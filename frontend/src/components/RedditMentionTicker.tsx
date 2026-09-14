'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';

const DEFAULT_SUBREDDITS = [
  'wallstreetbets',
  'stocks',
  'investing',
  'StockMarket',
  'options',
  'pennystocks',
];
const SUBREDDIT_STORAGE_KEY = 'stock-research.reddit-subreddits.v1';
const SUBREDDIT_PATTERN = /^[A-Za-z0-9_]{2,21}$/;

interface MentionCount {
  posts: number;
  comments: number;
  total: number;
  firstMentionAt?: string;
  lastMentionAt?: string;
}

interface SubredditCount extends MentionCount {
  name: string;
}

interface TickerMention extends MentionCount {
  ticker: string;
  subreddits: SubredditCount[];
}

interface RedditMentionSnapshot {
  status: 'ready' | 'error' | 'unconfigured';
  error?: string;
  windowHours: number;
  refreshedAt?: string;
  observedFrom?: string;
  coverage?: string;
  directory: SubredditCount[];
  mentions: TickerMention[];
}

function readStoredSubreddits(): string[] {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SUBREDDIT_STORAGE_KEY) ?? 'null'
    ) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_SUBREDDITS;
    const valid = parsed.filter(
      (value): value is string => typeof value === 'string' && SUBREDDIT_PATTERN.test(value)
    );
    return valid.length > 0 ? [...new Set(valid)].slice(0, 10) : DEFAULT_SUBREDDITS;
  } catch {
    return DEFAULT_SUBREDDITS;
  }
}

