const fs = require('fs');
const content = ` 'use client';

import React, { useState, useMemo } from 'react';

export interface MetricDefinition {
  key: string;
  label: string;
  category: string;
  definition: string;
  formula: string;
}

const TRACKED_FACTS: MetricDefinition[] = [
  { key: 'revenue', label: 'Revenue', category: 'Financials', definition: 'Total amount of money brought in by the company\\'s operations through the sale of goods or services.', formula: 'Sum of all sales' },
  { key: 'netIncome', label: 'Net Income', category: 'Financials', definition: 'The company\\'s total earnings after all operating expenses, interest, taxes, and other costs are deducted.', formula: 'Total Revenue - Total Expenses' },
  { key: 'epsDiluted', label: 'EPS (Diluted)', category: 'Financials', definition: 'Earnings per share after accounting for all convertible securities (options, warrants, etc.) that could dilute ownership.', formula: 'Net Income / Diluted Weighted Average Shares' },
  { key: 'assets', label: 'Total Assets', category: 'Financials', definition: 'The total value of everything the company owns, including cash, inventory, and property.', formula: 'Current Assets + Non-Current Assets' },
  { key: 'cashAndEquivalents', label: 'Cash & Equivalents', category: 'Financials', definition: 'The most liquid assets available, including currency, demand deposits, and highly liquid short-term investments.', formula: 'Cash + Marketable Securities' },
  { key: 'equity', label: 'Total Equity', category: 'Financials', definition: 'The residual interest in the assets of the company after deducting all its liabilities.', formula: 'Total Assets - Total Liabilities' },
  { key: 'sharesOutstanding', label: 'Shares Outstanding', category: 'Financials', definition: 'The total number of shares of a company\\'s stock that are currently held by all its shareholders.', formula: 'Issued Shares - Treasury Shares' },
  { key: 'liabilities', label: 'Total Liabilities', category: 'Financials', definition: 'The total financial obligations the company owes to external parties.', formula: 'Current Liabilities + Non-Current Liabilities' },
  { key: 'currentAssets', label: 'Current Assets', category: 'Liquidity', definition: 'Assets that the company expects to convert to cash or use up within one year.', formula: 'Cash + Accounts Receivable + Inventory + Prepaid Expenses' },
  { key: 'currentLiabilities', label: 'Current Liabilities', category: 'Liquidity', definition: 'Financial obligations that the company is required to settle within one year.', formula: 'Accounts Payable + Short-term Debt + Accrued Liabilities' },
  { key: 'accountsReceivable', label: 'Accounts Receivable', category: 'Liquidity', definition: 'Money owed to the company by its customers for goods or services delivered on credit.', formula: 'Unpaid Invoices' },
  { key: 'inventory', label: 'Inventory', category: 'Liquidity', definition: 'The value of raw materials, work-in-progress, and finished goods ready for sale.', formula: 'Closing Stock' },
  { key: 'accountsPayable', label: 'Accounts Payable', category: 'Liquidity', definition: 'Short-term obligations owed to suppliers or vendors for purchases made on credit.', formula: 'Unpaid Vendor Bills' },
  { key: 'deferredRevenue', label: 'Deferred Revenue', category: 'Liquidity', definition: 'Money received by the company in advance of providing the corresponding goods or services.', formula: 'Prepayments from Customers' },
  { key: 'longTermDebt', label: 'Long-term Debt', category: 'Long-term', definition: 'Loans and other financial obligations that are due after one year.', formula: 'Long-term Notes + Bonds Payable' },
  { key: 'propertyPlantEquipment', label: 'PP&E', category: 'Long-term', definition: 'Tangible long-term assets used in the production of income (Net of depreciation).', formula: 'Gross PPE - Accumulated Depreciation' },
  { key: 'intangibleAssets', label: 'Intangible Assets', category: 'Long-term', definition: 'Non-physical assets that provide long-term value, such as patents, trademarks, and copyrights.', formula: 'Total Intangibles' },
  { key: 'goodwill', label: 'Goodwill', category: 'Long-term', definition: 'The excess of the purchase price over the fair market value of the net identifiable assets of an acquired company.', formula: 'Purchase Price - Fair Value of Net Assets' },
  { key: 'grossProfit', label: 'Gross Profit', category: 'Profitability', definition: 'The profit a company makes after deducting the costs associated with making and selling its products.', formula: 'Revenue - COGS' },
  { key: 'operatingIncome', label: 'Operating Income', category: 'Profitability', definition: 'The profit realized from a business\\'s own operations, before deducting interest and taxes.', formula: 'Gross Profit - Operating Expenses' },
  { key: 'operatingCashFlow', label: 'Operating Cash Flow', category: 'Profitability', definition: 'The amount of cash a company generates from its normal business operations.', formula: 'Net Income + Depreciation - Changes in Working Capital' },
  { key: 'capex', label: 'CapEx', category: 'Investment', definition: 'Funds used by a company to acquire, upgrade, and maintain physical assets such as property, plants, or equipment.', formula: 'Purchase of PPE' },
  { key: 'rdExpense', label: 'R&D Expense', category: 'Investment', definition: 'Spending on research and development to create new products or improve existing ones.', formula: 'R&D Costs' },
  { key: 'dividendPerShare', label: 'Dividend Per Share', category: 'Returns', definition: 'The total amount of dividends declared by a company for every ordinary share outstanding.', formula: 'Total Dividends / Shares Outstanding' },
  { key: 'retainedEarnings', label: 'Retained Earnings', category: 'Financials', definition: 'The cumulative amount of net income that is kept by the company rather than distributed to shareholders as dividends.', formula: 'Beginning RE + Net Income - Dividends' },
];

const DERIVED_RATIOS: MetricDefinition[] = [
  { key: 'bookValuePerShare', label: 'Book Value / Share', category: 'Valuation', definition: 'The per-share value of a company based on its equity.', formula: 'Total Equity / Shares Outstanding' },
  { key: 'currentRatio', label: 'Current Ratio', category: 'Liquidity', definition: 'A liquidity ratio that measures a company\\'s ability to pay short-term obligations.', formula: 'Current Assets / Current Liabilities' },
  { key: 'workingCapital', label: 'Working Capital', category: 'Liquidity', definition: 'The difference between current assets and current liabilities, representing operating liquidity.', formula: 'Current Assets - Current Liabilities' },
  { key: 'freeCashFlow', label: 'Free Cash Flow', category: 'Liquidity', definition: 'The cash a company produces through its operations, less the cost of expenditures on assets.', formula: 'Operating Cash Flow - CapEx' },
  { key: 'cashToAssets', label: 'Cash to Assets', category: 'Liquidity', definition: 'The proportion of total assets held in cash and cash equivalents.', formula: 'Cash & Equivalents / Total Assets' },
  { key: 'accountsReceivableDays', label: 'A/R Days', category: 'Liquidity', definition: 'The average number of days it takes for a company to collect payment after a sale has been made.', formula: '(Accounts Receivable / Revenue) * 365' },
  { key: 'inventoryDays', label: 'Inventory Days', category: 'Liquidity', definition: 'The average number of days a company holds its inventory before selling it.', formula: '(Inventory / COGS) * 365' },
  { key: 'debtToEquity', label: 'Debt to Equity', category: 'Leverage', definition: 'The ratio of total liabilities to shareholders\\' equity, indicating financial leverage.', formula: 'Total Liabilities / Total Equity' },
  { key: 'longTermDebtToEquity', label: 'LT Debt to Equity', category: 'Leverage', definition: 'The ratio of long-term debt to shareholders\\' equity.', formula: 'Long-term Debt / Total Equity' },
  { key: 'grossMargin', label: 'Gross Margin', category: 'Profitability', definition: 'The percentage of total sales revenue that the company retains after incurring the direct costs of producing the goods it sells.', formula: 'Gross Profit / Revenue' },
  { key: 'operatingMargin', label: 'Operating Margin', category: 'Profitability', definition: 'The percentage of revenue remaining after paying for variable costs of production.', formula: 'Operating Income / Revenue' },
  { key: 'netMargin', label: 'Net Margin', category: 'Profitability', definition: 'The percentage of revenue that remains as profit after all expenses and taxes are paid.', formula: 'Net Income / Revenue' },
  { key: 'returnOnEquity', label: 'Return on Equity', category: 'Profitability', definition: 'A measure of financial performance calculated by dividing net income by shareholders\\' equity.', formula: 'Net Income / Average Shareholders\\' Equity' },
  { key: 'returnOnAssets', label: 'Return on Assets', category: 'Profitability', definition: 'An indicator of how profitable a company is relative to its total assets.', formula: 'Net Income / Average Total Assets' },
  { key: 'researchIntensity', label: 'Research Intensity', category: 'Investment', definition: 'The proportion of a company\\'s revenue spent on research and development.', formula: 'R&D Expense / Revenue' },
  { key: 'dividendPayoutRatio', label: 'Div Payout Ratio', category: 'Returns', definition: 'The proportion of earnings paid out as dividends to shareholders.', formula: 'Total Dividends / Net Income' },
];

type SortKey = keyof MetricDefinition;
type SortDirection = 'asc' | 'desc';

function SortableMetricTable({ 
  title, 
  data 
}: { 
  title: string; 
  data: MetricDefinition[] 
}) {
  const [sortKey, setSortKey] = useState('label');
  const [sortDirection, setSortDirection] = useState('asc');

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortDirection]);

  const handleSort = (key: any) => {
    if (key === sortKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const getIndicator = (key: any) => {
    if (key !== sortKey) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="mb-12">
      <h3 className="mb-4 font-mono text-sm font-black uppercase tracking-widest text-text-muted">{title}</h3>
      <div className="overflow-x-auto font-mono">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-bg-alt text-text-muted">
              {([
                { key: 'key', label: 'Key' },
                { key: 'label', label: 'Label' },
                { key: 'category', label: 'Category' },
                { key: 'definition', label: 'Definition' },
                { key: 'formula', label: 'Formula' },
              ]).map(col => (
                <th 
                  key={col.key} 
                  onClick={() => handleSort(col.key)}
                  className="cursor-pointer px-3 py-2 font-medium hover:text-text transition-colors"
                >
                  <span className="flex items-center gap-2">
                    {col.label}
                    <span className="text-[10px] opacity-50">{getIndicator(col.key)}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((metric) => (
              <tr key={metric.key} className="border-b border-border hover:bg-bg-alt/50 transition-colors">
                <td className="px-3 py-2 font-bold text-primary">{metric.key}</td>
                <td className="px-3 py-2 text-text">{metric.label}</td>
                <td className="px-3 py-2 text-text-muted">{metric.category}</td>
                <td className="px-3 py-2 text-text leading-relaxed">{metric.definition}</td>
                <td className="px-3 py-2 text-text-muted italic">{metric.formula}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AppendixGrid({ data }: { data: MetricDefinition[] }) {
  return (
    <div className="mt-16 border-t border-border pt-12">
      <h3 className="mb-8 font-mono text-sm font-black uppercase tracking-widest text-text-muted">Definitions Quick-Reference</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.map((metric) => (
          <div key={metric.key} className="border border-border bg-bg-alt p-4 hover:border-primary transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] font-black uppercase text-primary">{metric.key}</span>
              <span className="font-mono text-[10px] uppercase text-text-muted">{metric.category}</span>
            </div>
            <h4 className="mb-2 font-mono text-xs font-bold text-text">{metric.label}</h4>
            <p className="mb-3 text-[11px] leading-relaxed text-text-muted">{metric.definition}</p>
            <div className="text-[10px] font-mono italic text-text-muted/70 border-t border-border pt-2">
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
        <h1 className="text-2xl font-black uppercase tracking-tighter text-text">Metrics Reference</h1>
        <p className="text-xs text-text-muted">Comprehensive directory of tracked financial facts and derived analytical ratios.</p>
      </header>

      <SortableMetricTable title="Tracked Facts" data={TRACKED_FACTS} />
      <SortableMetricTable title="Derived Ratios" data={DERIVED_RATIOS} />
      
      <AppendixGrid data={[...TRACKED_FACTS, ...DERIVED_RATIOS]} />
    </div>
  );
}

export default MetricsReferenceTable;
\`;

fs.writeFileSync('/home/mike/Code/stock-research/frontend/src/components/MetricsReferenceTable.tsx', content);
console.log('File written successfully');
