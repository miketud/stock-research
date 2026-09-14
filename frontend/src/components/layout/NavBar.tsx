'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { ExtensionPoint } from '@/components/ExtensionPoint';
import { RedditMentionTicker } from '@/components/RedditMentionTicker';
import headerActions from '@/extensions/header-actions/index.generated';

export function NavBar() {
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);

  // The header is sticky and its height is not a constant — the Reddit ticker
  // is conditional and its panels expand. Publishing the measured height lets
  // the side rails pin directly beneath it instead of scrolling under it.
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const publishHeight = () => {
      document.documentElement.style.setProperty(
        '--app-header-h',
        `${Math.round(header.getBoundingClientRect().height)}px`
      );
    };

    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 w-full border-b border-border bg-surface font-mono"
    >
      <div className="flex min-h-9 w-full items-center gap-4 px-3">
        <Link
          href="/"
          aria-label="stock-research — home"
          className="shrink-0 text-[11px] font-black uppercase tracking-[0.2em] text-primary transition-colors hover:text-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
        >
          Stock Research
        </Link>

        <div className="ml-auto flex items-stretch">
          {/* Flat, hairline, no offset shadow and no press translate: these are
              terminal function keys, not raised buttons. */}
          <nav aria-label="Primary navigation" className="flex items-stretch">
            {[
              { href: '/simulation', label: 'Sim' },
              { href: '/reference', label: 'Info' },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? 'page' : undefined}
                className={`inline-flex h-7 items-center border-y border-l border-border px-3 text-[10px] font-black uppercase tracking-wide transition-colors hover:bg-surface-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${
                  pathname === href ? 'text-primary' : 'text-text-subtle hover:text-text'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <ExtensionPoint
            name="header-actions"
            entries={headerActions}
            className="flex items-stretch [&_[data-ui-toggle]]:m-0"
          />
        </div>
      </div>
      {pathname !== '/simulation' && <RedditMentionTicker />}
    </header>
  );
}
