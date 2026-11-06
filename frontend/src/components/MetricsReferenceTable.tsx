'use client';

import { useMemo, useState } from 'react';

export interface MetricDefinition {
  key: string;
  label: string;
  category: string;
  definition: string;
  formula: string;
}

const TRACKED_FACTS: MetricDefinition[] = [
  { key: 'revenue', label: 'Revenue', category: 'Financials', definition: 'Total amount of money brought in by the operations of the company through the sale of goods or services.', formula: 'Sum of all sales' },
  { key: 'netIncome', label: 'Net Income', category: 'Financials', definition: 'The total earnings of the company after all operating expenses, interest, taxes, and other costs are deducted.', formula: 'Total Revenue - Total Expenses' },
  { key: 'epsDiluted', label: 'EPS (Diluted)', category: 'Financials', definition: 'Earnings per share after accounting for all convertible securities (options, warrants, etc.) that could dilute ownership.', formula: 'Net Income / Diluted Weighted Average Shares' },
  { key: 'assets', label: 'Total Assets', category: 'Financials', definition: 'The total value of everything the company owns, including cash, inventory, and property.', formula: 'Current Assets + Non-Current Assets' },
  { key: 'cashAndEquivalents', label: 'Cash & Equivalents', category: 'Financials', definition: 'The most liquid assets available, including currency, demand deposits, and highly liquid short-term investments.', formula: 'Cash + Securities' },
  { key: 'equity', label: 'Total Equity', category: 'Financials', definition: 'The residual interest in the assets of the company after deducting all its liabilities.', formula: 'Total Assets - Total Liabilities' },
  { key: 'sharesOutstanding', label: 'Shares Outstanding', category: 'Financials', definition: 'The total number of shares of the stock of a company that are currently held by all its shareholders.', formula: 'Issued Shares - Treasury Shares' },
  { key: 'liabilities', label: 'Total Liabilities', category: 'Financials', definition: 'The total financial obligations the company owes to external parties.', formula: 'Current Liabilities + Non-Current Liabilities' },
  { key: 'currentAssets', label: 'Current Assets', category: 'Liquidity', definition: 'Assets that the company expects to convert to cash or use up within one year.', formula: 'Cash + Receivable + Inventory + Prepaid' },
  { key: 'currentLiabilities', label: 'Current Liabilities', category: 'Liquidity', definition: 'Financial obligations that the company is required to settle within one year.', formula: 'Payable + Short-term Debt + Accrued' },
  { key: 'accountsReceivable', label: 'Accounts Receivable', category: 'Liquidity', definition: 'Money owed to the company by its customers for goods or services delivered on credit.', formula: 'Unpaid Invoices' },
  { key: 'inventory', label: 'Inventory', category: 'Liquidity', definition: 'The value of raw materials, work-in-progress, and finished goods ready for sale.', formula: 'Closing Stock' },
  { key: 'accountsPayable', label: 'Accounts Payable', category: 'Liquidity', definition: 'Short-term obligations owed to suppliers or vendors for purchases made on credit.', formula: 'Unpaid Vendor Bills' },
  { key: 'deferredRevenue', label: 'Deferred Revenue', category: 'Liquidity', definition: 'Money received by the company in advance of providing the corresponding goods or services.', formula: 'Prepayments from Customers' },
  { key: 'longTermDebt', label: 'Long-term Debt', category: 'Long-term', definition: 'Loans and other financial obligations that are due after one year.', formula: 'Long-term Notes + Bonds Payable' },
  { key: 'propertyPlantEquipment', label: 'PP&E', category: 'Long-term', definition: 'Tangible long-term assets used in the production of income (net of depreciation).', formula: 'Gross PP&E - Accumulated Depreciation' },
  { key: 'goodwill', label: 'Goodwill', category: 'Long-term', definition: 'An intangible asset reflecting the premium paid over fair value during an acquisition.', formula: 'Purchase Price - Fair Value of Identifiable Net Assets' },
  { key: 'depreciation', label: 'Depreciation & Amortization', category: 'Long-term', definition: 'The allocation of the cost of tangible and intangible assets over their useful lives.', formula: 'Added back in the cash flow statement' },
  { key: 'researchDevelopment', label: 'R&D', category: 'Long-term', definition: 'Spend on new product development and research to drive future growth.', formula: 'Operating expense line' },
  { key: 'sellingGeneralAdmin', label: 'SG&A', category: 'Long-term', definition: 'Operating costs outside of direct production costs, including marketing and overhead.', formula: 'Operating expense line' },
  { key: 'operatingIncome', label: 'Operating Income', category: 'Financials', definition: 'Profit from core business operations before interest and taxes.', formula: 'Gross Profit - Operating Expenses' },
  { key: 'netProfitMargin', label: 'Net Profit Margin', category: 'Financials', definition: 'The percentage of each dollar of revenue that results in net profit.', formula: 'Net Income / Revenue' },
  { key: 'grossProfit', label: 'Gross Profit', category: 'Financials', definition: 'Profit remaining after subtracting the cost of goods sold from revenue.', formula: 'Revenue - Cost of Goods Sold' },
  { key: 'costOfGoodsSold', label: 'Cost of Goods Sold', category: 'Financials', definition: 'The direct costs of producing the goods sold by the company.', formula: 'Beginning Inventory + Purchases - Ending Inventory' },
  { key: 'freeCashFlow', label: 'Free Cash Flow', category: 'Liquidity', definition: 'The cash a company generates after accounting for capital spending.', formula: 'Operating Cash Flow - CapEx' },
];

