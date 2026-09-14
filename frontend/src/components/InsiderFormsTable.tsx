'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import type { Filing } from '@/components/FormsTableMain';

export interface InsiderActivity {
  periodDays: number;
  total: number;
  form3: number;
  form4: number;
  form5: number;
  latestDate?: string;
}

export interface InsiderTransaction {
  accessionNumber: string;
  form: string;
  fileDate: string;
  transactionDate?: string;
  ownerName: string;
  ownerCik?: string;
  relationships: string[];
  securityTitle?: string;
  transactionCode?: string;
  acquiredDisposed?: string;
  shares?: number;
  pricePerShare?: number;
  sharesOwnedFollowing?: number;
  directOrIndirect?: string;
  derivative: boolean;
  url: string;
}

export interface InsiderTransactionsResponse {
  ticker: string;
  cik: string;
  periodDays: number;
  filingsScanned: number;
  scannedAccessions?: string[];
  filings?: Filing[];
  transactions: InsiderTransaction[];
}

interface InsiderFormsTableProps {
  activity?: InsiderActivity;
  details: InsiderTransactionsResponse | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  limit: number;
  onLoadMore: () => void;
}

const transactionCodeLabels: Record<string, string> = {
  A: 'Grant / award',
  D: 'Returned to issuer',
  F: 'Tax or exercise payment',
  G: 'Gift',
  J: 'Other',
  M: 'Option exercise',
  P: 'Purchase',
  S: 'Sale',
  V: 'Voluntary',
};

function InsiderTransactionGraph({ transactions }: { transactions: InsiderTransaction[] }) {
  const plotted = transactions
    .filter((transaction) => transaction.shares !== undefined && transaction.shares > 0)
    .slice(0, 24);
  if (plotted.length === 0) return null;

  const maximum = Math.max(...plotted.map((transaction) => transaction.shares ?? 0));
  const gap = 2;
  const barWidth = Math.max(2, (94 - gap * (plotted.length - 1)) / plotted.length);

  return (
    <svg
      viewBox="0 0 96 30"
      className="h-8 w-24 shrink-0"
      role="img"
      aria-label="Acquired and disposed share activity"
    >
      <title>Green bars are acquired shares; red bars are disposed shares.</title>
      <line x1="1" x2="95" y1="15" y2="15" stroke="var(--semantic-border)" strokeWidth="1" />
      {plotted.map((transaction, index) => {
        const height = Math.max(2, ((transaction.shares ?? 0) / maximum) * 13);
        const acquired = transaction.acquiredDisposed === 'A';
        const disposed = transaction.acquiredDisposed === 'D';
        return (
          <rect
            key={`${transaction.accessionNumber}-${index}`}
            x={1 + index * (barWidth + gap)}
            y={acquired ? 15 - height : 15}
            width={barWidth}
            height={height}
            rx="0.75"
            fill={
              acquired
                ? 'var(--semantic-success)'
                : disposed
                  ? 'var(--semantic-danger)'
                  : 'var(--semantic-text-muted)'
            }
          />
        );
      })}
    </svg>
  );
}

