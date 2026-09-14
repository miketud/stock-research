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

  const simulateRefresh = useCallback((forceSpike = false) => {
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
    const spikeAmount = shouldSpike && target
      ? Math.max(12, threshold - totalFor(target) + 14 + Math.floor(Math.random() * 8))
      : 0;

    setPreviousRanks(rankMap(currentRanking));
    setMentions(mentions.map((mention) => ({
      ...mention,
      sources: mention.sources.map((source) => {
        const baseline = Math.floor(Math.random() * 3);
        const spike = mention.ticker === spikeTicker && source.name === spikeSource ? spikeAmount : 0;
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
    })));
    setRefreshNumber((value) => value + 1);
    setLastRefreshAt(now);
    setLastMover(shouldSpike ? spikeTicker : null);
    setLastSpike(
      shouldSpike
        ? `$${spikeTicker} +${spikeAmount} from r/${spikeSource} · targeting rank #${desiredRank + 1}`
        : 'Routine refresh — baseline mentions only'
    );
  }, [mentions]);

  useEffect(() => {
    if (!autoPlay) return;
    const interval = window.setInterval(() => simulateRefresh(), 4000);
    return () => window.clearInterval(interval);
  }, [autoPlay, simulateRefresh]);

  const ranking = useMemo(
    () => [...mentions].sort((a, b) => totalFor(b) - totalFor(a) || a.ticker.localeCompare(b.ticker)),
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
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <section className="mb-8 border-4 border-border-strong bg-surface p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="mb-2 font-mono text-xs font-black uppercase tracking-wide text-primary">
              Isolated UI fixture
            </p>
            <h1 className="text-4xl font-black uppercase text-text">Reddit ticker simulation</h1>
            <p className="mt-2 max-w-2xl text-text-muted">
              Synthetic mention counts only. No Reddit credentials, API calls, backend state, or local storage.
            </p>
          </div>
          <div className="flex items-stretch border-2 border-border-strong">
            <button
              type="button"
              onClick={() => setAutoPlay((playing) => !playing)}
              className={`px-4 py-2 text-xs font-black uppercase ${autoPlay ? 'bg-success text-text' : 'bg-surface-alt text-text'}`}
            >
              {autoPlay ? 'Auto: on' : 'Auto: off'}
            </button>
            <button
              type="button"
              onClick={() => simulateRefresh(false)}
              className="border-l-2 border-border-strong bg-primary px-4 py-2 text-xs font-black uppercase text-primary-contrast"
            >
              Next refresh
            </button>
            <button
              type="button"
              onClick={() => simulateRefresh(true)}
              className="border-l-2 border-border-strong bg-warning px-4 py-2 text-xs font-black uppercase text-text"
            >
              Force spike
            </button>
            <button
              type="button"
              onClick={resetSimulation}
              className="border-l-2 border-border-strong bg-surface-alt px-4 py-2 text-xs font-black uppercase text-text"
            >
              Reset
            </button>
          </div>
        </div>
      </section>

      <section className="mb-8 overflow-hidden border-4 border-border-strong shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="research-panel-header flex flex-wrap items-center justify-between gap-3 border-b-4 border-border-strong px-4 py-3">
          <h2 className="font-black uppercase">Simulated Reddit 24h ticker</h2>
          <p className="font-mono text-xs opacity-75">
            Refresh {refreshNumber} · {formatTime(lastRefreshAt)} · {lastSpike}
          </p>
        </div>
        <div className="reddit-banner overflow-x-auto">
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
                    className={`flex items-center gap-3 border-r-2 border-border-strong px-4 py-3 font-mono font-black ${
                      lastMover === mention.ticker
                        ? 'bg-warning text-text'
                        : selectedTicker === mention.ticker
                          ? 'bg-primary-muted'
                          : 'hover:bg-primary-muted'
                    }`}
                  >
                    <span className="text-xs opacity-70">#{index + 1}</span>
                    <span>${mention.ticker}</span>
                    {previousRanks[mention.ticker] !== undefined &&
                      previousRanks[mention.ticker] !== index + 1 && (
                        <motion.span
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-[10px] tabular-nums"
                        >
                          {previousRanks[mention.ticker]! > index + 1 ? '↑' : '↓'}
                          {Math.abs(previousRanks[mention.ticker]! - (index + 1))}
                        </motion.span>
                      )}
                    <motion.span
                      key={totalFor(mention)}
                      initial={{ scale: 1.45, backgroundColor: 'var(--semantic-warning)' }}
                      animate={{ scale: 1, backgroundColor: 'var(--semantic-success)' }}
                      className="px-2 py-0.5 text-sm text-text tabular-nums"
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

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="overflow-hidden border-4 border-border-strong bg-surface shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <div className="research-panel-header border-b-4 border-border-strong px-4 py-3">
            <h2 className="font-black uppercase">Ranking animation inspector</h2>
          </div>
          <LayoutGroup id="simulated-vertical-ranking">
            <div className="divide-y-2 divide-border">
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
                  className={`grid w-full grid-cols-[3rem_5rem_1fr_auto] items-center gap-3 px-4 py-3 text-left ${
                    lastMover === mention.ticker
                      ? 'bg-warning text-text'
                      : selectedTicker === mention.ticker
                        ? 'bg-primary-muted'
                        : 'hover:bg-surface-alt'
                  }`}
                >
                  <span className="font-mono text-sm font-black text-primary">
                    #{index + 1}
                    {previousRanks[mention.ticker] !== undefined &&
                      previousRanks[mention.ticker] !== index + 1 && (
                        <span className="ml-1 text-[10px] text-success">
                          {previousRanks[mention.ticker]! > index + 1 ? '↑' : '↓'}
                          {Math.abs(previousRanks[mention.ticker]! - (index + 1))}
                        </span>
                      )}
                  </span>
                  <span className="font-mono font-black text-text">${mention.ticker}</span>
                  <span className="font-mono text-xs text-text-muted">
                    {mention.sources.filter((source) => source.posts + source.comments > 0).length} subreddits
                  </span>
                  <span className="font-mono text-lg font-black tabular-nums text-text">{totalFor(mention)}</span>
                </motion.button>
              ))}
            </div>
          </LayoutGroup>
        </section>

        <aside className="border-4 border-border-strong bg-surface shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <div className="research-panel-header border-b-4 border-border-strong px-4 py-3">
            <h2 className="font-black uppercase">${selected?.ticker} by subreddit</h2>
          </div>
          <div className="divide-y-2 divide-border">
            {selected?.sources
              .filter((source) => source.posts + source.comments > 0)
              .sort((a, b) => b.posts + b.comments - a.posts - a.comments)
              .map((source) => (
                <div key={source.name} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs font-black text-text">r/{source.name}</span>
                    <span className="font-mono font-black tabular-nums text-primary">
                      {source.posts + source.comments}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-text-muted">
                    {source.posts} posts · {source.comments} comments
                  </p>
                  <p className="font-mono text-[10px] text-text-muted">
                    {formatTime(source.firstMentionAt)} → {formatTime(source.lastMentionAt)}
                  </p>
                </div>
              ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
