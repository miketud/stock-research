// class:injection — SEC EDGAR filings.
//
// A single ticker resolves to every public EDGAR filing for that issuer.
// The backend is the only place SEC is ever contacted from: it holds the
// required descriptive User-Agent, the rate-limit backoff, and the JSON parsing
// that would otherwise leak a third-party shape into the frontend.
//
// Two endpoints, both read-only against the public data API the browse-edgar
// website itself is built on (no token, full history):
//
//   GET /api/sec/filings?ticker=X&formType=10-K&limit=100
//       The company record plus a flat list of filings, each carrying the direct
//       SEC URL to its index.json so the frontend can populate direct access.
//
//   GET /api/sec/archives/<accession-number>
//       The .index.json for one accession: the document list for that filing,
//       including the direct link to each underlying document.
//
// Note: sec-edgar-api-overview.pdf documents the EDGAR *Next* submission/filer
// APIs. Those require a filer API token + user API token and exist to *file*
// documents. This dashboard reads public filing data, which has never needed a
// token, so it uses the public data.sec.gov submissions API instead.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const SEC = 'https://www.sec.gov';
const SEC_DATA = 'https://data.sec.gov';

/**
 * SEC's hard rule for the data API: the User-Agent must declare the traffic —
 * a descriptive name, a company/product URL, and a contact — or the request is
 * blocked with HTTP 403 ("undeclared automated tool"). A browser-style UA is
 * NOT enough; it is still classified as undeclared. Replace the placeholders
 * below (and set SEC_USER_AGENT in .env) before relying on this in production.
 *
 * Format required by SEC:
 *   Mozilla/5.0 (compatible; <product>; <URL>; contact:<email>)
 */
const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ||
  'Mozilla/5.0 (compatible; stock-research SEC research tool; <replace-with-url>; contact:<replace-with-email>)';

/**
 * SEC asks automated clients to stay below ten requests per second. Retries use
 * a longer exponential delay because 429/5xx responses are transient and an
 * immediate retry just adds pressure while the service is recovering.
 */
const SEC_RETRY_BASE_MS = 500;
const SEC_MAX_ATTEMPTS = 3;
const TICKER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SUBMISSIONS_CACHE_TTL_MS = 5 * 60 * 1000;
const COMPANY_FACTS_CACHE_TTL_MS = 15 * 60 * 1000;
const FORMS_INDEX_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FORMS_INDEX_PAGE_LIMIT = 20;
const SYNC_COMPANY_LIMIT = 50;
const SYNC_FILING_LIMIT = 20;
const ATOM_PAGE_SIZE = 100;
const ATOM_MAX_PAGES = 10;
const syncStatePath = process.env.SEC_SYNC_STATE_PATH
  ? path.resolve(process.env.SEC_SYNC_STATE_PATH)
  : path.resolve(import.meta.dirname, '../../var/sec-sync-state.json');

/**
 * The filing types a ticker can produce. The API accepts an exact formType, so
 * an invalid one is a validation error, not a silent empty list. Used both as a
 * Fastify JSON-Schema enum and (via the same string values) as the zod enum.
 */
const FORM_TYPES = [
  '1',
  '1-A',
  '1-A POS',
  '1-K',
  '1-MA',
  '3',
  '4',
  '424B2',
  '424B4',
  '424B5',
  '424B7',
  '424H',
  '424K',
  '424O',
  '497',
  '6-K',
  '8-K',
  'A-20',
  'A-3',
  'A-4',
  'A-5',
  'A-CSR',
  'A-D',
  'A-E',
  'A-F',
  'C',
  'C-1',
  'C-2',
  'C-SC',
  'F-1',
  'F-3',
  'F-4',
  'F-6',
  'F-8',
  'F-20',
  'N-CSR',
  'N-40',
  'N-54',
  'S-1',
  'S-3',
  'S-4',
  'S-6',
  'S-8',
  'SB-2',
  'SC-13D',
  'SC-13G',
  'SC-14D',
  'SC-14G',
  'SC-TO',
  'T-1',
];

const filingsQuery = z.object({
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(5)
    .regex(/^[A-Za-z0-9]+$/, 'Ticker is alphanumeric (letters, digits).')
    .transform((t) => t.toUpperCase()),
  formType: z.enum(FORM_TYPES).optional(),
  limit: z.coerce.number().int().positive().max(1000).default(100),
});

const insidersQuery = z.object({
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(5)
    .regex(/^[A-Za-z0-9]+$/, 'Ticker is alphanumeric (letters, digits).')
    .transform((ticker) => ticker.toUpperCase()),
  limit: z.coerce.number().int().positive().max(1000).default(10),
});

const accessionParam = z.object({
  accession: z
    .string()
    .regex(/^\d{4}-\d{4,10}$/, 'Accession number must look like 0000320193-26-000020.'),
});

/**
 * Fastify validates against these plain JSON-Schemas. zod is kept for a second,
 * explicit pass on the parsed values: the two are deliberately not coupled, so a
 * JSON-Schema edge case (e.g. how an enum serializes) cannot silently weaken the
 * documented zod validation the frontend relies on.
 */
const filingsSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      ticker: { type: 'string', minLength: 1, maxLength: 5, pattern: '^[A-Za-z0-9]+$' },
      formType: { type: 'string', enum: FORM_TYPES },
      limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 },
    },
    required: ['ticker'],
  },
  response: {
    200: {
      type: 'object',
      required: [
        'company_id',
        'cik',
        'entityName',
        'companyInfo',
        'financialSnapshot',
        'insiderActivity',
        'filings',
      ],
      properties: {
        company_id: { type: 'string' },
        cik: { type: 'string' },
        entityName: { type: 'string' },
        companyInfo: {
          type: 'object',
          additionalProperties: true,
        },
        financialSnapshot: {
          type: 'array',
          items: {
            type: 'object',
            required: ['key', 'label', 'value', 'unit', 'periodEnd', 'filed', 'form'],
            properties: {
              key: { type: 'string' },
              label: { type: 'string' },
              value: { type: 'number' },
              unit: { type: 'string' },
              periodEnd: { type: 'string' },
              filed: { type: 'string' },
              form: { type: 'string' },
            },
          },
        },
        insiderActivity: {
          type: 'object',
          required: ['periodDays', 'total', 'form3', 'form4', 'form5'],
          properties: {
            periodDays: { type: 'number' },
            total: { type: 'number' },
            form3: { type: 'number' },
            form4: { type: 'number' },
            form5: { type: 'number' },
            latestDate: { type: 'string' },
          },
        },
        filings: {
          type: 'array',
          items: {
            type: 'object',
            required: ['type', 'accessionNumber', 'fileDate', 'size', 'url'],
            properties: {
              type: { type: 'string' },
              formDescription: { type: 'string' },
              accessionNumber: { type: 'string' },
              fileDate: { type: 'string' },
              documentFormType: { type: 'string' },
              reportDate: { type: 'string' },
              acceptanceDateTime: { type: 'string' },
              act: { type: 'string' },
              fileNumber: { type: 'string' },
              filmNumber: { type: 'string' },
              items: { type: 'string' },
              primaryDocument: { type: 'string' },
              isXBRL: { type: 'boolean' },
              isInlineXBRL: { type: 'boolean' },
              size: { type: 'number' },
              url: { type: 'string' },
            },
          },
        },
      },
    },
    404: {
      type: 'object',
      required: ['message'],
      properties: {
        message: { type: 'string' },
      },
    },
    502: {
      type: 'object',
      required: ['message'],
      properties: {
        message: { type: 'string' },
      },
    },
  },
};

const accessionSchema = {
  params: {
    type: 'object',
    additionalProperties: false,
    properties: {
      accession: { type: 'string', pattern: '^\\d{4}-\\d{4,10}$' },
    },
    required: ['accession'],
  },
};

interface FilingResult {
  type: string;
  formDescription?: string;
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

type SyncStatus = 'idle' | 'running' | 'success' | 'error';
type CompanySyncStatus = 'queued' | 'loading' | 'success' | 'error';

interface SyncedCompany {
  ticker: string;
  cik: string;
  entityName: string;
  status: CompanySyncStatus;
  filings: FilingResult[];
  updatedAt?: string;
  error?: string;
}

interface SecSyncState {
  version: 2;
  status: SyncStatus;
  processed: number;
  total: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  companies: SyncedCompany[];
}

interface TickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

type TickerDirectory = Record<string, TickerEntry>;

interface FilingColumns {
  accessionNumber: string[];
  filingDate: string[];
  form: string[];
  primaryDocument: string[];
  primaryDocDescription: string[];
  size: number[];
  reportDate?: string[];
  acceptanceDateTime?: string[];
  act?: string[];
  fileNumber?: string[];
  filmNumber?: string[];
  items?: string[];
  isXBRL?: number[];
  isInlineXBRL?: number[];
}

interface SubmissionFile {
  name: string;
}

interface CompanySubmissionsResponse {
  cik: string;
  name: string;
  entityType?: string;
  sic?: string;
  sicDescription?: string;
  tickers?: string[];
  exchanges?: string[];
  ein?: string;
  category?: string;
  fiscalYearEnd?: string;
  stateOfIncorporation?: string;
  website?: string;
  investorWebsite?: string;
  phone?: string;
  formerNames?: Array<{ name: string; from: string; to: string }>;
  addresses?: {
    business?: Record<string, string | null>;
    mailing?: Record<string, string | null>;
  };
  filings: {
    recent: FilingColumns;
    files: SubmissionFile[];
  };
}

interface XbrlFactValue {
  val: number;
  end: string;
  filed: string;
  form: string;
  frame?: string;
}

interface CompanyFactsResponse {
  facts: Record<
    string,
    Record<string, { units: Record<string, XbrlFactValue[]> }>
  >;
}

interface FinancialMetric {
  key: string;
  label: string;
  value: number;
  unit: string;
  periodEnd: string;
  filed: string;
  form: string;
}

interface InsiderTransaction {
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

interface InsiderCacheData {
  transactions: InsiderTransaction[];
  ownerNamesByAccession: Record<string, string[]>;
  scannedAccessions: string[];
}

interface SecFormType {
  form: string;
  description: string;
  lastUpdated?: string;
  secNumber?: string;
  topics: string[];
  url?: string;
}

interface AtomFiling {
  cik: string;
  entityName: string;
  filing: FilingResult;
}

interface IndexJsonResponse {
  accessionNumber: string;
  filingDate: string;
  reportDate?: string;
  files: { name: string; path: string; description?: string }[];
}

class SecUpstreamError extends Error {
  readonly statusCode = 502;

  constructor(message: string) {
    super(message);
    this.name = 'SecUpstreamError';
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(retryAfterSeconds)) return retryAfterSeconds * 1000;
  return SEC_RETRY_BASE_MS * 2 ** attempt;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  let lastReason = 'request failed';

  for (let attempt = 0; attempt < SEC_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': SEC_USER_AGENT,
          Accept: 'application/json',
        },
        signal,
      });
      const text = await response.text();

      if (response.ok && text.trim().startsWith('{')) return JSON.parse(text) as T;

