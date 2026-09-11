#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// region.mjs — idempotent replace-between-markers.
//
// This exists to delete `sed -i` from the injection layer. Multiline `sed -i`
// replacement has delimiter collisions, treats `&` and `\1` in the replacement
// text as metacharacters, differs between GNU and BSD, and is not atomic.
// Node is already a hard dependency of the bootstrap, so the edits happen here.
//
// Marker syntax — the comment skin is chosen by file extension:
//
//   CSS      /* >>> bootstrap:region NAME owner=ID v=X.Y.Z */
//            … content …
//            /* <<< bootstrap:region NAME */
//
//   TS/JS    // >>> bootstrap:region NAME owner=ID v=X.Y.Z
//   sh/.env  # >>> bootstrap:region NAME owner=ID v=X.Y.Z
//
// Owner and version live IN the marker, so a second injection writing the same
// region is detectable from the file alone — no manifest lookup required.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';

import { fail, loadManifest, parseArgs, relPath, saveManifest, writeAtomic } from './manifest.mjs';

// ── Comment skins ────────────────────────────────────────────────────────────

const SKINS = {
  block: { open: '/* ', close: ' */' }, // .css
  line: { open: '// ', close: '' }, // .ts .js .mjs .cjs
  hash: { open: '# ', close: '' }, // .sh .env .yml .toml
};

const EXT_SKIN = {
  '.css': 'block',
  '.scss': 'block',
  '.ts': 'line',
  '.js': 'line',
  '.mjs': 'line',
  '.cjs': 'line',
  '.sh': 'hash',
  '.bash': 'hash',
  '.yml': 'hash',
  '.yaml': 'hash',
  '.toml': 'hash',
};

// Regions inside JSX are forbidden by construction, not by convention.
// `{/* … */}` is legal JSX but the failure modes are unverifiable without a
// parser: a marker in attribute position is a syntax error, and injected
// content must be valid in that exact JSX position. Every JSX seam is an
// extension point instead, which removes the hardest case entirely.
const JSX_EXT = new Set(['.tsx', '.jsx']);

/** Applies to every verb, not just the writing ones — a .tsx never has regions. */
function refuseJsx(file) {
  if (!JSX_EXT.has(path.extname(file).toLowerCase())) return;
  fail(
    `Regions are not supported in JSX files (${path.basename(file)})`,
    [
      'A marker in attribute position is a syntax error, and injected content',
      'must be valid in the exact JSX position it lands in — neither is checkable',
      'without a full parser.',
    ],
    'Use an extension point: add extensions/<point>/NN-<id>.tsx and let the generated barrel pick it up.'
  );
}

function skinFor(file) {
  const ext = path.extname(file).toLowerCase();
  refuseJsx(file);
  if (path.basename(file).startsWith('.env')) return SKINS.hash;
  const skin = EXT_SKIN[ext];
  if (!skin) {
    fail(
      `No marker skin for extension "${ext || '(none)'}"`,
      [`Known: ${Object.keys(EXT_SKIN).join(', ')}, .env*`],
      'JSON is never marker-patched — use `pnpm pkg set` instead.'
    );
  }
  return SKINS[skin];
}

// ── Marker recognition ───────────────────────────────────────────────────────
// Deliberately skin-agnostic on read, so a marker written with the wrong
// comment style is still found (and then reported) rather than silently missed.

