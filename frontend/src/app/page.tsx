'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { motion } from 'motion/react';
import { FormsTableMain, type Filing } from '@/components/FormsTableMain';
import {
  InsiderFormsTable,
  type InsiderActivity,
  type InsiderTransactionsResponse,
} from '@/components/InsiderFormsTable';
import { FadeIn } from '@/components/motion/FadeIn';
import {
  ResearchMetricsRail,
  type FinancialMetric,
} from '@/components/ResearchMetricsRail';

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

function WatchlistStar({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path
        d="m12 2.9 2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 16.93l-5.5 2.89 1.05-6.12L3.1 9.37l6.15-.9L12 2.9Z"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
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

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
      <path
        d="M7.1 3h3l1.2 4.4-2 1.7a15.4 15.4 0 0 0 5.6 5.6l1.7-2L21 13.9v3A4.1 4.1 0 0 1 16.9 21 13.9 13.9 0 0 1 3 7.1 4.1 4.1 0 0 1 7.1 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatFiscalYearEnd(value?: string): string | undefined {
  if (!value || !/^\d{4}$/.test(value)) return value;
  return `${value.slice(0, 2)}-${value.slice(2)}`;
}

function formatAddress(address?: Record<string, string | null>): string | undefined {
  if (!address) return undefined;
  const locality = [address.city, address.stateOrCountry, address.zipCode].filter(Boolean).join(', ');
  return [address.street1, address.street2, locality].filter(Boolean).join(' · ') || undefined;
}

function externalHref(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function formatFinancialValue(metric: FinancialMetric): string {
  if (metric.unit === 'USD/shares') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(metric.value);
  }
  if (metric.unit === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(metric.value);
  }
  if (metric.unit === 'shares') {
    return `${new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(metric.value)} shares`;
  }
  return `${metric.value.toLocaleString()} ${metric.unit}`;
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
  const watchedTickers = useMemo(
    () => [...watchlist].sort((a, b) => a.localeCompare(b)),
    [watchlist]
  );

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
        const score = symbol === query
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

  const companyDetails = useMemo(() => {
    if (!data) return [];
    const info = data.companyInfo ?? {};
    const values: Array<{ label: string; value?: string }> = [
      {
        label: 'Industry',
        value: [info.sicDescription, info.sic ? `SIC ${info.sic}` : undefined]
          .filter(Boolean)
          .join(' · '),
      },
      { label: 'Exchange', value: info.exchanges?.filter(Boolean).join(', ') },
      { label: 'Entity', value: info.entityType },
      { label: 'Filer status', value: info.category },
      { label: 'Fiscal year end', value: formatFiscalYearEnd(info.fiscalYearEnd) },
      { label: 'Incorporated', value: info.stateOfIncorporation },
    ];
    return values.filter((item): item is { label: string; value: string } => Boolean(item.value));
  }, [data]);

  const loadInsiderTransactions = async (
    companyTicker: string,
    limit = 10,
    loadMore = false
  ) => {
    const requestId = ++insiderRequestId.current;
    if (loadMore) setInsiderLoadingMore(true);
    else setInsiderLoading(true);
    setInsiderError(null);
    if (!loadMore) setInsiderDetails(null);

    try {
      const response = await fetch(
        `/api/sec/insiders?ticker=${encodeURIComponent(companyTicker)}&limit=${limit}`
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message || `Could not load insider transactions: ${response.statusText}`);
      }
      const details: InsiderTransactionsResponse = await response.json();
      if (requestId !== insiderRequestId.current) return;
      setInsiderDetails(details);
      setInsiderLimit(limit);
    } catch (requestError) {
      if (requestId !== insiderRequestId.current) return;
      setInsiderError(
        requestError instanceof Error ? requestError.message : 'Could not load insider transactions.'
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

  const loadFilings = async (companyTicker: string) => {
    const requestedTicker = companyTicker.trim().toUpperCase();
    if (!requestedTicker) return;

    setTicker(requestedTicker);
    setLoading(true);
    setError(null);
    setData(null);
    setInsiderDetails(null);
    setInsiderLimit(10);
    setInsiderError(null);

    try {
      const res = await fetch(
        `/api/sec/filings?ticker=${encodeURIComponent(requestedTicker)}&limit=100`
      );
      if (!res.ok) throw new Error(`Error fetching filings: ${res.statusText}`);
      const json: SECResponse = await res.json();
      setData(json);
      setActiveTicker(requestedTicker);
      window.history.replaceState(null, '', `/?ticker=${encodeURIComponent(requestedTicker)}`);
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
    <div className="mx-auto w-full max-w-7xl px-6 py-12 font-sans">
      <div className="grid items-start gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_13rem]">
        <aside
          aria-label="Watchlist"
          className="border-4 border-border-strong bg-surface shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] lg:sticky lg:top-6"
        >
          <div className="research-panel-header flex items-center justify-between border-b-4 border-border-strong px-3 py-3">
            <h2 className="text-sm font-black uppercase tracking-wide">Watchlist</h2>
            <span className="font-mono text-xs font-bold" aria-label={`${watchlist.size} companies`}>
              {watchlist.size}
            </span>
          </div>
          {watchedTickers.length === 0 ? (
            <div className="grid min-h-36 place-items-center px-4 text-center font-mono text-sm text-text-muted">
              None on watch.
            </div>
          ) : (
            <ul className="max-h-[32rem] divide-y-2 divide-border overflow-y-auto">
              {watchedTickers.map((watchedTicker) => (
                <li key={watchedTicker} className="grid grid-cols-[1fr_auto] items-stretch">
                  <button
                    type="button"
                    onClick={() => void loadFilings(watchedTicker)}
                    disabled={loading && ticker === watchedTicker}
                    className={`min-w-0 px-3 py-3 text-left font-mono text-sm font-black transition-colors hover:bg-surface-alt disabled:cursor-wait ${
                      activeTicker === watchedTicker ? 'bg-primary-muted text-primary' : 'text-text'
                    }`}
                  >
                    {watchedTicker}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleWatchlist(watchedTicker)}
                    aria-label={`Remove ${watchedTicker} from watchlist`}
                    title="Remove from watchlist"
                    className="grid w-10 place-items-center text-warning transition-colors hover:bg-surface-alt hover:text-danger"
                  >
                    <WatchlistStar active />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="min-w-0">
          <FadeIn>
        <div className="mb-12 border-4 border-border-strong p-6 bg-surface shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="shrink-0">
              <h1 className="mb-2 text-5xl font-black tracking-tighter text-text">
                STOCK RESEARCH
              </h1>
              <p className="text-lg font-medium text-text-muted">
                Direct access to SEC EDGAR filings.
              </p>
            </div>
            <div className="flex w-full items-stretch gap-3 sm:w-auto">
              <div className="relative min-w-0 flex-1 lg:flex-none">
                <form
                  onSubmit={fetchFilings}
                  className="flex min-w-0 border-2 border-border-strong bg-surface shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] focus-within:border-primary"
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
                      setActiveSuggestion((index) => (index - 1 + tickerSuggestions.length) % tickerSuggestions.length);
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
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-lg font-bold text-text uppercase placeholder:text-text-subtle focus:outline-none lg:w-28 lg:flex-none"
                />
                <button
                  type="submit"
                  disabled={loading || ticker.trim().length === 0}
                  aria-label={loading ? 'Searching filings' : 'Search filings'}
                  title={loading ? 'Searching filings' : 'Search filings'}
                  className="grid w-12 place-items-center border-l-2 border-border-strong bg-success text-text transition-colors hover:bg-primary-muted disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-text-subtle"
                >
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
                    <circle cx="10.5" cy="10.5" r="6" stroke="currentColor" strokeWidth="2.5" />
                    <path d="m15 15 5 5" stroke="currentColor" strokeWidth="2.5" />
                  </svg>
                </button>
                </form>
                {searchFocused && tickerSuggestions.length > 0 && (
                  <ul
                    id="ticker-suggestions"
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto border-2 border-border-strong bg-surface shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
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
                          className={`grid w-full grid-cols-[4.5rem_1fr] gap-2 border-b border-border px-3 py-2 text-left last:border-b-0 ${
                            index === activeSuggestion ? 'bg-primary-muted' : 'hover:bg-surface-alt'
                          }`}
                        >
                          <span className="font-mono text-sm font-black text-text">{suggestion.ticker}</span>
                          <span className="truncate text-xs font-medium text-text-muted">{suggestion.name}</span>
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
                aria-label={syncState?.status === 'running' ? 'SEC sync running' : 'Run SEC sync'}
                title={
                  syncState?.status === 'running' ? 'SEC sync running' : 'Run SEC metadata sync'
                }
                className="grid size-12 shrink-0 place-items-center border-2 border-border-strong bg-surface-alt text-text shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:bg-surface-raised hover:shadow-none"
              >
                <RssJobIndicator state={syncState} />
              </button>
            </div>
          </div>

          {syncPanelOpen && (
            <section
              id="sec-sync-panel"
              aria-label="SEC metadata sync activity"
              className="mt-6 border-t-4 border-border-strong pt-5"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black uppercase text-text">Latest SEC filers</h2>
                  <p className="font-mono text-xs text-text-muted" aria-live="polite">
                    {syncState?.status === 'running'
                      ? syncState.total === 0
                        ? 'Reading SEC Latest Filings feed…'
                        : `Refreshing ${syncState.total} companies · ${syncState.processed} complete`
                      : syncState?.completedAt
                        ? `Last run ${new Date(syncState.completedAt).toLocaleString()}`
                        : 'No completed runs yet'}
                  </p>
                </div>
                <div className="flex items-stretch gap-2">
                  <div
                    role="group"
                    className="flex border-2 border-border-strong bg-surface"
                    aria-label="Company filter"
                  >
                    <button
                      type="button"
                      onClick={() => setWatchlistOnly(false)}
                      aria-pressed={!watchlistOnly}
                      className={`px-3 py-1 text-xs font-black uppercase transition-colors ${
                        !watchlistOnly ? 'bg-primary text-primary-contrast' : 'text-text hover:bg-surface-alt'
                      }`}
                    >
                      All {syncState?.companies.length ?? 0}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWatchlistOnly(true)}
                      aria-pressed={watchlistOnly}
                      className={`border-l-2 border-border-strong px-3 py-1 text-xs font-black uppercase transition-colors ${
                        watchlistOnly ? 'bg-primary text-primary-contrast' : 'text-text hover:bg-surface-alt'
                      }`}
                    >
                      Watchlist {watchlist.size}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSyncPanelOpen(false)}
                    className="border-2 border-border-strong bg-surface px-3 py-1 text-xs font-black uppercase text-text hover:bg-surface-alt"
                  >
                    Close
                  </button>
                </div>
              </div>

              {(syncRequestError || syncState?.error) && (
                <p className="mb-3 border-2 border-danger bg-surface-alt px-3 py-2 text-sm font-bold text-danger">
                  {syncRequestError || syncState?.error}
                </p>
              )}

              <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {displayedSyncCompanies.length === 0 ? (
                  <p className="border-2 border-border bg-surface-alt px-4 py-5 text-sm font-medium text-text-muted">
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
                        className={`border-2 border-border bg-surface transition-colors ${
                          company.status === 'loading' ? 'sec-company-loading' : ''
                        }`}
                      >
                        <div className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-3 py-2">
                          <span
                            className={`size-2.5 border border-border-strong ${
                              company.status === 'success'
                                ? 'bg-success'
                                : company.status === 'error'
                                  ? 'bg-danger'
                                  : company.status === 'loading'
                                    ? 'bg-info'
                                    : 'bg-text-subtle'
                            }`}
                            aria-hidden="true"
                          />
                          <button
                            type="button"
                            onClick={() => toggleCompany(company.cik)}
                            aria-expanded={expanded}
                            className="min-w-0 py-1 text-left"
                          >
                            <span className="block truncate font-black text-text">
                              {company.entityName}{' '}
                              <span className="font-mono text-xs text-text-muted">
                                ({company.ticker})
                              </span>
                            </span>
                            <span className="block font-mono text-[11px] uppercase text-text-muted">
                              {company.status}
                              {company.updatedAt
                                ? ` · ${new Date(company.updatedAt).toLocaleString()}`
                                : ''}
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
                            className={`grid size-9 place-items-center transition-colors hover:bg-surface-alt ${
                              watchlist.has(company.ticker.toUpperCase())
                                ? 'text-warning'
                                : 'text-text-subtle hover:text-warning'
                            }`}
                          >
                            <WatchlistStar active={watchlist.has(company.ticker.toUpperCase())} />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleCompany(company.cik)}
                            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${company.entityName} filings`}
                            className="grid size-9 place-items-center font-mono text-lg text-text hover:bg-surface-alt"
                          >
                            {expanded ? '−' : '+'}
                          </button>
                        </div>

                        {expanded && (
                          <div className="border-t-2 border-border bg-bg-alt px-3 py-2">
                            {company.error ? (
                              <p className="py-2 text-sm font-bold text-danger">{company.error}</p>
                            ) : company.filings.length === 0 ? (
                              <p className="py-2 text-sm text-text-muted">
                                No filing metadata loaded.
                              </p>
                            ) : (
                              <ul className="divide-y divide-border">
                                {company.filings.map((filing) => (
                                  <li
                                    key={filing.accessionNumber}
                                    className="grid grid-cols-[5rem_1fr_auto] items-center gap-3 py-2 text-sm"
                                  >
                                    <span className="truncate font-mono font-bold text-success">
                                      {filing.type}
                                    </span>
                                    <span className="font-mono text-xs text-text-muted">
                                      {filing.fileDate}
                                    </span>
                                    <a
                                      href={filing.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-black uppercase text-text underline decoration-text-subtle underline-offset-4 hover:text-primary"
                                    >
                                      Filing
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
          <div className="mb-12 border-4 border-red-500 bg-red-50 p-4 text-red-600 font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            {error}
          </div>
        </FadeIn>
      )}

      {data && (
        <FadeIn delay={0.2}>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b-4 border-border-strong pb-2">
            <h2 className="text-3xl font-black text-text">
              {data.entityName}{' '}
              <span className="text-lg font-medium text-text-muted">({activeTicker})</span>
            </h2>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-text-muted">CIK: {data.cik}</span>
              {formatAddress(data.companyInfo?.addresses?.business) && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    formatAddress(data.companyInfo?.addresses?.business) ?? ''
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${formatAddress(data.companyInfo?.addresses?.business)} in maps`}
                  title={formatAddress(data.companyInfo?.addresses?.business)}
                  className="grid size-9 place-items-center border-2 border-border-strong bg-surface text-text-subtle transition-colors hover:bg-surface-alt hover:text-primary"
                >
                  <MapPinIcon />
                </a>
              )}
              {data.companyInfo?.phone && (
                <a
                  href={`tel:${data.companyInfo.phone.replace(/[^+\d]/g, '')}`}
                  aria-label={`Call ${data.companyInfo.phone}`}
                  title={data.companyInfo.phone}
                  className="grid size-9 place-items-center border-2 border-border-strong bg-surface text-text-subtle transition-colors hover:bg-surface-alt hover:text-primary"
                >
                  <PhoneIcon />
                </a>
              )}
              <button
                type="button"
                onClick={() => toggleWatchlist(activeTicker)}
                aria-label={`${watchlist.has(activeTicker) ? 'Remove' : 'Add'} ${activeTicker} ${watchlist.has(activeTicker) ? 'from' : 'to'} watchlist`}
                aria-pressed={watchlist.has(activeTicker)}
                title={watchlist.has(activeTicker) ? 'Remove from watchlist' : 'Add to watchlist'}
                className={`grid size-9 place-items-center border-2 border-border-strong bg-surface transition-colors hover:bg-surface-alt ${
                  watchlist.has(activeTicker)
                    ? 'text-warning'
                    : 'text-text-subtle hover:text-warning'
                }`}
              >
                <WatchlistStar active={watchlist.has(activeTicker)} />
              </button>
            </div>
          </div>

          <section
            aria-label="Company information"
            className="mb-6 grid border-2 border-border bg-surface-alt lg:grid-cols-[minmax(0,1fr)_18rem]"
          >
            <div className="min-w-0 p-4">
              {companyDetails.length === 0 ? (
                <p className="text-center font-mono text-xs font-bold text-text-muted">
                  Company profile unavailable from the current backend response. Restart the
                  backend and search again.
                </p>
              ) : (
                <dl className="space-y-4">
                  {companyDetails.map((detail) => (
                    <div key={detail.label}>
                      <dt className="mb-1 font-mono text-[11px] font-black uppercase tracking-wide text-text-muted">
                        {detail.label}
                      </dt>
                      <dd className="text-sm font-bold text-text">{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {(data.companyInfo?.website || data.companyInfo?.investorWebsite) && (
                <div className="mt-4 flex flex-wrap gap-4 border-t-2 border-border pt-3 text-xs font-black uppercase">
                  {data.companyInfo?.website && (
                    <a
                      href={externalHref(data.companyInfo.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-4 hover:text-primary-hover"
                    >
                      Company website
                    </a>
                  )}
                  {data.companyInfo?.investorWebsite && (
                    <a
                      href={externalHref(data.companyInfo.investorWebsite)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-4 hover:text-primary-hover"
                    >
                      Investor relations
                    </a>
                  )}
                </div>
              )}
            </div>

            <aside className="border-t-2 border-border bg-surface p-4 lg:border-l-2 lg:border-t-0">
              <div>
                <h3 className="mb-3 font-mono text-[11px] font-black uppercase tracking-wide text-text-muted">
                  Latest standardized financials
                </h3>
                {(data.financialSnapshot?.length ?? 0) > 0 ? (
                  <dl className="space-y-2">
                    {data.financialSnapshot?.map((metric) => (
                      <div key={metric.key} className="border-2 border-border bg-surface-alt px-3 py-2">
                        <dt className="font-mono text-[10px] font-black uppercase tracking-wide text-text-muted">
                          {metric.label}
                        </dt>
                        <dd className="mt-0.5 text-base font-black tabular-nums text-text">
                          {formatFinancialValue(metric)}
                        </dd>
                        <p className="font-mono text-[9px] text-text-muted">
                          {metric.form} · period {metric.periodEnd}
                        </p>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="font-mono text-xs text-text-muted">No standardized facts found.</p>
                )}
              </div>
            </aside>
          </section>

          <FormsTableMain key={activeTicker} filings={data.filings} />

          <InsiderFormsTable
            key={activeTicker}
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

        <ResearchMetricsRail
          ticker={data ? activeTicker : ''}
          financials={data?.financialSnapshot}
          insiderActivity={data?.insiderActivity}
          filings={data?.filings}
        />
      </div>
    </div>
  );
}
