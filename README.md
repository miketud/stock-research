# stock-research

A TypeScript stock-research dashboard: a Fastify 5 API backend and a
Next.js 16 frontend, managed as a pnpm workspace.

## Layout

```
backend/   Fastify 5, ESM, @fastify/autoload. No database.
frontend/  Next.js 16 (App Router), Tailwind v4, shadcn/ui, sharp corners.
e2e/       Playwright: a dev-time visual inspector + end-to-end tests.
```

## Run

```bash
pnpm install
pnpm dev   # both servers in parallel — backend :3001, frontend :3000
# or individually:
pnpm --filter stock-research-backend dev   # http://localhost:3001/health
pnpm --filter stock-research-frontend dev  # http://localhost:3000
```

## Verify

```bash
pnpm --filter stock-research-frontend typecheck
pnpm --filter stock-research-backend  typecheck
pnpm --filter stock-research-frontend build
pnpm test:e2e    # Playwright (needs the servers, or see e2e/playwright.config.ts)
```

## Extension points

Drop a file in the right place and it is discovered — no central registry to edit:

| Need | Add |
|---|---|
| HTTP route | `backend/src/routes/<name>.route.ts` (`export const autoPrefix`) |
| Fastify plugin | `backend/src/plugins/<name>.ts` |
| React context | `frontend/src/providers/NN-name.tsx` |
| Header item | `frontend/src/extensions/header-actions/NN-name.tsx` |
| Nav entry | `frontend/src/nav/<id>.nav.ts` (data, not JSX) |
| Stylesheet | `frontend/src/styles/layers/<id>.css` |
| Feature code | `frontend/src/features/<name>/` — colocate components, hooks, types |
| Shared helper | `frontend/src/lib/` |

Only the first six are discovered. Barrels under those directories are
**generated and committed** — Turbopack has no glob import, and Vercel will not
run bash. `predev`/`prebuild` regenerate them, so they self-heal.

`features/` and `lib/` are ordinary directories with no registry and no barrel.
Create `features/` when you have a feature to put in it.

The entry types are hand-written, not generated: `ExtensionEntry` in
`src/lib/extensions.ts`, `NavEntry` in `src/lib/nav.ts`.

## Theme

Dark by default, server-rendered, no flash. An inline script in `layout.tsx`
resolves the stored theme before first paint and writes **both** `data-theme`
(source of truth) and `.dark` (so shadcn and Tailwind's `dark:` variant work
unmodified).

Color flows in two layers: `--semantic-*` on `:root`/`.dark` is the runtime
layer, and `@theme inline` in `styles/theme.css` maps it into `--color-*` so
Tailwind emits real utilities that still switch at runtime. That is why no
component in this project uses `style={{ }}`.
