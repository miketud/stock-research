#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// conformance.mjs — proves the base is independently valid.
//
// The whole point of the layered design is that the base output typechecks,
// builds and renders with ZERO injections applied. That claim is only worth
// something if it is checked, so this suite runs against base-only output and
// again after each injection.
//
// The check that justifies the rebuild is #4, token resolution: it compiles the
// project's REAL CSS entry with the Tailwind CLI and asserts that every class
// the source actually uses is a class Tailwind actually generates. That is the
// check that would have caught `--color-surface-alt` being referenced by
// page.tsx before the injection that defines it had run.
//
//   node conformance.mjs --root <project> [--only 4,6] [--skip 5] [--quick]
// ─────────────────────────────────────────────────────────────────────────────

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { parseArgs } from './manifest.mjs';

const C = process.stdout.isTTY
  ? { r: '\x1b[0;31m', g: '\x1b[0;32m', y: '\x1b[0;33m', d: '\x1b[2m', b: '\x1b[1m', n: '\x1b[0m' }
  : { r: '', g: '', y: '', d: '', b: '', n: '' };

const failures = [];
const warnings = [];
let ROOT = process.cwd();

function pass(msg) {
  process.stdout.write(`  ${C.g}✔${C.n} ${msg}\n`);
}
function fail(msg, detail = []) {
  process.stdout.write(`  ${C.r}✖${C.n} ${msg}\n`);
  for (const d of detail) process.stdout.write(`      ${C.d}${d}${C.n}\n`);
  failures.push(msg);
}
function warnOnly(msg, detail = []) {
  process.stdout.write(`  ${C.y}⚠${C.n} ${msg}\n`);
  for (const d of detail) process.stdout.write(`      ${C.d}${d}${C.n}\n`);
  warnings.push(msg);
}
function heading(n, title) {
  process.stdout.write(`\n${C.b}${n}. ${title}${C.n}\n`);
}

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
    env: { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1', ...(opts.env || {}) },
  });
}

function tail(text, n = 25) {
  return String(text || '')
    .trimEnd()
    .split('\n')
    .slice(-n);
}

const exists = (...p) => fs.existsSync(path.join(ROOT, ...p));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

/** Every source file under a directory, recursively, matching an extension set. */
function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (['node_modules', '.next', 'dist', '.git', '.bootstrap'].includes(d.name)) continue;
      walk(p, exts, out);
    } else if (exts.some((e) => d.name.endsWith(e))) {
      out.push(p);
    }
  }
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1 — Install
// ═════════════════════════════════════════════════════════════════════════════