function formatTimestamp(value?: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function RedditMentionTicker() {
  const [subreddits, setSubreddits] = useState<string[]>(DEFAULT_SUBREDDITS);
  const [initialized, setInitialized] = useState(false);
  const [snapshot, setSnapshot] = useState<RedditMentionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [newSubreddit, setNewSubreddit] = useState('');
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSubreddits(readStoredSubreddits());
      setInitialized(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const loadMentions = useCallback(
    async (force = false) => {
      if (!initialized) return;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          force
            ? '/api/reddit/mentions/refresh'
            : `/api/reddit/mentions?subreddits=${encodeURIComponent(subreddits.join(','))}`,
          force
            ? {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subreddits }),
              }
            : { cache: 'no-store' }
        );
        const body = (await response.json().catch(() => null)) as
          RedditMentionSnapshot | { message?: string } | null;
        if (body && 'mentions' in body) setSnapshot(body);
        if (!response.ok) {
          const message =
            body && 'message' in body
              ? body.message
              : body && 'error' in body
                ? body.error
                : undefined;
          throw new Error(message || `Reddit mentions unavailable (${response.status}).`);
        }
      } catch (requestError) {
        setError(
          requestError instanceof Error ? requestError.message : 'Reddit mentions unavailable.'
        );
      } finally {
        setLoading(false);
      }
    },
    [initialized, subreddits]
  );

  useEffect(() => {
    if (!initialized) return;
    const initial = window.setTimeout(() => void loadMentions(), 0);
    const interval = window.setInterval(() => void loadMentions(), 2 * 60 * 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [initialized, loadMentions]);

  const saveSubreddits = (next: string[]) => {
    setSubreddits(next);
    window.localStorage.setItem(SUBREDDIT_STORAGE_KEY, JSON.stringify(next));
    setDirectoryError(null);
  };

  const removeSubreddit = (name: string) => {
    if (subreddits.length === 1) {
      setDirectoryError('At least one subreddit must remain enabled.');
      return;
    }
    saveSubreddits(subreddits.filter((item) => item.toLowerCase() !== name.toLowerCase()));
  };

  const addSubreddit = () => {
    const normalized = newSubreddit.trim().replace(/^r\//i, '');
    if (!SUBREDDIT_PATTERN.test(normalized)) {
      setDirectoryError('Use a subreddit name containing 2–21 letters, numbers, or underscores.');
      return;
    }
    if (subreddits.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
      setDirectoryError('That subreddit is already enabled.');
      return;
    }
    if (subreddits.length >= 10) {
      setDirectoryError('A maximum of 10 subreddits can be monitored.');
      return;
    }
    saveSubreddits([...subreddits, normalized]);
    setNewSubreddit('');
  };

  const selectedMention = useMemo(
    () => snapshot?.mentions.find((mention) => mention.ticker === selectedTicker),
    [selectedTicker, snapshot]
  );
  const visibleMentions = snapshot?.mentions.slice(0, 20) ?? [];
  const directory: SubredditCount[] =
    snapshot?.directory ??
    subreddits.map((name) => ({
      name,
      posts: 0,
      comments: 0,
      total: 0,
    }));

  return (
    <section
      className="reddit-banner border-t border-border font-mono"
      aria-label="Reddit stock mentions"
    >
      <div className="flex min-h-7 items-stretch">
        <div className="flex shrink-0 items-center gap-2 border-r border-border px-2 text-primary">
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Reddit 24h</span>
          <span
            className={`size-1.5 ${loading ? 'animate-pulse bg-warning' : 'bg-success'}`}
            aria-hidden="true"
          />
        </div>

        <div className="min-w-0 flex-1 overflow-hidden">
          {visibleMentions.length > 0 ? (
            <LayoutGroup id="reddit-mention-ranking">
              <div className="reddit-ticker-track flex w-max items-stretch">
                <AnimatePresence initial={false} mode="popLayout">
                  {visibleMentions.map((mention, index) => (
                    <motion.div
                      layout="position"
                      key={mention.ticker}
                      initial={{ opacity: 0, y: -14, scale: 0.94 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 14, scale: 0.94 }}
                      transition={{
                        layout: { type: 'spring', stiffness: 420, damping: 34 },
                        opacity: { duration: 0.2 },
                        y: { duration: 0.25 },
                        scale: { duration: 0.25 },
                      }}
                      className="flex items-stretch border-r border-border"
                    >
                      <span
                        className="grid min-w-7 place-items-center px-1.5 text-[10px] tabular-nums text-text-subtle"
                        aria-label={`Rank ${index + 1}`}
                      >
                        #{index + 1}
                      </span>
                      <a
                        href={`/?ticker=${encodeURIComponent(mention.ticker)}`}
                        className="flex items-center gap-2 px-2 py-1 text-[11px] font-black hover:bg-surface-alt"
                        title={`Open ${mention.ticker} research`}
                      >
                        <span>{mention.ticker}</span>
                        <span className="tabular-nums text-primary">{mention.total}</span>
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedTicker(
                            selectedTicker === mention.ticker ? null : mention.ticker
                          )
                        }
                        className="border-l border-border px-1.5 text-[10px] text-text-subtle hover:bg-surface-alt hover:text-text"
                        aria-expanded={selectedTicker === mention.ticker}
                        title={`Show ${mention.ticker} counts by subreddit`}
                      >
                        {mention.subreddits.length}r
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </LayoutGroup>
          ) : (
            <p className="px-2 py-1 text-[11px] text-text-subtle">
              {error || snapshot?.error || 'Collecting observed ticker mentions…'}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-stretch border-l border-border">
          <button
            type="button"
            onClick={() => void loadMentions(true)}
            disabled={loading}
            className="px-2 text-[11px] text-text-subtle hover:bg-surface-alt hover:text-text disabled:opacity-50"
            title="Refresh Reddit mentions"
          >
            {loading ? 'SYNC' : '↻'}
          </button>
          <button
            type="button"
            onClick={() => setDirectoryOpen((open) => !open)}
            aria-expanded={directoryOpen}
            className="border-l border-border px-2 text-[10px] font-black uppercase tracking-wide text-text-subtle hover:bg-surface-alt hover:text-text"
          >
            Sources {subreddits.length}
          </button>
        </div>
      </div>

      {selectedMention && (
        <div className="border-b border-border bg-surface px-3 py-2 text-text">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="font-mono text-xs font-black uppercase">
              ${selectedMention.ticker}: {selectedMention.total} mentions · {selectedMention.posts}{' '}
              posts · {selectedMention.comments} comments
            </p>
            <button
              type="button"
              onClick={() => setSelectedTicker(null)}
              className="text-xs font-black uppercase"
            >
              Close
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {selectedMention.subreddits.map((subreddit) => (
              <div key={subreddit.name} className="border border-border bg-bg-alt px-2 py-1">
                <div className="flex justify-between gap-3 font-mono text-xs font-black">
                  <span>r/{subreddit.name}</span>
                  <span>{subreddit.total}</span>
                </div>
                <p className="mt-1 font-mono text-[10px] text-text-muted">
                  {subreddit.posts} posts · {subreddit.comments} comments
                </p>
                <p className="font-mono text-[10px] text-text-muted">
                  {formatTimestamp(subreddit.firstMentionAt)} →{' '}
                  {formatTimestamp(subreddit.lastMentionAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {directoryOpen && (
        <div className="border-b border-border bg-surface px-3 py-2 text-text">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-black uppercase">Subreddit source directory</h2>
              <p className="font-mono text-[10px] text-text-muted">
                Counts are unique observed posts and comments. Last refresh{' '}
                {formatTimestamp(snapshot?.refreshedAt)}.
              </p>
            </div>
            <div className="flex border border-border">
              <span className="grid place-items-center border-r border-border bg-bg-alt px-2 text-[11px] text-text-subtle">
                r/
              </span>
              <input
                value={newSubreddit}
                onChange={(event) => setNewSubreddit(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addSubreddit();
                }}
                className="w-36 bg-surface px-2 py-1.5 font-mono text-xs outline-none"
                placeholder="subreddit"
                aria-label="Add subreddit"
              />
              <button
                type="button"
                onClick={addSubreddit}
                className="border-l border-border px-2 text-[10px] font-black uppercase text-success hover:bg-surface-alt"
              >
                Add
              </button>
            </div>
          </div>
          {directoryError && (
            <p className="mb-2 font-mono text-xs font-bold text-danger">{directoryError}</p>
          )}
          <div className="max-h-56 overflow-auto border border-border">
            <div className="grid grid-cols-[minmax(8rem,1fr)_4rem_4rem_4rem_minmax(10rem,1fr)_auto] border-b border-border bg-bg-alt px-2 py-1 text-[10px] font-black uppercase tracking-wide text-text-subtle">
              <span>Source</span>
              <span>Posts</span>
              <span>Comments</span>
              <span>Total</span>
              <span>Observed</span>
              <span />
            </div>
            {directory.map((subreddit) => (
              <div
                key={subreddit.name}
                className="grid grid-cols-[minmax(8rem,1fr)_4rem_4rem_4rem_minmax(10rem,1fr)_auto] items-center border-t border-border px-2 py-1 text-[11px]"
              >
                <a
                  href={`https://www.reddit.com/r/${subreddit.name}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-black underline underline-offset-2"
                >
                  r/{subreddit.name}
                </a>
                <span>{subreddit.posts}</span>
                <span>{subreddit.comments}</span>
                <span className="font-black">{subreddit.total}</span>
                <span className="text-[10px] text-text-muted">
                  {formatTimestamp(subreddit.firstMentionAt)} →{' '}
                  {formatTimestamp(subreddit.lastMentionAt)}
                </span>
                <button
                  type="button"
                  onClick={() => removeSubreddit(subreddit.name)}
                  className="px-2 font-black text-danger"
                  aria-label={`Stop monitoring r/${subreddit.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 font-mono text-[10px] text-text-muted">
            {snapshot?.coverage ??
              'Best-effort observations from Reddit listing APIs; not a complete archive.'}{' '}
            Data from Reddit.
          </p>
        </div>
      )}
    </section>
  );
}
