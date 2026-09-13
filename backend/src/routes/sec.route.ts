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
// token, so it uses the browse-edgar JSON endpoints instead.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const SEC = 'https://www.sec.gov';

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
 * The browse-edgar endpoint is throttled hard on a shared IP — a burst of
 * requests returns an HTML "File Unavailable" page, not JSON. A single short
 * backoff between retries recovers without a library.
 */
const SEC_RATE_LIMIT_MS = 150;

/**
 * The filing types a ticker can produce. The API accepts an exact formType, so
 * an invalid one is a validation error, not a silent empty list. Used both as a
 * Fastify JSON-Schema enum and (via the same string values) as the zod enum.
 */
const FORM_TYPES = [
  '1', '1-A', '1-A POS', '1-K', '1-MA', '3', '4', '424B2', '424B4',
  '424B5', '424B7', '424H', '424K', '424O', '497', '6-K', '8-K',
  'A-20', 'A-3', 'A-4', 'A-5', 'A-CSR', 'A-D', 'A-E', 'A-F',
  'C', 'C-1', 'C-2', 'C-SC', 'F-1', 'F-3', 'F-4', 'F-6', 'F-8',
  'F-20', 'N-CSR', 'N-40', 'N-54', 'S-1', 'S-3', 'S-4', 'S-6', 'S-8',
  'SB-2', 'SC-13D', 'SC-13G', 'SC-14D', 'SC-14G', 'SC-TO', 'T-1',
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

const accessionParam = z.object({
  accession: z
    .string()
    .regex(
      /^\d{4}-\d{4,10}$/,
      'Accession number must look like 0000320193-26-000020.',
    ),
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
      required: ['company_id', 'cik', 'entityName', 'filings'],
      properties: {
        company_id: { type: 'string' },
        cik: { type: 'string' },
        entityName: { type: 'string' },
        filings: {
          type: 'array',
          items: {
            type: 'object',
            required: ['type', 'accessionNumber', 'fileDate', 'size', 'url'],
            properties: {
              type: { type: 'string' },
              accessionNumber: { type: 'string' },
              fileDate: { type: 'string' },
              documentFormType: { type: 'string' },
              size: { type: 'string' },
              url: { type: 'string' },
            },
          },
        },
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
  accessionNumber: string;
  fileDate: string;
  documentFormType?: string;
  size: string;
  url: string;
}

interface CompanyFilingsResponse {
  company_id: string;
  cik: string;
  entityName: string;
  filings: { result: FilingResult[] };
}

interface IndexJsonResponse {
  accessionNumber: string;
  filingDate: string;
  reportDate?: string;
  files: { name: string; path: string; description?: string }[];
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': SEC_USER_AGENT,
      Accept: 'application/json',
    },
    signal,
  });

  // A throttled browse-edgar returns HTML, not JSON, with a 200.
  const text = await res.text();
  if (res.status !== 200 || !text.trim().startsWith('{')) {
    const reason = res.status !== 200 ? `HTTP ${res.status}` : 'non-JSON response (rate limited)';
    throw new Error(`SEC EDGAR request failed for ${url}: ${reason}`);
  }

  return JSON.parse(text) as T;
}

async function getCompanyFilings(
  ticker: string,
  formType: string | undefined,
  limit: number,
  signal: AbortSignal,
): Promise<CompanyFilingsResponse> {
  const params = new URLSearchParams({
    action: 'getcompany',
    ticker,
    output: 'json',
    dateb: '',
    amount: String(limit),
  });
  if (formType) params.set('formType', formType);

  const url = `${SEC}/cgi-bin/browse-edgar?${params.toString()}`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchJson<CompanyFilingsResponse>(url, signal);
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, SEC_RATE_LIMIT_MS));
    }
  }
  throw lastError as Error;
}

async function getArchivesIndex(accession: string, signal: AbortSignal): Promise<IndexJsonResponse> {
  const url = `${SEC}/Archives/${accession}/.index.json`;
  return fetchJson<IndexJsonResponse>(url, signal);
}

const route: FastifyPluginAsync = async (app) => {
  app.get(
    '/filings',
    {
      schema: filingsSchema,
    },
    async (request) => {
      const { ticker, formType, limit } = filingsQuery.parse(request.query);
      const data = await getCompanyFilings(ticker, formType, limit, request.signal);

      return {
        company_id: data.company_id,
        cik: data.cik,
        entityName: data.entityName,
        filings: data.filings.result,
      };
    },
  );

  app.get(
    '/archives/:accession',
    {
      schema: accessionSchema,
    },
    async (request) => {
      const { accession } = accessionParam.parse(request.params);
      const data = await getArchivesIndex(accession, request.signal);

      return data;
    },
  );
};

export default route;
export const autoPrefix = '/api';
export const meta = {
  name: 'sec',
  description: 'Public SEC EDGAR filings lookup by ticker.',
};
