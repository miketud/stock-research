'use client';

import { useState, useEffect } from 'react';
import { FadeIn } from '@/components/motion/FadeIn';
import { StaggerGroup, StaggerItem } from '@/components/motion/StaggerGroup';

interface Filing {
  type: string;
  accessionNumber: string;
  fileDate: string;
  documentFormType?: string;
  size: number;
  url: string;
}

interface SECResponse {
  company_id: string;
  cik: string;
  entityName: string;
  filings: Filing[];
}

export default function Home() {
  const [ticker, setTicker] = useState('');
  const [data, setData] = useState<SECResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFilings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker) return;

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(`/api/sec/filings?ticker=${encodeURIComponent(ticker)}&limit=100`);
      if (!res.ok) throw new Error(`Error fetching filings: ${res.statusText}`);
      const json: SECResponse = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12 font-sans">
      <FadeIn>
        <div className="mb-12 border-4 border-text p-6 bg-surface shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <h1 className="text-5xl font-black tracking-tighter text-text mb-2">STOCK RESEARCH</h1>
          <p className="text-lg font-medium text-text-muted">
            Direct access to SEC EDGAR filings. No noise.
          </p>
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <form onSubmit={fetchFilings} className="mb-12 flex gap-4">
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Enter Ticker (e.g. AAPL)"
            className="flex-1 border-4 border-text bg-surface px-4 py-3 text-xl font-bold text-text placeholder:text-text-muted focus:outline-none focus:ring-0 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all focus:translate-x-1 focus:translate-y-1 focus:shadow-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="border-4 border-text bg-green-500 px-8 py-3 text-xl font-black text-text shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50"
          >
            {loading ? '...' : 'SEARCH'}
          </button>
        </form>
      </FadeIn>

      {error && (
        <FadeIn delay={0.2}>
          <div className="mb-12 border-4 border-red-500 bg-red-50 p-4 text-red-600 font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            {error}
          </div>
        </FadeIn>
      )}

      {data && (
        <FadeIn delay={0.2}>
          <div className="mb-6 flex items-baseline justify-between border-b-4 border-text pb-2">
            <h2 className="text-3xl font-black text-text">
              {data.entityName}{' '}
              <span className="text-lg font-medium text-text-muted">({ticker})</span>
            </h2>
            <span className="font-mono text-sm font-bold text-text-muted">CIK: {data.cik}</span>
          </div>

          <div className="overflow-x-auto border-4 border-text bg-surface shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-4 border-text bg-text text-surface text-lg font-black">
                  <th className="px-4 py-3">FORM</th>
                  <th className="px-4 py-3">DATE</th>
                  <th className="px-4 py-3">SIZE</th>
                  <th className="px-4 py-3 text-right">LINK</th>
                </tr>
              </thead>
              <tbody>
                <StaggerGroup>
                  {data.filings.length === 0 ? (
                    <StaggerItem>
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center font-bold text-text-muted">
                          No filings found for this ticker.
                        </td>
                      </tr>
                    </StaggerItem>
                  ) : (
                    data.filings
                      .sort(
                        (a, b) => new Date(b.fileDate).getTime() - new Date(a.fileDate).getTime()
                      )
                      .map((filing) => (
                        <StaggerItem key={filing.accessionNumber}>
                          <tr className="border-b-2 border-border hover:bg-green-50 transition-colors group">
                            <td className="px-4 py-3 font-mono font-bold text-green-600">
                              {filing.type}
                            </td>
                            <td className="px-4 py-3 font-medium text-text">{filing.fileDate}</td>
                            <td className="px-4 py-3 text-sm font-mono text-text-muted">
                              {(filing.size / 1024).toFixed(1)} KB
                            </td>
                            <td className="px-4 py-3 text-right">
                              <a
                                href={filing.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block border-2 border-text bg-surface px-3 py-1 text-sm font-black text-text shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] group-hover:bg-white transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
                              >
                                VIEW
                              </a>
                            </td>
                          </tr>
                        </StaggerItem>
                      ))
                  )}
                </StaggerGroup>
              </tbody>
            </table>
          </div>
        </FadeIn>
      )}
    </div>
  );
}