const BEGIN_RE =
  /^(\s*)(?:\/\*|\/\/|#)\s*>>>\s*bootstrap:region\s+(\S+?)(?:\s+owner=(\S+?))?(?:\s+v=(\S+?))?\s*(?:\*\/)?\s*$/;
const END_RE = /^(\s*)(?:\/\*|\/\/|#)\s*<<<\s*bootstrap:region\s+(\S+?)\s*(?:\*\/)?\s*$/;
const SUSPECT_RE = /bootstrap:region/;

function beginMarker(skin, name, owner, version) {
  return `${skin.open}>>> bootstrap:region ${name} owner=${owner} v=${version}${skin.close}`;
}

function endMarker(skin, name) {
  return `${skin.open}<<< bootstrap:region ${name}${skin.close}`;
}

/**
 * Parse every region in `lines`.
 *
 * Errors — not warnings — on: unterminated regions, mismatched end names,
 * duplicate region names, nesting, and lines that mention bootstrap:region but
 * match neither marker form. Silence on any of these hides the exact class of
 * bug this tool exists to prevent.
 */
function parseRegions(file, lines) {
  const regions = new Map();
  const problems = [];
  let open = null;

  lines.forEach((line, i) => {
    const ln = i + 1;
    const b = BEGIN_RE.exec(line);
    const e = END_RE.exec(line);

    if (b) {
      const [, indent, name, owner, version] = b;
      if (open) {
        problems.push(
          `line ${ln}: region "${name}" opens inside still-open region "${open.name}" (line ${open.beginLine}) — nesting is not allowed`
        );
        return;
      }
      if (regions.has(name)) {
        problems.push(
          `line ${ln}: duplicate region "${name}" (already opened at line ${regions.get(name).beginLine})`
        );
        return;
      }
      open = {
        name,
        owner: owner ?? null,
        version: version ?? null,
        indent,
        beginLine: ln,
      };
      regions.set(name, open);
      return;
    }

    if (e) {
      const [, , name] = e;
      if (!open) {
        problems.push(`line ${ln}: end marker for "${name}" with no matching begin marker`);
        return;
      }
      if (open.name !== name) {
        problems.push(
          `line ${ln}: end marker "${name}" closes region "${open.name}" opened at line ${open.beginLine}`
        );
        return;
      }
      open.endLine = ln;
      open = null;
      return;
    }

    if (SUSPECT_RE.test(line)) {
      problems.push(`line ${ln}: malformed bootstrap:region marker — ${line.trim()}`);
    }
  });

  if (open) {
    problems.push(`region "${open.name}" opened at line ${open.beginLine} is never closed`);
  }

  if (problems.length) {
    fail(`Malformed region markers in ${file}`, problems, 'Fix the markers by hand, or restore the file from git.');
  }

  return regions;
}

function readLines(file) {
  if (!fs.existsSync(file)) fail(`No such file: ${file}`);
  const text = fs.readFileSync(file, 'utf8');
  return { text, lines: text.split('\n') };
}

function missingRegion(file, name, regions) {
  const present = [...regions.keys()];
  fail(
    `No region "${name}" in ${path.basename(file)}`,
    present.length
      ? ['Regions present in this file:', ...present.map((r) => `  ${r}`)]
      : ['This file declares no regions at all.'],
    // Appending silently would turn a typo like `tokens.pallete` into a block
    // of CSS nobody ever reads. So: hard error, with the real names listed.
    'Check the region name for typos, or add the region to the base template.'
  );
}

// ── Manifest bookkeeping ─────────────────────────────────────────────────────

function syncManifest(root, file, { region, owner, shared } = {}) {
  if (!root) return;
  const m = loadManifest(root, { required: false });
  if (!m.files) return;
  const rel = relPath(root, file);
  if (region) {
    const key = `${rel}#${region}`;
    const existing = m.regions[key];
    m.regions[key] = {
      owner: existing?.shared ? existing.owner : owner,
      shared: Boolean(shared || existing?.shared),
    };
  }
  saveManifest(root, m);
}

// ─────────────────────────────────────────────────────────────────────────────
// Verbs
// ─────────────────────────────────────────────────────────────────────────────

const VERBS = {
  /**
   * write <file> --region NAME --owner ID [--version V] [--content-file F]
   *
   * Content comes from --content-file or stdin. Same owner replaces silently
   * (so re-running an injection is idempotent); a different owner is an error.
   */
  write(file, flags, content) {
    const skin = skinFor(file);
    const { lines } = readLines(file);
    const regions = parseRegions(file, lines);
    const name = req(flags, 'region');
    const owner = req(flags, 'owner');
    const version = str(flags, 'version') || '1.0.0';

    const r = regions.get(name);
    if (!r) missingRegion(file, name, regions);

    // A base-owned region holds a seeded default, not a claim — the base writes
    // placeholder tokens so the project is valid standalone, and the first
    // injection to want the region takes it over. Once an injection owns it, a
    // second injection is an error.
    if (r.owner && r.owner !== 'base' && r.owner !== owner && !flags.force) {
      fail(
        `Region "${name}" in ${relOrBase(file)} is owned by "${r.owner}" (v=${r.version ?? '?'})`,
        [`Attempted by: ${owner}`, `Marker at line ${r.beginLine}`],
        'Only one injection may write a non-shared region. Give this injection its own region, ' +
          'or declare the region shared in the base template.'
      );
    }

    // The begin-marker's indentation is the region's indentation; reapply it so
    // injected content sits at the right depth regardless of how it was authored.
    const body = content
      .replace(/\n+$/, '')
      .split('\n')
      .map((l) => (l.length ? r.indent + l : l));

    const out = [
      ...lines.slice(0, r.beginLine - 1),
      r.indent + beginMarker(skin, name, owner, version).trim(),
      ...body,
      r.indent + endMarker(skin, name).trim(),
      ...lines.slice(r.endLine),
    ];

    writeAtomic(file, out.join('\n'));
    syncManifest(flags.root, file, { region: name, owner, shared: flags.shared });
  },

  /** clear <file> --region NAME --owner ID — empties a region, keeps the markers. */
  clear(file, flags) {
    VERBS.write(file, flags, '');
  },

  /** read <file> --region NAME — prints the region body to stdout. */
  read(file, flags) {
    const { lines } = readLines(file);
    const regions = parseRegions(file, lines);
    const name = req(flags, 'region');
    const r = regions.get(name);
    if (!r) missingRegion(file, name, regions);
    process.stdout.write(lines.slice(r.beginLine, r.endLine - 1).join('\n') + '\n');
  },

  /** list <file> — every region, with owner and version. */
  list(file) {
    const { lines } = readLines(file);
    const regions = parseRegions(file, lines);
    for (const [name, r] of regions) {
      process.stdout.write(`${name}\t${r.owner ?? '-'}\t${r.version ?? '-'}\tL${r.beginLine}-${r.endLine}\n`);
    }
  },

  /**
   * ensure <file> --region NAME [--owner ID] — append empty markers if absent.
   * Used by the base when authoring a file that exposes a region; never by an
   * injection, which must find the region already declared.
   */
  ensure(file, flags) {
    const skin = skinFor(file);
    const { text, lines } = readLines(file);
    const regions = parseRegions(file, lines);
    const name = req(flags, 'region');
    if (regions.has(name)) return;
    const owner = str(flags, 'owner') || 'base';
    const version = str(flags, 'version') || '1.0.0';
    const block = `${beginMarker(skin, name, owner, version)}\n${endMarker(skin, name)}\n`;
    writeAtomic(file, (text.endsWith('\n') ? text : text + '\n') + block);
    syncManifest(flags.root, file, { region: name, owner, shared: flags.shared });
  },
};

// ─────────────────────────────────────────────────────────────────────────────

function req(flags, name) {
  const v = str(flags, name);
  if (!v) fail(`--${name} is required`);
  return v;
}

function str(flags, name) {
  return flags[name] && flags[name] !== true ? String(flags[name]) : null;
}

function relOrBase(file) {
  return path.basename(file);
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main(argv) {
  const { flags, positional } = parseArgs(argv);
  const verb = positional.shift();
  if (!verb || flags.help) {
    process.stdout.write(
      `Usage: region.mjs <verb> <file> [--region NAME] [--owner ID] [--root DIR]\n\nVerbs: ${Object.keys(VERBS).join(', ')}\n`
    );
    process.exit(verb ? 0 : 1);
  }
  if (!VERBS[verb]) fail(`Unknown verb "${verb}"`, [`Known: ${Object.keys(VERBS).join(', ')}`]);

  const file = positional.shift();
  if (!file) fail(`Usage: region.mjs ${verb} <file> …`);
  const abs = path.resolve(file);
  refuseJsx(abs);

  let content = '';
  if (verb === 'write') {
    const cf = str(flags, 'content-file');
    content = cf ? fs.readFileSync(cf, 'utf8') : readStdin();
  }
  VERBS[verb](abs, flags, content);
}

if (import.meta.filename === process.argv[1]) main(process.argv.slice(2));