export function InsiderFormsTable({
  activity,
  details,
  loading,
  loadingMore,
  error,
  limit,
  onLoadMore,
}: InsiderFormsTableProps) {
  const [expandedFilings, setExpandedFilings] = useState<Set<string>>(() => new Set());
  const [panelOpen, setPanelOpen] = useState(true);
  const tableRef = useRef<HTMLDivElement>(null);
  const previousLimit = useRef(limit);

  useEffect(() => {
    const firstNewIndex = previousLimit.current;
    previousLimit.current = limit;
    if (limit <= firstNewIndex) return;
    tableRef.current
      ?.querySelector<HTMLElement>(`[data-insider-index="${firstNewIndex}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [details, limit]);

  const toggleFiling = (accessionNumber: string) => {
    setExpandedFilings((current) => {
      const next = new Set(current);
      if (next.has(accessionNumber)) next.delete(accessionNumber);
      else next.add(accessionNumber);
      return next;
    });
  };

  return (
    <section className="mt-4 border border-border bg-surface font-mono">
      {/* The whole bar is the toggle; the load-more button inside it stops the
          click from reaching this handler. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setPanelOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          setPanelOpen((open) => !open);
        }}
        aria-expanded={panelOpen}
        aria-controls="insider-panel-body"
        title={panelOpen ? 'Collapse insider ownership' : 'Expand insider ownership'}
        className="flex cursor-pointer flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-1.5 transition-colors hover:bg-surface-alt"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
            Insider ownership
          </h3>
          <span className="text-sm leading-none text-text-subtle" aria-hidden="true">
            {panelOpen ? '−' : '+'}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {activity && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] uppercase tabular-nums text-text-subtle">
              <span>{activity.total} filings · 12 months</span>
              <span>Form 3: {activity.form3}</span>
              <span>Form 4: {activity.form4}</span>
              <span>Form 5: {activity.form5}</span>
              {activity.latestDate && <span>Latest: {activity.latestDate}</span>}
            </div>
          )}
          {details && limit < (details.filings?.length ?? 0) && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onLoadMore();
              }}
              disabled={loadingMore}
              aria-label="Read and show the next 10 insider ownership filings"
              className="border border-border px-2 py-0.5 font-mono text-[10px] font-black uppercase text-text-subtle transition-colors hover:border-primary hover:text-primary disabled:cursor-wait disabled:opacity-50"
            >
              {loadingMore ? 'READING…' : '+10'}
            </button>
          )}
        </div>
      </div>

      <div id="insider-panel-body" className={panelOpen ? undefined : 'hidden'}>
        {loading ? (
          <div className="grid min-h-36 place-items-center font-mono text-sm font-bold text-text-muted">
            Reading ownership filings…
          </div>
        ) : error && !details ? (
          <div className="m-3 border border-danger px-3 py-1.5 text-[11px] font-black uppercase text-danger">
            {error}
          </div>
        ) : details ? (
          (details.filings?.length ?? 0) === 0 ? (
            <div className="grid min-h-36 place-items-center px-4 text-center font-mono text-sm text-text-muted">
              No Forms 3, 4, or 5 filed during the last 12 months.
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg-alt px-3 py-1">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-text-subtle">
                  Ownership filings · click a row for matched details
                </p>
                <span className="text-[10px] tabular-nums text-text-subtle">
                  {Math.min(limit, details.filings?.length ?? 0)} of {details.filings?.length ?? 0}{' '}
                  files shown · {details.transactions.length} transactions ·{' '}
                  {details.filingsScanned} files read
                </span>
              </div>
              {error && (
                <div className="border-b-2 border-danger bg-surface-alt px-4 py-2 font-mono text-xs font-bold text-danger">
                  {error}
                </div>
              )}
              <div ref={tableRef} className="max-h-[44rem] overflow-y-auto">
                <table className="w-full table-fixed border-collapse text-left">
                  <colgroup>
                    <col className="w-[8%]" />
                    <col className="w-[13%]" />
                    <col className="w-[24%]" />
                    <col className="w-[44%]" />
                    <col className="w-[11%]" />
                  </colgroup>
                  <thead className="research-panel-header sticky top-0 z-10 font-mono text-[10px] font-black uppercase">
                    <tr>
                      <th className="px-3 py-2">Form</th>
                      <th className="px-3 py-2">Filed</th>
                      <th className="px-3 py-2">Insider</th>
                      <th className="px-3 py-2">Activity</th>
                      <th className="px-3 py-2 text-right">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(details.filings ?? []).slice(0, limit).map((filing, filingIndex) => {
                      const matchedTransactions = details.transactions.filter(
                        (transaction) => transaction.accessionNumber === filing.accessionNumber
                      );
                      const expanded = expandedFilings.has(filing.accessionNumber);
                      const wasScanned = details.scannedAccessions?.includes(
                        filing.accessionNumber
                      );
                      const isInitialStatement = /^3(?:\/A)?$/.test(filing.type);
                      const ownerNames =
                        filing.ownerNames && filing.ownerNames.length > 0
                          ? filing.ownerNames
                          : [
                              ...new Set(
                                matchedTransactions.map((transaction) => transaction.ownerName)
                              ),
                            ];
                      const detailSummary = isInitialStatement
                        ? 'Initial holdings'
                        : matchedTransactions.length > 0
                          ? `${matchedTransactions.length} transaction${matchedTransactions.length === 1 ? '' : 's'}`
                          : wasScanned
                            ? 'No transactions'
                            : 'Not extracted';

                      return (
                        <Fragment key={filing.accessionNumber}>
                          <tr
                            data-insider-index={filingIndex}
                            role="button"
                            tabIndex={0}
                            aria-expanded={expanded}
                            onClick={() => toggleFiling(filing.accessionNumber)}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter' && event.key !== ' ') return;
                              event.preventDefault();
                              toggleFiling(filing.accessionNumber);
                            }}
                            className="cursor-pointer border-b-2 border-border transition-colors hover:bg-surface-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px]"
                          >
                            <td className="truncate px-3 py-3 font-mono font-black text-success">
                              <span className="mr-1 text-text-muted" aria-hidden="true">
                                {expanded ? '−' : '+'}
                              </span>
                              {filing.type}
                            </td>
                            <td className="truncate px-3 py-3 font-mono text-xs tabular-nums text-text-muted">
                              {filing.fileDate}
                            </td>
                            <td className="truncate px-3 py-3 text-sm font-black text-text">
                              {ownerNames.join(', ') || 'Not extracted'}
                            </td>
                            <td className="px-3 py-2">
                              {matchedTransactions.length > 0 ? (
                                <div className="flex min-w-0 items-center justify-between gap-3">
                                  <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
                                    {matchedTransactions.map((transaction, index) => {
                                      const acquired = transaction.acquiredDisposed === 'A';
                                      const disposed = transaction.acquiredDisposed === 'D';
                                      return (
                                        <span
                                          key={`${transaction.accessionNumber}-summary-${index}`}
                                          className="min-w-fit font-mono"
                                        >
                                          <strong
                                            className={`block text-xs tabular-nums ${
                                              disposed
                                                ? 'text-danger'
                                                : acquired
                                                  ? 'text-success'
                                                  : 'text-text'
                                            }`}
                                          >
                                            {disposed ? '−' : acquired ? '+' : ''}
                                            {transaction.shares?.toLocaleString() ?? '—'}
                                          </strong>
                                          <span className="block text-[9px] tabular-nums text-text-muted">
                                            {transaction.pricePerShare === undefined
                                              ? 'Price —'
                                              : transaction.pricePerShare.toLocaleString('en-US', {
                                                  style: 'currency',
                                                  currency: 'USD',
                                                  maximumFractionDigits: 4,
                                                })}
                                          </span>
                                        </span>
                                      );
                                    })}
                                  </div>
                                  <InsiderTransactionGraph transactions={matchedTransactions} />
                                </div>
                              ) : (
                                <span className="font-mono text-xs text-text-muted">
                                  {detailSummary}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <a
                                href={filing.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                className="inline-block border border-border px-2 py-0.5 text-[10px] font-black uppercase text-text-subtle transition-colors hover:border-primary hover:text-primary"
                              >
                                VIEW
                              </a>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="border-b-2 border-border bg-surface-alt">
                              <td colSpan={5} className="px-4 py-4">
                                <p className="mb-3 font-mono text-[10px] font-bold text-text-muted">
                                  Filed {filing.fileDate} · Accession {filing.accessionNumber}
                                </p>
                                {matchedTransactions.length > 0 ? (
                                  <div className="space-y-3">
                                    {matchedTransactions.map((transaction, index) => (
                                      <dl
                                        key={`${transaction.accessionNumber}-${index}`}
                                        className="grid grid-cols-2 gap-x-4 gap-y-3 border-2 border-border bg-surface p-3 md:grid-cols-[0.8fr_1.5fr_1.2fr_0.7fr_0.7fr_0.8fr]"
                                      >
                                        <div>
                                          <dt className="font-mono text-[9px] font-black uppercase text-text-muted">
                                            Transaction date
                                          </dt>
                                          <dd className="font-mono text-xs tabular-nums text-text">
                                            {transaction.transactionDate || 'Not reported'}
                                          </dd>
                                        </div>
                                        <div className="min-w-0">
                                          <dt className="font-mono text-[9px] font-black uppercase text-text-muted">
                                            Reporting owner
                                          </dt>
                                          <dd className="truncate text-sm font-black text-text">
                                            {transaction.ownerName}
                                          </dd>
                                          <dd className="truncate font-mono text-[9px] text-text-muted">
                                            {transaction.relationships.join(' · ') ||
                                              'Relationship not reported'}
                                            {transaction.derivative ? ' · Derivative' : ''}
                                          </dd>
                                        </div>
                                        <div className="min-w-0">
                                          <dt className="font-mono text-[9px] font-black uppercase text-text-muted">
                                            Transaction
                                          </dt>
                                          <dd
                                            className={`truncate font-mono text-xs font-black ${
                                              transaction.acquiredDisposed === 'D'
                                                ? 'text-danger'
                                                : transaction.acquiredDisposed === 'A'
                                                  ? 'text-success'
                                                  : 'text-text'
                                            }`}
                                          >
                                            {transaction.transactionCode || '—'} ·{' '}
                                            {transaction.acquiredDisposed === 'D'
                                              ? 'Disposed'
                                              : transaction.acquiredDisposed === 'A'
                                                ? 'Acquired'
                                                : 'Unspecified'}
                                          </dd>
                                          <dd className="truncate text-[9px] text-text-muted">
                                            {transaction.transactionCode
                                              ? transactionCodeLabels[
                                                  transaction.transactionCode
                                                ] || 'Other'
                                              : 'Uncoded'}
                                            {transaction.securityTitle
                                              ? ` · ${transaction.securityTitle}`
                                              : ''}
                                          </dd>
                                        </div>
                                        <div>
                                          <dt className="font-mono text-[9px] font-black uppercase text-text-muted">
                                            Shares
                                          </dt>
                                          <dd className="font-mono text-sm tabular-nums text-text">
                                            {transaction.shares?.toLocaleString() ?? '—'}
                                          </dd>
                                        </div>
                                        <div>
                                          <dt className="font-mono text-[9px] font-black uppercase text-text-muted">
                                            Price
                                          </dt>
                                          <dd className="font-mono text-sm tabular-nums text-text">
                                            {transaction.pricePerShare === undefined
                                              ? '—'
                                              : transaction.pricePerShare.toLocaleString('en-US', {
                                                  style: 'currency',
                                                  currency: 'USD',
                                                  maximumFractionDigits: 4,
                                                })}
                                          </dd>
                                        </div>
                                        <div>
                                          <dt className="font-mono text-[9px] font-black uppercase text-text-muted">
                                            Holdings after
                                          </dt>
                                          <dd className="font-mono text-sm tabular-nums text-text">
                                            {transaction.sharesOwnedFollowing?.toLocaleString() ??
                                              '—'}{' '}
                                            <span className="text-[9px] text-text-muted">
                                              {transaction.directOrIndirect || ''}
                                            </span>
                                          </dd>
                                        </div>
                                      </dl>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="font-mono text-xs text-text-muted">
                                    {isInitialStatement
                                      ? 'Form 3 establishes the reporting person’s initial holdings; it does not report a change transaction.'
                                      : wasScanned
                                        ? 'No transaction elements were reported in this ownership document.'
                                        : 'This ownership filing could not be extracted from the SEC document.'}
                                  </p>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          <div className="grid min-h-36 place-items-center px-4 text-center font-mono text-sm text-text-muted">
            No insider ownership data available.
          </div>
        )}
      </div>
    </section>
  );
}