      lastReason = response.ok ? 'returned a non-JSON response' : `returned HTTP ${response.status}`;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === SEC_MAX_ATTEMPTS - 1) break;
      await delay(retryDelay(response, attempt), signal);
    } catch (err) {
      if (signal.aborted) throw err;
      lastReason = err instanceof Error ? err.message : 'network request failed';
      if (attempt === SEC_MAX_ATTEMPTS - 1) break;
      await delay(SEC_RETRY_BASE_MS * 2 ** attempt, signal);
    }
  }

  throw new SecUpstreamError(`SEC EDGAR is temporarily unavailable (${lastReason}).`);
}

async function fetchAtomPage(start: number, signal: AbortSignal): Promise<string> {
  const params = new URLSearchParams({
    action: 'getcurrent',
    owner: 'include',
    count: String(ATOM_PAGE_SIZE),
    start: String(start),
    output: 'atom',
  });
  const url = `${SEC}/cgi-bin/browse-edgar?${params.toString()}`;
  let lastReason = 'request failed';

  for (let attempt = 0; attempt < SEC_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': SEC_USER_AGENT,
          Accept: 'application/atom+xml, application/xml;q=0.9',
        },
        signal,
      });
      const text = await response.text();
      const isAtom = text.trimStart().startsWith('<?xml') && text.includes('<feed');
      if (response.ok && isAtom) return text;

      lastReason = response.ok ? 'returned a non-Atom response' : `returned HTTP ${response.status}`;
      const retryable = response.status === 429 || response.status >= 500 || !isAtom;
      if (!retryable || attempt === SEC_MAX_ATTEMPTS - 1) break;
      await delay(retryDelay(response, attempt), signal);
    } catch (error) {
      if (signal.aborted) throw error;
      lastReason = error instanceof Error ? error.message : 'network request failed';
      if (attempt === SEC_MAX_ATTEMPTS - 1) break;
      await delay(SEC_RETRY_BASE_MS * 2 ** attempt, signal);
    }
  }

  throw new SecUpstreamError(`SEC Latest Filings feed is temporarily unavailable (${lastReason}).`);
}

async function fetchOwnershipXml(url: string, signal: AbortSignal): Promise<string> {
  let lastReason = 'request failed';

  for (let attempt = 0; attempt < SEC_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': SEC_USER_AGENT,
          Accept: 'application/xml, text/xml;q=0.9',
        },
        signal,
      });
      const text = await response.text();
      if (response.ok && text.includes('<ownershipDocument')) return text;

      lastReason = response.ok ? 'returned a non-ownership document' : `returned HTTP ${response.status}`;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === SEC_MAX_ATTEMPTS - 1) break;
      await delay(retryDelay(response, attempt), signal);
    } catch (error) {
      if (signal.aborted) throw error;
      lastReason = error instanceof Error ? error.message : 'network request failed';
      if (attempt === SEC_MAX_ATTEMPTS - 1) break;
      await delay(SEC_RETRY_BASE_MS * 2 ** attempt, signal);
    }
  }

  throw new SecUpstreamError(`SEC ownership filing is temporarily unavailable (${lastReason}).`);
}

async function fetchSecHtml(url: string, signal: AbortSignal): Promise<string> {
  let lastReason = 'request failed';

  for (let attempt = 0; attempt < SEC_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': SEC_USER_AGENT,
          Accept: 'text/html',
        },
        signal,
      });
      const text = await response.text();
      if (response.ok && /<html\b/i.test(text)) return text;

      lastReason = response.ok ? 'returned a non-HTML response' : `returned HTTP ${response.status}`;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === SEC_MAX_ATTEMPTS - 1) break;
      await delay(retryDelay(response, attempt), signal);
    } catch (error) {
      if (signal.aborted) throw error;
      lastReason = error instanceof Error ? error.message : 'network request failed';
      if (attempt === SEC_MAX_ATTEMPTS - 1) break;
      await delay(SEC_RETRY_BASE_MS * 2 ** attempt, signal);
    }
  }

  throw new SecUpstreamError(`SEC Forms Index is temporarily unavailable (${lastReason}).`);
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function htmlText(value: string): string {
  return decodeXml(
    value
      .replace(/<br\s*\/?\s*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function parseFormsIndexPage(html: string): SecFormType[] {
  const forms: SecFormType[] = [];

  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...(row[1] ?? '').matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (match) => match[1] ?? ''
    );
    if (cells.length < 5) continue;

    const form = htmlText(cells[0] ?? '');
    const descriptionCell = cells[1] ?? '';
    const description = htmlText(descriptionCell).replace(/\s*\(PDF\)\s*$/i, '');
    if (!form || form.toLowerCase() === 'n/a' || !description) continue;

    const href = decodeXml(descriptionCell.match(/<a\b[^>]*href="([^"]+)"/i)?.[1] ?? '');
    forms.push({
      form,
      description,
      lastUpdated: htmlText(cells[2] ?? '') || undefined,
      secNumber: htmlText(cells[3] ?? '') || undefined,
      topics: htmlText(cells[4] ?? '')
        .split(',')
        .map((topic) => topic.trim())
        .filter(Boolean),
      url: href ? new URL(href, SEC).toString() : undefined,
    });
  }

  return forms;
}

function parseFilingSize(value: string): number {
  const match = value.match(/([\d.]+)\s*(KB|MB|GB|B)?/i);
  if (!match) return 0;
  const amount = Number(match[1] ?? 0);
  const multiplier = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }[
    (match[2]?.toUpperCase() ?? 'B') as 'B' | 'KB' | 'MB' | 'GB'
  ];
  return Math.round(amount * multiplier);
}