const DERIVED_RATIOS: MetricDefinition[] = [
  { key: 'bookValuePerShare', label: 'Book Value / Share', category: 'Valuation', definition: 'The net asset value per share based on shareholders equity.', formula: 'Total Equity / Shares Outstanding' },
  { key: 'currentRatio', label: 'Current Ratio', category: 'Liquidity', definition: 'The ability to pay short-term obligations with short-term assets.', formula: 'Current Assets / Current Liabilities' },
  { key: 'quickRatio', label: 'Quick Ratio', category: 'Liquidity', definition: 'A more stringent liquidity measure that excludes inventory.', formula: '(Current Assets - Inventory) / Current Liabilities' },
  { key: 'debtToEquity', label: 'Debt to Equity', category: 'Leverage', definition: 'Relative proportion of debt to shareholder equity used to finance the business.', formula: 'Total Liabilities / Total Equity' },
  { key: 'grossMargin', label: 'Gross Margin', category: 'Profitability', definition: 'The percentage of revenue that exceeds the cost of goods sold.', formula: 'Gross Profit / Revenue' },
  { key: 'operatingMargin', label: 'Operating Margin', category: 'Profitability', definition: 'The share of revenue left after covering operating costs.', formula: 'Operating Income / Revenue' },
  { key: 'roe', label: 'Return on Equity', category: 'Profitability', definition: 'Measures how effectively the company generates profits from shareholders equity.', formula: 'Net Income / Total Equity' },
  { key: 'roa', label: 'Return on Assets', category: 'Profitability', definition: 'Measures how efficiently the company uses its assets to earn profit.', formula: 'Net Income / Total Assets' },
  { key: 'assetTurnover', label: 'Asset Turnover', category: 'Efficiency', definition: 'An efficiency ratio measuring the proportion of company assets used to generate revenue.', formula: 'Revenue / Total Assets' },
  { key: 'inventoryTurnover', label: 'Inventory Turnover', category: 'Efficiency', definition: 'How many times inventory is sold and replaced over a period.', formula: 'Cost of Goods Sold / Inventory' },
  { key: 'receivablesTurnover', label: 'Receivables Turnover', category: 'Efficiency', definition: 'The number of times a company collects its average accounts receivable over a period.', formula: 'Revenue / Accounts Receivable' },
  { key: 'interestCoverage', label: 'Interest Coverage', category: 'Leverage', definition: 'How easily a company can pay interest on its outstanding debt.', formula: 'Operating Income / Interest Expense' },
  { key: 'debtToAssets', label: 'Debt to Assets', category: 'Leverage', definition: 'The proportion of a company total assets funded by debt.', formula: 'Total Liabilities / Total Assets' },
  { key: 'workingCapital', label: 'Working Capital', category: 'Liquidity', definition: 'The operating liquidity available to a company.', formula: 'Current Assets - Current Liabilities' },
  { key: 'priceToEarnings', label: 'Price to Earnings', category: 'Valuation', definition: 'The ratio of the share price of a company to its earnings per share.', formula: 'Price per Share / EPS (Diluted)' },
  { key: 'pegRatio', label: 'PEG Ratio', category: 'Valuation', definition: 'P/E ratio divided by the expected earnings growth rate.', formula: '(Price per Share / EPS) / Growth Rate' },
];

