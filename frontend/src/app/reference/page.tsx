'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { FadeIn } from '@/components/motion/FadeIn';
import { MetricsReferenceTable } from '@/components/MetricsReferenceTable';
import { SecFormsTable } from '@/components/SecFormsTable';

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

export default function ReferencePage() {
  const [data, setData] = useState<FormsResponse | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'forms' | 'metrics'>('forms');

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
        setError(
          requestError instanceof Error ? requestError.message : 'Could not load SEC forms.'
        );
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-12">
      <FadeIn>
        <div className="mb-8 border border-border bg-surface p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <h1 className="text-4xl font-black uppercase tracking-tight text-text">
              {tab === 'forms' ? 'SEC Forms Reference' : 'Financial Metrics Reference'}
            </h1>
            <div className="flex items-center gap-2 self-start">
              <button
                type="button"
                onClick={() => setTab('forms')}
                className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-colors border border-border rounded-md ${
                  tab === 'forms'
                    ? 'bg-surface/50 text-primary hover:bg-primary/30 hover:text-primary'
                    : 'bg-surface/50 text-text-muted hover:text-text hover:bg-surface/80'
                }`}
              >
                SEC Forms
              </button>
              <button
                type="button"
                onClick={() => setTab('metrics')}
                className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-colors border border-border rounded-md ${
                  tab === 'metrics'
                    ? 'bg-surface/50 text-primary hover:bg-primary/30 hover:text-primary'
                    : 'bg-surface/50 text-text-muted hover:text-text hover:bg-surface/80'
                }`}
              >
                Metrics
              </button>
            </div>
          </div>
          <p className="text-text-muted">
            {tab === 'forms'
              ? 'Official SEC form catalog, descriptions, revision dates, numbers, and topics.'
              : 'The financial facts we track and the derived ratios computed from them — with their definitions, formulas, XBRL concepts, and sources.'}
          </p>
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        {tab === 'forms' ? (
          <SecFormsTable forms={data?.forms ?? []} error={error} />
        ) : (
          <MetricsReferenceTable />
        )}
      </FadeIn>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 font-mono text-xs font-bold">
        <Link
          href="/"
          className="text-primary underline underline-offset-4 hover:text-primary-hover"
        >
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
