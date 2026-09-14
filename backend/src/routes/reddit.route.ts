// class:injection — Reddit stock-mention aggregation.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const REDDIT = 'https://oauth.reddit.com';
const REDDIT_TOKEN = 'https://www.reddit.com/api/v1/access_token';
const SEC_TICKERS = 'https://www.sec.gov/files/company_tickers.json';
const DEFAULT_SUBREDDITS = [
  'wallstreetbets',
  'stocks',
  'investing',
  'StockMarket',
  'options',
  'pennystocks',
];
const WINDOW_MS = 24 * 60 * 60 * 1000;
const REFRESH_MS = 2 * 60 * 1000;
const MAX_LISTING_PAGES = 10;
const PAGE_SIZE = 100;
const STATE_VERSION = 1;
const statePath = process.env.REDDIT_MENTIONS_STATE_PATH
  ? path.resolve(process.env.REDDIT_MENTIONS_STATE_PATH)
  : path.resolve(import.meta.dirname, '../../var/reddit-mentions-state.json');

const subredditName = z.string().trim().regex(/^[A-Za-z0-9_]{2,21}$/);
const subredditList = z
  .string()
  .default(DEFAULT_SUBREDDITS.join(','))
  .transform((value, context) => {
    const unique = [...new Set(value.split(',').map((part) => part.trim()).filter(Boolean))];
    if (unique.length < 1 || unique.length > 10 || unique.some((name) => !subredditName.safeParse(name).success)) {
      context.addIssue({ code: 'custom', message: 'Supply between 1 and 10 valid subreddit names.' });
      return z.NEVER;
    }
    return unique;
  });

const querySchema = z.object({ subreddits: subredditList.optional() });
const refreshSchema = z.object({ subreddits: z.array(subredditName).min(1).max(10) });

interface SecTickerEntry {
  ticker: string;
  title: string;
}

type RedditItemKind = 'post' | 'comment';

interface RedditItem {
  name?: string;
  created_utc?: number;
  subreddit?: string;
  title?: string;
  selftext?: string;
  body?: string;
}

interface RedditListing {
  data?: {
    after?: string | null;
    children?: Array<{ data?: RedditItem }>;
  };
}

interface MentionEvent {
  id: string;
  createdAt: string;
  subreddit: string;
  kind: RedditItemKind;
  tickers: string[];
}

interface PersistedState {
  version: number;
  events: MentionEvent[];
  refreshedAtBySource: Record<string, string>;
}

interface CountBucket {
  posts: number;
  comments: number;
  firstMentionAt?: string;
  lastMentionAt?: string;
}

let state: PersistedState = {
  version: STATE_VERSION,
  events: [],
  refreshedAtBySource: {},
};
let tokenCache: { token: string; expiresAt: number } | undefined;
let tickerCache: { symbols: Set<string>; expiresAt: number } | undefined;
let persistQueue: Promise<void> = Promise.resolve();
let refreshPromise: Promise<void> | undefined;

function sourceKey(subreddits: string[]): string {
  return [...subreddits].map((name) => name.toLowerCase()).sort().join('+');
}

function configured(): boolean {
  return Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(signal.reason);
    }, { once: true });
  });
}