function check1() {
  heading(1, 'Install is reproducible');
  for (const ws of ['backend', 'frontend']) {
    if (!exists(ws, 'pnpm-lock.yaml')) {
      fail(`${ws}: no pnpm-lock.yaml`, ['A lockfile is what makes the build reproducible.']);
      continue;
    }
    const r = sh('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], {
      cwd: path.join(ROOT, ws),
    });
    if (r.status !== 0) fail(`${ws}: pnpm install --frozen-lockfile failed`, tail(r.stderr || r.stdout));
    else pass(`${ws}: frozen lockfile installs clean`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 2 — Typecheck + lint
// ═════════════════════════════════════════════════════════════════════════════

function check2() {
  heading(2, 'Typecheck and lint are clean');
  for (const ws of ['backend', 'frontend']) {
    const r = sh('pnpm', ['run', 'typecheck'], { cwd: path.join(ROOT, ws) });
    if (r.status !== 0) fail(`${ws}: typecheck failed`, tail(r.stdout || r.stderr));
    else pass(`${ws}: typecheck clean`);
  }
  const r = sh('pnpm', ['run', 'lint'], { cwd: path.join(ROOT, 'backend') });
  if (r.status !== 0) fail('backend: lint failed', tail(r.stdout || r.stderr));
  else pass('backend: lint clean');
}

// ═════════════════════════════════════════════════════════════════════════════
// 3 — Builds
// ═════════════════════════════════════════════════════════════════════════════

function check3() {
  heading(3, 'Both workspaces build');
  const be = sh('pnpm', ['run', 'build'], { cwd: path.join(ROOT, 'backend') });
  if (be.status !== 0) fail('backend: tsc build failed', tail(be.stdout || be.stderr));
  else if (!exists('backend', 'dist', 'app.js')) fail('backend: build produced no dist/app.js');
  else pass('backend: builds to dist/');

  const fe = sh('pnpm', ['run', 'build'], { cwd: path.join(ROOT, 'frontend') });
  if (fe.status !== 0) fail('frontend: next build failed', tail(fe.stdout || fe.stderr, 40));
  else pass('frontend: next build succeeds');
}

// ═════════════════════════════════════════════════════════════════════════════
// 4 — Token resolution.  THE check.
//
// Extract every candidate utility class from the source, compile the project's
// real globals.css against a synthetic content file, and assert Tailwind
// emitted a rule for each. No hand-maintained list of built-in utilities is
// involved: the authority is Tailwind itself.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Extract the strings that genuinely hold class names.
 *
 * Scanning whole lines is too blunt: `{ name: 'surface', className: 'bg-surface' }`
 * and `<html lang="en" className={…}>` would both contribute junk candidates.
 * So walk to a `className=` / `className:` or a cn()/cva()/tv()/clsx() call and
 * read only the balanced expression that follows.
 */
function extractClassStrings(text) {
  const out = [];
  const lineOf = (idx) => text.slice(0, idx).split('\n').length;

  const pushLiterals = (span, at) => {
    for (const m of span.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/gs)) {
      // A literal followed by `:` is an object KEY, not a class list. cva()
      // variant maps are full of them — `"icon-sm": "…"` would otherwise
      // contribute `icon-sm` as a phantom candidate.
      if (/^\s*:/.test(span.slice(m.index + m[0].length))) continue;
      // Drop `${…}` holes from template literals; the surrounding static text
      // still carries real classes.
      out.push({ value: m[2].replace(/\$\{[^}]*\}/g, ' '), line: at });
    }
  };

  const readBalanced = (start, open, close) => {
    let depth = 0;
    let quote = null;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        if (ch === '\\') i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return text.slice(start, Math.min(text.length, start + 4000));
  };

  for (const m of text.matchAll(/\bclassName\s*[=:]\s*/g)) {
    const at = m.index + m[0].length;
    const ch = text[at];
    if (ch === '{') pushLiterals(readBalanced(at, '{', '}'), lineOf(at));
    else if (ch === '"' || ch === "'" || ch === '`') pushLiterals(text.slice(at, at + 4000).match(/^(['"`])((?:\\.|(?!\1)[^\\])*)\1/s)?.[0] ?? '', lineOf(at));
  }

  for (const m of text.matchAll(/\b(?:cn|cva|tv|clsx|twMerge)\s*\(/g)) {
    const at = m.index + m[0].length - 1;
    // `defaultVariants: { variant: "default" }` names a variant, not a class.
    // Excise it before extracting, or every cva() call donates a phantom.
    const span = readBalanced(at, '(', ')').replace(/defaultVariants\s*:\s*\{[^}]*\}/gs, '');
    pushLiterals(span, lineOf(at));
  }

  return out;
}

/**
 * Marker classes carry no styles of their own — `group/button` and `peer/x`
 * exist so that `group-hover/button:` can target them. Tailwind emits no rule
 * for the marker itself, so asserting on one would be a false failure.
 */
function isMarkerClass(cls) {
  return /^(group|peer)(\/[\w-]+)?$/.test(cls);
}

function collectCandidates() {
  const files = walk(path.join(ROOT, 'frontend', 'src'), ['.ts', '.tsx']);
  const found = new Map(); // class-as-written -> "file:line"

  for (const file of files) {
    if (file.includes('.generated.')) continue;
    const rel = path.relative(ROOT, file);
    for (const { value, line } of extractClassStrings(fs.readFileSync(file, 'utf8'))) {
      for (const raw of value.split(/\s+/)) {
        if (!raw) continue;
        // Keep the class exactly as written, variants and all — `sm:grid-cols-4`
        // is what Tailwind is asked to emit, so it is what we assert on.
        const cls = raw.replace(/^!/, '').replace(/!$/, '');
        if (!cls || cls.length < 2) continue;
        if (isMarkerClass(cls)) continue;
        if (!/^-?[a-z0-9]/i.test(cls)) continue;
        if (!/^[-a-z0-9[\]().:/_@%,#!*+~>&$?]+$/i.test(cls)) continue;
        if (!found.has(cls)) found.set(cls, `${rel}:${line}`);
      }
    }
  }
  return found;
}

/**
 * Compile the project's REAL CSS entry, optionally forcing extra classes into
 * the output via an @source'd synthetic file.
 *
 * The v4 CLI has no --content flag — sources are declared in CSS with @source,
 * and passing --content is silently ignored, which would make this whole check
 * quietly vacuous. The probe entry therefore lives inside frontend/ so that
 * globals.css's own relative @imports still resolve.
 */
function tailwindProbe(extraClasses = []) {
  const feDir = path.join(ROOT, 'frontend');
  const probeDir = path.join(feDir, '.bs-probe');
  const outFile = path.join(probeDir, 'out.css');
  try {
    fs.mkdirSync(probeDir, { recursive: true });
    fs.writeFileSync(path.join(probeDir, 'content.html'), extraClasses.map((c) => `<i class="${c}"></i>`).join('\n'));
    fs.writeFileSync(
      path.join(probeDir, 'entry.css'),
      `@import "../src/app/globals.css";\n@source "./content.html";\n`
    );
    const r = sh('npx', ['--yes', '@tailwindcss/cli', '-i', '.bs-probe/entry.css', '-o', '.bs-probe/out.css'], {
      cwd: feDir,
    });
    if (r.status !== 0 || !fs.existsSync(outFile)) {
      return { ok: false, error: tail(r.stderr || r.stdout, 30) };
    }
    return { ok: true, css: fs.readFileSync(outFile, 'utf8') };
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
  }
}

/** Tailwind escapes special characters in emitted selectors: `bg-surface/80` → `.bg-surface\/80`. */
function selectorRegex(cls) {
  const special = new Set(['.', ':', '/', '[', ']', '(', ')', '%', ',', '#', '!', '@', '&', '*', '+', '~', '>', '$', '?']);
  let pattern = '\\.';
  for (const ch of cls) {
    const esc = ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern += special.has(ch) ? `\\\\${esc}` : esc;
  }
  return new RegExp(`${pattern}(?![\\w\\\\-])`);
}

function check4() {
  heading(4, 'Every utility class the source uses actually resolves');

  const candidates = collectCandidates();
  if (candidates.size === 0) {
    warnOnly('No candidate classes found — the scanner may be mis-tuned');
    return;
  }

  const probe = tailwindProbe();
  if (!probe.ok) {
    fail('Tailwind CLI probe failed to compile globals.css', probe.error);
    return;
  }
  const css = probe.css;

  const unresolved = [];
  for (const [cls, where] of candidates) {
    if (!selectorRegex(cls).test(css)) unresolved.push({ cls, where });
  }

  if (unresolved.length) {
    fail(
      `${unresolved.length} class(es) do not resolve to any Tailwind rule`,
      unresolved.map((u) => `${u.cls}   ${C.d}(${u.where})${C.n}`)
    );
  } else {
    pass(`${candidates.size} candidate classes all resolve`);
  }

  // ── The contract itself: every declared role must exist in semantic.css ──
  const manifest = JSON.parse(read('.bootstrap', 'manifest.json'));
  const roles = manifest.capabilities?.['tokens.contract']?.roles?.color ?? [];
  const semantic = exists('frontend', 'src', 'styles', 'tokens', 'semantic.css')
    ? read('frontend', 'src', 'styles', 'tokens', 'semantic.css')
    : '';
  const theme = exists('frontend', 'src', 'styles', 'theme.css')
    ? read('frontend', 'src', 'styles', 'theme.css')
    : '';

  const undeclared = roles.filter((r2) => !semantic.includes(`--semantic-${r2}:`));
  const unmapped = roles.filter((r2) => !theme.includes(`--color-${r2}:`));

  if (undeclared.length) fail(`Roles in the contract but not declared in semantic.css: ${undeclared.join(', ')}`);
  else pass(`${roles.length} contract roles declared in semantic.css`);

  if (unmapped.length) fail(`Roles not mapped into @theme inline: ${unmapped.join(', ')}`);
  else pass(`${roles.length} contract roles mapped to utilities via @theme inline`);

  // Declared-but-unused is a warning, not a failure: the base publishes the
  // whole contract so injections can rely on it, and the base does not have to
  // use every role itself.
  const used = new Set(
    [...candidates.keys()].map((c) =>
      c.replace(/^.*:/, '').replace(/^(bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|shadow|accent|caret|divide)-/, '')
    )
  );
  const unused = roles.filter((r2) => !used.has(r2));
  if (unused.length) warnOnly(`Contract roles not used anywhere yet: ${unused.join(', ')}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 5 — Theme mechanism, headless.
//
// Playwright is a CONFORMANCE dependency, not an application one: it is
// resolved from the frontend workspace if present and the check skips loudly if
// it is not, so the base never ships a browser download to people who only
// wanted a scaffold.
//
// The assertion that matters is the no-FOUC one. Checking "the page ends up
// light" proves nothing — a flash also ends up light. So a MutationObserver is
// installed at document-start and records whether <body> existed at the moment
// the theme class was corrected. If it did, the correction happened after the
// document had something to paint, which is precisely a flash.
// ═════════════════════════════════════════════════════════════════════════════

async function loadPlaywright() {
  const local = path.join(ROOT, 'frontend', 'node_modules', 'playwright', 'index.js');
  for (const spec of [local, 'playwright']) {
    try {
      const mod = await import(spec.startsWith('/') ? `file://${spec}` : spec);
      // playwright is CJS, so importing it yields { default: module.exports }.
      const pw = mod.chromium ? mod : mod.default;
      if (pw?.chromium) return pw;
    } catch {
      /* try the next */
    }
  }
  return null;
}

async function check5() {
  heading(5, 'Theme resolves before first paint, and survives reload');

  const pw = await loadPlaywright();
  if (!pw) {
    warnOnly('Playwright not installed — theme mechanism not verified in a browser', [
      'Enable with:  cd frontend && pnpm add -D playwright && pnpm exec playwright install chromium',
    ]);
    return;
  }

  let browser;
  const { spawn } = await import('node:child_process');
  const port = await freePort();
  const server = spawn('pnpm', ['exec', 'next', 'start', '--port', String(port)], {
    cwd: path.join(ROOT, 'frontend'),
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    const url = `http://127.0.0.1:${port}/`;
    if (!(await waitFor(url, 60000))) {
      fail('next start did not come up');
      return;
    }
    browser = await pw.chromium.launch();

    // ── 1. No flash, with a stored preference that contradicts the SSR default
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      // addInitScript runs on EVERY navigation, so seed only when nothing is
      // stored — otherwise the reload check would be re-seeded before it could
      // observe what the toggle persisted.
      try {
        if (localStorage.getItem('theme') === null) localStorage.setItem('theme', 'light');
      } catch {
        /* private browsing */
      }
      // Observe `document`, not `document.documentElement`: an init script runs
      // before the parser has created <html>, so observing documentElement
      // silently attaches to nothing and the assertion becomes vacuous.
      // `document` always exists, and subtree:true still catches attribute
      // changes on <html>.
      window.__trace = [];
      new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.target !== document.documentElement) continue;
          if (m.attributeName !== 'class' && m.attributeName !== 'data-theme') continue;
          window.__trace.push({
            attr: m.attributeName,
            cls: document.documentElement.className,
            dt: document.documentElement.getAttribute('data-theme'),
            hadBody: Boolean(document.body),
          });
        }
      }).observe(document, { attributes: true, subtree: true });
    });

    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    await page.goto(url, { waitUntil: 'load' });

    const trace = await page.evaluate(() => window.__trace ?? []);
    const state = await page.evaluate(() => ({
      cls: document.documentElement.className,
      dt: document.documentElement.getAttribute('data-theme'),
      bg: getComputedStyle(document.body).backgroundColor,
    }));

    if (state.dt !== 'light' || state.cls.includes('dark')) {
      fail(`stored preference not honored: data-theme=${state.dt} class="${state.cls}"`);
    } else {
      pass('stored light preference is applied');
    }

    // Guard against the assertion below passing because nothing was observed at
    // all. An empty trace means the probe is broken, not that the page is fine.
    if (trace.length === 0) {
      fail('no theme mutation was observed — the inline script never ran', [
        'Expected the script in <head> to correct <html> away from the dark default.',
      ]);
    }

    const lateCorrection = trace.find((t) => t.hadBody && !t.cls.includes('dark'));
    if (lateCorrection) {
      fail('the theme was corrected AFTER <body> existed — that is a flash', [
        'The inline script must run in <head>, before there is anything to paint.',
      ]);
    } else {
      pass('theme resolved in <head>, before <body> existed — no flash');
    }

    // ── 2. Toggling flips BOTH selectors and actually repaints
    const toggle = page.locator('[data-extension-point="header-actions"] button').first();
    await toggle.click();
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({
      cls: document.documentElement.className,
      dt: document.documentElement.getAttribute('data-theme'),
      bg: getComputedStyle(document.body).backgroundColor,
    }));

    if (after.dt !== 'dark' || !after.cls.includes('dark')) {
      fail(`toggle did not set both selectors: data-theme=${after.dt} class="${after.cls}"`, [
        'data-theme is the source of truth; .dark is what shadcn and Tailwind dark: rely on.',
      ]);
    } else {
      pass('toggle flips data-theme and .dark together');
    }
    if (after.bg === state.bg) fail(`body background did not change (${state.bg} → ${after.bg})`);
    else pass(`body background repaints (${state.bg} → ${after.bg})`);

    // ── 3. Persistence
    await page.reload({ waitUntil: 'load' });
    const reloaded = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    if (reloaded !== 'dark') fail(`theme did not persist across reload (got ${reloaded})`);
    else pass('theme persists across reload');

    if (consoleErrors.length) warnOnly(`${consoleErrors.length} console error(s)`, consoleErrors.slice(0, 5));
    await ctx.close();

    // ── 4. JavaScript disabled: dark, and nothing broken
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    const p2 = await noJs.newPage();
    await p2.goto(url, { waitUntil: 'load' });
    const noJsState = await p2.evaluate(() => null).catch(() => null);
    void noJsState;
    const html = await p2.content();
    if (!/<html[^>]*class="[^"]*\bdark\b/.test(html) || !/<html[^>]*data-theme="dark"/.test(html)) {
      fail('with JavaScript disabled the document is not dark', [
        'layout.tsx must server-render class="dark" data-theme="dark" so the',
        'inline script only ever has to REMOVE the class.',
      ]);
    } else {
      pass('renders dark with JavaScript disabled');
    }
    await noJs.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill('SIGTERM');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 6 — Sharp corners
