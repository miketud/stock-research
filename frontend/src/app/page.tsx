// class:base-replaceable — the ui_ux injection replaces this wholesale.
//
// Reference material for whoever opens the project. Anything about how the
// scaffold generates itself lives at /info.

const spec: Array<[string, string]> = [
  ['Runtime', 'Node 22+'],
  ['Modules', 'ESM, NodeNext resolution'],
  ['API', 'Fastify 5, @fastify/autoload 6'],
  ['Validation', 'zod 4, parsed at startup'],
  ['Framework', 'Next.js 16, React 19'],
  ['Compiler', 'React Compiler enabled'],
  ['Styling', 'Tailwind CSS v4'],
  ['Components', 'Base UI, via the shadcn registry'],
  ['Packages', 'pnpm, one lockfile per workspace'],
  ['Lint', 'ESLint 9 flat config, Prettier'],
];

const backend: Array<[string, string]> = [
  ['src/routes/*.route.ts', 'Autoloaded. export const autoPrefix sets the mount path; files at the root mount at /.'],
  ['src/plugins/*.ts', 'Autoloaded before routes and not encapsulated, so a plugin applies app-wide.'],
  ['src/env.ts', 'NODE_ENV, HOST, PORT, LOG_LEVEL, CORS_ORIGIN. Invalid values exit non-zero at startup.'],
  ['src/app.ts', 'Registers autoload twice and nothing else. No route is named in it.'],
  ['GET /health', 'Returns {"status":"ok"}. Unknown paths return 404.'],
  ['pnpm build', 'tsc to dist/. Autoload resolves via import.meta.dirname, so it discovers dist/routes at runtime.'],
  ['Port', 'Fixed at PORT. On EADDRINUSE it reports the holding PID rather than moving to another port.'],
];

const frontend: Array<[string, string]> = [
  ['styles/tokens/primitives.css', 'Raw oklch scales. Neutral, brand and status ramps. Not referenced by components.'],
  ['styles/tokens/semantic.css', '--semantic-<role> on :root, overridden under .dark. This is the role contract.'],
  ['styles/theme.css', '@theme inline maps each role to --color-<role>, so utilities exist and still switch at runtime.'],
  ['Radius', 'sm/md/lg/xl all compute to 0. --radius-full stays 9999px for dots and avatars.'],
  ['Theme', 'An inline script in <head> writes data-theme and mirrors .dark before first paint.'],
  ['providers/, extensions/, nav/', 'Directories scanned into committed barrels. Turbopack has no glob import.'],
  ['components/ui/', 'Owned source, not a package. shadcn add copies files here.'],
];

function Section({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <section className="border-t border-border py-12">
      <h2 className="text-xs font-medium uppercase tracking-wider text-text-subtle">{title}</h2>
      <dl className="mt-5 divide-y divide-border border border-border">
        {rows.map(([key, value]) => (
          <div key={key} className="grid gap-1.5 p-4 sm:grid-cols-[20rem_1fr] sm:gap-6">
            <dt className="font-mono text-xs leading-relaxed text-text">{key}</dt>
            <dd className="text-sm leading-relaxed text-text-muted">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6">
      <section className="grid gap-10 border-b border-border py-16 md:grid-cols-[1fr_18rem] md:gap-16">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            Fastify and Next.js in one repository
          </h1>
          <div className="mt-5 space-y-4 text-sm leading-relaxed text-text-muted">
            <p>
              Two pnpm workspaces with independent lockfiles and builds. The backend registers no
              route by name: <code className="font-mono text-text">src/app.ts</code> mounts
              autoload over <code className="font-mono text-text">plugins/</code> and{' '}
              <code className="font-mono text-text">routes/</code>, and resolves those directories
              through <code className="font-mono text-text">import.meta.dirname</code>, so the same
              file works under <code className="font-mono text-text">tsx watch</code> and from{' '}
              <code className="font-mono text-text">dist/</code>.
            </p>
            <p>
              The frontend carries a two-tier token layer. Roles are declared as{' '}
              <code className="font-mono text-text">--semantic-*</code> on{' '}
              <code className="font-mono text-text">:root</code> and <code className="font-mono text-text">.dark</code>, then
              mapped into Tailwind through <code className="font-mono text-text">@theme inline</code> —
              which emits <code className="font-mono text-text">var()</code> rather than a resolved
              value, so utilities exist at build time and still respond to a theme change at
              runtime. No component uses an inline style.
            </p>
            <p>
              Both workspaces typecheck, lint and build with zero errors, and a ten-check
              conformance suite runs against the result. One of those checks compiles the real CSS
              entry and fails on any class the source uses that Tailwind does not generate.
            </p>
          </div>
        </div>

        <dl className="space-y-3 md:border-l md:border-border md:pl-8">
          {spec.map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs uppercase tracking-wider text-text-subtle">{key}</dt>
              <dd className="mt-0.5 text-sm text-text">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Section title="Backend" rows={backend} />
      <Section title="Frontend" rows={frontend} />
    </div>
  );
}
