#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// manifest.mjs — the ownership + capability ledger for a bootstrapped project.
//
// Lives at <root>/.bootstrap/manifest.json. Every write the bootstrap or an
// injection performs goes through here first, so that:
//
//   • a file's ownership class is known before anything touches it,
//   • capabilities are named semver contracts rather than file-existence stats.
//
// Enforcement is cooperative, and deliberately stops there. An injection that
// bypasses the API with `sed -i` is caught by `git diff` against the
// bootstrap/base tag — the same tool that would have to show the damage anyway.
// Re-hashing every class:base file to catch scripts in this same repo was
// ceremony, and the `rehash` escape hatch it needed made it unsound as a
// guarantee besides.
//
// jq is NOT a dependency of the bootstrap (Node is), so all manifest queries
// from bash come through this script.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';

export const MANIFEST_VERSION = 1;

// `manifest.mjs list … | head -4` closes stdout early, and Node's default is to
// throw on the next write. These are listing tools meant to be piped, so a
// closed pipe is a normal exit, not a crash. Imported by the sibling CLIs too.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (err) => {
    if (err.code === 'EPIPE') process.exit(0);
    throw err;
  });
}

// ── Ownership classes ────────────────────────────────────────────────────────
export const CLASSES = Object.freeze({
  base: 'base', // injections may do nothing — hard fail
  'base-replaceable': 'base-replaceable', // replace wholesale, if declared + sole claimant
  region: 'region', // write only between named markers
  injection: 'injection', // owned fully by one injection
  generated: 'generated', // never hand-edited; regenerated from source of truth
});

// ─────────────────────────────────────────────────────────────────────────────
// Tiny semver — enough for `>=1`, `^1.2.0`, `~1.2`, `1.x`, `*`, and exact pins.
// A real semver dep would mean an install step before the bootstrap can run.
// ─────────────────────────────────────────────────────────────────────────────

