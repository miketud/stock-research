// class:base-replaceable — how the project is generated and extended.
//
// Split from the landing page: that page documents the stack, this one documents
// the scaffold. Reference material, read once.

const commands: Array<[string, string]> = [
  ['cd backend && pnpm dev', 'tsx watch src/server.ts on :3001'],
  ['cd frontend && pnpm dev', 'next dev on :3000; predev regenerates barrels'],
  ['pnpm typecheck', 'tsc --noEmit, per workspace'],
  ['cd backend && pnpm build', 'tsc to dist/, then node dist/server.js'],
  ['cd frontend && pnpm build', 'next build; prebuild regenerates barrels'],
  ['pnpm dlx shadcn@latest add card', 'copies source into components/ui/'],
  ['conformance.mjs --root <this dir>', 'ten checks; run from the bootstrap checkout'],
  ['node .bootstrap/bin/gen_barrels.mjs --root .', 'rebuild directory indexes by hand'],
];

const env: Array<[string, string]> = [
  ['NODE_ENV', 'development | test | production. Default development.'],
  ['HOST', 'Bind address. Default 0.0.0.0.'],
  ['PORT', 'Default 3001. Never auto-incremented; a clash reports the holding PID.'],
  ['LOG_LEVEL', 'fatal | error | warn | info | debug | trace | silent. Default info.'],
  ['CORS_ORIGIN', 'Comma-separated origins. Default http://localhost:3000.'],
];

const seams: Array<[string, string]> = [
  ['backend/src/routes/<n>.route.ts', 'Default-exports a FastifyPluginAsync. autoPrefix sets the mount path.'],
  ['backend/src/plugins/<n>.ts', 'Registered before routes, unencapsulated, so it applies app-wide.'],
  ['frontend/src/providers/NN-name.tsx', 'Default-exports a component taking children. NN is nesting order, lowest outermost.'],
  ['frontend/src/extensions/header-actions/NN-name.tsx', 'Rendered by SiteHeader. The only way to add UI to a layout the base owns.'],
  ['frontend/src/nav/<id>.nav.ts', 'Default-exports NavEntry data. Conformance asserts every href resolves to a page.'],
  ['frontend/src/styles/layers/<id>.css', 'Imported by a generated index. Nothing appends to globals.css.'],
  ['frontend/src/features/<name>/', 'Ordinary feature code. Colocate components, hooks and types; no registry, no barrel.'],
  ['frontend/src/lib/', 'Shared helpers and the hand-written entry types (extensions.ts, nav.ts).'],
];

const ownership: Array<[string, string]> = [
  ['base', 'Immutable. An injection that writes one is rejected; git diff bootstrap/base shows any that slipped through.'],
  ['base-replaceable', 'Replaced wholesale by one declared claimant. Recover the original with git show bootstrap/base:<path>.'],
  ['region', 'Written only between named markers. Owner and version are stored in the marker itself.'],
  ['injection', 'Created and owned outright by one layer.'],
  ['generated', 'Rebuilt from the directory it indexes. Committed, because Turbopack has no glob import.'],
];

const checks: Array<[string, string]> = [
  ['1', 'pnpm install --frozen-lockfile is clean in both workspaces.'],
  ['2', 'tsc --noEmit and eslint report zero errors.'],
  ['3', 'next build and tsc both succeed.'],
  ['4', 'Every class in the source resolves against the compiled CSS entry. No hand-kept list of utilities.'],
  ['5', 'Theme is corrected in <head> before <body> exists; toggle flips both selectors; state survives reload; renders dark with JS off.'],
  ['6', 'rounded-sm/md/lg/xl compute to 0px and rounded-full to 9999px.'],
  ['7', 'Barrels regenerate byte-identical, base files are present, nav hrefs resolve, injected CSS is imported.'],
  ['8', 'GET /health is 200, unknown paths 404, and a route written into dist/ is discovered at runtime.'],
  ['9', 'No dependency is declared but never imported.'],
  ['10', 'No component uses an inline style.'],
];

function Section({
  title,
  intro,
  rows,
  narrow = false,
}: {
  title: string;
  intro?: string;
  rows: Array<[string, string]>;
  /** For lists keyed by a number rather than a path. */
  narrow?: boolean;
}) {
  return (
    <section className="border-t border-border py-12">
      <h2 className="text-xs font-medium uppercase tracking-wider text-text-subtle">{title}</h2>
      {intro ? (
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">{intro}</p>
      ) : null}
      <dl className="mt-5 divide-y divide-border border border-border">
        {rows.map(([key, value]) => (
          <div
            key={key}
            className={
              narrow
                ? 'grid gap-1.5 p-4 sm:grid-cols-[3rem_1fr] sm:gap-6'
                : 'grid gap-1.5 p-4 sm:grid-cols-[20rem_1fr] sm:gap-6'
            }
          >
            <dt className="font-mono text-xs leading-relaxed text-text">{key}</dt>
            <dd className="text-sm leading-relaxed text-text-muted">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function Info() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6">
      <section className="border-b border-border py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-text">Getting started</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-text-muted">
          The project is generated in layers: a base that passes its own checks standing alone,
          then optional injections applied on top of it. Each layer is a git tag, so any of them
          can be undone with a reset. Nothing is added by editing a file the base owns.
        </p>
      </section>

      <Section title="Commands" rows={commands} />
      <Section
        title="Environment"
        intro="backend/.env, validated by zod at import time. An invalid value exits non-zero with the field named."
        rows={env}
      />
      <Section
        title="Extension points"
        intro="Discovered from disk. Add the file and it is picked up; no registration step, and no base file changes."
        rows={seams}
      />
      <Section
        title="Ownership"
        intro="Recorded per path in .bootstrap/manifest.json. Determines what a later layer may do to a file."
        rows={ownership}
      />
      <Section
        title="Conformance"
        intro="conformance.mjs, from the bootstrap checkout. The base passes all ten with no injections applied."
        rows={checks}
        narrow
      />
    </div>
  );
}
