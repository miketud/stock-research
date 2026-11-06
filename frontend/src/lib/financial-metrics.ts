export interface TrackedFact {
  key: string;
  label: string;
  unit: string;
  concepts: string[];
}

/** Filing forms whose XBRL facts we read values from (matches the backend filter). */
export const FACT_SOURCE_FORMS = ['10-K', '10-Q', '20-F', '40-F'] as const;

/**
 * The standardized financial facts we track, mirroring the backend `FINANCIAL_METRICS`
 * list. A reference-page catalog: the label, unit and the XBRL concept(s) each is read
 * from. Values are per-stock and come from `financialSnapshot`; this is just the catalog.
 */
export const trackedFacts: TrackedFact[] = [
  {
    key: 'revenue',
    label: 'Revenue',
    unit: 'USD',
    concepts: [
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'Revenues',
      'SalesRevenueNet',
    ],
  },
  { key: 'netIncome', label: 'Net income', unit: 'USD', concepts: ['NetIncomeLoss', 'ProfitLoss'] },
  { key: 'epsDiluted', label: 'Diluted EPS', unit: 'USD/shares', concepts: ['EarningsPerShareDiluted'] },
  { key: 'assets', label: 'Assets', unit: 'USD', concepts: ['Assets'] },
  {
    key: 'cash',
    label: 'Cash',
    unit: 'USD',
    concepts: [
      'CashAndCashEquivalentsAtCarryingValue',
      'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
    ],
  },
  {
    key: 'equity',
    label: 'Stockholders’ equity',
    unit: 'USD',
    concepts: [
      'StockholdersEquity',
      'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    ],
  },
  {
    key: 'sharesOutstanding',
    label: 'Shares outstanding',
    unit: 'shares',
    concepts: ['EntityCommonStockSharesOutstanding'],
  },
  { key: 'liabilities', label: 'Liabilities', unit: 'USD', concepts: ['Liabilities'] },
  { key: 'currentAssets', label: 'Current assets', unit: 'USD', concepts: ['AssetsCurrent'] },
  { key: 'currentLiabilities', label: 'Current liabilities', unit: 'USD', concepts: ['LiabilitiesCurrent'] },
  { key: 'longTermDebt', label: 'Long-term debt', unit: 'USD', concepts: ['LongTermDebtNoncurrent', 'LongTermDebt'] },
  { key: 'grossProfit', label: 'Gross profit', unit: 'USD', concepts: ['GrossProfit'] },
  { key: 'operatingIncome', label: 'Operating income', unit: 'USD', concepts: ['OperatingIncomeLoss'] },
  {
    key: 'operatingCashFlow',
    label: 'Operating cash flow',
    unit: 'USD',
    concepts: [
      'NetCashProvidedByUsedInOperatingActivities',
      'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
    ],
  },
  {
    key: 'capex',
    label: 'Capital expenditure',
    unit: 'USD',
    concepts: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
  },
  { key: 'researchDevelopment', label: 'R&D expense', unit: 'USD', concepts: ['ResearchAndDevelopmentExpense'] },
  {
    key: 'dividendPerShare',
    label: 'Dividend / share',
    unit: 'USD/shares',
    concepts: ['CommonStockDividendsPerShareDeclared', 'CommonStockDividendsPerShareCashPaid'],
  },
];

export type DerivedMetricKind = 'percent' | 'ratio' | 'usd' | 'usdShare';

export const DERIVED_KIND_LABEL: Record<DerivedMetricKind, string> = {
  percent: '%',
  ratio: '× (multiple)',
  usd: 'USD (compact)',
  usdShare: 'USD / share',
};

const KIND_BY_KEY: Record<string, DerivedMetricKind> = {
  bookValuePerShare: 'usdShare',
  currentRatio: 'ratio',
  debtToEquity: 'ratio',
  longTermDebtToEquity: 'ratio',
  grossMargin: 'percent',
  operatingMargin: 'percent',
  netMargin: 'percent',
  returnOnEquity: 'percent',
  returnOnAssets: 'percent',
  freeCashFlow: 'usd',
  cashToAssets: 'percent',
  researchIntensity: 'percent',
};

/** Output type for a derived ratio, for the reference "Type" column. */
export function derivedKind(key: string): DerivedMetricKind {
  return KIND_BY_KEY[key] ?? 'percent';
}