export function parseVersion(v) {
  const m = String(v)
    .trim()
    .match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

function cmp(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Does `version` satisfy `range`? Ranges may be space- or comma-separated
 * conjunctions (`">=1.2 <2"`). Unparseable ranges throw rather than silently
 * matching — a typo in a `requires:` must not read as "no constraint".
 */
export function satisfies(version, range) {
  const v = parseVersion(version);
  if (!v) throw new Error(`Unparseable version: ${version}`);
  const parts = String(range)
    .split(/[,\s]+/)
    .filter(Boolean);
  if (parts.length === 0) return true;

  for (const part of parts) {
    if (part === '*' || part === 'latest' || part === 'any') continue;

    const m = part.match(/^(>=|<=|>|<|\^|~|=)?\s*v?(\d+|x|\*)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/);
    if (!m) throw new Error(`Unparseable range: ${range}`);

    const [, op = '=', majRaw, minRaw, patRaw] = m;
    const wild = (s) => s === undefined || s === 'x' || s === '*';

    // `1.x` / `1` with no operator means "any 1.y.z", not "exactly 1.0.0".
    if (op === '=' && (wild(minRaw) || wild(patRaw))) {
      if (wild(majRaw)) continue;
      if (v[0] !== Number(majRaw)) return false;
      if (!wild(minRaw) && v[1] !== Number(minRaw)) return false;
      continue;
    }

    const target = [
      wild(majRaw) ? 0 : Number(majRaw),
      wild(minRaw) ? 0 : Number(minRaw),
      wild(patRaw) ? 0 : Number(patRaw),
    ];
    const c = cmp(v, target);

    switch (op) {
      case '>=':
        if (c < 0) return false;
        break;
      case '>':
        if (c <= 0) return false;
        break;
      case '<=':
        if (c > 0) return false;
        break;
      case '<':
        if (c >= 0) return false;
        break;
      case '=':
        if (c !== 0) return false;
        break;
      case '^': {
        if (c < 0) return false;
        // ^0.2.3 is caret-on-minor; ^1.2.3 is caret-on-major.
        const ceiling =
          target[0] > 0 ? [target[0] + 1, 0, 0] : [0, target[1] + 1, 0];
        if (cmp(v, ceiling) >= 0) return false;
        break;
      }
      case '~': {
        if (c < 0) return false;
        if (cmp(v, [target[0], target[1] + 1, 0]) >= 0) return false;
        break;
      }
      default:
        throw new Error(`Unparseable range: ${range}`);
    }
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest I/O
// ─────────────────────────────────────────────────────────────────────────────

export function manifestPath(root) {
  return path.join(root, '.bootstrap', 'manifest.json');
}

export function emptyManifest() {
  return {
    manifestVersion: MANIFEST_VERSION,
    base: null,
    capabilities: {},
    files: {},
    regions: {},
    injections: {},
    packages: {},
  };
}

export function loadManifest(root, { required = true } = {}) {
  const p = manifestPath(root);
  if (!fs.existsSync(p)) {
    if (!required) return emptyManifest();
    fail(
      `No bootstrap manifest at ${p}`,
      [`${root} does not look like a bootstrapped project.`],
      'Run main_v1.sh against this directory first.'
    );
  }
  const raw = fs.readFileSync(p, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    fail(`Manifest is not valid JSON: ${p}`, [e.message], 'Restore it from git.');
  }
  if (data.manifestVersion !== MANIFEST_VERSION) {
    fail(
      `Manifest version mismatch in ${p}`,
      [`found manifestVersion=${data.manifestVersion}, this tool speaks ${MANIFEST_VERSION}`],
      'Re-bootstrap into a fresh directory.'
    );
  }
  return data;
}

export function saveManifest(root, data) {
  const p = manifestPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  writeAtomic(p, JSON.stringify(data, null, 2) + '\n');
}

/** Temp-file + rename, so an interrupted write never leaves a half file. */
export function writeAtomic(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, file);
}

/** All manifest paths are repo-relative and forward-slashed, on every platform. */
export function relPath(root, p) {
  const abs = path.isAbsolute(p) ? p : path.resolve(root, p);
  return path.relative(root, abs).split(path.sep).join('/');
}

// ─────────────────────────────────────────────────────────────────────────────
// Failure reporting
//
// Every failure names the requirement, lists what IS present, gives the fix,
// and ends with "Nothing was written." — the messages the current scripts
// don't have, and the reason their failures are hard to act on.
// ─────────────────────────────────────────────────────────────────────────────

export function fail(headline, details = [], fix = null) {
  const out = [];
  out.push('');
  out.push(`  ✖ ${headline}`);
  for (const d of details) out.push(`    ${d}`);
  if (fix) {
    out.push('');
    out.push(`    Fix: ${fix}`);
  }
  out.push('');
  out.push('  Nothing was written.');
  out.push('');
  process.stderr.write(out.join('\n') + '\n');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ownership checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * May `owner` perform `mode` on `p`?
 *
 * Unregistered paths are writable by anyone — a new file an injection fully
 * owns. Registration happens on the write, not before it.
 */
export function checkWrite(root, m, p, owner, mode) {
  const rel = relPath(root, p);
  const entry = m.files[rel];

  if (!entry) return { ok: true, rel, entry: null };

  const cls = entry.class;

  if (owner === 'base') return { ok: true, rel, entry };

  if (cls === CLASSES.base) {
    return {
      ok: false,
      rel,
      entry,
      reason: `${rel} is class:base — owned by the bootstrap, not injectable.`,
      hint: 'Use the declared extension point instead (providers/, extensions/, routes/, plugins/, styles/layers/).',
    };
  }

  if (cls === CLASSES.generated) {
    return {
      ok: false,
      rel,
      entry,
      reason: `${rel} is class:generated — it is rebuilt from its source directory.`,
      hint: 'Add a source file in the directory it indexes; the barrel regenerates.',
    };
  }

  if (cls === CLASSES['base-replaceable']) {
    if (mode !== 'replace') {
      return {
        ok: false,
        rel,
        entry,
        reason: `${rel} is class:base-replaceable — it may only be replaced wholesale.`,
        hint: `Declare it in this injection's "replaces" list and use bs_replace.`,
      };
    }
    if (entry.replacedBy && entry.replacedBy !== owner) {
      return {
        ok: false,
        rel,
        entry,
        reason: `${rel} was already replaced by injection "${entry.replacedBy}".`,
        hint: `Two injections cannot both own ${rel}. Remove one, or have "${owner}" declare a conflict.`,
      };
    }
    return { ok: true, rel, entry };
  }

  if (cls === CLASSES.region) {
    return {
      ok: false,
      rel,
      entry,
      reason: `${rel} is class:region — it may only be written between markers.`,
      hint: `Use bs_inject_region. Regions present: ${listRegionsFor(m, rel).join(', ') || '(none claimed yet)'}`,
    };
  }

  if (cls === CLASSES.injection && entry.owner !== owner) {
    return {
      ok: false,
      rel,
      entry,
      reason: `${rel} is owned by injection "${entry.owner}".`,
      hint: `"${owner}" must write its own files.`,
    };
  }

  return { ok: true, rel, entry };
}

function listRegionsFor(m, rel) {
  return Object.keys(m.regions)
    .filter((k) => k.startsWith(`${rel}#`))
    .map((k) => k.slice(rel.length + 1));
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flags that never take a value. Without this list `--explain ui_ux` parses as
 * explain="ui_ux" and swallows the positional argument — a silent, confusing
 * failure rather than an error.
 */
export const BOOLEAN_FLAGS = new Set([
  'force',
  'quiet',
  'help',
  'check',
  'shared',
  'explain',
  'quick',
  'verbose',
]);

export function parseArgs(argv, booleans = BOOLEAN_FLAGS) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
        continue;
      }
      const name = a.slice(2);
      if (booleans.has(name)) flags[name] = true;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags[name] = argv[++i];
      else flags[name] = true;
    } else positional.push(a);
  }
  return { flags, positional };
}

function requireFlag(flags, name) {
  if (!flags[name] || flags[name] === true) fail(`--${name} is required`);
  return flags[name];
}

const VERBS = {
  // ── init ───────────────────────────────────────────────────────────────────
  init(root, flags) {
    const p = manifestPath(root);
    if (fs.existsSync(p) && !flags.force) {
      fail(
        `Manifest already exists at ${p}`,
        ['Re-running the bootstrap over an existing project is not supported.'],
        'Bootstrap into an empty directory, or pass --force to reset the ledger.'
      );
    }
    const m = emptyManifest();
    m.base = { version: String(flags.version || '1.0.0'), appliedAt: new Date().toISOString() };
    saveManifest(root, m);
    process.stdout.write(`${p}\n`);
  },

  // ── register <path> --class <c> [--owner <o>] ──────────────────────────────
  // Records who owns a path and under which class.
  register(root, flags, pos) {
    const m = loadManifest(root);
    const rel = relPath(root, requireFlag(flags, 'path'));
    const cls = requireFlag(flags, 'class');
    if (!CLASSES[cls]) {
      fail(`Unknown ownership class "${cls}"`, [`Known: ${Object.keys(CLASSES).join(', ')}`]);
    }
    const owner = flags.owner && flags.owner !== true ? flags.owner : 'base';
    m.files[rel] = { ...(m.files[rel] || {}), class: cls, owner };
    saveManifest(root, m);
    void pos;
  },

  // ── class-of / owner-of <path> ────────────────────────────────────────────
  'class-of'(root, flags) {
    const m = loadManifest(root);
    const rel = relPath(root, requireFlag(flags, 'path'));
    process.stdout.write(`${m.files[rel]?.class ?? 'unregistered'}\n`);
  },

  'owner-of'(root, flags) {
    const m = loadManifest(root);
    const rel = relPath(root, requireFlag(flags, 'path'));
    process.stdout.write(`${m.files[rel]?.replacedBy ?? m.files[rel]?.owner ?? 'unregistered'}\n`);
  },

  // ── can-write <path> --owner <id> --mode write|replace ────────────────────
  'can-write'(root, flags) {
    const m = loadManifest(root);
    const owner = requireFlag(flags, 'owner');
    const mode = flags.mode && flags.mode !== true ? flags.mode : 'write';
    const res = checkWrite(root, m, requireFlag(flags, 'path'), owner, mode);
    if (!res.ok) fail(res.reason, [`Attempted by: ${owner} (mode: ${mode})`], res.hint);
  },

  // ── claim-replace <path> --owner <id> ─────────────────────────────────────
  'claim-replace'(root, flags) {
    const m = loadManifest(root);
    const owner = requireFlag(flags, 'owner');
    const rel = relPath(root, requireFlag(flags, 'path'));
    const res = checkWrite(root, m, rel, owner, 'replace');
    if (!res.ok) fail(res.reason, [`Attempted by: ${owner}`], res.hint);

    // The pre-replacement copy is the bootstrap/base commit, not a stashed
    // duplicate under .bootstrap/originals: `git show bootstrap/base:<path>`
    // recovers it, and every phase boundary is tagged.
    m.files[rel] = { ...(m.files[rel] || { class: CLASSES['base-replaceable'] }), replacedBy: owner };
    saveManifest(root, m);
  },

  // ── claim-region <path> --region <name> --owner <id> [--shared] ───────────
  'claim-region'(root, flags) {
    const m = loadManifest(root);
    const rel = relPath(root, requireFlag(flags, 'path'));
    const region = requireFlag(flags, 'region');
    const owner = requireFlag(flags, 'owner');
    const key = `${rel}#${region}`;
    const existing = m.regions[key];

    if (existing && existing.owner !== owner && !existing.shared) {
      fail(
        `Region "${region}" in ${rel} is already claimed by "${existing.owner}".`,
        [`Attempted by: ${owner}`],
        `Only one injection may own a non-shared region. Mark it shared, or pick a different region.`
      );
    }
    m.regions[key] = { owner: existing?.shared ? existing.owner : owner, shared: Boolean(flags.shared || existing?.shared) };
    saveManifest(root, m);
  },

  // ── provide <cap> <version> --provider <id> [--data <json>] ───────────────
  provide(root, flags, pos) {
    const m = loadManifest(root);
    const [cap, version] = pos;
    if (!cap || !version) fail('Usage: manifest.mjs provide <capability> <version> --provider <id>');
    if (!parseVersion(version)) fail(`Not a version: ${version}`);
    const provider = flags.provider && flags.provider !== true ? flags.provider : 'base';

    const prev = m.capabilities[cap];
    if (prev && prev.provider !== provider) {
      fail(
        `Capability "${cap}" is already provided by "${prev.provider}" at ${prev.version}.`,
        [`Attempted by: ${provider}`],
        'Two providers for one capability is ambiguous. Declare a conflict instead.'
      );
    }

    let data = {};
    if (flags.data && flags.data !== true) {
      try {
        data = JSON.parse(flags.data);
      } catch (e) {
        fail(`--data is not valid JSON`, [e.message]);
      }
    }
    m.capabilities[cap] = { version, provider, ...data };
    saveManifest(root, m);
  },

  // ── require <cap> [range] ─────────────────────────────────────────────────
  // The direct replacement for `[[ -f .../ThemeProvider.tsx ]] || die`.
  require(root, flags, pos) {
    const m = loadManifest(root);
    const [cap, range = '*'] = pos;
    if (!cap) fail('Usage: manifest.mjs require <capability> [range]');
    const have = m.capabilities[cap];
    const by = flags.by && flags.by !== true ? ` (required by ${flags.by})` : '';

    if (!have) {
      const present = Object.entries(m.capabilities)
        .map(([k, v]) => `  ${k} @ ${v.version}  (from ${v.provider})`)
        .sort();
      fail(
        `Missing capability "${cap}" ${range}${by}`,
        ['Capabilities present in this project:', ...(present.length ? present : ['  (none)'])],
        `Apply an injection that provides "${cap}", or re-bootstrap with a base version that does.`
      );
    }
    if (!satisfies(have.version, range)) {
      fail(
        `Capability "${cap}" is ${have.version}, which does not satisfy ${range}${by}`,
        [`Provided by: ${have.provider}`],
        `Upgrade the provider of "${cap}", or relax the range.`
      );
    }
  },

  // ── token <namespace> <role> ──────────────────────────────────────────────
  // Assert a design token exists BEFORE writing TSX that uses `bg-<role>`.
  token(root, flags, pos) {
    const m = loadManifest(root);
    const [ns, role] = pos;
    if (!ns || !role) fail('Usage: manifest.mjs token <namespace> <role>');
    const contract = m.capabilities['tokens.contract'];
    if (!contract) {
      fail(
        `No "tokens.contract" capability in this project`,
        ['The token layer has not been installed.'],
        'Re-bootstrap; the base provides tokens.contract.'
      );
    }
    const roles = contract.roles?.[ns];
    if (!Array.isArray(roles)) {
      fail(
        `Token namespace "${ns}" is not in the contract`,
        [`Namespaces present: ${Object.keys(contract.roles || {}).join(', ') || '(none)'}`]
      );
    }
    if (!roles.includes(role)) {
      fail(
        `Token "${ns}.${role}" is not in the contract (tokens.contract @ ${contract.version})`,
        [`Roles in "${ns}":`, ...chunk(roles, 6).map((r) => `  ${r.join('  ')}`)],
        `Writing className="bg-${role}" would produce a class Tailwind never generates. ` +
          `Add the role to the base contract, or use one that exists.`
      );
    }
  },

  // ── has-injection <id> ────────────────────────────────────────────────────
  // Exit 0 if applied, 1 if not. Quiet — this is a predicate, not an assertion.
  'has-injection'(root, flags, pos) {
    const m = loadManifest(root);
    const id = pos[0];
    if (!id) fail('Usage: manifest.mjs has-injection <id>');
    process.exit(m.injections[id] ? 0 : 1);
  },

  // ── record-injection <id> <version> ───────────────────────────────────────
  'record-injection'(root, flags, pos) {
    const m = loadManifest(root);
    const [id, version = '1.0.0'] = pos;
    if (!id) fail('Usage: manifest.mjs record-injection <id> [version]');
    m.injections[id] = { version, appliedAt: new Date().toISOString() };
    saveManifest(root, m);
  },

  // ── verify ────────────────────────────────────────────────────────────────
  // Every registered class:base path still exists. Presence only: content drift
  // is git's job, and `git diff bootstrap/base` reports it better than a hash
  // mismatch ever did — it shows WHAT changed, not just that something did.
  // A deletion, though, is worth naming here: it means an injection removed a
  // singleton the base owns, and the failure it causes surfaces far from
  // the cause.
  verify(root, flags) {
    const m = loadManifest(root);
    const missing = Object.entries(m.files)
      .filter(([, e]) => e.class === CLASSES.base)
      .map(([rel]) => rel)
      .filter((rel) => !fs.existsSync(path.resolve(root, rel)));

    if (missing.length === 0) {
      if (!flags.quiet) {
        const n = Object.values(m.files).filter((f) => f.class === CLASSES.base).length;
        process.stdout.write(`${n} class:base files present\n`);
      }
      return;
    }

    fail(
      `${missing.length} class:base file(s) are missing`,
      missing.map((rel) => `  deleted: ${rel}`),
      'Restore them (`git checkout bootstrap/base -- <path>`) and use the declared ' +
        'extension point. class:base files are singletons the base owns.'
    );
  },

  // ── list [--class <c>] ────────────────────────────────────────────────────
  list(root, flags) {
    const m = loadManifest(root);
    const want = flags.class && flags.class !== true ? flags.class : null;
    for (const [rel, entry] of Object.entries(m.files).sort()) {
      if (want && entry.class !== want) continue;
      process.stdout.write(`${entry.class}\t${entry.replacedBy || entry.owner}\t${rel}\n`);
    }
  },

  // ── plan --dir <injections> <id…> ─────────────────────────────────────────
  //
  // Computes the ENTIRE plan and validates it before anything is written.
  // Today's scripts write as they go and fail halfway, leaving a project that
  // is neither the old thing nor the new one. Here: any conflict aborts with
  // nothing written, and the ordered id list is only printed once every check
  // has passed.
  plan(root, flags, pos) {
    const m = loadManifest(root);
    const dir = path.resolve(requireFlag(flags, 'dir'));
    const requested = pos.filter(Boolean);
    if (!requested.length) fail('Usage: manifest.mjs plan --dir <injections> <id> [id…]');

    const problems = [];
    const specs = new Map();

    // ── Load descriptors ────────────────────────────────────────────────────
    for (const id of requested) {
      const file = path.join(dir, `${id}.injection.json`);
      if (!fs.existsSync(file)) {
        const available = fs
          .readdirSync(dir)
          .filter((n) => n.endsWith('.injection.json'))
          .map((n) => `  ${n.replace('.injection.json', '')}`);
        fail(
          `No such injection: "${id}"`,
          available.length ? ['Available:', ...available] : ['No injections are defined in ' + dir]
        );
      }
      let spec;
      try {
        spec = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (e) {
        fail(`${id}.injection.json is not valid JSON`, [e.message]);
      }
      if (spec.id !== id) problems.push(`${id}: descriptor declares id "${spec.id}"`);
      specs.set(id, spec);
    }

    // Already-applied injections are skipped, not re-run: an injection is
    // idempotent by construction, but re-applying would re-claim regions.
    const pending = requested.filter((id) => !m.injections[id]);
    const already = requested.filter((id) => m.injections[id]);

    // ── requires: satisfied by the project, or by something in this plan ────
    const willProvide = new Map();
    for (const id of pending) {
      for (const [cap, version] of Object.entries(specs.get(id).provides || {})) {
        if (willProvide.has(cap)) {
          problems.push(`capability "${cap}" is provided by both "${willProvide.get(cap).by}" and "${id}"`);
        }
        willProvide.set(cap, { by: id, version });
      }
    }

    for (const id of pending) {
      for (const [cap, range] of Object.entries(specs.get(id).requires || {})) {
        const have = m.capabilities[cap] ?? willProvide.get(cap);
        if (!have) {
          const present = Object.keys(m.capabilities).sort().join(', ') || '(none)';
          problems.push(`${id} requires "${cap}" ${range}, which nothing provides. Present: ${present}`);
        } else if (!satisfies(have.version, range)) {
          problems.push(`${id} requires "${cap}" ${range}, but ${have.version} is what is available`);
        }
      }

      for (const other of specs.get(id).conflicts || []) {
        if (m.injections[other]) problems.push(`${id} conflicts with "${other}", which is already applied`);
        if (pending.includes(other)) problems.push(`${id} conflicts with "${other}", also in this plan`);
      }
    }

    // ── replaces: one claimant per path ─────────────────────────────────────
    const replaceClaims = new Map();
    for (const id of pending) {
      for (const rel of specs.get(id).replaces || []) {
        const entry = m.files[rel];
        if (!entry) {
          problems.push(`${id} replaces "${rel}", which is not a file this project has`);
        } else if (entry.class !== CLASSES['base-replaceable']) {
          problems.push(`${id} replaces "${rel}", which is class:${entry.class}, not base-replaceable`);
        } else if (entry.replacedBy && entry.replacedBy !== id) {
          problems.push(`${id} replaces "${rel}", already replaced by "${entry.replacedBy}"`);
        }
        if (replaceClaims.has(rel)) {
          problems.push(`"${rel}" is replaced by both "${replaceClaims.get(rel)}" and "${id}"`);
        }
        replaceClaims.set(rel, id);
      }
    }

    // ── regions: one owner per non-shared region ────────────────────────────
    const regionClaims = new Map();
    for (const id of pending) {
      for (const r of specs.get(id).regions || []) {
        const key = `${r.path}#${r.region}`;
        const existing = m.regions[key];
        if (existing && existing.owner !== 'base' && existing.owner !== id && !existing.shared) {
          problems.push(`${id} claims region "${r.region}" in ${r.path}, owned by "${existing.owner}"`);
        }
        if (regionClaims.has(key) && !r.shared) {
          problems.push(`region "${r.region}" in ${r.path} is claimed by both "${regionClaims.get(key)}" and "${id}"`);
        }
        regionClaims.set(key, id);
      }
    }

    // ── packages: incompatible ranges for one package ───────────────────────
    const pkgClaims = new Map();
    for (const id of pending) {
      const pkgs = specs.get(id).packages || {};
      for (const [ws, kinds] of Object.entries(pkgs)) {
        for (const [kind, entries] of Object.entries(kinds)) {
          for (const [name, range] of Object.entries(entries)) {
            const key = `${ws}:${name}`;
            const prev = pkgClaims.get(key);
            if (prev && prev.range !== range) {
              problems.push(
                `package "${name}" in ${ws}: "${prev.by}" wants ${prev.range}, "${id}" wants ${range}`
              );
            }
            pkgClaims.set(key, { by: id, range, kind });
          }
        }
      }
    }

    // ── Ordering: fixed phases, then Kahn within a phase ────────────────────
    //
    // A pure topological sort leaves independent injections in arbitrary order,
    // and both CSS cascade order and slot `order` values are sensitive to that.
    // So: phase first (10 tokens, 20 plumbing, 30 features, 40 content), then
    // requires→provides within the phase, ties broken lexicographically.
    const ordered = [];
    const byPhase = new Map();
    for (const id of pending) {
      const phase = Number(specs.get(id).phase ?? 30);
      if (!byPhase.has(phase)) byPhase.set(phase, []);
      byPhase.get(phase).push(id);
    }

    for (const phase of [...byPhase.keys()].sort((a, b) => a - b)) {
      const ids = byPhase.get(phase).sort();
      const indeg = new Map(ids.map((id) => [id, 0]));
      const edges = new Map(ids.map((id) => [id, []]));

      for (const id of ids) {
        for (const cap of Object.keys(specs.get(id).requires || {})) {
          const provider = willProvide.get(cap);
          if (provider && provider.by !== id && ids.includes(provider.by)) {
            edges.get(provider.by).push(id);
            indeg.set(id, indeg.get(id) + 1);
          }
        }
      }

      const queue = ids.filter((id) => indeg.get(id) === 0).sort();
      const out = [];
      while (queue.length) {
        const id = queue.shift();
        out.push(id);
        for (const next of edges.get(id).sort()) {
          indeg.set(next, indeg.get(next) - 1);
          if (indeg.get(next) === 0) {
            queue.push(next);
            queue.sort();
          }
        }
      }
      if (out.length !== ids.length) {
        problems.push(`dependency cycle in phase ${phase} among: ${ids.filter((i) => !out.includes(i)).join(', ')}`);
      }
      ordered.push(...out);
    }

    if (problems.length) {
      fail(
        `The plan does not validate — ${problems.length} problem(s)`,
        problems.map((p) => `  ${p}`),
        'Resolve the conflicts above and re-run. No injection was applied.'
      );
    }

    if (flags.explain) {
      for (const id of already) process.stderr.write(`  (already applied: ${id})\n`);
    }
    for (const id of ordered) process.stdout.write(`${id}\n`);
  },

  // ── injections ────────────────────────────────────────────────────────────
  // Applied injection ids, one per line. Used by the interactive picker to show
  // what a candidate project already carries.
  injections(root) {
    const m = loadManifest(root);
    for (const [id, v] of Object.entries(m.injections).sort()) {
      process.stdout.write(`${id}\t${v.version}\n`);
    }
  },

  // ── capabilities ──────────────────────────────────────────────────────────
  capabilities(root) {
    const m = loadManifest(root);
    for (const [cap, v] of Object.entries(m.capabilities).sort()) {
      process.stdout.write(`${cap}\t${v.version}\t${v.provider}\n`);
    }
  },
};

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function main(argv) {
  const { flags, positional } = parseArgs(argv);
  const verb = positional.shift();
  if (!verb || flags.help) {
    process.stdout.write(
      `Usage: manifest.mjs <verb> --root <project> [args]\n\nVerbs: ${Object.keys(VERBS).join(', ')}\n`
    );
    process.exit(verb ? 0 : 1);
  }
  if (!VERBS[verb]) fail(`Unknown verb "${verb}"`, [`Known: ${Object.keys(VERBS).join(', ')}`]);
  const root = path.resolve(flags.root && flags.root !== true ? flags.root : process.cwd());
  VERBS[verb](root, flags, positional);
}

if (import.meta.filename === process.argv[1]) main(process.argv.slice(2));
