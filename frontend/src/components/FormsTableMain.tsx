'use client';

import { Fragment, useMemo, useState } from 'react';

export interface Filing {
  type: string;
  formDescription?: string;
  ownerNames?: string[];
  accessionNumber: string;
  fileDate: string;
  documentFormType?: string;
  reportDate?: string;
  acceptanceDateTime?: string;
  act?: string;
  fileNumber?: string;
  filmNumber?: string;
  items?: string;
  primaryDocument?: string;
  isXBRL?: boolean;
  isInlineXBRL?: boolean;
  size: number;
  url: string;
}

type SortKey = 'type' | 'fileDate' | 'url';
type SortDirection = 'asc' | 'desc';

const sortLabels: Record<SortKey, string> = {
  type: 'form',
  fileDate: 'date',
  url: 'link',
};

export function FormsTableMain({ filings }: { filings: Filing[] }) {
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('fileDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expandedFilings, setExpandedFilings] = useState<Set<string>>(() => new Set());
  const [panelOpen, setPanelOpen] = useState(true);

  const visibleFilings = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    const filtered = query
      ? filings.filter((filing) =>
          [
            filing.type,
            filing.formDescription,
            filing.fileDate,
            filing.documentFormType,
            filing.accessionNumber,
          ].some((value) => value?.toLocaleLowerCase().includes(query))
        )
      : filings;

    return [...filtered].sort((a, b) => {
      const comparison =
        sortKey === 'url'
          ? a.accessionNumber.localeCompare(b.accessionNumber)
          : a[sortKey].localeCompare(b[sortKey], undefined, {
              numeric: true,
              sensitivity: 'base',
            });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filings, filter, sortDirection, sortKey]);

  const changeSort = (nextKey: SortKey) => {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === 'fileDate' ? 'desc' : 'asc');
  };

  const toggleFiling = (accessionNumber: string) => {
    setExpandedFilings((current) => {
      const next = new Set(current);
      if (next.has(accessionNumber)) next.delete(accessionNumber);
      else next.add(accessionNumber);
      return next;
    });
  };

  const sortIndicator = (key: SortKey) => {
    if (key !== sortKey) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const hasScrollableFilings = visibleFilings.length > 10;

  return (
    <section className="overflow-x-auto border border-border bg-surface font-mono">
      {/* The whole bar toggles the panel; the filter cell stops its own clicks
          and keys so typing there never collapses the table. */}
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
        aria-controls="forms-table-body"
        title={panelOpen ? 'Collapse forms table' : 'Expand forms table'}
        className="flex cursor-pointer flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-1.5 transition-colors hover:bg-surface-alt"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
            Forms table
          </h2>
          <span className="text-sm leading-none text-text-subtle" aria-hidden="true">
            {panelOpen ? '−' : '+'}
          </span>
        </div>
        <div
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          className="flex cursor-auto flex-wrap items-center justify-end gap-3"
        >
          <label htmlFor="filing-filter" className="sr-only">
            Filter forms
          </label>
          <input
            id="filing-filter"
            type="search"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              // A filter you cannot see the results of is a dead control, so
              // typing opens the table if it was collapsed.
              if (event.target.value.trim()) setPanelOpen(true);
            }}
            placeholder="Filter Forms"
            className="min-w-44 border border-border bg-bg px-2 py-0.5 font-mono text-[11px] text-text placeholder:text-text-subtle focus:border-primary focus:outline-none"
          />
          <span className="text-[10px] tabular-nums text-text-subtle" aria-live="polite">
            {visibleFilings.length} / {filings.length}
          </span>
        </div>
      </div>
      <table
        id="forms-table-body"
        // The table is display:block for the scrollable tbody, so the hidden
        // attribute alone would lose to that class — toggle the class itself.
        className={`w-full min-w-[640px] border-collapse text-left ${panelOpen ? 'block' : 'hidden'}`}
      >
        <thead className="block">
          <tr className="table w-full table-fixed border-b border-border bg-bg-alt text-[10px] font-black uppercase tracking-[0.15em] text-text-subtle">
            {(
              [
                ['type', 'FORM', 'text-left'],
                ['fileDate', 'DATE', 'text-left'],
                ['url', 'LINK', 'text-right'],
              ] as const
            ).map(([key, label, alignment]) => (
              <th
                key={key}
                scope="col"
                aria-sort={
                  sortKey === key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'
                }
                className={`h-7 px-3 py-1 ${alignment} ${key === 'type' ? 'w-[40%]' : 'w-[30%]'}`}
              >
                <button
                  type="button"
                  onClick={() => changeSort(key)}
                  aria-label={`Sort by ${sortLabels[key]}`}
                  className={`inline-flex w-full items-center gap-2 hover:text-primary focus-visible:outline-offset-4 ${
                    alignment === 'text-right' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <span>{label}</span>
                  <span className="font-mono text-sm" aria-hidden="true">
                    {sortIndicator(key)}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody
          className={`block max-h-[35rem] ${
            hasScrollableFilings
              ? 'overflow-y-scroll [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2'
              : ''
          }`}
        >
          {visibleFilings.length === 0 ? (
            <tr className="table w-full table-fixed">
              <td colSpan={3} className="px-4 py-8 text-center font-bold text-text-muted">
                {filings.length === 0
                  ? 'No filings found for this ticker.'
                  : 'No loaded filings match this filter.'}
              </td>
            </tr>
          ) : (
            visibleFilings.map((filing) => {
              const expanded = expandedFilings.has(filing.accessionNumber);
              const metadata = [
                ['Accession', filing.accessionNumber],
                ['Official filing type', filing.formDescription],
                ['Report period', filing.reportDate],
                ['Accepted', filing.acceptanceDateTime?.replace('T', ' ').replace('Z', ' UTC')],
                ['Document', filing.primaryDocument],
                ['Description', filing.documentFormType],
                ['SEC Act', filing.act],
                ['File number', filing.fileNumber],
                ['Film number', filing.filmNumber],
                ['Items', filing.items],
                ['XBRL', filing.isXBRL ? 'Yes' : 'No'],
                ['Inline XBRL', filing.isInlineXBRL ? 'Yes' : 'No'],
              ].filter((item): item is [string, string] => Boolean(item[1]));

              return (
                <Fragment key={filing.accessionNumber}>
                  <tr
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    onClick={() => toggleFiling(filing.accessionNumber)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      toggleFiling(filing.accessionNumber);
                    }}
                    className="group table h-8 w-full cursor-pointer table-fixed border-b border-border text-xs transition-colors hover:bg-surface-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px]"
                  >
                    <td className="w-[40%] px-3 py-1 font-black text-primary">
                      <span className="mr-2 inline-block w-3 text-text-muted" aria-hidden="true">
                        {expanded ? '−' : '+'}
                      </span>
                      <span
                        className="group/form relative inline-flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                        tabIndex={filing.formDescription ? 0 : -1}
                        aria-describedby={
                          filing.formDescription
                            ? `form-description-${filing.accessionNumber}`
                            : undefined
                        }
                        title={filing.formDescription}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {filing.type}
                        {filing.formDescription && (
                          <span
                            id={`form-description-${filing.accessionNumber}`}
                            role="tooltip"
                            className="pointer-events-none absolute left-0 top-full z-30 mt-1 w-64 border border-border bg-bg-alt px-2 py-1 font-mono text-[10px] text-text opacity-0 transition-opacity group-hover/form:opacity-100 group-focus-within/form:opacity-100"
                          >
                            {filing.formDescription}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="w-[30%] whitespace-nowrap px-3 py-1 tabular-nums text-text-muted">
                      {filing.fileDate}
                    </td>
                    <td className="w-[30%] px-3 py-1 text-right">
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
                    <tr className="table w-full table-fixed border-b-2 border-border bg-surface-alt">
                      <td colSpan={3} className="px-5 py-4">
                        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                          {metadata.map(([label, value]) => (
                            <div key={label}>
                              <dt className="mb-1 font-mono text-[10px] font-black uppercase tracking-wide text-text-muted">
                                {label}
                              </dt>
                              <dd className="break-words font-mono text-xs font-bold text-text">
                                {value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
}
