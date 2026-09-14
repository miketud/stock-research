'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';

interface SourceCount {
  name: string;
  posts: number;
  comments: number;
  firstMentionAt: string;
  lastMentionAt: string;
}

interface SimulatedMention {
  ticker: string;
  sources: SourceCount[];
}

const SOURCE_NAMES = ['wallstreetbets', 'stocks', 'investing', 'StockMarket', 'options'];
const SEED_FIRST_AT = '2026-09-14T08:00:00.000Z';
const SEED_LAST_AT = '2026-09-14T12:00:00.000Z';

const SEED_COUNTS: Array<[string, number[]]> = [
  ['NVDA', [34, 18, 8, 14, 12]],
  ['TSLA', [29, 17, 5, 12, 15]],
  ['AAPL', [8, 18, 15, 9, 3]],
  ['PLTR', [21, 8, 4, 9, 7]],
  ['AMD', [16, 12, 5, 7, 8]],
  ['MSFT', [4, 13, 14, 8, 2]],
  ['META', [9, 10, 6, 5, 4]],
  ['AMZN', [5, 9, 8, 7, 2]],
];

function makeSeedData(): SimulatedMention[] {
  return SEED_COUNTS.map(([ticker, totals]) => ({
    ticker,
    sources: SOURCE_NAMES.map((name, index) => {
      const total = totals[index] ?? 0;
      const posts = Math.round(total * 0.35);
      return {
        name,
        posts,
        comments: total - posts,
        firstMentionAt: SEED_FIRST_AT,
        lastMentionAt: SEED_LAST_AT,
      };
    }),
  }));
}

function totalFor(mention: SimulatedMention): number {
  return mention.sources.reduce((sum, source) => sum + source.posts + source.comments, 0);
}

function rankMap(mentions: SimulatedMention[]): Record<string, number> {
  return Object.fromEntries(
    [...mentions]
      .sort((a, b) => totalFor(b) - totalFor(a) || a.ticker.localeCompare(b.ticker))
      .map((mention, index) => [mention.ticker, index + 1])
  );
}

function formatTime(value: string): string {
  return `${new Date(value).toISOString().slice(11, 19)} UTC`;
}