// ═════════════════════════════════════════════════════════════════════════════

function check6() {
  heading(6, 'Sharp corners, but not everywhere');

  const wanted = ['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-full'];
  const probe = tailwindProbe(wanted);
  if (!probe.ok) {
    fail('Tailwind CLI probe failed for radius', probe.error);
    return;
  }
  const css = probe.css;

  // Resolve what each utility ACTUALLY computes to: the rule body may reference
  // a variable, so follow it one hop into the declarations in the same output.
  const varValue = (name) => css.match(new RegExp(`${name.replace(/[-]/g, '\\-')}:\\s*([^;]+);`))?.[1]?.trim() ?? null;
  const ruleValue = (cls) => {
    const body = css.match(new RegExp(`\\.${cls}\\s*\\{[^}]*border-radius:\\s*([^;]+);`))?.[1]?.trim();
    if (!body) return null;
    const v = body.match(/^var\((--[\w-]+)\)$/);
    return v ? varValue(v[1]) : body;
  };

  const square = ['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl'];
  const notZero = square.map((c) => [c, ruleValue(c)]).filter(([, v]) => !v || !/^0(px|rem|em)?$/.test(v));
  if (notZero.length) {
    fail('Radius scale is not zero', notZero.map(([c, v]) => `${c} → ${v ?? '(no rule generated)'}`));
  } else {
    pass('rounded-sm/md/lg/xl all compute to 0');
  }

  const full = ruleValue('rounded-full');
  if (full !== '9999px') {
    fail(`rounded-full computes to ${full ?? '(no rule)'}, not 9999px`, [
      'Status dots, typing indicators and avatars have to stay circular.',
    ]);
  } else {
    pass('rounded-full still computes to 9999px');
  }

  const compat = read('frontend', 'src', 'styles', 'tokens', 'shadcn-compat.css');
  if (!/--radius:\s*0rem/.test(compat)) fail("shadcn's --radius is not 0rem — shadcn components would keep their corners");
  else pass("shadcn's --radius is 0rem");
}

