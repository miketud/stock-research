'use client';

// class:base — written entirely in token utilities.
//
// No inline styles anywhere, which only became possible once theme.css adopted
// `@theme inline`: bg-surface, text-text-muted and border-border are real
// generated utilities now, and they still switch at runtime.
//
// The NavBar is a static wordmark plus a right-aligned theme toggle. There is
// deliberately no nav list here: the nav system has been removed, so the header
// is just the home link and the single action extension point.

import Link from 'next/link';

import { ExtensionPoint } from '@/components/ExtensionPoint';
import headerActions from '@/extensions/header-actions/index.generated';

export function NavBar() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-6 px-6">
        {/* The wordmark is the home link — a separate "Home" nav item would be
            the same destination twice. */}
        <Link
          href="/"
          aria-label="stock-research — home"
          className="group flex shrink-0 items-center gap-3"
        >
          <span className="text-lg font-bold tracking-tight text-text">STOCK RESEARCH</span>
        </Link>

        <ExtensionPoint
          name="header-actions"
          entries={headerActions}
          className="ml-auto flex items-center gap-2"
        />
      </div>
    </header>
  );
}