export default function TickerSimulationPage() {
  const [mentions, setMentions] = useState<SimulatedMention[]>(makeSeedData);
  const [autoPlay, setAutoPlay] = useState(true);
  const [refreshNumber, setRefreshNumber] = useState(0);
  const [lastRefreshAt, setLastRefreshAt] = useState(SEED_LAST_AT);
  const [lastSpike, setLastSpike] = useState('Seed ranking loaded');
  const [lastMover, setLastMover] = useState<string | null>(null);
  const [previousRanks, setPreviousRanks] = useState<Record<string, number>>(() =>
    rankMap(makeSeedData())
  );
  const [selectedTicker, setSelectedTicker] = useState('NVDA');

  const simulateRefresh = useCallback(
    (forceSpike = false) => {
      const now = new Date().toISOString();
      const shouldSpike = forceSpike || Math.random() < 0.55;
      const currentRanking = [...mentions].sort(
        (a, b) => totalFor(b) - totalFor(a) || a.ticker.localeCompare(b.ticker)
      );
      const eligibleTargets = currentRanking.slice(1);
      const target = forceSpike
        ? eligibleTargets.at(-1)
        : eligibleTargets[Math.floor(Math.random() * eligibleTargets.length)];
      const oldRank = target ? currentRanking.indexOf(target) : 0;
      const desiredRank = forceSpike ? 0 : Math.floor(Math.random() * Math.max(1, oldRank));
      const threshold = totalFor(currentRanking[desiredRank] ?? currentRanking[0]!);
      const spikeTicker = target?.ticker ?? currentRanking.at(-1)?.ticker ?? 'NVDA';
      const spikeSource = SOURCE_NAMES[Math.floor(Math.random() * SOURCE_NAMES.length)] ?? 'stocks';
      const spikeAmount =
        shouldSpike && target
          ? Math.max(12, threshold - totalFor(target) + 14 + Math.floor(Math.random() * 8))
          : 0;

      setPreviousRanks(rankMap(currentRanking));
      setMentions(
        mentions.map((mention) => ({
          ...mention,
          sources: mention.sources.map((source) => {
            const baseline = Math.floor(Math.random() * 3);
            const spike =
              mention.ticker === spikeTicker && source.name === spikeSource ? spikeAmount : 0;
            const increment = baseline + spike;
            if (increment === 0) return source;
            const postIncrement = Math.floor(increment * 0.3);
            return {
              ...source,
              posts: source.posts + postIncrement,
              comments: source.comments + increment - postIncrement,
              lastMentionAt: now,
            };
          }),
        }))
      );
      setRefreshNumber((value) => value + 1);
      setLastRefreshAt(now);
      setLastMover(shouldSpike ? spikeTicker : null);
      setLastSpike(
        shouldSpike
          ? `$${spikeTicker} +${spikeAmount} from r/${spikeSource} · targeting rank #${desiredRank + 1}`
          : 'Routine refresh — baseline mentions only'
      );
    },
    [mentions]
  );

  useEffect(() => {
    if (!autoPlay) return;
    const interval = window.setInterval(() => simulateRefresh(), 4000);
    return () => window.clearInterval(interval);
  }, [autoPlay, simulateRefresh]);

  const ranking = useMemo(
    () =>
      [...mentions].sort((a, b) => totalFor(b) - totalFor(a) || a.ticker.localeCompare(b.ticker)),
    [mentions]
  );
  const selected = ranking.find((mention) => mention.ticker === selectedTicker) ?? ranking[0];

  const resetSimulation = () => {
    const seed = makeSeedData();
    setMentions(seed);
    setPreviousRanks(rankMap(seed));
    setRefreshNumber(0);
    setLastRefreshAt(SEED_LAST_AT);
    setLastSpike('Seed ranking loaded');
    setLastMover(null);
    setSelectedTicker('NVDA');
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 font-mono">
      {/* A terminal reads as one continuous surface: thin rules, no drop
          shadows, no filled panels — only type weight and the amber accent
          separate a heading from its data. */}
      <section className="mb-4 border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2">
          <h1 className="text-xs font-black uppercase tracking-[0.2em] text-primary">
            Reddit ticker simulation
          </h1>
          <p className="text-[10px] uppercase tracking-wide text-text-subtle">
            Isolated UI fixture · synthetic counts · no credentials, API calls, or stored state
          </p>
        </div>
        <div className="flex flex-wrap items-stretch divide-x divide-border">
          <button
            type="button"
            onClick={() => setAutoPlay((playing) => !playing)}
            aria-pressed={autoPlay}
            className={`px-3 py-1.5 text-[11px] font-black uppercase tracking-wide transition-colors hover:bg-surface-alt ${
              autoPlay ? 'text-success' : 'text-text-subtle'
            }`}
          >
            <span aria-hidden="true">{autoPlay ? '■' : '□'}</span> Auto {autoPlay ? 'on' : 'off'}
          </button>
          <button
            type="button"
            onClick={() => simulateRefresh(false)}
            className="px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-text transition-colors hover:bg-surface-alt hover:text-primary"
          >
            Next refresh
          </button>
          <button
            type="button"
            onClick={() => simulateRefresh(true)}
            className="px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-warning transition-colors hover:bg-surface-alt"
          >
            Force spike
          </button>
          <button
            type="button"
            onClick={resetSimulation}
            className="px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-text-subtle transition-colors hover:bg-surface-alt hover:text-text"
          >
            Reset
          </button>
          <p className="ml-auto flex items-center px-3 py-1.5 text-[11px] tabular-nums text-text-muted">
            REFRESH {String(refreshNumber).padStart(3, '0')} · {formatTime(lastRefreshAt)} ·{' '}
            <span className="ml-1 text-text-subtle">{lastSpike}</span>
          </p>
        </div>
      </section>

      <section className="mb-4 overflow-hidden border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-1.5">
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
            Simulated Reddit 24h ticker
          </h2>
          <p className="text-[10px] uppercase tracking-wide text-text-subtle">24h mention count</p>
        </div>
        <div className="overflow-x-auto bg-bg">
          <LayoutGroup id="simulated-horizontal-ranking">
            <div className="flex min-w-max items-stretch">
              <AnimatePresence initial={false} mode="popLayout">
                {ranking.map((mention, index) => (
                  <motion.button
                    layout="position"
                    layoutDependency={refreshNumber}
                    key={mention.ticker}
                    type="button"
                    onClick={() => setSelectedTicker(mention.ticker)}
                    initial={{ opacity: 0, y: -16, scale: 0.92 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: lastMover === mention.ticker ? [1, 1.06, 1] : 1,
                    }}
                    exit={{ opacity: 0, y: 16, scale: 0.92 }}
                    transition={{
                      layout: { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 },
                      scale: { duration: 0.45, times: [0, 0.45, 1] },
                    }}
                    className={`flex items-center gap-2 border-r border-border px-3 py-2 text-xs font-black transition-colors ${
                      lastMover === mention.ticker
                        ? 'bg-primary-muted text-primary'
                        : selectedTicker === mention.ticker
                          ? 'bg-surface-alt text-text'
                          : 'text-text-muted hover:bg-surface-alt hover:text-text'
                    }`}
                  >
                    <span className="tabular-nums text-text-subtle">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="text-text">{mention.ticker}</span>
                    {previousRanks[mention.ticker] !== undefined &&
                      previousRanks[mention.ticker] !== index + 1 && (
                        <motion.span
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`text-[10px] tabular-nums ${
                            previousRanks[mention.ticker]! > index + 1
                              ? 'text-success'
                              : 'text-danger'
                          }`}
                        >
                          {previousRanks[mention.ticker]! > index + 1 ? '▲' : '▼'}
                          {Math.abs(previousRanks[mention.ticker]! - (index + 1))}
                        </motion.span>
                      )}
                    {/* The count flashes amber on change and settles back to
                        plain type — a tape print, not a filled badge. */}
                    <motion.span
                      key={totalFor(mention)}
                      initial={{ color: 'var(--semantic-warning)' }}
                      animate={{ color: 'var(--semantic-primary)' }}
                      transition={{ duration: 0.8 }}
                      className="text-sm tabular-nums"
                    >
                      {totalFor(mention)}
                    </motion.span>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </LayoutGroup>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="overflow-hidden border border-border bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-1.5">
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
              Ranking animation inspector
            </h2>
            <span className="text-[10px] uppercase tracking-wide text-text-subtle">
              Rank · ticker · sources · count
            </span>
          </div>
          <LayoutGroup id="simulated-vertical-ranking">
            <div className="divide-y divide-border">
              {ranking.map((mention, index) => (
                <motion.button
                  layout="position"
                  layoutDependency={refreshNumber}
                  key={mention.ticker}
                  type="button"
                  onClick={() => setSelectedTicker(mention.ticker)}
                  animate={{
                    scale: lastMover === mention.ticker ? [1, 1.025, 1] : 1,
                  }}
                  transition={{
                    layout: { type: 'spring', stiffness: 360, damping: 32, mass: 0.85 },
                    scale: { duration: 0.45, times: [0, 0.45, 1] },
                  }}
                  className={`grid w-full grid-cols-[3.5rem_5rem_1fr_auto] items-center gap-3 px-3 py-1.5 text-left text-xs transition-colors ${
                    lastMover === mention.ticker
                      ? 'bg-primary-muted'
                      : selectedTicker === mention.ticker
                        ? 'bg-surface-alt'
                        : 'hover:bg-surface-alt'
                  }`}
                >
                  <span className="tabular-nums text-text-subtle">
                    {String(index + 1).padStart(2, '0')}
                    {previousRanks[mention.ticker] !== undefined &&
                      previousRanks[mention.ticker] !== index + 1 && (
                        <span
                          className={`ml-1 text-[10px] ${
                            previousRanks[mention.ticker]! > index + 1
                              ? 'text-success'
                              : 'text-danger'
                          }`}
                        >
                          {previousRanks[mention.ticker]! > index + 1 ? '▲' : '▼'}
                          {Math.abs(previousRanks[mention.ticker]! - (index + 1))}
                        </span>
                      )}
                  </span>
                  <span className="font-black text-text">{mention.ticker}</span>
                  <span className="text-[10px] uppercase tracking-wide text-text-subtle">
                    {mention.sources.filter((source) => source.posts + source.comments > 0).length}{' '}
                    sources
                  </span>
                  <span className="text-sm font-black tabular-nums text-primary">
                    {totalFor(mention)}
                  </span>
                </motion.button>
              ))}
            </div>
          </LayoutGroup>
        </section>

        <aside className="border border-border bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-1.5">
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
              {selected?.ticker} by subreddit
            </h2>
            <span className="text-[10px] tabular-nums text-text-subtle">
              {selected ? totalFor(selected) : 0}
            </span>
          </div>
          <div className="divide-y divide-border">
            {selected?.sources
              .filter((source) => source.posts + source.comments > 0)
              .sort((a, b) => b.posts + b.comments - a.posts - a.comments)
              .map((source) => (
                <div key={source.name} className="px-3 py-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-text">r/{source.name}</span>
                    <span className="text-xs font-black tabular-nums text-primary">
                      {source.posts + source.comments}
                    </span>
                  </div>
                  <p className="text-[10px] tabular-nums text-text-subtle">
                    {source.posts} posts · {source.comments} comments ·{' '}
                    {formatTime(source.firstMentionAt)}→{formatTime(source.lastMentionAt)}
                  </p>
                </div>
              ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
