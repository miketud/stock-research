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
  { label: 'P/B', requirement: 'Price + book value/share', factKeys: ['equity', 'sharesOutstanding'] },
  { label: 'P/S', requirement: 'Market cap + TTM revenue', factKeys: ['revenue', 'sharesOutstanding'] },
  { label: 'RSI · 14D', requirement: '15+ daily closes', factKeys: [] },
] as const;

export function ResearchMetricsRail({
  ticker,
  financials = [],
  insiderActivity,
  filings = [],
}: ResearchMetricsRailProps) {
  const availableFacts = new Set(financials.map((metric) => metric.key));
  const beneficialOwnershipCount = filings.filter((filing) =>
    /^(?:SC )?13[DG](?:\/A)?$/i.test(filing.type)
  ).length;

  return (
    <aside
      aria-label="Research metrics"
      className="border-4 border-border-strong bg-surface shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] lg:sticky lg:top-6"
    >
      <div className="research-panel-header flex items-center justify-between border-b-4 border-border-strong px-3 py-3">
        <h2 className="text-sm font-black uppercase tracking-wide">Metrics</h2>
        {ticker && <span className="font-mono text-xs font-bold">{ticker}</span>}
      </div>

      {!ticker ? (
        <div className="grid min-h-36 place-items-center px-4 text-center font-mono text-sm text-text-muted">
          Search a ticker.
        </div>
      ) : (
        <div className="divide-y-4 divide-border-strong">
          <section className="p-3" aria-labelledby="valuation-heading">
            <h3
              id="valuation-heading"
              className="mb-3 font-mono text-[10px] font-black uppercase tracking-wide text-text-muted"
            >
              Market ratios
            </h3>
            <dl className="space-y-2">
              {requestedMetrics.map((metric) => {
                const secFactsFound =
                  metric.factKeys.length > 0 &&
                  metric.factKeys.every((key) => availableFacts.has(key));
                return (
                  <div key={metric.label} className="border-2 border-border bg-surface-alt p-2">
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

          <section className="p-3" aria-labelledby="ownership-heading">
            <h3
              id="ownership-heading"
              className="mb-3 font-mono text-[10px] font-black uppercase tracking-wide text-text-muted"
            >
              Ownership signals
            </h3>
            <dl className="space-y-2">
              <div className="border-2 border-border bg-surface-alt p-2">
                <dt className="font-mono text-[9px] font-black uppercase text-text-muted">
                  Insider filings · 12M
                </dt>
                <dd className="mt-1 text-xl font-black tabular-nums text-text">
                  {insiderActivity?.total ?? '—'}
                </dd>
                {insiderActivity && (
                  <p className="font-mono text-[9px] text-text-muted">
                    3: {insiderActivity.form3} · 4: {insiderActivity.form4} · 5:{' '}
                    {insiderActivity.form5}
                  </p>
                )}
              </div>
              <div className="border-2 border-border bg-surface-alt p-2">
                <dt className="font-mono text-[9px] font-black uppercase text-text-muted">
                  13D/G in loaded files
                </dt>
                <dd className="mt-1 text-xl font-black tabular-nums text-text">
                  {beneficialOwnershipCount}
                </dd>
              </div>
            </dl>
            <p className="mt-3 font-mono text-[9px] leading-relaxed text-text-muted">
              13D/G identifies reportable beneficial owners. 13F is manager-centric and requires a
              separate cross-filer holdings index.
            </p>
          </section>
        </div>
      )}
    </aside>
  );
}