async function persistState(): Promise<void> {
  const snapshot = JSON.stringify(state, null, 2);
  persistQueue = persistQueue.catch(() => undefined).then(async () => {
    await mkdir(path.dirname(statePath), { recursive: true });
    const temporaryPath = `${statePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, snapshot);
    await rename(temporaryPath, statePath);
  });
  return persistQueue;
}

async function restoreState(): Promise<void> {
  try {
    const restored = JSON.parse(await readFile(statePath, 'utf8')) as PersistedState;
    if (restored.version !== STATE_VERSION || !Array.isArray(restored.events)) return;
    state = {
      version: STATE_VERSION,
      events: restored.events,
      refreshedAtBySource: restored.refreshedAtBySource ?? {},
    };
    pruneEvents();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function pruneEvents(now = Date.now()): void {
  const cutoff = now - WINDOW_MS;
  state.events = state.events.filter((event) => Date.parse(event.createdAt) >= cutoff);
}

async function getAccessToken(signal: AbortSignal): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Reddit API credentials are not configured.');

  const response = await fetch(REDDIT_TOKEN, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': process.env.REDDIT_USER_AGENT || 'stock-research/0.1 (personal research dashboard)',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  if (!response.ok) throw new Error(`Reddit OAuth failed (${response.status}).`);
  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error('Reddit OAuth returned no access token.');
  tokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };
  return tokenCache.token;
}

async function fetchRedditJson(url: URL, signal: AbortSignal): Promise<RedditListing> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = await getAccessToken(signal);
    const response = await fetch(url, {
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': process.env.REDDIT_USER_AGENT || 'stock-research/0.1 (personal research dashboard)',
      },
    });
    if (response.ok) return response.json() as Promise<RedditListing>;
    if (response.status === 401) tokenCache = undefined;
    if (![401, 429, 500, 502, 503, 504].includes(response.status) || attempt === 2) {
      throw new Error(`Reddit listing request failed (${response.status}).`);
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : 500 * 2 ** attempt, signal);
  }
  throw new Error('Reddit listing request failed.');
}

async function getTickerSymbols(signal: AbortSignal): Promise<Set<string>> {
  if (tickerCache && tickerCache.expiresAt > Date.now()) return tickerCache.symbols;
  const response = await fetch(SEC_TICKERS, {
    signal,
    headers: { 'User-Agent': process.env.SEC_USER_AGENT || 'stock-research personal research tool' },
  });
  if (!response.ok) throw new Error(`SEC ticker directory unavailable (${response.status}).`);
  const directory = (await response.json()) as Record<string, SecTickerEntry>;
  const symbols = new Set(
    Object.values(directory)
      .map((entry) => entry.ticker.toUpperCase())
      .filter((ticker) => /^[A-Z][A-Z0-9]{0,4}$/.test(ticker))
  );
  tickerCache = { symbols, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
  return symbols;
}

const AMBIGUOUS_TICKERS = new Set([
  'A', 'ALL', 'AM', 'AN', 'ARE', 'BE', 'BY', 'CAN', 'CAR', 'DD', 'EV', 'FOR', 'GO', 'HAS',
  'HE', 'IT', 'LOVE', 'ME', 'NOW', 'ON', 'OR', 'OUT', 'POST', 'SO', 'SUN', 'T', 'TV', 'US',
]);

function extractTickers(text: string, symbols: Set<string>): string[] {
  const matches = new Set<string>();
  for (const match of text.matchAll(/\$([A-Za-z][A-Za-z0-9]{0,4})\b/g)) {
    const ticker = match[1]?.toUpperCase();
    if (ticker && symbols.has(ticker)) matches.add(ticker);
  }
  for (const match of text.matchAll(/\b[A-Z][A-Z0-9]{0,4}\b/g)) {
    const ticker = match[0];
    if (symbols.has(ticker) && !AMBIGUOUS_TICKERS.has(ticker)) matches.add(ticker);
  }
  return [...matches];
}

async function collectListing(
  kind: RedditItemKind,
  subreddits: string[],
  symbols: Set<string>,
  signal: AbortSignal,
  warmup: boolean
): Promise<MentionEvent[]> {
  const events: MentionEvent[] = [];
  const knownIds = new Set(state.events.map((event) => event.id));
  const cutoffSeconds = (Date.now() - WINDOW_MS) / 1000;
  let after: string | null | undefined;

  for (let page = 0; page < (warmup ? MAX_LISTING_PAGES : 2); page++) {
    const endpoint = kind === 'post' ? 'new' : 'comments';
    const url = new URL(`/r/${subreddits.join('+')}/${endpoint}`, REDDIT);
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('raw_json', '1');
    if (after) url.searchParams.set('after', after);
    const listing = await fetchRedditJson(url, signal);
    const items = listing.data?.children ?? [];
    let reachedKnownItem = false;
    let reachedCutoff = false;

    for (const child of items) {
      const item = child.data;
      if (!item?.name || !item.created_utc || !item.subreddit) continue;
      if (knownIds.has(item.name)) {
        reachedKnownItem = true;
        continue;
      }
      if (item.created_utc < cutoffSeconds) {
        reachedCutoff = true;
        continue;
      }
      const text = kind === 'post' ? `${item.title ?? ''}\n${item.selftext ?? ''}` : item.body ?? '';
      const tickers = extractTickers(text, symbols);
      if (tickers.length === 0) continue;
      events.push({
        id: item.name,
        createdAt: new Date(item.created_utc * 1000).toISOString(),
        subreddit: item.subreddit,
        kind,
        tickers,
      });
    }

    after = listing.data?.after;
    if (!after || reachedCutoff || (!warmup && reachedKnownItem)) break;
  }
  return events;
}

async function refresh(subreddits: string[], signal: AbortSignal): Promise<void> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const key = sourceKey(subreddits);
    const symbols = await getTickerSymbols(signal);
    const warmup = !state.refreshedAtBySource[key];
    const [posts, comments] = await Promise.all([
      collectListing('post', subreddits, symbols, signal, warmup),
      collectListing('comment', subreddits, symbols, signal, warmup),
    ]);
    const byId = new Map(state.events.map((event) => [event.id, event]));
    for (const event of [...posts, ...comments]) byId.set(event.id, event);
    state.events = [...byId.values()];
    pruneEvents();
    state.refreshedAtBySource[key] = new Date().toISOString();
    await persistState();
  })().finally(() => {
    refreshPromise = undefined;
  });
  return refreshPromise;
}

function addCount(bucket: CountBucket, event: MentionEvent): void {
  if (event.kind === 'post') bucket.posts += 1;
  else bucket.comments += 1;
  if (!bucket.firstMentionAt || event.createdAt < bucket.firstMentionAt) bucket.firstMentionAt = event.createdAt;
  if (!bucket.lastMentionAt || event.createdAt > bucket.lastMentionAt) bucket.lastMentionAt = event.createdAt;
}

function buildSnapshot(subreddits: string[], status: 'ready' | 'error', error?: string) {
  pruneEvents();
  const selected = new Set(subreddits.map((name) => name.toLowerCase()));
  const selectedEvents = state.events.filter((event) => selected.has(event.subreddit.toLowerCase()));
  const tickerCounts = new Map<string, CountBucket>();
  const tickerSubredditCounts = new Map<string, Map<string, CountBucket>>();
  const subredditCounts = new Map<string, CountBucket>();

  for (const subreddit of subreddits) subredditCounts.set(subreddit.toLowerCase(), { posts: 0, comments: 0 });
  for (const event of selectedEvents) {
    const subreddit = event.subreddit.toLowerCase();
    if (!selected.has(subreddit)) continue;
    addCount(subredditCounts.get(subreddit) ?? { posts: 0, comments: 0 }, event);
    for (const ticker of event.tickers) {
      const total = tickerCounts.get(ticker) ?? { posts: 0, comments: 0 };
      addCount(total, event);
      tickerCounts.set(ticker, total);
      const bySubreddit = tickerSubredditCounts.get(ticker) ?? new Map<string, CountBucket>();
      const perSubreddit = bySubreddit.get(subreddit) ?? { posts: 0, comments: 0 };
      addCount(perSubreddit, event);
      bySubreddit.set(subreddit, perSubreddit);
      tickerSubredditCounts.set(ticker, bySubreddit);
    }
  }

  const serialize = (name: string, bucket: CountBucket) => ({
    name,
    posts: bucket.posts,
    comments: bucket.comments,
    total: bucket.posts + bucket.comments,
    firstMentionAt: bucket.firstMentionAt,
    lastMentionAt: bucket.lastMentionAt,
  });

  const mentions = [...tickerCounts.entries()]
    .map(([ticker, bucket]) => ({
      ticker,
      posts: bucket.posts,
      comments: bucket.comments,
      total: bucket.posts + bucket.comments,
      firstMentionAt: bucket.firstMentionAt,
      lastMentionAt: bucket.lastMentionAt,
      subreddits: [...(tickerSubredditCounts.get(ticker) ?? new Map()).entries()]
        .map(([name, counts]) => serialize(name, counts))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.total - a.total || a.ticker.localeCompare(b.ticker));

  return {
    status,
    error,
    windowHours: 24,
    refreshedAt: state.refreshedAtBySource[sourceKey(subreddits)],
    observedFrom: selectedEvents.length
      ? selectedEvents.map((event) => event.createdAt).sort()[0]
      : undefined,
    coverage: 'Best-effort observations from Reddit listing APIs; not a complete archive.',
    directory: subreddits.map((name) => serialize(name, subredditCounts.get(name.toLowerCase()) ?? { posts: 0, comments: 0 })),
    mentions,
  };
}

const route: FastifyPluginAsync = async (app) => {
  try {
    await restoreState();
  } catch (error) {
    app.log.warn({ error }, 'Could not restore Reddit mention state');
  }

  app.get('/mentions', async (request, reply) => {
    const result = querySchema.safeParse(request.query);
    if (!result.success) {
      return reply.code(400).send({ message: result.error.issues[0]?.message ?? 'Invalid subreddit query.' });
    }
    const parsed = result.data;
    const subreddits = parsed.subreddits ?? DEFAULT_SUBREDDITS;
    if (!configured()) {
      return reply.code(503).send({
        status: 'unconfigured',
        error: 'Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to enable Reddit mentions.',
        windowHours: 24,
        directory: subreddits.map((name) => ({ name, posts: 0, comments: 0, total: 0 })),
        mentions: [],
      });
    }
    const refreshedAt = state.refreshedAtBySource[sourceKey(subreddits)];
    const stale = !refreshedAt || Date.now() - Date.parse(refreshedAt) >= REFRESH_MS;
    try {
      if (stale) await refresh(subreddits, request.signal);
      return buildSnapshot(subreddits, 'ready');
    } catch (error) {
      request.log.warn({ error }, 'Reddit mentions refresh failed');
      const message = error instanceof Error ? error.message : 'Reddit refresh failed.';
      if (state.events.length > 0) return buildSnapshot(subreddits, 'error', message);
      return reply.code(502).send(buildSnapshot(subreddits, 'error', message));
    }
  });

  app.post('/mentions/refresh', async (request, reply) => {
    const result = refreshSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ message: result.error.issues[0]?.message ?? 'Invalid subreddit list.' });
    }
    const { subreddits } = result.data;
    if (!configured()) return reply.code(503).send({ message: 'Reddit API credentials are not configured.' });
    try {
      await refresh(subreddits, request.signal);
      return buildSnapshot(subreddits, 'ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Reddit refresh failed.';
      return reply.code(502).send(buildSnapshot(subreddits, 'error', message));
    }
  });
};

export default route;
export const autoPrefix = '/api/reddit';
export const meta = {
  name: 'reddit',
  description: 'Observed stock ticker mentions across selected subreddits.',
};
