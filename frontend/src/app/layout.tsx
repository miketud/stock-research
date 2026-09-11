// ─────────────────────────────────────────────────────────────────────────────
// class:base — FROZEN after this point, and hash-enforced.
//
// layout.tsx is the archetypal singleton: Next permits exactly one, and every
// injection that wants to wrap the tree, add a header item, or load a font would
// otherwise have to edit it. Here it changes never. Instead:
//
//   a React context   → providers/NN-name.tsx
//   a header item     → extensions/header-actions/NN-name.tsx
//   a nav link        → nav/<id>.nav.ts
//   CSS               → styles/layers/<id>.css
//
// <html> ships class="dark" data-theme="dark" from the server, so the page is
// dark with JavaScript disabled and the inline script only ever has to REMOVE
// the class. suppressHydrationWarning is required and sufficient: the script
// mutates <html> before React hydrates, and that one element is expected to
// differ.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';

import './globals.css';

import { fontVariables } from './fonts';
import { Providers } from './providers';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { themeInitScript } from '@/lib/theme-script';

export const metadata: Metadata = {
  title: 'stock-research',
  description: 'TypeScript ground layer — Fastify, Next.js 16, Tailwind v4.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${fontVariables}`} data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh bg-bg font-sans text-text antialiased">
        <Providers>
          <SiteHeader />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