const COLUMN_DEFS = [
  { key: 'label', label: 'Label' },
  { key: 'category', label: 'Category' },
  { key: 'definition', label: 'Definition' },
  { key: 'formula', label: 'Formula' },
] as const;

type SortKey = (typeof COLUMN_DEFS)[number]['key'];
type SortDirection = 'asc' | 'desc';

function SortableMetricTable({
  title,
  data,
  search,
}: {
  title?: string;
  data: MetricDefinition[];
  search: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('label');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const filtered = query
      ? data.filter((m) =>
          [m.label, m.category, m.definition, m.formula]
            .join(' ')
            .toLocaleLowerCase()
            .includes(query)
        )
      : data;

    return [...filtered].sort((a, b) => {
      const comparison = (a[sortKey] ?? '').localeCompare(b[sortKey] ?? '', undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, search, sortKey, sortDirection]);

  const changeSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection('asc');
  };

  const indicator = (key: SortKey) => {
    if (key !== sortKey) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  return (
    <section className="mt-10 overflow-hidden border border-border bg-surface">
      {title ? (
        <div className="border-b border-border bg-surface-alt px-4 py-3">
          <h2 className="font-mono text-sm font-black uppercase tracking-widest text-text-muted">
            {title}
          </h2>
        </div>
      ) : null}
      <div className="max-h-[65vh] overflow-auto">
        <table className="w-full min-w-[880px] table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[10%]" />
            <col className="w-[40%]" />
            <col className="w-[30%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-alt">
            <tr>
              {COLUMN_DEFS.map(({ key, label }) => (
                <th key={key} className="px-4 py-3 text-text-muted">
                  <button
                    type="button"
                    onClick={() => changeSort(key)}
                    aria-label={`Sort by ${label}`}
                    className="inline-flex items-center gap-2 font-black uppercase"
                  >
                    {label}
                    <span aria-hidden="true">{indicator(key)}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((metric) => (
              <tr
                key={metric.key}
                className="border-b-2 border-border transition-colors hover:bg-surface-alt focus-visible:bg-surface-alt/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px]"
              >
                <td className="px-4 py-3 text-sm font-bold text-text">{metric.label}</td>
                <td className="px-4 py-3 font-mono text-xs text-text-muted">{metric.category}</td>
                <td className="px-4 py-3 leading-relaxed text-text">{metric.definition}</td>
                <td className="px-4 py-3 italic text-text-muted">{metric.formula}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function MetricsReferenceTable() {
  const [search, setSearch] = useState('');

  return (
    <div className="font-mono">
      <div className="border-b border-border bg-surface-alt p-4">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search labels, categories, definitions, or formulas…"
          className="h-11 w-full border border-border bg-surface px-3 font-mono text-sm text-text placeholder:text-text-muted focus:outline-none"
        />
      </div>

      <SortableMetricTable title="Financial Facts" search={search} data={TRACKED_FACTS} />
      <SortableMetricTable title="Derived Ratios" search={search} data={DERIVED_RATIOS} />
    </div>
  );
}

export default MetricsReferenceTable;
