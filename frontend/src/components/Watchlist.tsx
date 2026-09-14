'use client';

import { useMemo, useState } from 'react';

/* A watched instrument is a flag, not a rating — so it is a marked cell rather
   than a star: a hairline square that takes an accent core when set. It reads
   at 10px, aligns with the mono grid, and carries no favourite/5-star
   connotation. */
export function WatchlistMark({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
      <rect
        x="2.5"
        y="2.5"
        width="11"
        height="11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {active && <rect x="5.5" y="5.5" width="5" height="5" fill="currentColor" />}
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
      <path
        d={direction === 'left' ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6'}
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface WatchlistProps {
  watchlist: Set<string>;
  activeTicker: string;
  loading: boolean;
  onSelectTicker: (ticker: string) => void;
  onToggleWatchlist: (ticker: string) => void;
}

export function Watchlist({
  watchlist,
  activeTicker,
  loading,
  onSelectTicker,
  onToggleWatchlist,
}: WatchlistProps) {
  const [collapsed, setCollapsed] = useState(false);
  const watchedTickers = useMemo(
    () => [...watchlist].sort((a, b) => a.localeCompare(b)),
    [watchlist]
  );

  return (
    <aside
      aria-label="Watchlist"
      data-collapsed={collapsed}
      style={{
        top: 'var(--app-header-h, 6.5rem)',
        height: 'calc(100dvh - var(--app-header-h, 6.5rem))',
      }}
      className={`sticky z-30 flex shrink-0 flex-col self-start overflow-hidden border-r border-border bg-surface font-mono transition-[width] duration-200 ease-smooth ${
        collapsed ? 'w-[50px]' : 'w-52'
      }`}
    >
      <div
        className={`flex shrink-0 items-center border-b border-border ${
          collapsed ? 'flex-col gap-1 px-0 py-1.5' : 'justify-between px-3 py-1.5'
        }`}
      >
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand watchlist' : 'Collapse watchlist'}
          title={collapsed ? 'Expand watchlist' : 'Collapse watchlist'}
          className={`grid size-6 place-items-center text-text-subtle transition-colors hover:bg-surface-alt hover:text-text ${
            collapsed ? 'order-first' : 'order-last'
          }`}
        >
          <ChevronIcon direction={collapsed ? 'right' : 'left'} />
        </button>
        {!collapsed && (
          <>
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
              Watchlist
            </h2>
            <span
              className="text-[10px] tabular-nums text-text-subtle"
              aria-label={`${watchlist.size} companies`}
            >
              {watchlist.size}
            </span>
          </>
        )}
      </div>
      {watchedTickers.length === 0 ? (
        collapsed ? (
          <div
            className="grid flex-1 place-items-center text-[10px] text-text-subtle"
            aria-hidden="true"
          >
            <span className="[writing-mode:vertical-rl]">EMPTY</span>
          </div>
        ) : (
          <div className="grid min-h-24 place-items-center px-3 text-center text-[11px] text-text-subtle">
            None on watch.
          </div>
        )
      ) : (
        <ul className="flex-1 divide-y divide-border overflow-y-auto">
          {watchedTickers.map((watchedTicker) => (
            <li
              key={watchedTicker}
              className={collapsed ? '' : 'grid grid-cols-[1fr_auto] items-stretch'}
            >
              <button
                type="button"
                onClick={() => onSelectTicker(watchedTicker)}
                disabled={loading && activeTicker === watchedTicker}
                title={watchedTicker}
                className={`h-7 w-full min-w-0 truncate text-xs font-black transition-colors hover:bg-surface-alt disabled:cursor-wait ${
                  collapsed ? 'px-1 text-center text-[11px]' : 'px-3 text-left'
                } ${activeTicker === watchedTicker ? 'bg-primary-muted text-primary' : 'text-text'}`}
              >
                {watchedTicker}
              </button>
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => onToggleWatchlist(watchedTicker)}
                  aria-label={`Remove ${watchedTicker} from watchlist`}
                  title="Remove from watchlist"
                  className="grid w-7 place-items-center text-primary transition-colors hover:bg-surface-alt hover:text-danger"
                >
                  <WatchlistMark active />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
