'use client';

import { useState, useSyncExternalStore } from 'react';

import type { Filing } from '@/components/FormsTableMain';
import type { InsiderActivity } from '@/components/InsiderFormsTable';

export interface FinancialMetric {
  key: string;
  label: string;
  value: number;
  unit: string;
  periodEnd: string;
  filed: string;
  form: string;
}

interface ResearchMetricsRailProps {
  ticker: string;
  financials?: FinancialMetric[];
  insiderActivity?: InsiderActivity;
  filings?: Filing[];
}

const requestedMetrics = [
  { label: 'P/E', requirement: 'Price + TTM EPS', factKeys: ['epsDiluted'] },
  {
    label: 'P/B',
    requirement: 'Price + book value/share',
    factKeys: ['equity', 'sharesOutstanding'],
  },
  {
    label: 'P/S',
    requirement: 'Market cap + TTM revenue',
    factKeys: ['revenue', 'sharesOutstanding'],
  },
  { label: 'RSI · 14D', requirement: '15+ daily closes', factKeys: [] },
] as const;

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

const percent = (value: number) =>
  `${(value * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
const ratio = (value: number) => `${value.toFixed(2)}×`;
const compactUsd = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
const perShareUsd = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);

/* Every ratio here is computed from facts already in the snapshot — no quote
   feed, no extra request. Each takes the facts it names and returns undefined
   when any of them is missing or would divide by zero. */
const derivedMetrics: Array<{
  key: string;
  label: string;
  note: string;
  facts: string[];
  compute: (value: (key: string) => number | undefined) => string | undefined;
}> = [
  {
    key: 'bookValuePerShare',
    label: 'Book value / share',
    note: 'Equity ÷ shares outstanding',
    facts: ['equity', 'sharesOutstanding'],
    compute: (value) => {
      const equity = value('equity');
      const shares = value('sharesOutstanding');
      return equity !== undefined && shares ? perShareUsd(equity / shares) : undefined;
    },
  },
  {
    key: 'currentRatio',
    label: 'Current ratio',
    note: 'Current assets ÷ current liabilities',
    facts: ['currentAssets', 'currentLiabilities'],
    compute: (value) => {
      const assets = value('currentAssets');
      const liabilities = value('currentLiabilities');
      return assets !== undefined && liabilities ? ratio(assets / liabilities) : undefined;
    },
  },
  {
    key: 'debtToEquity',
    label: 'Debt / equity',
    note: 'Total liabilities ÷ equity',
    facts: ['liabilities', 'equity'],
    compute: (value) => {
      const liabilities = value('liabilities');
      const equity = value('equity');
      return liabilities !== undefined && equity ? ratio(liabilities / equity) : undefined;
    },
  },
  {
    key: 'longTermDebtToEquity',
    label: 'LT debt / equity',
    note: 'Long-term debt ÷ equity',
    facts: ['longTermDebt', 'equity'],
    compute: (value) => {
      const debt = value('longTermDebt');
      const equity = value('equity');
      return debt !== undefined && equity ? ratio(debt / equity) : undefined;
    },
  },
  {
    key: 'grossMargin',
    label: 'Gross margin',
    note: 'Gross profit ÷ revenue',
    facts: ['grossProfit', 'revenue'],
    compute: (value) => {
      const gross = value('grossProfit');
      const revenue = value('revenue');
      return gross !== undefined && revenue ? percent(gross / revenue) : undefined;
    },
  },
  {
    key: 'operatingMargin',
    label: 'Operating margin',
    note: 'Operating income ÷ revenue',
    facts: ['operatingIncome', 'revenue'],
    compute: (value) => {
      const operating = value('operatingIncome');
      const revenue = value('revenue');
      return operating !== undefined && revenue ? percent(operating / revenue) : undefined;
    },
  },
  {
    key: 'netMargin',
    label: 'Net margin',
    note: 'Net income ÷ revenue',
    facts: ['netIncome', 'revenue'],
    compute: (value) => {
      const net = value('netIncome');
      const revenue = value('revenue');
      return net !== undefined && revenue ? percent(net / revenue) : undefined;
    },
  },
  {
    key: 'returnOnEquity',
    label: 'Return on equity',
    note: 'Net income ÷ equity',
    facts: ['netIncome', 'equity'],
    compute: (value) => {
      const net = value('netIncome');
      const equity = value('equity');
      return net !== undefined && equity ? percent(net / equity) : undefined;
    },
  },
  {
    key: 'returnOnAssets',
    label: 'Return on assets',
    note: 'Net income ÷ assets',
    facts: ['netIncome', 'assets'],
    compute: (value) => {
      const net = value('netIncome');
      const assets = value('assets');
      return net !== undefined && assets ? percent(net / assets) : undefined;
    },
  },
  {
    key: 'freeCashFlow',
    label: 'Free cash flow',
    note: 'Operating cash flow − capex',
    facts: ['operatingCashFlow', 'capex'],
    compute: (value) => {
      const operating = value('operatingCashFlow');
      const capex = value('capex');
      return operating !== undefined && capex !== undefined
        ? compactUsd(operating - capex)
        : undefined;
    },
  },
  {
    key: 'cashToAssets',
    label: 'Cash / assets',
    note: 'Cash ÷ total assets',
    facts: ['cash', 'assets'],
    compute: (value) => {
      const cash = value('cash');
      const assets = value('assets');
      return cash !== undefined && assets ? percent(cash / assets) : undefined;
    },
  },
  {
    key: 'researchIntensity',
    label: 'R&D intensity',
    note: 'R&D expense ÷ revenue',
    facts: ['researchDevelopment', 'revenue'],
    compute: (value) => {
      const research = value('researchDevelopment');
      const revenue = value('revenue');
      return research !== undefined && revenue ? percent(research / revenue) : undefined;
    },
  },
];

/* The clock is read through a store rather than during render: render must
   stay pure, and a raw Date.now() would also disagree between the server pass
   and the client one. The snapshot is the day number, which is stable for the
   whole day — so it never loops — and day granularity is all a filing age
   needs. The server snapshot is null, so ages render blank until hydration. */
const MS_PER_DAY = 86_400_000;
const subscribeToClock = () => () => {};
const getDayNumber = () => Math.floor(Date.now() / MS_PER_DAY);
const getServerDayNumber = () => null;

function daysSince(date: string, today: number | null): number | undefined {
  if (today === null) return undefined;
  const parsed = Date.parse(date);
  if (Number.isNaN(parsed)) return undefined;
  return Math.max(0, today - Math.floor(parsed / MS_PER_DAY));
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

type MetricGroup = (typeof metricGroups)[number]['key'];

const metricGroups = [
  { key: 'all', label: 'All', title: 'All metrics' },
  { key: 'financials', label: 'Fin', title: 'Latest standardized financials' },
  { key: 'derived', label: 'Calc', title: 'Derived ratios — computed from SEC facts alone' },
  { key: 'ratios', label: 'Price', title: 'Market ratios — need a price feed' },
  { key: 'ownership', label: 'Own', title: 'Ownership signals' },
  { key: 'activity', label: 'File', title: 'Filing activity' },
] as const;

export function ResearchMetricsRail({
  ticker,
  financials = [],
  insiderActivity,
  filings = [],
}: ResearchMetricsRailProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [group, setGroup] = useState<MetricGroup>('all');
  const [query, setQuery] = useState('');
  const today = useSyncExternalStore(subscribeToClock, getDayNumber, getServerDayNumber);

  if (!ticker) return null;

  const availableFacts = new Set(financials.map((metric) => metric.key));
  const beneficialOwnershipCount = filings.filter((filing) =>
    /^(?:SC )?13[DG](?:\/A)?$/i.test(filing.type)
  ).length;

  const factByKey = new Map(financials.map((metric) => [metric.key, metric]));
  const factValue = (key: string) => factByKey.get(key)?.value;

  const derivedCards = derivedMetrics.flatMap((metric) => {
    const value = metric.compute(factValue);
    if (value === undefined) return [];
    // Facts are each the latest of their own concept, so a ratio can straddle
    // two filing periods. Showing the oldest of them keeps that visible.
    const basis = metric.facts
      .map((key) => factByKey.get(key)?.periodEnd)
      .filter((period): period is string => Boolean(period))
      .sort();
    return [{ ...metric, value, period: basis[0] }];
  });

  const formCount = (pattern: RegExp) =>
    filings.filter((filing) => pattern.test(filing.type)).length;
  const latestOfForm = (pattern: RegExp) =>
    filings
      .filter((filing) => pattern.test(filing.type))
      .map((filing) => filing.fileDate)
      .sort()
      .at(-1);
  const latestFiling = filings
    .map((filing) => filing.fileDate)
    .sort()
    .at(-1);
  const latestFilingAge = latestFiling ? daysSince(latestFiling, today) : undefined;
  const lastAnnual = latestOfForm(/^10-K(?:\/A)?$/i);
  const lastQuarterly = latestOfForm(/^10-Q(?:\/A)?$/i);
  const oneYearAgo =
    today === null ? null : new Date((today - 365) * MS_PER_DAY).toISOString().slice(0, 10);

  const activityCards = [
    {
      key: 'latest-filing',
      label: 'Latest filing',
      value: latestFiling ?? '—',
      detail: latestFilingAge === undefined ? undefined : `${latestFilingAge} days ago`,
    },
    {
      key: 'filings-loaded',
      label: 'Filings loaded',
      value: filings.length,
      detail: `${new Set(filings.map((filing) => filing.type)).size} distinct form types`,
    },
    {
      key: 'last-10k',
      label: 'Last 10-K',
      value: lastAnnual ?? '—',
      detail: lastAnnual
        ? `${daysSince(lastAnnual, today) ?? '—'} days ago`
        : 'Not in loaded filings',
    },
    {
      key: 'last-10q',
      label: 'Last 10-Q',
      value: lastQuarterly ?? '—',
      detail: lastQuarterly
        ? `${daysSince(lastQuarterly, today) ?? '—'} days ago`
        : 'Not in loaded filings',
    },
    {
      key: 'current-reports',
      label: '8-K · 12M',
      value:
        oneYearAgo === null
          ? '—'
          : filings.filter(
              (filing) => /^8-K(?:\/A)?$/i.test(filing.type) && filing.fileDate >= oneYearAgo
            ).length,
      detail: `${formCount(/^8-K(?:\/A)?$/i)} in loaded filings`,
    },
    {
      key: 'registrations',
      label: 'S-/424 registrations',
      value: formCount(/^(?:S-\d|424B\d)/i),
      detail: 'Securities offerings in loaded filings',
    },
  ];

  const ownershipCards = [
    {
      key: 'insider-filings',
      label: 'Insider filings · 12M',
      value: insiderActivity?.total ?? '—',
      detail: insiderActivity
        ? `3: ${insiderActivity.form3} · 4: ${insiderActivity.form4} · 5: ${insiderActivity.form5}`
        : undefined,
    },
    {
      key: 'beneficial-ownership',
      label: '13D/G in loaded files',
      value: beneficialOwnershipCount,
      detail: undefined,
    },
  ];

  // One query across every card in the rail: the group buttons narrow by
  // section, the text field narrows by name within whatever is showing.
  const search = query.trim().toLocaleLowerCase();
  const matches = (...values: Array<string | undefined>) =>
    !search || values.some((value) => value?.toLocaleLowerCase().includes(search));

  const visibleFinancials = financials.filter((metric) =>
    matches(metric.label, metric.key, metric.form)
  );
  const visibleRatios = requestedMetrics.filter((metric) =>
    matches(metric.label, metric.requirement)
  );
  const visibleOwnership = ownershipCards.filter((card) => matches(card.label));
  const visibleDerived = derivedCards.filter((card) => matches(card.label, card.note));
  const visibleActivity = activityCards.filter((card) => matches(card.label, card.detail));

  const showFinancials =
    (group === 'all' || group === 'financials') && (!search || visibleFinancials.length > 0);
  const showDerived = (group === 'all' || group === 'derived') && visibleDerived.length > 0;
  const showRatios = (group === 'all' || group === 'ratios') && visibleRatios.length > 0;
  const showOwnership = (group === 'all' || group === 'ownership') && visibleOwnership.length > 0;
  const showActivity = (group === 'all' || group === 'activity') && visibleActivity.length > 0;
  const showNothing =
    !showFinancials && !showDerived && !showRatios && !showOwnership && !showActivity;

  return (
    <aside
      aria-label="Research metrics"
      data-collapsed={collapsed}
      style={{
        top: 'var(--app-header-h, 6.5rem)',
        height: 'calc(100dvh - var(--app-header-h, 6.5rem))',
      }}
      // The rail arrives with a company: it slides in from the right edge on
      // mount (a CSS animation, so no render-time state), and the width
      // transition then carries the collapse toggle.
      className={`rail-enter sticky z-30 flex shrink-0 flex-col self-start overflow-hidden border-l border-border bg-surface font-mono transition-[width] duration-200 ease-smooth ${
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
          aria-label={collapsed ? 'Expand metrics' : 'Collapse metrics'}
          title={collapsed ? 'Expand metrics' : 'Collapse metrics'}
          className="grid size-6 shrink-0 place-items-center text-text-subtle transition-colors hover:bg-surface-alt hover:text-text"
        >
          <ChevronIcon direction={collapsed ? 'left' : 'right'} />
        </button>
        {!collapsed && (
          <>
            <h2 className="flex-1 text-center text-[11px] font-black uppercase tracking-[0.2em] text-primary">
              Metrics
            </h2>
            {/* Balances the chevron so the title centers on the rail, not on the
                space left over beside it. */}
            <span className="size-6 shrink-0" aria-hidden="true" />
          </>
        )}
      </div>

      {!collapsed && (
        <div
          role="group"
          aria-label="Filter metrics"
          className="flex shrink-0 flex-wrap border-b border-border bg-bg-alt"
        >
          {metricGroups.map(({ key, label, title }) => (
            <button
              key={key}
              type="button"
              onClick={() => setGroup(key)}
              aria-pressed={group === key}
              title={title}
              className={`h-6 min-w-[3.25rem] flex-1 border-b border-r border-border text-[9px] font-black uppercase tracking-wide transition-colors ${
                group === key
                  ? 'bg-primary text-primary-contrast'
                  : 'text-text-muted hover:bg-surface hover:text-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!collapsed && (
        <div className="shrink-0 border-b border-border bg-bg-alt px-2 py-1">
          <label htmlFor="metrics-filter" className="sr-only">
            Filter metrics
          </label>
          <input
            id="metrics-filter"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter metrics"
            className="h-6 w-full border border-border bg-bg px-2 text-[11px] text-text placeholder:text-text-subtle focus:border-primary focus:outline-none"
          />
        </div>
      )}

      {collapsed ? (
        <div className="grid flex-1 place-items-center font-mono text-[11px] font-black text-text-muted">
          <span className="[writing-mode:vertical-rl]">{ticker}</span>
        </div>
      ) : (
        <div className="min-w-52 flex-1 divide-y divide-border overflow-y-auto">
          {showFinancials && (
            <section className="p-2" aria-labelledby="financials-heading">
              <h3
                id="financials-heading"
                className="mb-3 font-mono text-[10px] font-black uppercase tracking-wide text-text-muted"
              >
                Latest standardized financials
              </h3>
              {visibleFinancials.length > 0 ? (
                <dl className="space-y-2">
                  {visibleFinancials.map((metric) => (
                    <div key={metric.key} className="border border-border bg-bg-alt px-2 py-1">
                      <dt className="font-mono text-[9px] font-black uppercase tracking-wide text-text-muted">
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
                <p className="font-mono text-[10px] text-text-muted">
                  No standardized facts found.
                </p>
              )}
            </section>
          )}

          {showDerived && (
            <section className="p-2" aria-labelledby="derived-heading">
              <h3
                id="derived-heading"
                className="mb-3 font-mono text-[10px] font-black uppercase tracking-wide text-text-muted"
              >
                Derived ratios
              </h3>
              <dl className="space-y-2">
                {visibleDerived.map((card) => (
                  <div key={card.key} className="border border-border bg-bg-alt p-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="font-mono text-[9px] font-black uppercase tracking-wide text-text-muted">
                        {card.label}
                      </dt>
                      <dd className="font-mono text-sm font-black tabular-nums text-text">
                        {card.value}
                      </dd>
                    </div>
                    <p className="font-mono text-[9px] leading-tight text-text-muted">
                      {card.note}
                      {card.period ? ` · from ${card.period}` : ''}
                    </p>
                  </div>
                ))}
              </dl>
              <p className="mt-3 font-mono text-[9px] leading-relaxed text-text-muted">
                Computed from the filed facts above. Each fact is the latest of its own concept, so
                a ratio can mix an annual figure with a quarterly one.
              </p>
            </section>
          )}

          {showRatios && (
            <section className="p-2" aria-labelledby="valuation-heading">
              <h3
                id="valuation-heading"
                className="mb-3 font-mono text-[10px] font-black uppercase tracking-wide text-text-muted"
              >
                Market ratios
              </h3>
              <dl className="space-y-2">
                {visibleRatios.map((metric) => {
                  const secFactsFound =
                    metric.factKeys.length > 0 &&
                    metric.factKeys.every((key) => availableFacts.has(key));
                  return (
                    <div key={metric.label} className="border border-border bg-bg-alt p-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="font-black text-text">{metric.label}</dt>
                        <dd className="font-mono text-lg font-black text-text-muted">—</dd>
                      </div>
                      <p className="font-mono text-[9px] leading-tight text-text-muted">
                        {metric.requirement}
                      </p>
                      {secFactsFound && (
                        <p className="mt-1 font-mono text-[9px] font-black uppercase text-success">
                          SEC facts found
                        </p>
                      )}
                    </div>
                  );
                })}
              </dl>
              <p className="mt-3 font-mono text-[9px] leading-relaxed text-text-muted">
                Requires a market-price feed. SEC EDGAR does not publish quotes or price history.
              </p>
            </section>
          )}

          {showOwnership && (
            <section className="p-2" aria-labelledby="ownership-heading">
              <h3
                id="ownership-heading"
                className="mb-3 font-mono text-[10px] font-black uppercase tracking-wide text-text-muted"
              >
                Ownership signals
              </h3>
              <dl className="space-y-2">
                {visibleOwnership.map((card) => (
                  <div key={card.key} className="border border-border bg-bg-alt p-2">
                    <dt className="font-mono text-[9px] font-black uppercase text-text-muted">
                      {card.label}
                    </dt>
                    <dd className="mt-1 text-xl font-black tabular-nums text-text">{card.value}</dd>
                    {card.detail && (
                      <p className="font-mono text-[9px] text-text-muted">{card.detail}</p>
                    )}
                  </div>
                ))}
              </dl>
              <p className="mt-3 font-mono text-[9px] leading-relaxed text-text-muted">
                13D/G identifies reportable beneficial owners. 13F is manager-centric and requires a
                separate cross-filer holdings index.
              </p>
            </section>
          )}

          {showActivity && (
            <section className="p-2" aria-labelledby="activity-heading">
              <h3
                id="activity-heading"
                className="mb-3 font-mono text-[10px] font-black uppercase tracking-wide text-text-muted"
              >
                Filing activity
              </h3>
              <dl className="space-y-2">
                {visibleActivity.map((card) => (
                  <div key={card.key} className="border border-border bg-bg-alt p-2">
                    <dt className="font-mono text-[9px] font-black uppercase text-text-muted">
                      {card.label}
                    </dt>
                    <dd className="mt-1 font-mono text-base font-black tabular-nums text-text">
                      {card.value}
                    </dd>
                    {card.detail && (
                      <p className="font-mono text-[9px] text-text-muted">{card.detail}</p>
                    )}
                  </div>
                ))}
              </dl>
              <p className="mt-3 font-mono text-[9px] leading-relaxed text-text-muted">
                Counted over the filings loaded for this company, not its full EDGAR history.
              </p>
            </section>
          )}

          {showNothing && (
            <p className="p-3 font-mono text-[10px] text-text-muted">
              No metrics match “{query.trim()}”.
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