function parseAtomEntries(xml: string): AtomFiling[] {
  const entries: AtomFiling[] = [];

  for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const entry = match[1] ?? '';
    const title = decodeXml(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? '');
    const titleParts = title.match(/^(.+?) - (.+) \((\d{10})\) \(([^)]+)\)$/);
    const url = decodeXml(
      entry.match(/<link\b(?=[^>]*\brel="alternate")[^>]*\bhref="([^"]+)"[^>]*\/?\s*>/)?.[1] ?? ''
    );
    const summary = decodeXml(entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1] ?? '');
    const accessionNumber = summary.match(/AccNo:<\/b>\s*([\d-]+)/)?.[1] ?? '';
    const fileDate = summary.match(/Filed:<\/b>\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
    const size = parseFilingSize(summary.match(/Size:<\/b>\s*([^\n<]+)/)?.[1] ?? '');

    if (!titleParts || !url || !accessionNumber || !fileDate) continue;
    const [, type, entityName, cik, role] = titleParts;
    if (!type || !entityName || !cik) continue;

    entries.push({
      cik,
      entityName,
      filing: {
        type,
        accessionNumber,
        fileDate,
        documentFormType: role,
        size,
        url,
      },
    });
  }

  return entries;
}

let tickerDirectoryCache: { expiresAt: number; data: TickerDirectory } | undefined;
let formsIndexCache: { expiresAt: number; data: SecFormType[] } | undefined;
const submissionsCache = new Map<
  string,
  { expiresAt: number; data: CompanySubmissionsResponse }
>();
const companyFactsCache = new Map<
  string,
  { expiresAt: number; data: FinancialMetric[] }
>();
const insiderTransactionsCache = new Map<
  string,
  { expiresAt: number; data: InsiderCacheData }
>();
let syncState: SecSyncState = {
  version: 2,
  status: 'idle',
  processed: 0,
  total: 0,
  companies: [],
};
let persistQueue: Promise<void> = Promise.resolve();

