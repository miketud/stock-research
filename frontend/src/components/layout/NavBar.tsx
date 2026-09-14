'use client';

import Link from 'next/link';

import { ExtensionPoint } from '@/components/ExtensionPoint';
import { RedditMentionTicker } from '@/components/RedditMentionTicker';
import headerActions from '@/extensions/header-actions/index.generated';

export function NavBar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b-4 border-border-strong bg-surface">
      <div className="flex min-h-16 w-full items-center gap-4 px-6">
        <Link
          href="/"
          aria-label="stock-research — home"
          className="shrink-0 px-2 py-1 text-text transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
        >
          <span className="text-sm font-black uppercase tracking-tight sm:text-lg">
            Stock Research
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <nav aria-label="Primary navigation">
            <Link
              href="/reference"
              className="inline-flex h-10 items-center border-2 border-border-strong bg-surface-alt px-4 text-xs font-black uppercase tracking-wide text-text shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:bg-primary hover:text-primary-contrast hover:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
            >
              Info
            </Link>
          </nav>
          <ExtensionPoint
            name="header-actions"
            entries={headerActions}
            className="flex items-center [&_[data-ui-toggle]]:m-0"
          />
        </div>
      </div>
      <RedditMentionTicker />
    </header>
  );
}
