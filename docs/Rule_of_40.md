# Rule of 40: Definition, SEC Filing Extraction, and Monitoring Guide

Nov 6, 2026 · @Mike

## Overview

The Rule of 40 is a screening test for growth companies. A company passes when its revenue growth rate plus its profit margin is at least 40%.

Investors apply it mainly to software (SaaS) companies. It lets them compare fast-growing, loss-making firms with slower, highly profitable ones on one scale.

The test rewards a trade-off. Growth can offset thin margins, and strong margins can offset slower growth.

## Formula and variants

Rule of 40 score = revenue growth (%) + profit margin (%)

| Component | Common choices | Notes |
| --- | --- | --- |
| Revenue growth | Year-over-year, quarterly or annual | Quarterly YoY is most common in filings-based screens |
| Profit margin | Free cash flow, operating, EBITDA, or net | Free cash flow margin is the most widely used in analyst work |

Free cash flow margin = (operating cash flow - capital expenditures) ÷ revenue.

The choice of margin can move a score by 10 points or more. Always state which pair you used.

## Worked example: Palantir, Q3 2026

Palantir scores about 143 on the operating-margin version of the test. Revenue growth supplies most of the score.

| Input (in $ millions) | Q3 2026 | Q3 2025 | Source line |
| --- | --- | --- | --- |
| Revenue | 2,313.4 | 1,181.1 | Statement of operations |
| Income from operations | 1,084.8 | 393.3 | Statement of operations |
| Net income | 1,134.4 | 476.7 | Statement of operations |
| Revenue growth (YoY) | 95.9% | n/a | 2,313.4 ÷ 1,181.1 - 1 |
| Operating margin | 46.9% | n/a | 1,084.8 ÷ 2,313.4 |
| **Rule of 40 score** | **≈ 143** | n/a | 95.9 + 46.9 |