// ═════════════════════════════════════════════════════════════════════════════
// 7 — Structural integrity
// ═════════════════════════════════════════════════════════════════════════════

function check7() {
  heading(7, 'Structure matches the ledger');

  // Barrels must be committed AND reproducible: Vercel will not run bash, so a
  // stale committed barrel is a broken deploy.
  const gen = sh('node', [path.join(ROOT, '.bootstrap', 'bin', 'gen_barrels.mjs'), '--root', ROOT, '--quiet']);
  if (gen.status !== 0) {
    fail('gen_barrels.mjs failed', tail(gen.stderr || gen.stdout));
  } else {
    const diff = sh('git', ['status', '--porcelain', '--', '*.generated.ts', '*.generated.css'], { cwd: ROOT });
    const dirty = String(diff.stdout || '').trim();
    if (dirty) fail('Regenerating barrels changed committed files', dirty.split('\n'));
    else pass('generated barrels are up to date');
  }

  const vh = sh('node', [path.join(ROOT, '.bootstrap', 'bin', 'manifest.mjs'), 'verify', '--root', ROOT, '--quiet']);
  if (vh.status !== 0) fail('verify failed — a class:base file is missing', tail(vh.stderr || vh.stdout, 30));
  else pass('every class:base file the ledger records is present');

  // Every nav href must resolve to a real page — nav entries are data precisely
  // so this check is possible.
  const navDir = path.join(ROOT, 'frontend', 'src', 'nav');
  const appDir = path.join(ROOT, 'frontend', 'src', 'app');
  let broken = 0;
  for (const f of walk(navDir, ['.nav.ts'])) {
    const text = fs.readFileSync(f, 'utf8');
    const m = text.match(/href:\s*'([^']+)'/) || text.match(/href:\s*"([^"]+)"/);
    if (!m) continue;
    const href = m[1];
    if (href.startsWith('http')) continue;
    const target = path.join(appDir, href === '/' ? '' : href, 'page.tsx');
    if (!fs.existsSync(target)) {
      fail(`nav href "${href}" has no page`, [`expected ${path.relative(ROOT, target)}`, `from ${path.relative(ROOT, f)}`]);
      broken++;
    }
  }
  if (!broken) pass('every nav href resolves to a page.tsx');

  // Every injected stylesheet must be reachable from the generated index.
  const layersDir = path.join(ROOT, 'frontend', 'src', 'styles', 'layers');
  if (fs.existsSync(layersDir)) {
    const index = path.join(layersDir, 'index.generated.css');
    const indexText = fs.existsSync(index) ? fs.readFileSync(index, 'utf8') : '';
    const orphans = fs
      .readdirSync(layersDir)
      .filter((n) => n.endsWith('.css') && !n.includes('.generated.'))
      .filter((n) => !indexText.includes(`./${n}`));
    if (orphans.length) fail(`Stylesheets not imported by the generated index: ${orphans.join(', ')}`);
    else pass('every styles/layers/*.css is imported');
  }

  // Exactly one .gitignore, at the root. create-next-app writes one into
  // frontend/ and `shadcn add` can drag others in; a nested ignore is read in
  // addition to the root one, so a rule the root file negates can be silently
  // re-excluded by a descendant. Catch it here rather than during the deploy
  // where a file turns out not to have been committed.
  const ignores = walk(ROOT, ['.gitignore']).map((f) => path.relative(ROOT, f));
  const nested = ignores.filter((rel) => rel !== '.gitignore');
  if (nested.length) {
    fail(`${nested.length} nested .gitignore file(s)`, [
      ...nested.map((rel) => `  ${rel}`),
      '',
      'The project keeps one .gitignore, at the root. Fold the patterns in —',
      'dropping any leading `/`, which would anchor them to the root only.',
    ]);
  } else if (ignores.length === 1) {
    pass('one .gitignore, at the root');
  } else {
    fail('no .gitignore at the project root');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 8 — Smoke: the backend really serves, and autoload survives compilation
// ═════════════════════════════════════════════════════════════════════════════

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitFor(url, ms = 30000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function check8() {
  heading(8, 'Backend serves, and autoload survives compilation');

  // A throwaway route dropped into BUILT output. If it is discovered, autoload
  // is genuinely reading dist/ at runtime rather than working only under tsx.
  const probeSrc = path.join(ROOT, 'backend', 'dist', 'routes', 'probe.route.js');
  const hadProbe = fs.existsSync(probeSrc);
  fs.mkdirSync(path.dirname(probeSrc), { recursive: true });
  fs.writeFileSync(
    probeSrc,
    `export default async function (app) { app.get('/__probe', async () => ({ probe: true })); }\n`
  );

  const port = await freePort();
  const { spawn } = await import('node:child_process');
  const child = spawn('node', ['dist/server.js'], {
    cwd: path.join(ROOT, 'backend'),
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), LOG_LEVEL: 'silent' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));

  try {
    const base = `http://127.0.0.1:${port}`;
    if (!(await waitFor(`${base}/health`))) {
      fail('backend did not start', tail(stderr, 20));
      return;
    }

    const health = await fetch(`${base}/health`);
    const body = await health.json().catch(() => null);
    if (health.status === 200 && body?.status === 'ok') pass('GET /health → 200 {"status":"ok"}');
    else fail(`GET /health → ${health.status} ${JSON.stringify(body)}`);

    const missing = await fetch(`${base}/__nope`);
    if (missing.status === 404) pass('GET /__nope → 404');
    else fail(`GET /__nope → ${missing.status}, expected 404`);

    const probe = await fetch(`${base}/__probe`);
    if (probe.status === 200) pass('a route dropped into dist/ is discovered — autoload survives tsc');
    else fail(`GET /__probe → ${probe.status} — autoload did not pick up dist/routes/probe.route.js`);
  } finally {
    child.kill('SIGTERM');
    if (!hadProbe) fs.rmSync(probeSrc, { force: true });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 9 — No unused declared dependency
// ═════════════════════════════════════════════════════════════════════════════

function check9() {
  heading(9, 'No declared dependency goes unimported');
  for (const ws of ['backend', 'frontend']) {
    const pkg = JSON.parse(read(ws, 'package.json'));
    const deps = Object.keys(pkg.dependencies || {});
    if (deps.length === 0) {
      pass(`${ws}: no runtime dependencies declared`);
      continue;
    }
    const files = walk(path.join(ROOT, ws, 'src'), ['.ts', '.tsx', '.mjs', '.js']);
    const text = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    // Packages consumed by config or the framework rather than by an import.
    const implicit = new Set(['next', 'react', 'react-dom', 'tailwindcss', '@tailwindcss/postcss']);
    // Matches bare specifiers and subpaths alike, so `import 'dotenv/config'`
    // counts as using `dotenv`.
    const isImported = (d) =>
      new RegExp(`['"]${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/[^'"]*)?['"]`).test(text);
    const unused = deps.filter((d) => !implicit.has(d) && !isImported(d));
    if (unused.length) {
      fail(
        `${ws}: ${unused.length} declared but never imported`,
        [...unused, '', 'The previous base declared ~20 of these (gsap, howler, react-pdf, …).']
      );
    } else {
      pass(`${ws}: all ${deps.length} dependencies are imported`);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 10 — No inline styles
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Blank out comments while preserving line numbers, so a check that greps for a
 * pattern reads code rather than prose. A file explaining why it does not use
 * inline styles should not be reported for using inline styles.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

function check10() {
  heading(10, 'No inline styles anywhere');
  const files = walk(path.join(ROOT, 'frontend', 'src'), ['.tsx']);
  const hits = [];
  for (const f of files) {
    stripComments(fs.readFileSync(f, 'utf8'))
      .split('\n')
      .forEach((line, i) => {
        if (line.includes('style={{')) hits.push(`${path.relative(ROOT, f)}:${i + 1}`);
      });
  }
  if (hits.length) {
    fail(`${hits.length} inline style(s)`, [
      ...hits,
      '',
      'Inline styles were a workaround for a token layer that generated no',
      'utilities. With @theme inline they are no longer necessary.',
    ]);
  } else {
    pass('no inline styles — every color goes through a token utility');
  }
}

// ═════════════════════════════════════════════════════════════════════════════

const CHECKS = {
  1: check1,
  2: check2,
  3: check3,
  4: check4,
  5: check5,
  6: check6,
  7: check7,
  8: check8,
  9: check9,
  10: check10,
};

async function main(argv) {
  const { flags } = parseArgs(argv);
  // --root is optional: walk up from the current directory looking for the
  // manifest, the way git finds .git.
  if (flags.root && flags.root !== true) {
    ROOT = path.resolve(String(flags.root));
  } else {
    let dir = process.cwd();
    for (;;) {
      if (fs.existsSync(path.join(dir, '.bootstrap', 'manifest.json'))) break;
      const parent = path.dirname(dir);
      if (parent === dir) {
        dir = process.cwd();
        break;
      }
      dir = parent;
    }
    ROOT = dir;
  }

  if (!fs.existsSync(path.join(ROOT, '.bootstrap', 'manifest.json'))) {
    process.stderr.write(
      `\n  ✖ ${ROOT} is not a bootstrapped project (no .bootstrap/manifest.json)\n` +
        `    Run from inside a project, or pass --root <dir>.\n\n`
    );
    process.exit(1);
  }

  const only = flags.only && flags.only !== true ? String(flags.only).split(',').map(Number) : null;
  const skip = flags.skip && flags.skip !== true ? String(flags.skip).split(',').map(Number) : [];

  process.stdout.write(`\n${C.b}Conformance${C.n} ${C.d}${ROOT}${C.n}\n`);

  for (const [n, fn] of Object.entries(CHECKS)) {
    const num = Number(n);
    if (only && !only.includes(num)) continue;
    if (skip.includes(num)) continue;
    try {
      await fn();
    } catch (e) {
      fail(`check ${num} threw: ${e.message}`);
    }
  }

  process.stdout.write('\n');
  if (failures.length) {
    process.stdout.write(`${C.r}${C.b}FAILED${C.n} — ${failures.length} failure(s), ${warnings.length} warning(s)\n\n`);
    process.exit(1);
  }
  process.stdout.write(`${C.g}${C.b}PASSED${C.n}${warnings.length ? ` — ${warnings.length} warning(s)` : ''}\n\n`);
}

if (import.meta.filename === process.argv[1]) await main(process.argv.slice(2));
