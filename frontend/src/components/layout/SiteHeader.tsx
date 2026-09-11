// class:base — written entirely in token utilities.
//
// No inline styles anywhere, which only became possible once theme.css adopted
// `@theme inline`: bg-surface, text-text-muted and border-border are real
// generated utilities now, and they still switch at runtime.

import Link from 'next/link';

import { ExtensionPoint } from '@/components/ExtensionPoint';
import headerActions from '@/extensions/header-actions/index.generated';
import nav from '@/nav/nav.generated';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-8 px-6">
        {/* The wordmark is the home link — a separate "Home" nav item would be
            the same destination twice. The mark is square because the radius
            scale is 0; a circle here would contradict everything else. */}
        <Link
          href="/"
          aria-label="stock-research — home"
          className="group flex shrink-0 items-center gap-2.5"
        >
          <span
            aria-hidden
            className="h-3.5 w-3.5 bg-primary transition-colors group-hover:bg-primary-hover"
          />
          <span className="text-sm font-semibold tracking-tight text-text">
            stock-research
          </span>
        </Link>

        <nav className="flex items-center gap-5">
          {nav.map((entry) => (
            <Link
              key={entry.id}
              href={entry.href}
              className="text-sm text-text-muted transition-colors hover:text-text"
            >
              {entry.label}
            </Link>
          ))}
        </nav>

        <ExtensionPoint
          name="header-actions"
          entries={headerActions}
          className="ml-auto flex items-center gap-2"
        />
      </div>
    </header>
  );
}
