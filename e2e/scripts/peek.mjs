#!/usr/bin/env node
// peek.mjs — textual "view": dumps each route's title, visible text, and controls.
// Companion to view.mjs for when screenshots can't be inspected directly.
import { chromium } from '@playwright/test';

const BASE = (process.env.VIEW_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ROUTES = (process.env.VIEW_ROUTES || '/,/reference,/simulation')
  .split(',').map((s) => s.trim()).filter(Boolean);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

for (const r of ROUTES) {
  await page.goto(BASE + r, { waitUntil: 'load', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const title = await page.title().catch(() => '(n/a)');
  const text = await page
    .evaluate(() => (document.body ? document.body.innerText : '(no body)')
      .replace(/\n{3,}/g, '\n\n')
      .slice(0, 1400))
    .catch(() => '(evaluate failed)');
  const controls = await page
    .evaluate(() =>
      [...document.querySelectorAll('button, [role=button], input, select, [role=tab]')]
        .map((e) => `${e.tagName.toLowerCase()}:${(e.value || e.textContent || e.getAttribute('placeholder') || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 42)}`)
        .filter(Boolean)
        .slice(0, 40),
    )
    .catch(() => []);
  console.log(`\n######## ${r} ########`);
  console.log(`title: ${title}`);
  console.log('--- visible text (first ~1400 chars) ---');
  console.log(text);
  console.log('--- interactive controls ---');
  console.log(controls.length ? controls.join('\n') : '(none found)');
}

await browser.close();