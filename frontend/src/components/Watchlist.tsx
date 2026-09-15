'use client';

import { useMemo, useState } from 'react';
import { matchTickers, type TickerDirectoryItem } from '@/lib/ticker-directory';

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

function SortIcon({ ascending }: { ascending: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3" aria-hidden="true">
      <path
        d={ascending ? 'M8 3v10m0 0 3.5-3.5M8 13 4.5 9.5' : 'M8 13V3m0 0 3.5 3.5M8 3 4.5 6.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
    </svg>
  );
}

interface WatchlistProps {
  watchlist: Set<string>;
  activeTicker: string;
  loading: boolean;
  tickerDirectory: TickerDirectoryItem[];
  onSelectTicker: (ticker: string) => void;
  onToggleWatchlist: (ticker: string) => void;
}

export function Watchlist({
  watchlist,
  activeTicker,
  loading,
  tickerDirectory,
  onSelectTicker,
  onToggleWatchlist,
}: WatchlistProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [draftTicker, setDraftTicker] = useState('');
  const [quickAddFocused, setQuickAddFocused] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [sortAscending, setSortAscending] = useState(true);
  const watchedTickers = useMemo(() => {
    const sorted = [...watchlist].sort((a, b) => a.localeCompare(b));
    return sortAscending ? sorted : sorted.reverse();
  }, [watchlist, sortAscending]);

  /* The rail is narrow, so it shows a shorter list than the header search. */
  const suggestions = useMemo(
    () => matchTickers(tickerDirectory, draftTicker, 6),
    [draftTicker, tickerDirectory]
  );
  const suggestionsOpen = quickAddFocused && suggestions.length > 0;

  /* Quick add is add-only: toggling would silently drop a ticker already on
     watch, so an existing one just becomes the selection instead. */
  const addTicker = (rawTicker: string) => {
    const normalizedTicker = rawTicker.trim().toUpperCase();
    if (!normalizedTicker) return;

    if (!watchlist.has(normalizedTicker)) onToggleWatchlist(normalizedTicker);
    onSelectTicker(normalizedTicker);
    setDraftTicker('');
    setActiveSuggestion(0);
    setQuickAddFocused(false);
  };

  const handleQuickAdd = (event: React.FormEvent) => {
    event.preventDefault();
    /* Enter takes the highlighted suggestion when the list is open, so a
       partial name still resolves to a real symbol. */
    addTicker(suggestionsOpen ? suggestions[activeSuggestion].ticker : draftTicker);
  };

  const handleQuickAddKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setQuickAddFocused(false);
      return;
    }
    if (!suggestionsOpen) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestion((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestion((index) => (index - 1 + suggestions.length) % suggestions.length);
    }
  };

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
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
            Watchlist
          </h2>
        )}
      </div>
      {!collapsed && (
        <div className="relative shrink-0 border-b border-border">
          <form onSubmit={handleQuickAdd} className="flex items-stretch">
            <input
              value={draftTicker}
              onChange={(event) => {
                setDraftTicker(event.target.value);
                setActiveSuggestion(0);
              }}
              onFocus={() => setQuickAddFocused(true)}
              onBlur={() => window.setTimeout(() => setQuickAddFocused(false), 120)}
              onKeyDown={handleQuickAddKeyDown}
              placeholder="ADD TICKER"
              aria-label="Add ticker to watchlist"
              spellCheck={false}
              autoComplete="off"
              maxLength={24}
              role="combobox"
              aria-controls="watchlist-quick-add-suggestions"
              aria-expanded={suggestionsOpen}
              aria-autocomplete="list"
              aria-activedescendant={
                suggestionsOpen
                  ? `watchlist-quick-add-${suggestions[activeSuggestion].ticker}`
                  : undefined
              }
              className="h-7 w-full min-w-0 bg-transparent px-3 text-xs font-black uppercase text-text placeholder:font-normal placeholder:tracking-[0.2em] placeholder:text-text-subtle focus:bg-surface-alt focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draftTicker.trim()}
              aria-label="Add to watchlist"
              title="Add to watchlist"
              className="grid w-7 shrink-0 place-items-center text-text-subtle transition-colors hover:bg-surface-alt hover:text-primary disabled:pointer-events-none disabled:opacity-40"
            >
              <WatchlistMark active={false} />
            </button>
          </form>
          {suggestionsOpen && (
            <ul
              id="watchlist-quick-add-suggestions"
              role="listbox"
              className="absolute left-0 right-0 top-full z-40 max-h-64 overflow-y-auto border border-border bg-surface"
            >
              {suggestions.map((suggestion, index) => (
                <li
                  key={suggestion.ticker}
                  id={`watchlist-quick-add-${suggestion.ticker}`}
                  role="option"
                  aria-selected={index === activeSuggestion}
                >
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => addTicker(suggestion.ticker)}
                    title={suggestion.name}
                    className={`flex w-full flex-col gap-0.5 border-b border-border px-3 py-1 text-left last:border-b-0 ${
                      index === activeSuggestion ? 'bg-primary-muted' : 'hover:bg-surface-alt'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2 text-xs font-black text-primary">
                      {suggestion.ticker}
                      {watchlist.has(suggestion.ticker.toUpperCase()) && (
                        <span className="text-[9px] font-normal uppercase tracking-[0.15em] text-text-subtle">
                          On watch
                        </span>
                      )}
                    </span>
                    <span className="truncate text-[10px] text-text-muted">{suggestion.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
      <div
        className={`mt-auto flex h-7 shrink-0 items-center border-t border-border text-[10px] text-text-subtle ${
          collapsed ? 'justify-center px-0' : 'justify-between px-3'
        }`}
      >
        {!collapsed && (
          <button
            type="button"
            onClick={() => setSortAscending((current) => !current)}
            aria-label={
              sortAscending ? 'Sort tickers Z to A' : 'Sort tickers A to Z'
            }
            title={sortAscending ? 'Sorted A–Z' : 'Sorted Z–A'}
            className="-mx-1 flex items-center gap-1 px-1 uppercase tracking-[0.2em] transition-colors hover:text-text"
          >
            {sortAscending ? 'A–Z' : 'Z–A'}
            <SortIcon ascending={sortAscending} />
          </button>
        )}
        <span className="tabular-nums" aria-label={`${watchlist.size} companies`}>
          {watchlist.size}
        </span>
      </div>
    </aside>
  );
}
