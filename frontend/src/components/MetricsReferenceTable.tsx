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

const COLUMNS = [
  { key: 'key', label: 'Key' },
  { key: 'label', label: 'Label' },
  { key: 'category', label: 'Category' },
  { key: 'definition', label: 'Definition' },
  { key: 'formula', label: 'Formula' },
] as const;

type SortKey = (typeof COLUMNS)[number]['key'];
type SortDirection = 'asc' | 'desc';

function SortableMetricTable({ data }: { data: MetricDefinition[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('label');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const comparison = (a[sortKey] ?? '').localeCompare(b[sortKey] ?? '', undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  const indicator = (key: SortKey) => {
    if (key !== sortKey) return '\u2195';
    return sortDirection === 'asc' ? '\u2191' : '\u2193';
  };

  return (
    <section className="mt-12 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className="cursor-pointer px-3 py-2 text-left font-bold uppercase tracking-wider text-text-muted transition-colors hover:text-text"
                onClick={() => handleSort(col.key)}
              >
                {col.label} {indicator(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((metric) => (
            <tr
              key={metric.key}
              className="border-b border-border transition-colors hover:bg-bg-alt/50"
            >
              <td className="px-3 py-2 font-bold text-primary">{metric.key}</td>
              <td className="px-3 py-2 text-text">{metric.label}</td>
              <td className="px-3 py-2 text-text-muted">{metric.category}</td>
              <td className="px-3 py-2 leading-relaxed text-text">{metric.definition}</td>
              <td className="px-3 py-2 italic text-text-muted">{metric.formula}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function AppendixGrid({ data }: { data: MetricDefinition[] }) {
  return (
    <div className="mt-16 border-t border-border pt-12">
      <h3 className="mb-8 font-mono text-sm font-black uppercase tracking-widest text-text-muted">
        Definitions Quick-Reference
      </h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.map((metric) => (
          <div
            key={metric.key}
            className="border border-border bg-bg-alt p-4 hover:border-primary transition-colors"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] font-black uppercase text-primary">
                {metric.key}
              </span>
              <span className="font-mono text-[10px] uppercase text-text-muted">
                {metric.category}
              </span>
            </div>
            <h4 className="mb-2 font-mono text-xs font-bold text-text">{metric.label}</h4>
            <p className="mb-3 text-[11px] leading-relaxed text-text-muted">{metric.definition}</p>
            <div className="border-t border-border pt-2 text-[10px] font-mono italic text-text-muted/70">
              Formula: {metric.formula}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MetricsReferenceTable() {
  return (
    <div className="p-6 font-mono">
      <header className="mb-12">
        <h1 className="text-2xl font-black uppercase tracking-tighter text-text">
          Metrics Reference
        </h1>
        <p className="text-xs text-text-muted">
          Comprehensive directory of tracked financial facts and derived analytical ratios.
        </p>
      </header>

      <SortableMetricTable data={TRACKED_FACTS} />
      <SortableMetricTable data={DERIVED_RATIOS} />

      <AppendixGrid data={[...TRACKED_FACTS, ...DERIVED_RATIOS]} />
    </div>
  );
}

export default MetricsReferenceTable;
