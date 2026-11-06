#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// view.mjs — dev-time visual inspector.
//
// Attaches to the running frontend and, for each app route, captures a
// full-page screenshot plus a plain-text log of console messages, network
// responses, and any errors (console.error / uncaught page errors / HTTP>=400 /
// failed requests). It is strictly observational: it navigates and reads, it
// does not mutate app state or drive mutating endpoints.
//
// Requires the dev servers to be running (frontend on :3000). To override:
//   VIEW_BASE_URL=http://localhost:3000 \
//   VIEW_ROUTES=/,/reference,/simulation \
//   node e2e/scripts/view.mjs
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const OUT = path.join(ROOT, 'e2e', 'out', 'view');
const BASE = (process.env.VIEW_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ROUTES = process.env.VIEW_ROUTES
  ? process.env.VIEW_ROUTES.split(',').map((s) => s.trim()).filter(Boolean)
  : ['/', '/reference', '/simulation'];

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

const summary = [];

for (const route of ROUTES) {
  const safe = route === '/' ? 'index' : route.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+/, '');
  const consoleMsgs = [];
  const network = [];
  const errors = [];

  const onConsole = (msg) => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`);
  const onPageError = (err) => errors.push(`pageerror: ${err.message}`);
  const onResponse = (res) => {
    const line = `${res.status()} ${res.request().method()} ${res.url()}`;
    network.push(line);
    if (res.status() >= 400) errors.push(`http ${res.status()} ${res.url()}`);
  };
  const onRequestFailed = (req) =>
    errors.push(`requestfailed: ${req.url()} — ${req.failure()?.errorText ?? 'unknown'}`);

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);

  let navError = null;
  try {
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 });
  } catch (e) {
    navError = e.message;
    try {
      await page.waitForLoadState('load', { timeout: 30000 });
    } catch {}
  }
  // Let client-side data fetches and entrance animations settle before the shot.
  await page.waitForTimeout(2500);

  const png = path.join(OUT, `${safe}.png`);
  await page.screenshot({ path: png, fullPage: true });

  const log = path.join(OUT, `${safe}.log`);
  const logText = [
    `# route: ${route}`,
    `# final url: ${page.url()}`,
    `# base: ${BASE}`,
    navError ? `# navigation note: ${navError}` : null,
    '',
    '## console',
    ...(consoleMsgs.length ? consoleMsgs : ['(none)']),
    '',
    '## network',
    ...(network.length ? network : ['(none)']),
    '',
    '## errors',
    ...(errors.length ? errors : ['(none)']),
    '',
  ]
    .filter((l) => l !== null)
    .join('\n');
  fs.writeFileSync(log, logText);

  summary.push({ route, png, log, navError, errors: errors.length });

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('response', onResponse);
  page.off('requestfailed', onRequestFailed);
}

await browser.close();

console.log('\n=== visual inspector ===');
for (const s of summary) {
  const flag = s.errors ? `${s.errors} error(s)` : 'clean';
  console.log(`  ${s.route}\n    png : ${path.relative(ROOT, s.png)}\n    log : ${path.relative(ROOT, s.log)}  [${flag}]`);
}
console.log(`\nOutput: ${path.relative(ROOT, OUT)}/`);