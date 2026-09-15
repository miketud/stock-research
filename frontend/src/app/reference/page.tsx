'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { FadeIn } from '@/components/motion/FadeIn';

interface SecFormType {
  form: string;
  description: string;
  lastUpdated?: string;
  secNumber?: string;
  topics: string[];
  url?: string;
}

interface FormsResponse {
  source: string;
  sourceType: string;
  fetchedAt: string;
  forms: SecFormType[];
}

type SortKey = 'form' | 'description' | 'lastUpdated' | 'secNumber';
type SortDirection = 'asc' | 'desc';

export default function ReferencePage() {
  const [data, setData] = useState<FormsResponse | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('form');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  useEffect(() => {
    const controller = new AbortController();

    void fetch('/api/sec/forms', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(body?.message || `Could not load SEC forms: ${response.statusText}`);
        }
        return response.json() as Promise<FormsResponse>;
      })
      .then(setData)
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setError(requestError instanceof Error ? requestError.message : 'Could not load SEC forms.');
      });

    return () => controller.abort();
  }, []);

  const topics = useMemo(
    () =>
      [...new Set((data?.forms ?? []).flatMap((form) => form.topics))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [data]
  );

  const visibleForms = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const filtered = (data?.forms ?? []).filter(
      (form) =>
        (!topic || form.topics.includes(topic)) &&
        (!query ||
          [form.form, form.description, form.lastUpdated, form.secNumber, ...form.topics].some(
            (value) => value?.toLocaleLowerCase().includes(query)
          ))
    );

    return [...filtered].sort((a, b) => {
      const comparison = (a[sortKey] ?? '').localeCompare(b[sortKey] ?? '', undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, search, sortDirection, sortKey, topic]);

  const changeSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection('asc');
  };

  const sortIndicator = (key: SortKey) => {
    if (key !== sortKey) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-12">
      <FadeIn>
        <div className="mb-8 border-4 border-border-strong bg-surface p-6 shadow-hard-lg">
          <h1 className="mb-2 text-4xl font-black uppercase tracking-tight text-text">
            SEC Form Reference
          </h1>
          <p className="text-text-muted">
            Official SEC form catalog, descriptions, revision dates, numbers, and topics.
          </p>
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <section className="overflow-hidden border-4 border-border-strong bg-surface shadow-hard-lg">
          <div className="grid gap-3 border-b-4 border-border-strong bg-surface-alt p-4 md:grid-cols-[minmax(16rem,1fr)_minmax(13rem,20rem)_auto] md:items-center">
            <label className="min-w-0">
              <span className="sr-only">Search SEC form types</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search form, description, SEC number or topic…"
                className="h-11 w-full border-2 border-border-strong bg-surface px-3 font-mono text-sm text-text placeholder:text-text-muted focus:outline-none"
              />
            </label>
            <label className="min-w-0">
              <span className="sr-only">Filter by topic</span>
              <select
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                className="h-11 w-full border-2 border-border-strong bg-surface px-3 font-mono text-sm font-bold text-text focus:outline-none"
              >
                <option value="">All topics</option>
                {topics.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <span className="whitespace-nowrap text-right font-mono text-xs font-bold text-text-muted">
              {visibleForms.length} / {data?.forms.length ?? 0}
            </span>
          </div>

          {error ? (
            <div className="m-4 border-2 border-danger bg-surface-alt px-4 py-3 text-sm font-bold text-danger">
              {error}
            </div>
          ) : !data ? (
            <div className="grid min-h-48 place-items-center font-mono text-sm font-bold text-text-muted">
              Loading the SEC Forms Index…
            </div>
          ) : (
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full min-w-[880px] table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-[11%]" />
                  <col className="w-[38%]" />
                  <col className="w-[13%]" />
                  <col className="w-[12%]" />
                  <col className="w-[19%]" />
                  <col className="w-[7%]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-text text-surface">
                  <tr>
                    {(
                      [
                        ['form', 'Form'],
                        ['description', 'Description'],
                        ['lastUpdated', 'Updated'],
                        ['secNumber', 'SEC No.'],
                      ] as const
                    ).map(([key, label]) => (
                      <th key={key} className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => changeSort(key)}
                          aria-label={`Sort by ${label}`}
                          className="inline-flex items-center gap-2 font-black uppercase"
                        >
                          {label}
                          <span aria-hidden="true">{sortIndicator(key)}</span>
                        </button>
                      </th>
                    ))}
                    <th className="px-4 py-3 font-black uppercase">Topics</th>
                    <th className="px-4 py-3 text-right font-black uppercase">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleForms.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center font-mono text-sm text-text-muted">
                        No SEC forms match the current filters.
                      </td>
                    </tr>
                  ) : (
                    visibleForms.map((form, index) => (
                      <tr
                        key={`${form.form}-${form.description}-${index}`}
                        className="border-b-2 border-border transition-colors hover:bg-surface-alt"
                      >
                        <td className="px-4 py-3 font-mono font-black text-success">{form.form}</td>
                        <td className="px-4 py-3 text-sm font-bold text-text">{form.description}</td>
                        <td className="px-4 py-3 font-mono text-xs text-text-muted">
                          {form.lastUpdated || '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-text-muted">
                          {form.secNumber || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-text-muted">
                          {form.topics.join(' · ') || '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {form.url ? (
                            <a
                              href={form.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-block border-2 border-border-strong bg-surface px-3 py-1 text-xs font-black text-text shadow-hard transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:bg-surface-raised hover:shadow-none"
                            >
                              VIEW
                            </a>
                          ) : (
                            <span className="font-mono text-xs text-text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </FadeIn>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 font-mono text-xs font-bold">
        <Link href="/" className="text-primary underline underline-offset-4 hover:text-primary-hover">
          ← Return to dashboard
        </Link>
        {data && (
          <a
            href={data.source}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-muted underline underline-offset-4 hover:text-primary"
          >
            Source: {data.sourceType}
          </a>
        )}
      </div>
    </main>
  );
}
