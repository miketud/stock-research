'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { motion } from 'motion/react';
import { FormsTableMain, type Filing } from '@/components/FormsTableMain';
import { Watchlist, WatchlistMark } from '@/components/Watchlist';
import {
  InsiderFormsTable,
  type InsiderActivity,
  type InsiderTransactionsResponse,
} from '@/components/InsiderFormsTable';
import { FadeIn } from '@/components/motion/FadeIn';
import { ResearchMetricsRail, type FinancialMetric } from '@/components/ResearchMetricsRail';

interface CompanyInfo {
  entityType?: string;
  sic?: string;
  sicDescription?: string;
  tickers?: string[];
  exchanges?: string[];
  ein?: string;
  category?: string;
  fiscalYearEnd?: string;
  stateOfIncorporation?: string;
  website?: string;
  investorWebsite?: string;
  phone?: string;
  formerNames?: Array<{ name: string; from: string; to: string }>;
  addresses?: {
    business?: Record<string, string | null>;
    mailing?: Record<string, string | null>;
  };
}

interface SECResponse {
  company_id: string;
  cik: string;
  entityName: string;
  companyInfo?: CompanyInfo;
  financialSnapshot?: FinancialMetric[];
  insiderActivity?: InsiderActivity;
  filings: Filing[];
}

interface TickerDirectoryItem {
  ticker: string;
  name: string;
}

interface TickerDirectoryCache {
  version: number;
  fetchedAt: string;
  tickers: TickerDirectoryItem[];
}

type SyncStatus = 'idle' | 'running' | 'success' | 'error';
type CompanySyncStatus = 'queued' | 'loading' | 'success' | 'error';

interface SyncedCompany {
  ticker: string;
  cik: string;
  entityName: string;
  status: CompanySyncStatus;
  filings: Filing[];
  updatedAt?: string;
  error?: string;
}

interface SecSyncState {
  status: SyncStatus;
  processed: number;
  total: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  companies: SyncedCompany[];
}

const WATCHLIST_STORAGE_KEY = 'stock-research.watchlist.v1';
const WATCHLIST_EVENT = 'stock-research:watchlist-change';
const TICKER_DIRECTORY_STORAGE_KEY = 'stock-research.ticker-directory.v1';
const TICKER_DIRECTORY_TTL_MS = 24 * 60 * 60 * 1000;

function subscribeToWatchlist(onStoreChange: () => void): () => void {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(WATCHLIST_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(WATCHLIST_EVENT, onStoreChange);
  };
}

function getWatchlistSnapshot(): string {
  return window.localStorage.getItem(WATCHLIST_STORAGE_KEY) ?? '[]';
}

function getServerWatchlistSnapshot(): string {
  return '[]';
}

function saveWatchlist(tickers: Set<string>): void {
  window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([...tickers].sort()));
  window.dispatchEvent(new Event(WATCHLIST_EVENT));
}

function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
      <path
        d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function formatAddress(address?: Record<string, string | null>): string | undefined {
  if (!address) return undefined;
  const locality = [address.city, address.stateOrCountry, address.zipCode]
    .filter(Boolean)
    .join(', ');
  return [address.street1, address.street2, locality].filter(Boolean).join(' · ') || undefined;
}

function RssJobIndicator({ state }: { state: SecSyncState | null }) {
  const status = state?.status ?? 'idle';
  const paths = ['M4 17a3 3 0 0 1 3 3', 'M4 11a9 9 0 0 1 9 9', 'M4 5a15 15 0 0 1 15 15'];
  const signalColor =
    status === 'error'
      ? 'var(--semantic-danger)'
      : status === 'success'
        ? 'var(--semantic-success)'
        : 'var(--semantic-info)';

  return (
    <svg viewBox="0 0 24 24" className="size-7" fill="none" aria-hidden="true">
      {paths.map((path) => (
        <path
          key={`base-${path}`}
          d={path}
          stroke="var(--semantic-text-subtle)"
          strokeWidth="2.25"
          strokeLinecap="round"
        />
      ))}
      {paths.map((path, index) => (
        <motion.path
          key={path}
          d={path}
          stroke={signalColor}
          strokeWidth="2.25"
          strokeLinecap="round"
          initial={false}
          animate={
            status === 'running'
              ? { pathLength: [0, 1, 1, 0], opacity: [0, 1, 1, 0] }
              : {
                  pathLength: status === 'success' || status === 'error' ? 1 : 0,
                  opacity: status === 'success' || status === 'error' ? 1 : 0,
                }
          }
          transition={
            status === 'running'
              ? {
                  duration: 1.8,
                  times: [0, 0.3, 0.72, 1],
                  ease: 'easeInOut',
                  repeat: Infinity,
                  delay: index * 0.18,
                }
              : { duration: 0.35, ease: 'easeOut', delay: index * 0.07 }
          }
        />
      ))}
    </svg>
  );
}