The source is the [Q3 2026 Form 10-Q](https://www.sec.gov/Archives/edgar/data/0001321655/000132165526000048/pltr-20260930.htm), filed for the period ended September 30, 2026. Figures are unaudited.

Free cash flow was not computed. It requires the cash flow statement in the same filing.

## SEC filings to monitor

Three filings carry the inputs for the score. The 10-Q and 10-K also carry the full financial statements and cash flow data.

| Form | Frequency | Inputs it provides | Timing |
| --- | --- | --- | --- |
| 10-Q | Quarterly (Q1, Q2, Q3) | Revenue, operating income, net income, cash flow statement (year to date) | Usually 40 to 45 days after quarter end |
| 10-K | Annual | Full-year revenue and margins, audited cash flows, segment and risk disclosures | Usually 60 to 90 days after fiscal year end, by filer status |
| 8-K (Item 2.02) | Event-driven, usually with earnings | Earnings release with preliminary results and guidance | Within 4 business days of the event; earnings releases are often furnished |

Supporting filings:

- **Form 4**: insider trades, filed within 2 business days
- **DEF 14A (proxy)**: executive pay and stock-based compensation context
- **S-1 or S-3**: needed for IPO or share-offering analysis

The 8-K gives the earliest numbers. The 10-Q or 10-K confirms them and is the audited or reviewed record.

## Extraction guide

Each input has a fixed location in the filing and a standard XBRL tag. Use the tag to pull the value programmatically, and the location to check it by hand.

| Input | Where in the 10-Q or 10-K | Common us-gaap XBRL tag |
| --- | --- | --- |
| Revenue | Statement of operations | Revenues, or RevenueFromContractWithCustomerExcludingAssessedTax |
| Operating income | Statement of operations | OperatingIncomeLoss |
| Net income | Statement of operations | NetIncomeLoss |
| Operating cash flow | Statement of cash flows | NetCashProvidedByUsedInOperatingActivities |
| Capital expenditures | Statement of cash flows, investing section | PaymentsToAcquirePropertyPlantAndEquipment |
| Stock-based compensation | Statement of cash flows, operating adjustments | ShareBasedCompensation |

**Steps to extract by hand**

1. Open the filing on EDGAR and go to the statement of operations.
2. Record revenue and operating income for the current quarter and the prior-year quarter.
3. Go to the statement of cash flows. Note that most companies report cash flow year to date, so subtract the prior year-to-date figure to isolate the quarter.
4. Compute growth, margin, and the score as shown in the worked example.

**Steps to extract programmatically**

1. Look up the ten-digit CIK for the ticker in the SEC ticker file.
2. Call the companyconcept endpoint for one tag, for example data.sec.gov/api/xbrl/companyconcept/CIK0001321655/us-gaap/Revenues.json.
3. Filter the results by form type (10-Q or 10-K) and by period end date.
4. Send a descriptive User-Agent header that includes your own contact details. Requests without one can be blocked.

The SEC APIs need no API key. They allow about 10 requests per second.

The companyfacts endpoint returns every tag for a company in one call. The frames endpoint returns one tag for all companies in one period, which is useful for screening.

## Monitoring workflow

Run this routine after each earnings cycle. Use the 8-K for an early read and the 10-Q or 10-K for the confirmed figures.

- [ ] **Day 0 (earnings 8-K):** record preliminary revenue, operating income, and guidance
- [ ] **Day 1 to 2:** compute the early score and note the change from the prior quarter
- [ ] **Day 40 to 45 (10-Q) or Day 60 to 90 (10-K):** replace preliminary figures with filed figures
- [ ] **Each 10-Q:** derive the quarter's operating cash flow and capex from year-to-date totals
- [ ] **Each quarter:** compute trailing four-quarter growth and margin to remove seasonality
- [ ] **Each quarter:** log the score, the margin measure used, and the filing link

**Tracking table**

| Period | Revenue ($M) | YoY growth | Margin measure | Margin | Score | Filing |
| --- | --- | --- | --- | --- | --- | --- |
| Q3 2026 | 2,313.4 | 95.9% | Operating | 46.9% | 143 | [10-Q](https://www.sec.gov/Archives/edgar/data/0001321655/000132165526000048/pltr-20260930.htm) |

Add one row per period. Keep the margin measure fixed across rows so the trend is comparable.

**Alerts to set**

- Score falls below 40 for two consecutive quarters
- Growth falls more than 10 points in one quarter
- Margin changes by more than 5 points without a change in guidance

## Pitfalls and limitations

- **Margin definitions differ.** Operating, EBITDA, net, and free cash flow margins can give very different scores for the same company.
- **Growth is noisy in one quarter.** Acquisitions, pricing changes, and one-time contracts distort quarterly growth. Trailing four-quarter figures are more stable.
- **Stock-based compensation.** Operating margin under GAAP includes SBC as an expense. Non-GAAP margins often exclude it, which raises the score. Check which basis a source uses.
- **Working capital timing.** Upfront customer payments can lift operating cash flow in one quarter without reflecting underlying profit.
- **Stage bias.** Early-stage companies often fail the test by design. Apply it to companies at a comparable stage.
- **Restatements and amendments.** A 10-Q/A or 10-K/A can change inputs. Re-check the score after any amendment.
- **Not a valuation tool.** A passing score does not indicate that a stock is cheap.

## Sources

- [Palantir Form 10-Q, period ended September 30, 2026](https://www.sec.gov/Archives/edgar/data/0001321655/000132165526000048/pltr-20260930.htm): Q3 2026 statement of operations used in the worked example
- [SEC EDGAR APIs](https://www.sec.gov/page/sec-api-documentation): data.sec.gov endpoints, bulk archives, and update timing
- [SEC EDGAR APIs (overview)](https://sec.gov/edgar/sec-api-documentation): companyconcept, companyfacts, and frames endpoints

Deadlines for each form and the Rule of 40 definition reflect standard SEC rules and common analyst usage. Check current SEC form instructions before relying on exact day counts.