function persistSyncState(): Promise<void> {
  const snapshot = JSON.stringify(syncState, null, 2);
  persistQueue = persistQueue.catch(() => undefined).then(async () => {
    await mkdir(path.dirname(syncStatePath), { recursive: true });
    const temporaryPath = `${syncStatePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, snapshot);
    await rename(temporaryPath, syncStatePath);
  });
  return persistQueue;
}

async function restoreSyncState(): Promise<void> {
  try {
    const restored = JSON.parse(await readFile(syncStatePath, 'utf8')) as SecSyncState;
    if (restored.version !== 2 || !Array.isArray(restored.companies)) return;
    syncState = {
      ...restored,
      status: restored.status === 'running' ? 'idle' : restored.status,
      processed: restored.status === 'running' ? 0 : restored.processed,
      companies: restored.companies.slice(0, SYNC_COMPANY_LIMIT).map((company) => ({
        ...company,
        status:
          company.status === 'loading' || company.status === 'queued' ? 'success' : company.status,
      })),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function getTickerDirectory(signal: AbortSignal): Promise<TickerDirectory> {
  if (tickerDirectoryCache && tickerDirectoryCache.expiresAt > Date.now()) {
    return tickerDirectoryCache.data;
  }

  const data = await fetchJson<TickerDirectory>(`${SEC}/files/company_tickers.json`, signal);
  tickerDirectoryCache = { expiresAt: Date.now() + TICKER_CACHE_TTL_MS, data };
  return data;
}

async function getSecFormTypes(signal: AbortSignal): Promise<SecFormType[]> {
  if (formsIndexCache && formsIndexCache.expiresAt > Date.now()) return formsIndexCache.data;

  const forms: SecFormType[] = [];
  for (let page = 0; page < FORMS_INDEX_PAGE_LIMIT; page++) {
    const html = await fetchSecHtml(`${SEC}/submit-filings/forms-index?page=${page}`, signal);
    const entries = parseFormsIndexPage(html);
    if (entries.length === 0) break;
    forms.push(...entries);
    await delay(125, signal);
  }

  const unique = [...new Map(forms.map((form) => [`${form.form}\u0000${form.description}`, form])).values()];
  unique.sort((a, b) => a.form.localeCompare(b.form, undefined, { numeric: true }));
  formsIndexCache = { expiresAt: Date.now() + FORMS_INDEX_CACHE_TTL_MS, data: unique };
  return unique;
}

async function getCompanySubmissions(
  cik: string,
  signal: AbortSignal
): Promise<CompanySubmissionsResponse> {
  const cached = submissionsCache.get(cik);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const data = await fetchJson<CompanySubmissionsResponse>(
    `${SEC_DATA}/submissions/CIK${cik}.json`,
    signal
  );
  submissionsCache.set(cik, { expiresAt: Date.now() + SUBMISSIONS_CACHE_TTL_MS, data });
  return data;
}

async function discoverLatestCompanies(signal: AbortSignal): Promise<SyncedCompany[]> {
  const directory = await getTickerDirectory(signal);
  const publicCompanies = new Map(
    Object.values(directory).map((entry) => [
      String(entry.cik_str).padStart(10, '0'),
      entry,
    ])
  );
  const companies = new Map<string, SyncedCompany>();

  for (let page = 0; page < ATOM_MAX_PAGES; page++) {
    const xml = await fetchAtomPage(page * ATOM_PAGE_SIZE, signal);
    const entries = parseAtomEntries(xml);
    if (entries.length === 0) break;

    for (const entry of entries) {
      const listedCompany = publicCompanies.get(entry.cik);
      if (!listedCompany) continue;

      const company = companies.get(entry.cik);
      if (company) {
        if (!company.filings.some((filing) => filing.accessionNumber === entry.filing.accessionNumber)) {
          company.filings.push(entry.filing);
        }
      } else if (companies.size < SYNC_COMPANY_LIMIT) {
        companies.set(entry.cik, {
          ticker: listedCompany.ticker,
          cik: entry.cik,
          entityName: entry.entityName,
          status: 'queued',
          filings: [entry.filing],
        });
      }
    }

    if (companies.size >= SYNC_COMPANY_LIMIT) break;
    await delay(125, signal);
  }

  return [...companies.values()];
}

function describeSecForm(type: string): string | undefined {
  const base = type.replace(/\/A$/, '');
  const amended = base !== type ? ' (amendment)' : '';
  const exact: Record<string, string> = {
    '3': 'Initial beneficial ownership statement',
    '4': 'Changes in beneficial ownership statement',
    '5': 'Annual beneficial ownership statement',
    '6-K': 'Foreign private issuer report',
    '8-K': 'Current report',
    '10-K': 'Annual report',
    '10-Q': 'Quarterly report',
    '13F-HR': 'Institutional investment manager holdings report',
    '20-F': 'Foreign private issuer annual report',
    '40-F': 'Canadian issuer annual report',
    '144': 'Notice of proposed securities sale',
    'DEF 14A': 'Definitive proxy statement',
    DEFA14A: 'Additional definitive proxy materials',
    'PRE 14A': 'Preliminary proxy statement',
    'SC 13D': 'Beneficial ownership report',
    'SC 13G': 'Short-form beneficial ownership report',
    'S-1': 'Securities registration statement',
    'S-3': 'Short-form securities registration statement',
    'S-4': 'Business-combination registration statement',
    'S-8': 'Employee-benefit securities registration statement',
  };
  const description =
    exact[base] ??
    (/^424B/.test(base)
      ? 'Prospectus filed under Rule 424(b)'
      : /^F-(?:1|3|4)$/.test(base)
        ? 'Foreign issuer securities registration statement'
        : /^N-/.test(base)
          ? 'Investment company filing'
          : undefined);
  return description ? `${description}${amended}` : undefined;
}

function filingResults(columns: FilingColumns, cik: string): FilingResult[] {
  const cikNumber = String(Number(cik));

  return columns.accessionNumber.map((accessionNumber, index) => ({
    type: columns.form[index] ?? '',
    formDescription: describeSecForm(columns.form[index] ?? ''),
    accessionNumber,
    fileDate: columns.filingDate[index] ?? '',
    documentFormType: columns.primaryDocDescription[index] || undefined,
    reportDate: columns.reportDate?.[index] || undefined,
    acceptanceDateTime: columns.acceptanceDateTime?.[index] || undefined,
    act: columns.act?.[index] || undefined,
    fileNumber: columns.fileNumber?.[index] || undefined,
    filmNumber: columns.filmNumber?.[index] || undefined,
    items: columns.items?.[index] || undefined,
    primaryDocument: columns.primaryDocument[index] || undefined,
    isXBRL: columns.isXBRL?.[index] === 1,
    isInlineXBRL: columns.isInlineXBRL?.[index] === 1,
    size: columns.size[index] ?? 0,
    url: `${SEC}/Archives/edgar/data/${cikNumber}/${accessionNumber.replaceAll('-', '')}/${columns.primaryDocument[index] ?? ''}`,
  }));
}

const FINANCIAL_METRICS: Array<{
  key: string;
  label: string;
  unit: string;
  concepts: string[];
}> = [
  {
    key: 'revenue',
    label: 'Revenue',
    unit: 'USD',
    concepts: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'],
  },
  {
    key: 'netIncome',
    label: 'Net income',
    unit: 'USD',
    concepts: ['NetIncomeLoss', 'ProfitLoss'],
  },
  {
    key: 'epsDiluted',
    label: 'Diluted EPS',
    unit: 'USD/shares',
    concepts: ['EarningsPerShareDiluted'],
  },
  {
    key: 'assets',
    label: 'Assets',
    unit: 'USD',
    concepts: ['Assets'],
  },
  {
    key: 'cash',
    label: 'Cash',
    unit: 'USD',
    concepts: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
  },
  {
    key: 'equity',
    label: 'Stockholders’ equity',
    unit: 'USD',
    concepts: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  },
  {
    key: 'sharesOutstanding',
    label: 'Shares outstanding',
    unit: 'shares',
    concepts: ['EntityCommonStockSharesOutstanding'],
  },
];

function financialSnapshot(facts: CompanyFactsResponse): FinancialMetric[] {
  const taxonomies = [facts.facts['us-gaap'], facts.facts.dei].filter(Boolean);

  return FINANCIAL_METRICS.flatMap((metric) => {
    const candidates = taxonomies.flatMap((taxonomy) =>
      metric.concepts.flatMap((concept) =>
        (taxonomy?.[concept]?.units[metric.unit] ?? []).filter(
          (fact) => Number.isFinite(fact.val) && /^(10-K|10-Q|20-F|40-F)(?:\/A)?$/.test(fact.form)
        )
      )
    );
    candidates.sort(
      (a, b) =>
        b.end.localeCompare(a.end) ||
        b.filed.localeCompare(a.filed) ||
        Number(Boolean(b.frame)) - Number(Boolean(a.frame))
    );
    const latest = candidates[0];
    return latest
      ? [
          {
            key: metric.key,
            label: metric.label,
            unit: metric.unit,
            value: latest.val,
            periodEnd: latest.end,
            filed: latest.filed,
            form: latest.form,
          },
        ]
      : [];
  });
}

async function getFinancialSnapshot(cik: string, signal: AbortSignal): Promise<FinancialMetric[]> {
  const cached = companyFactsCache.get(cik);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const facts = await fetchJson<CompanyFactsResponse>(
    `${SEC_DATA}/api/xbrl/companyfacts/CIK${cik}.json`,
    signal
  );
  const data = financialSnapshot(facts);
  companyFactsCache.set(cik, { expiresAt: Date.now() + COMPANY_FACTS_CACHE_TTL_MS, data });
  return data;
}

async function getCompanyFilings(
  ticker: string,
  formType: string | undefined,
  limit: number,
  signal: AbortSignal,
  includeCompanyFacts = false
): Promise<{
  company_id: string;
  cik: string;
  entityName: string;
  companyInfo: Omit<CompanySubmissionsResponse, 'cik' | 'name' | 'filings'>;
  financialSnapshot: FinancialMetric[];
  insiderActivity: {
    periodDays: number;
    total: number;
    form3: number;
    form4: number;
    form5: number;
    latestDate?: string;
  };
  filings: FilingResult[];
} | undefined> {
  const directory = await getTickerDirectory(signal);
  const company = Object.values(directory).find((entry) => entry.ticker.toUpperCase() === ticker);
  if (!company) return undefined;

  const cik = String(company.cik_str).padStart(10, '0');
  const [submissions, companyFacts] = await Promise.all([
    getCompanySubmissions(cik, signal),
    includeCompanyFacts
      ? getFinancialSnapshot(cik, signal).catch((error: unknown) => {
          if (signal.aborted) throw error;
          return [];
        })
      : Promise.resolve([]),
  ]);
  let filings = filingResults(submissions.filings.recent, cik);

  for (const file of submissions.filings.files) {
    const matching = formType ? filings.filter((filing) => filing.type === formType) : filings;
    if (matching.length >= limit) break;
    await delay(110, signal);
    const older = await fetchJson<FilingColumns>(`${SEC_DATA}/submissions/${file.name}`, signal);
    filings = filings.concat(filingResults(older, cik));
  }

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 365);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const insiderFilings = filings.filter(
    (filing) => /^[345](?:\/A)?$/.test(filing.type) && filing.fileDate >= cutoffDate
  );
  const insiderActivity = {
    periodDays: 365,
    total: insiderFilings.length,
    form3: insiderFilings.filter((filing) => filing.type.startsWith('3')).length,
    form4: insiderFilings.filter((filing) => filing.type.startsWith('4')).length,
    form5: insiderFilings.filter((filing) => filing.type.startsWith('5')).length,
    latestDate: insiderFilings[0]?.fileDate,
  };

  if (formType) filings = filings.filter((filing) => filing.type === formType);

  const {
    entityType,
    sic,
    sicDescription,
    tickers,
    exchanges,
    ein,
    category,
    fiscalYearEnd,
    stateOfIncorporation,
    website,
    investorWebsite,
    phone,
    formerNames,
    addresses,
  } = submissions;

  return {
    company_id: cik,
    cik,
    entityName: submissions.name || company.title,
    companyInfo: {
      entityType,
      sic,
      sicDescription,
      tickers,
      exchanges,
      ein,
      category,
      fiscalYearEnd,
      stateOfIncorporation,
      website,
      investorWebsite,
      phone,
      formerNames,
      addresses,
    },
    financialSnapshot: companyFacts,
    insiderActivity,
    filings: filings.slice(0, limit),
  };
}

function xmlElement(xml: string, tag: string): string | undefined {
  return xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1];
}

function xmlText(xml: string, tag: string): string | undefined {
  const value = xmlElement(xml, tag);
  if (!value) return undefined;
  const text = decodeXml(value.replace(/<[^>]+>/g, '').trim());
  return text || undefined;
}

function xmlValue(xml: string, tag: string): string | undefined {
  const container = xmlElement(xml, tag);
  return container ? xmlText(container, 'value') : undefined;
}

function xmlNumber(xml: string, tag: string): number | undefined {
  const value = xmlValue(xml, tag);
  if (!value) return undefined;
  const number = Number(value.replaceAll(',', ''));
  return Number.isFinite(number) ? number : undefined;
}

function parseOwnershipParties(xml: string): {
  ownerNames: string[];
  ownerCik?: string;
  relationships: string[];
} {
  const owners = [...xml.matchAll(/<reportingOwner>([\s\S]*?)<\/reportingOwner>/gi)].map(
    (match) => match[1] ?? ''
  );
  const ownerNames = owners
    .map((owner) => xmlText(owner, 'rptOwnerName'))
    .filter((name): name is string => Boolean(name));
  const ownerCik = owners.map((owner) => xmlText(owner, 'rptOwnerCik')).find(Boolean);
  const relationships = new Set<string>();

  for (const owner of owners) {
    const relationship = xmlElement(owner, 'reportingOwnerRelationship') ?? '';
    if (xmlText(relationship, 'isDirector') === '1') relationships.add('Director');
    if (xmlText(relationship, 'isOfficer') === '1') relationships.add('Officer');
    if (xmlText(relationship, 'isTenPercentOwner') === '1') relationships.add('10% owner');
    if (xmlText(relationship, 'isOther') === '1') relationships.add('Other');
    const officerTitle = xmlText(relationship, 'officerTitle');
    if (officerTitle) relationships.add(officerTitle);
    const otherText = xmlText(relationship, 'otherText');
    if (otherText) relationships.add(otherText);
  }

  return { ownerNames, ownerCik, relationships: [...relationships] };
}

function parseOwnershipTransactions(xml: string, filing: FilingResult): InsiderTransaction[] {
  const { ownerNames, ownerCik, relationships } = parseOwnershipParties(xml);
  const ownerName = ownerNames.join(', ');

  const transactions: InsiderTransaction[] = [];
  const tables: Array<{ pattern: RegExp; derivative: boolean }> = [
    { pattern: /<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/gi, derivative: false },
    { pattern: /<derivativeTransaction>([\s\S]*?)<\/derivativeTransaction>/gi, derivative: true },
  ];

  for (const table of tables) {
    for (const match of xml.matchAll(table.pattern)) {
      const transaction = match[1] ?? '';
      transactions.push({
        accessionNumber: filing.accessionNumber,
        form: filing.type,
        fileDate: filing.fileDate,
        transactionDate: xmlValue(transaction, 'transactionDate'),
        ownerName: ownerName || 'Unknown reporting owner',
        ownerCik,
        relationships,
        securityTitle: xmlValue(transaction, 'securityTitle'),
        transactionCode: xmlText(xmlElement(transaction, 'transactionCoding') ?? '', 'transactionCode'),
        acquiredDisposed: xmlValue(transaction, 'transactionAcquiredDisposedCode'),
        shares: xmlNumber(transaction, 'transactionShares'),
        pricePerShare: xmlNumber(transaction, 'transactionPricePerShare'),
        sharesOwnedFollowing: xmlNumber(transaction, 'sharesOwnedFollowingTransaction'),
        directOrIndirect: xmlValue(transaction, 'directOrIndirectOwnership'),
        derivative: table.derivative,
        url: filing.url,
      });
    }
  }

  return transactions;
}

function ownershipXmlUrl(filingUrl: string): string {
  const url = new URL(filingUrl);
  const match = url.pathname.match(
    /^(\/Archives\/edgar\/data\/\d+\/\d+\/)(?:[^/]+\/)*([^/]+)$/i
  );
  if (!match) return filingUrl;
  return `${url.origin}${match[1]}${match[2]}`;
}

async function getInsiderTransactions(
  ticker: string,
  limit: number,
  signal: AbortSignal
): Promise<{
  ticker: string;
  cik: string;
  periodDays: number;
  filingsScanned: number;
  scannedAccessions: string[];
  filings: Array<FilingResult & { ownerNames: string[] }>;
  transactions: InsiderTransaction[];
} | undefined> {
  const directory = await getTickerDirectory(signal);
  const company = Object.values(directory).find((entry) => entry.ticker.toUpperCase() === ticker);
  if (!company) return undefined;

  const cik = String(company.cik_str).padStart(10, '0');
  const cacheKey = cik;
  const cached = insiderTransactionsCache.get(cacheKey);
  const submissions = await getCompanySubmissions(cik, signal);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 365);
  const insiderFilings = filingResults(submissions.filings.recent, cik).filter(
    (filing) =>
      /^(?:3|4|5)(?:\/A)?$/.test(filing.type) &&
      filing.fileDate >= cutoff.toISOString().slice(0, 10)
  );
  const filingsToScan = insiderFilings.slice(0, limit);

  const withOwnerNames = (ownerNamesByAccession: Record<string, string[]>) =>
    insiderFilings.map((filing) => ({
      ...filing,
      ownerNames: ownerNamesByAccession[filing.accessionNumber] ?? [],
    }));

  const cachedData = cached && cached.expiresAt > Date.now() ? cached.data : undefined;
  const transactions: InsiderTransaction[] = [...(cachedData?.transactions ?? [])];
  const ownerNamesByAccession: Record<string, string[]> = {
    ...(cachedData?.ownerNamesByAccession ?? {}),
  };
  const scannedAccessions = new Set(cachedData?.scannedAccessions ?? []);
  const filingsNotYetScanned = filingsToScan.filter(
    (filing) => !scannedAccessions.has(filing.accessionNumber)
  );

  for (const filing of filingsNotYetScanned) {
    try {
      const xml = await fetchOwnershipXml(ownershipXmlUrl(filing.url), signal);
      ownerNamesByAccession[filing.accessionNumber] = parseOwnershipParties(xml).ownerNames;
      transactions.push(...parseOwnershipTransactions(xml, filing));
      scannedAccessions.add(filing.accessionNumber);
    } catch (error) {
      if (signal.aborted) throw error;
    }
    if (filing !== filingsNotYetScanned.at(-1)) await delay(125, signal);
  }

  insiderTransactionsCache.set(cacheKey, {
    expiresAt: Date.now() + SUBMISSIONS_CACHE_TTL_MS,
    data: { transactions, ownerNamesByAccession, scannedAccessions: [...scannedAccessions] },
  });
  const requestedAccessions = filingsToScan
    .map((filing) => filing.accessionNumber)
    .filter((accession) => scannedAccessions.has(accession));
  const requestedAccessionSet = new Set(requestedAccessions);
  return {
    ticker,
    cik,
    periodDays: 365,
    filingsScanned: requestedAccessions.length,
    scannedAccessions: requestedAccessions,
    filings: withOwnerNames(ownerNamesByAccession),
    transactions: transactions.filter((transaction) =>
      requestedAccessionSet.has(transaction.accessionNumber)
    ),
  };
}

function moveCompanyToFront(cik: string, update: Partial<SyncedCompany>): void {
  const company = syncState.companies.find((item) => item.cik === cik);
  if (!company) return;

  syncState.companies = [
    { ...company, ...update },
    ...syncState.companies.filter((item) => item.cik !== cik),
  ];
}

async function runSecSync(): Promise<void> {
  if (syncState.status === 'running') return;

  syncState = {
    version: 2,
    status: 'running',
    processed: 0,
    total: 0,
    startedAt: new Date().toISOString(),
    companies: [],
  };
  await persistSyncState();

  const controller = new AbortController();
  const targets = await discoverLatestCompanies(controller.signal);
  if (targets.length === 0) {
    throw new SecUpstreamError('SEC Latest Filings did not contain any listed companies.');
  }
  syncState.total = targets.length;
  syncState.companies = targets;
  await persistSyncState();

  let failures = 0;

  for (const target of targets) {
    moveCompanyToFront(target.cik, { status: 'loading', error: undefined });
    await persistSyncState();

    try {
      const company = await getCompanyFilings(
        target.ticker,
        undefined,
        SYNC_FILING_LIMIT,
        controller.signal
      );
      if (!company) throw new Error(`No SEC company found for ticker ${target.ticker}.`);
      moveCompanyToFront(target.cik, {
        entityName: company.entityName,
        status: 'success',
        filings: company.filings,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      failures++;
      moveCompanyToFront(target.cik, {
        status: 'error',
        error: error instanceof Error ? error.message : 'SEC lookup failed.',
        updatedAt: new Date().toISOString(),
      });
    }

    syncState.processed++;
    await persistSyncState();
    if (syncState.processed < syncState.total) await delay(125, controller.signal);
  }

  const feedOrder = new Map(targets.map((company, index) => [company.cik, index]));
  syncState.companies.sort(
    (a, b) => (feedOrder.get(a.cik) ?? Number.MAX_SAFE_INTEGER) - (feedOrder.get(b.cik) ?? Number.MAX_SAFE_INTEGER)
  );
  syncState.status = failures === 0 ? 'success' : 'error';
  syncState.completedAt = new Date().toISOString();
  syncState.error = failures > 0 ? `${failures} of ${targets.length} companies failed to refresh.` : undefined;
  await persistSyncState();
}

async function getArchivesIndex(
  accession: string,
  signal: AbortSignal
): Promise<IndexJsonResponse> {
  const url = `${SEC}/Archives/${accession}/.index.json`;
  return fetchJson<IndexJsonResponse>(url, signal);
}

const route: FastifyPluginAsync = async (app) => {
  try {
    await restoreSyncState();
  } catch (error) {
    app.log.warn({ error }, 'Could not restore SEC sync state');
  }

  app.get('/forms', async (request, reply) => {
    try {
      const forms = await getSecFormTypes(request.signal);
      return {
        source: `${SEC}/submit-filings/forms-index`,
        sourceType: 'SEC Forms Index HTML',
        fetchedAt: new Date().toISOString(),
        forms,
      };
    } catch (error) {
      if (!(error instanceof SecUpstreamError)) throw error;
      request.log.warn({ reason: error.message }, 'SEC Forms Index unavailable');
      return reply.code(error.statusCode).send({ message: error.message });
    }
  });

  app.get('/tickers', async (request, reply) => {
    try {
      const directory = await getTickerDirectory(request.signal);
      const tickers = Object.values(directory)
        .map((entry) => ({ ticker: entry.ticker.toUpperCase(), name: entry.title }))
        .sort((a, b) => a.ticker.localeCompare(b.ticker));
      return {
        version: 1,
        fetchedAt: new Date().toISOString(),
        tickers,
      };
    } catch (error) {
      if (!(error instanceof SecUpstreamError)) throw error;
      return reply.code(error.statusCode).send({ message: error.message });
    }
  });

  app.get(
    '/filings',
    {
      schema: filingsSchema,
    },
    async (request, reply) => {
      const { ticker, formType, limit } = filingsQuery.parse(request.query);
      let data: Awaited<ReturnType<typeof getCompanyFilings>>;
      try {
        data = await getCompanyFilings(ticker, formType, limit, request.signal, true);
      } catch (error) {
        if (!(error instanceof SecUpstreamError)) throw error;
        request.log.warn({ reason: error.message }, 'SEC EDGAR lookup unavailable');
        return reply.code(error.statusCode).send({ message: error.message });
      }
      if (!data) return reply.code(404).send({ message: `No SEC company found for ticker ${ticker}.` });

      return data;
    }
  );

  app.get('/sync/status', async () => syncState);

  app.post('/sync', async (_request, reply) => {
    if (syncState.status !== 'running') {
      void runSecSync().catch(async (error: unknown) => {
        syncState.status = 'error';
        syncState.completedAt = new Date().toISOString();
        syncState.error = error instanceof Error ? error.message : 'SEC sync failed.';
        app.log.error({ error }, 'SEC metadata sync failed');
        try {
          await persistSyncState();
        } catch (persistError) {
          app.log.error({ error: persistError }, 'Could not persist failed SEC sync state');
        }
      });
    }

    return reply.code(202).send(syncState);
  });

  app.get('/insiders', async (request, reply) => {
    const { ticker, limit } = insidersQuery.parse(request.query);
    try {
      const data = await getInsiderTransactions(ticker, limit, request.signal);
      if (!data) {
        return reply.code(404).send({ message: `No SEC company found for ticker ${ticker}.` });
      }
      return data;
    } catch (error) {
      if (!(error instanceof SecUpstreamError)) throw error;
      request.log.warn({ reason: error.message }, 'SEC insider lookup unavailable');
      return reply.code(error.statusCode).send({ message: error.message });
    }
  });

  app.get(
    '/archives/:accession',
    {
      schema: accessionSchema,
    },
    async (request) => {
      const { accession } = accessionParam.parse(request.params);
      const data = await getArchivesIndex(accession, request.signal);

      return data;
    }
  );
};

export default route;
export const autoPrefix = '/api/sec';
export const meta = {
  name: 'sec',
  description: 'Public SEC EDGAR filings lookup by ticker.',
};