export default function Home() {
  const [ticker, setTicker] = useState('');
  const [tickerDirectory, setTickerDirectory] = useState<TickerDirectoryItem[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const initialTickerHandled = useRef(false);
  const [activeTicker, setActiveTicker] = useState('');
  const [data, setData] = useState<SECResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SecSyncState | null>(null);
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);
  const [syncRequestError, setSyncRequestError] = useState<string | null>(null);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(() => new Set());
  const [insiderDetails, setInsiderDetails] = useState<InsiderTransactionsResponse | null>(null);
  const [insiderLoading, setInsiderLoading] = useState(false);
  const [insiderLoadingMore, setInsiderLoadingMore] = useState(false);
  const [insiderLimit, setInsiderLimit] = useState(10);
  const [insiderError, setInsiderError] = useState<string | null>(null);
  const insiderRequestId = useRef(0);
  // Session-lived, per-ticker. Filing metadata moves on SEC's schedule, not the
  // user's, so re-fetching it to render a company already in hand only buys a
  // blank panel.
  const companyCache = useRef(new Map<string, SECResponse>());
  const insiderCache = useRef(
    new Map<string, { details: InsiderTransactionsResponse; limit: number }>()
  );
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const watchlistSnapshot = useSyncExternalStore(
    subscribeToWatchlist,
    getWatchlistSnapshot,
    getServerWatchlistSnapshot
  );
  const watchlist = useMemo(() => {
    try {
      const stored = JSON.parse(watchlistSnapshot) as unknown;
      if (!Array.isArray(stored)) return new Set<string>();
      return new Set(
        stored
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean)
      );
    } catch {
      return new Set<string>();
    }
  }, [watchlistSnapshot]);

  useEffect(() => {
    let active = true;
    let cached: TickerDirectoryCache | null = null;
    try {
      cached = JSON.parse(
        window.localStorage.getItem(TICKER_DIRECTORY_STORAGE_KEY) ?? 'null'
      ) as TickerDirectoryCache | null;
      if (cached?.version === 1 && Array.isArray(cached.tickers)) {
        const cachedTickers = cached.tickers;
        queueMicrotask(() => {
          if (active) setTickerDirectory(cachedTickers);
        });
      } else {
        cached = null;
      }
    } catch {
      window.localStorage.removeItem(TICKER_DIRECTORY_STORAGE_KEY);
    }

    if (cached && Date.now() - Date.parse(cached.fetchedAt) < TICKER_DIRECTORY_TTL_MS) {
      return () => {
        active = false;
      };
    }

    void fetch('/api/sec/tickers')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Ticker directory unavailable (${response.status}).`);
        return response.json() as Promise<TickerDirectoryCache>;
      })
      .then((directory) => {
        if (!active || directory.version !== 1 || !Array.isArray(directory.tickers)) return;
        setTickerDirectory(directory.tickers);
        try {
          window.localStorage.setItem(TICKER_DIRECTORY_STORAGE_KEY, JSON.stringify(directory));
        } catch {
          // Search still works for this session if browser storage is unavailable or full.
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const tickerSuggestions = useMemo(() => {
    const query = ticker.trim().toUpperCase();
    if (!query) return [];
    const scored = tickerDirectory
      .map((entry) => {
        const symbol = entry.ticker.toUpperCase();
        const name = entry.name.toUpperCase();
        const score =
          symbol === query
            ? 0
            : symbol.startsWith(query)
              ? 1
              : name.startsWith(query)
                ? 2
                : name.includes(query)
                  ? 3
                  : 4;
        return { entry, score };
      })
      .filter(({ score }) => score < 4)
      .sort((a, b) => a.score - b.score || a.entry.ticker.localeCompare(b.entry.ticker));
    return scored.slice(0, 8).map(({ entry }) => entry);
  }, [ticker, tickerDirectory]);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        const response = await fetch('/api/sec/sync/status', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Job status unavailable: ${response.statusText}`);
        const nextState: SecSyncState = await response.json();
        if (active) {
          setSyncState(nextState);
          setSyncRequestError(null);
        }
      } catch (requestError) {
        if (active) {
          setSyncRequestError(
            requestError instanceof Error ? requestError.message : 'Job status unavailable.'
          );
        }
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, 2000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const runSync = async () => {
    setSyncPanelOpen(true);
    setSyncRequestError(null);

    try {
      const response = await fetch('/api/sec/sync', { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message || `Could not start job: ${response.statusText}`);
      }
      setSyncState(await response.json());
    } catch (requestError) {
      setSyncRequestError(
        requestError instanceof Error ? requestError.message : 'Could not start SEC sync.'
      );
    }
  };

  const stopSync = async () => {
    setSyncRequestError(null);

    try {
      const response = await fetch('/api/sec/sync/stop', { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message || `Could not stop job: ${response.statusText}`);
      }
      setSyncState(await response.json());
    } catch (requestError) {
      setSyncRequestError(
        requestError instanceof Error ? requestError.message : 'Could not stop SEC sync.'
      );
    }
  };

  const toggleCompany = (cik: string) => {
    setExpandedCompanies((current) => {
      const next = new Set(current);
      if (next.has(cik)) next.delete(cik);
      else next.add(cik);
      return next;
    });
  };

  const toggleWatchlist = (companyTicker: string) => {
    const normalizedTicker = companyTicker.trim().toUpperCase();
    if (!normalizedTicker) return;

    const next = new Set(watchlist);
    if (next.has(normalizedTicker)) next.delete(normalizedTicker);
    else next.add(normalizedTicker);
    saveWatchlist(next);
  };

  const displayedSyncCompanies = useMemo(() => {
    const priority: Record<CompanySyncStatus, number> = {
      loading: 0,
      queued: 1,
      error: 2,
      success: 3,
    };
    return [...(syncState?.companies ?? [])]
      .filter((company) => !watchlistOnly || watchlist.has(company.ticker.toUpperCase()))
      .sort((a, b) => priority[a.status] - priority[b.status]);
  }, [syncState, watchlist, watchlistOnly]);

  const companyProfile = useMemo(() => {
    const info = data?.companyInfo ?? {};
    return {
      industry:
        [info.sicDescription, info.sic ? `SIC ${info.sic}` : undefined]
          .filter(Boolean)
          .join(' · ') || undefined,
      exchange: info.exchanges?.filter(Boolean).join(', ') || undefined,
    };
  }, [data]);

  const loadInsiderTransactions = async (companyTicker: string, limit = 10, loadMore = false) => {
    const requestId = ++insiderRequestId.current;
    if (loadMore) setInsiderLoadingMore(true);
    else setInsiderLoading(true);
    setInsiderError(null);

    try {
      const response = await fetch(
        `/api/sec/insiders?ticker=${encodeURIComponent(companyTicker)}&limit=${limit}`
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(
          body?.message || `Could not load insider transactions: ${response.statusText}`
        );
      }
      const details: InsiderTransactionsResponse = await response.json();
      if (requestId !== insiderRequestId.current) return;
      insiderCache.current.set(companyTicker, { details, limit });
      setInsiderDetails(details);
      setInsiderLimit(limit);
    } catch (requestError) {
      if (requestId !== insiderRequestId.current) return;
      if (!loadMore) setInsiderDetails(null);
      setInsiderError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not load insider transactions.'
      );
    } finally {
      if (requestId === insiderRequestId.current) {
        setInsiderLoading(false);
        setInsiderLoadingMore(false);
      }
    }
  };

  const loadMoreInsiderTransactions = () => {
    if (!insiderDetails || insiderLoadingMore) return;
    const totalFilings = insiderDetails.filings?.length ?? 0;
    const nextLimit = Math.min(insiderLimit + 10, totalFilings);
    if (nextLimit <= insiderLimit) return;

    void loadInsiderTransactions(activeTicker, nextLimit, true);
  };

  const showCompany = (requestedTicker: string, company: SECResponse) => {
    setData(company);
    setActiveTicker(requestedTicker);
    window.history.replaceState(null, '', `/?ticker=${encodeURIComponent(requestedTicker)}`);
  };

  const loadFilings = async (companyTicker: string) => {
    const requestedTicker = companyTicker.trim().toUpperCase();
    if (!requestedTicker) return;

    setTicker(requestedTicker);
    setError(null);

    // A company already fetched this session swaps straight into the open
    // panels: no null state, so the metrics rail keeps its width and the tables
    // do not flash empty on the way back to something already loaded.
    const cachedCompany = companyCache.current.get(requestedTicker);
    if (cachedCompany) {
      showCompany(requestedTicker, cachedCompany);
      const cachedInsiders = insiderCache.current.get(requestedTicker);
      insiderRequestId.current++;
      setInsiderLoading(false);
      setInsiderLoadingMore(false);
      setInsiderError(null);
      setInsiderDetails(cachedInsiders?.details ?? null);
      setInsiderLimit(cachedInsiders?.limit ?? 10);
      if (!cachedInsiders) void loadInsiderTransactions(requestedTicker);
      return;
    }

    setLoading(true);
    // The previous company stays on screen until the new one lands, rather than
    // clearing to an empty shell first.
    setInsiderError(null);

    try {
      const res = await fetch(
        `/api/sec/filings?ticker=${encodeURIComponent(requestedTicker)}&limit=100`
      );
      if (!res.ok) throw new Error(`Error fetching filings: ${res.statusText}`);
      const json: SECResponse = await res.json();
      companyCache.current.set(requestedTicker, json);
      showCompany(requestedTicker, json);
      setInsiderDetails(null);
      setInsiderLimit(10);
      void loadInsiderTransactions(requestedTicker);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchFilings = (event: React.FormEvent) => {
    event.preventDefault();
    void loadFilings(ticker);
  };

  const selectTicker = (selected: string) => {
    setTicker(selected);
    setSearchFocused(false);
    setActiveSuggestion(0);
    void loadFilings(selected);
  };

  useEffect(() => {
    if (initialTickerHandled.current) return;
    initialTickerHandled.current = true;
    const initialTicker = new URLSearchParams(window.location.search).get('ticker');
    const timeout = initialTicker
      ? window.setTimeout(() => void loadFilings(initialTicker), 0)
      : undefined;
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
    // This is intentionally a one-time hydration of the URL into the existing client-side search flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex w-full items-start font-sans">
      <Watchlist
        watchlist={watchlist}
        activeTicker={activeTicker}
        loading={loading}
        onSelectTicker={(t) => void loadFilings(t)}
        onToggleWatchlist={toggleWatchlist}
      />

      <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6">
        <main className="min-w-0">
          <FadeIn>
            <div className="mb-6">
              <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                <div className="flex w-full items-stretch gap-2 sm:w-auto">
                  <div className="relative min-w-0 flex-1">
                    <form
                      onSubmit={fetchFilings}
                      className="flex h-9 min-w-0 border border-border bg-surface focus-within:border-primary"
                    >
                      <label htmlFor="ticker-search" className="sr-only">
                        Search ticker
                      </label>
                      <input
                        id="ticker-search"
                        type="text"
                        value={ticker}
                        onChange={(event) => {
                          setTicker(event.target.value.toUpperCase());
                          setActiveSuggestion(0);
                        }}
                        onFocus={() => setSearchFocused(true)}
                        onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
                        onKeyDown={(event) => {
                          if (!searchFocused || tickerSuggestions.length === 0) return;
                          if (event.key === 'ArrowDown') {
                            event.preventDefault();
                            setActiveSuggestion((index) => (index + 1) % tickerSuggestions.length);
                          } else if (event.key === 'ArrowUp') {
                            event.preventDefault();
                            setActiveSuggestion(
                              (index) =>
                                (index - 1 + tickerSuggestions.length) % tickerSuggestions.length
                            );
                          } else if (event.key === 'Enter' && tickerSuggestions[activeSuggestion]) {
                            event.preventDefault();
                            selectTicker(tickerSuggestions[activeSuggestion].ticker);
                          } else if (event.key === 'Escape') {
                            setSearchFocused(false);
                          }
                        }}
                        placeholder="Ticker"
                        autoComplete="off"
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded={searchFocused && tickerSuggestions.length > 0}
                        aria-controls="ticker-suggestions"
                        aria-activedescendant={
                          searchFocused && tickerSuggestions[activeSuggestion]
                            ? `ticker-option-${tickerSuggestions[activeSuggestion].ticker}`
                            : undefined
                        }
                        className="h-full min-w-0 flex-1 bg-transparent px-2 font-mono text-sm font-black uppercase tracking-wide text-text placeholder:text-text-subtle focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={loading || ticker.trim().length === 0}
                        aria-label={loading ? 'Searching filings' : 'Search filings'}
                        title={loading ? 'Searching filings' : 'Search filings'}
                        className="grid h-full w-9 place-items-center border-l border-border text-primary transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-text-subtle"
                      >
                        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
                          <circle
                            cx="10.5"
                            cy="10.5"
                            r="6"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          />
                          <path d="m15 15 5 5" stroke="currentColor" strokeWidth="2.5" />
                        </svg>
                      </button>
                    </form>
                    {searchFocused && tickerSuggestions.length > 0 && (
                      <ul
                        id="ticker-suggestions"
                        role="listbox"
                        className="absolute left-0 right-0 top-full z-40 max-h-72 overflow-y-auto border border-border bg-surface"
                      >
                        {tickerSuggestions.map((suggestion, index) => (
                          <li
                            key={suggestion.ticker}
                            id={`ticker-option-${suggestion.ticker}`}
                            role="option"
                            aria-selected={index === activeSuggestion}
                          >
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => selectTicker(suggestion.ticker)}
                              className={`grid w-full grid-cols-[4.5rem_1fr] gap-2 border-b border-border px-2 py-1 text-left last:border-b-0 ${
                                index === activeSuggestion
                                  ? 'bg-primary-muted'
                                  : 'hover:bg-surface-alt'
                              }`}
                            >
                              <span className="font-mono text-xs font-black text-primary">
                                {suggestion.ticker}
                              </span>
                              <span className="truncate font-mono text-[11px] text-text-muted">
                                {suggestion.name}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={runSync}
                    aria-expanded={syncPanelOpen}
                    aria-controls="sec-sync-panel"
                    aria-label={
                      syncState?.status === 'running' ? 'SEC sync running' : 'Run SEC sync'
                    }
                    title={
                      syncState?.status === 'running' ? 'SEC sync running' : 'Run SEC metadata sync'
                    }
                    className="grid size-9 shrink-0 place-items-center border border-border bg-surface text-text transition-colors hover:bg-surface-alt hover:text-primary"
                  >
                    <RssJobIndicator state={syncState} />
                  </button>
                </div>
              </div>

              {syncPanelOpen && (
                <section
                  id="sec-sync-panel"
                  aria-label="SEC metadata sync activity"
                  className="mt-4 border border-border bg-surface"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1.5">
                    <div className="flex flex-wrap items-baseline gap-3">
                      <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.2em] text-primary">
                        Latest SEC filers
                      </h2>
                      <p className="font-mono text-[10px] text-text-subtle" aria-live="polite">
                        {syncState?.status === 'running'
                          ? syncState.total === 0
                            ? 'Reading SEC Latest Filings feed…'
                            : `Refreshing ${syncState.total} companies · ${syncState.processed} complete`
                          : syncState?.completedAt
                            ? `Last run ${new Date(syncState.completedAt).toLocaleString()}`
                            : 'No completed runs yet'}
                      </p>
                    </div>
                    <div
                      className="flex items-stretch divide-x divide-border border border-border"
                      role="group"
                      aria-label="Company filter"
                    >
                      <button
                        type="button"
                        onClick={() => setWatchlistOnly(false)}
                        aria-pressed={!watchlistOnly}
                        className={`px-2 py-1 font-mono text-[10px] font-black uppercase tracking-wide transition-colors hover:bg-surface-alt ${
                          !watchlistOnly ? 'text-primary' : 'text-text-subtle'
                        }`}
                      >
                        All {syncState?.companies.length ?? 0}
                      </button>
                      <button
                        type="button"
                        onClick={() => setWatchlistOnly(true)}
                        aria-pressed={watchlistOnly}
                        className={`px-2 py-1 font-mono text-[10px] font-black uppercase tracking-wide transition-colors hover:bg-surface-alt ${
                          watchlistOnly ? 'text-primary' : 'text-text-subtle'
                        }`}
                      >
                        WL {watchlist.size}
                      </button>
                      <button
                        type="button"
                        onClick={() => void stopSync()}
                        disabled={syncState?.status !== 'running'}
                        title={
                          syncState?.status === 'running'
                            ? 'Stop the running SEC sync'
                            : 'No SEC sync is running'
                        }
                        className="px-2 py-1 font-mono text-[10px] font-black uppercase tracking-wide text-danger transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-text-subtle"
                      >
                        Stop
                      </button>
                      <button
                        type="button"
                        onClick={() => setSyncPanelOpen(false)}
                        className="px-2 py-1 font-mono text-[10px] font-black uppercase tracking-wide text-text-subtle transition-colors hover:bg-surface-alt hover:text-text"
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  {(syncRequestError || syncState?.error) && (
                    <p className="border-b border-danger bg-surface-alt px-3 py-1.5 font-mono text-[11px] font-bold text-danger">
                      {syncRequestError || syncState?.error}
                    </p>
                  )}

                  <div className="max-h-[28rem] divide-y divide-border overflow-y-auto">
                    {displayedSyncCompanies.length === 0 ? (
                      <p className="px-3 py-4 font-mono text-[11px] text-text-muted">
                        {watchlistOnly
                          ? watchlist.size === 0
                            ? 'Your watchlist is empty. Star a searched company or a company in this feed.'
                            : 'None of your watched companies are in the current latest 50.'
                          : 'Run the SEC sync to load the latest 50 listed companies from the global Latest Filings feed.'}
                      </p>
                    ) : (
                      displayedSyncCompanies.map((company) => {
                        const expanded = expandedCompanies.has(company.cik);
                        return (
                          <div
                            key={company.cik}
                            className={`bg-surface transition-colors ${
                              company.status === 'loading' ? 'sec-company-loading' : ''
                            }`}
                          >
                            <div className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-2 px-3 py-1">
                              <span
                                className={`size-1.5 ${
                                  company.status === 'success'
                                    ? 'bg-success'
                                    : company.status === 'error'
                                      ? 'bg-danger'
                                      : company.status === 'loading'
                                        ? 'bg-primary'
                                        : 'bg-text-subtle'
                                }`}
                                aria-hidden="true"
                              />
                              <button
                                type="button"
                                onClick={() => toggleCompany(company.cik)}
                                aria-expanded={expanded}
                                className="grid min-w-0 grid-cols-[4rem_1fr] items-baseline gap-2 text-left"
                              >
                                <span className="font-mono text-xs font-black text-primary">
                                  {company.ticker}
                                </span>
                                <span className="min-w-0 truncate font-mono text-[11px] text-text">
                                  {company.entityName}
                                  <span className="ml-2 uppercase text-text-subtle">
                                    {company.status}
                                    {company.updatedAt
                                      ? ` · ${new Date(company.updatedAt).toLocaleTimeString()}`
                                      : ''}
                                  </span>
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleWatchlist(company.ticker)}
                                aria-label={`${watchlist.has(company.ticker.toUpperCase()) ? 'Remove' : 'Add'} ${company.ticker} ${watchlist.has(company.ticker.toUpperCase()) ? 'from' : 'to'} watchlist`}
                                aria-pressed={watchlist.has(company.ticker.toUpperCase())}
                                title={
                                  watchlist.has(company.ticker.toUpperCase())
                                    ? 'Remove from watchlist'
                                    : 'Add to watchlist'
                                }
                                className={`grid size-6 place-items-center transition-colors hover:bg-surface-alt ${
                                  watchlist.has(company.ticker.toUpperCase())
                                    ? 'text-primary'
                                    : 'text-text-subtle hover:text-primary'
                                }`}
                              >
                                <WatchlistMark
                                  active={watchlist.has(company.ticker.toUpperCase())}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleCompany(company.cik)}
                                aria-label={`${expanded ? 'Collapse' : 'Expand'} ${company.entityName} filings`}
                                className="grid size-6 place-items-center font-mono text-sm text-text-subtle hover:bg-surface-alt hover:text-text"
                              >
                                {expanded ? '−' : '+'}
                              </button>
                            </div>

                            {expanded && (
                              <div className="border-t border-border bg-bg-alt px-3 py-1">
                                {company.error ? (
                                  <p className="py-1 font-mono text-[11px] font-bold text-danger">
                                    {company.error}
                                  </p>
                                ) : company.filings.length === 0 ? (
                                  <p className="py-1 font-mono text-[11px] text-text-muted">
                                    No filing metadata loaded.
                                  </p>
                                ) : (
                                  <ul className="divide-y divide-border">
                                    {company.filings.map((filing) => (
                                      <li
                                        key={filing.accessionNumber}
                                        className="grid grid-cols-[5rem_1fr_auto] items-center gap-3 py-1 font-mono text-[11px]"
                                      >
                                        <span className="truncate font-black text-primary">
                                          {filing.type}
                                        </span>
                                        <span className="tabular-nums text-text-muted">
                                          {filing.fileDate}
                                        </span>
                                        <a
                                          href={filing.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="uppercase text-text-subtle hover:text-primary"
                                        >
                                          Open
                                        </a>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>
              )}
            </div>
          </FadeIn>

          {error && (
            <FadeIn delay={0.2}>
              <div className="mb-4 border border-danger bg-surface px-3 py-2 font-mono text-[11px] font-black uppercase tracking-wide text-danger">
                {error}
              </div>
            </FadeIn>
          )}

          {data && (
            <FadeIn delay={0.2}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
                <div className="min-w-0">
                  <h2 className="font-mono text-xl font-black uppercase tracking-wide text-primary">
                    {activeTicker}{' '}
                    <span className="text-sm font-black text-text">{data.entityName}</span>
                  </h2>
                  {(companyProfile.industry ||
                    companyProfile.exchange ||
                    data.companyInfo?.phone) && (
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-text-subtle">
                      {[companyProfile.industry, companyProfile.exchange, data.companyInfo?.phone]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tabular-nums text-text-subtle">
                    CIK {data.cik}
                  </span>
                  {formatAddress(data.companyInfo?.addresses?.business) && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        formatAddress(data.companyInfo?.addresses?.business) ?? ''
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${formatAddress(data.companyInfo?.addresses?.business)} in maps`}
                      title={formatAddress(data.companyInfo?.addresses?.business)}
                      className="grid size-8 place-items-center border border-border bg-surface text-text-subtle transition-colors hover:bg-surface-alt hover:text-primary"
                    >
                      <MapPinIcon />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleWatchlist(activeTicker)}
                    aria-label={`${watchlist.has(activeTicker) ? 'Remove' : 'Add'} ${activeTicker} ${watchlist.has(activeTicker) ? 'from' : 'to'} watchlist`}
                    aria-pressed={watchlist.has(activeTicker)}
                    title={
                      watchlist.has(activeTicker) ? 'Remove from watchlist' : 'Add to watchlist'
                    }
                    className={`grid size-8 place-items-center border border-border bg-surface transition-colors hover:bg-surface-alt ${
                      watchlist.has(activeTicker)
                        ? 'text-primary'
                        : 'text-text-subtle hover:text-primary'
                    }`}
                  >
                    <WatchlistMark active={watchlist.has(activeTicker)} />
                  </button>
                </div>
              </div>

              <FormsTableMain key={`forms-${activeTicker}`} filings={data.filings} />

              <InsiderFormsTable
                key={`insiders-${activeTicker}`}
                activity={data.insiderActivity}
                details={insiderDetails}
                loading={insiderLoading}
                loadingMore={insiderLoadingMore}
                error={insiderError}
                limit={insiderLimit}
                onLoadMore={loadMoreInsiderTransactions}
              />
            </FadeIn>
          )}
        </main>
      </div>

      <ResearchMetricsRail
        ticker={data ? activeTicker : ''}
        financials={data?.financialSnapshot}
        insiderActivity={data?.insiderActivity}
        filings={data?.filings}
      />
    </div>
  );
}
