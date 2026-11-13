# Cerebras Systems ($CBRS) — Q3 2026 earnings and call findings

**Date:** 2026-11-13 · **Method:** `/deep-research` four-track fan-out (SEC filings, internal state, primary web, red team) + fresh-context confirm pass.

## Executive summary

**Classification: Bearish / pre-committed thesis-kill triggered.** Q3 was operationally stronger than guided, but the filed OpenAI delivery shortfall invalidates the thesis's load-bearing on-schedule-capacity premise.

- Q3 GAAP revenue was **$210.809M**; core revenue was **$230.873M**, above the **$214–216M** guide. Core gross margin was **41.0%**, and FY2026 core revenue guidance rose to **$940–960M** from $880–890M.
- The Q3 10-Q says that, before potential excused-delay adjustments, Cerebras had **delivered less capacity to OpenAI than the MRA contemplated**, with delays potentially continuing through part of 2027. Credits began accruing October 1 before excused-delay adjustments; an uncured tranche shortfall 90 days after the relevant milestone gives either party a termination election.
- That disclosure resolves `cbrs-q3-2026-core-revenue` **TRUE** and `cbrs-openai-mra-intact-fy26` **FALSE**. It also satisfies the thesis's explicit kill trigger for an SEC-disclosed OpenAI delivery-tranche miss. It does **not** establish that a tranche was terminated, that the full MRA was terminated, or that a loan default occurred.
- Capital intensity increased sharply: nine-month OCF was **$(388.894)M**, capex was **$1,046.059M**, and signed but uncommenced data-center leases represented approximately **$8.5B** of undiscounted future payments.
- **Disposition:** close the existing long thesis and retain 0 shares. Do not reweight the retired scenarios as though the old thesis remained valid. A future position requires a new underwrite built around delivered/accepted MW, credits, cancellations, cash conversion, and fixed-cost absorption.

## Baseline vs new evidence

| Baseline before Q3                                                                   | New primary evidence                                                                      | Thesis consequence                                                                                                         |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Q3 core revenue ≥$214M prediction; $214–216M guide                                   | Core revenue **$230.873M**                                                                | Revenue prediction passes; demand/revenue execution was not the kill mechanism.                                            |
| Bull/base assume OpenAI's committed 750MW deploys on schedule                        | Filed capacity shortfall; delays may extend through part of 2027                          | On-schedule premise is falsified as written.                                                                               |
| `cbrs-openai-mra-intact-fy26` fails on any SEC disclosure of a delivery-tranche miss | Q3 10-Q expressly discloses less delivered capacity than contemplated                     | Resolve FALSE now; do not wait for the FY2026 10-K.                                                                        |
| Q2 RPO $25.4B; 22% expected in first 24 months                                       | RPO **$26.1B**; 33% in first 24 months, 44% in months 25–48, remainder thereafter         | Higher RPO does not offset delivery risk; RPO contains variable/pass-through estimates and can fall if tranches terminate. |
| OpenAI loan $918.2M; repayment only through non-cash credits                         | Principal **$829.082M** after **$175.489M** cumulative non-cash credits; no cash payments | Credit-based repayment continues; a tranche miss alone is not loan acceleration.                                           |
| Approximately $2.25B of signed, uncommenced leases                                   | Approximately **$8.5B** of signed, uncommenced leases                                     | Fixed-cost asymmetry is materially larger than underwritten.                                                               |
| Q2 core GM 40.6%; FY2026 core revenue guide $880–890M                                | Q3 core GM **41.0%**; FY2026 guide **$940–960M**                                          | Genuine positive, but insufficient to repair the invalid delivery premise.                                                 |
| SemiAnalysis Nvidia-for-decode allegation unresolved                                 | No inspected primary source confirms or refutes the relevant future hardware allocation   | Remains an independent unresolved risk; the kill decision does not depend on it.                                           |

## Claim-by-claim breakdown

All 15 candidate claims passed the fresh-context confirm pass. Adapter checks used `fil_0001628280-26-073494`; exhibit claims were verified directly against Exhibit 99.1, not the 8-K body.

| #   | Claim                                                                                                                                                                                                            | Confirm status                                      | Primary anchor                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Q3 GAAP revenue **$210.809M**: hardware **$68.881M**, cloud/other **$141.928M**                                                                                                                                  | Adapter **0.80** + direct statement                 | [Q3 10-Q](https://www.sec.gov/Archives/edgar/data/2021728/000162828026073494/cbrs-20260930.htm), condensed statements of operations                                                                                                                                            |
| 2   | GAAP GM **20.0%**; core GM **41.0%**                                                                                                                                                                             | Direct exhibit, numeric rows                        | [Q3 Exhibit 99.1](https://www.sec.gov/Archives/edgar/data/2021728/000162828026073366/cbrsannouncesfinancialresu.htm), GAAP-to-core GM reconciliation                                                                                                                           |
| 3   | Core revenue **$230.873M**, above the **$214–216M** guide; core cloud **$144.914M**                                                                                                                              | Direct current/prior exhibits                       | [Q3 Exhibit 99.1](https://www.sec.gov/Archives/edgar/data/2021728/000162828026073366/cbrsannouncesfinancialresu.htm), revenue reconciliation; [Q2 Exhibit 99.1](https://www.sec.gov/Archives/edgar/data/2021728/000162828026056186/cbrsannouncesfinancialresu.htm), Q3 outlook |
| 4   | GAAP net loss **$(161.218)M**; core operating loss **$(33.108)M**; core net income **$29.823M**                                                                                                                  | GAAP adapter **0.80**; core direct exhibit          | Q3 10-Q statements; Q3 Exhibit 99.1 operating/net-income reconciliations                                                                                                                                                                                                       |
| 5   | Q4 core guide **$310–330M** / **47–49%** GM; FY2026 **$940–960M** / **42–44%** GM; no numeric FY2027 range                                                                                                       | Direct exhibit                                      | Q3 Exhibit 99.1, outlook sections and CEO quotation “expect to triple revenue in 2027”                                                                                                                                                                                         |
| 6   | RPO **$26.1B**; **33%** first 24 months, **44%** months 25–48, remaining balance thereafter; significant amount attributable to OpenAI                                                                           | Adapter **0.80**, `s_0001_c11`                      | Q3 10-Q Note 3, Remaining Performance Obligation. The often-derived **23%** remainder is analyst arithmetic, not filing text.                                                                                                                                                  |
| 7   | Delivered less OpenAI capacity than contemplated; delays may continue through part of 2027; October 1 credits before excused-delay adjustment; 90-day tranche termination right; <5% forecast terminable in 2026 | Adapter **0.80** + direct Risk Factors inspection   | Q3 10-Q Part II Item 1A, customer-concentration/MRA risk factor. The 90 days run from the relevant milestone, not from discovery.                                                                                                                                              |
| 8   | Q3 revenue shares: MBZUAI **38%**, OpenAI **34%**, G42 **7%**; two customers = **80%** of AR                                                                                                                     | Adapter **0.80** + direct Risk Factors/Note 3       | Q3 10-Q Part II Item 1A and Note 3. Named Risk Factors resolve the prior Customer A/B mapping question.                                                                                                                                                                        |
| 9   | OpenAI arrangement revenue **$72.4M**, net of **$3.2M** warrant amortization                                                                                                                                     | Adapter **0.80**, `s_0001_c10`                      | Q3 10-Q Note 3, OpenAI Collaboration                                                                                                                                                                                                                                           |
| 10  | Nine-month OCF **$(388.894)M** and capex **$1,046.059M**                                                                                                                                                         | Adapter **0.80** + direct cash-flow statement       | Q3 10-Q cash flows. Analyst simple FCF = **$(1,434.953)M**; not a company-reported subtotal.                                                                                                                                                                                   |
| 11  | Signed but uncommenced data-center leases ≈**$8.5B** undiscounted future payments                                                                                                                                | Adapter **0.80**, `s_0001_c23`                      | Q3 10-Q Note 15, Leases Not Yet Commenced                                                                                                                                                                                                                                      |
| 12  | OpenAI loan **$829.082M** after **$175.489M** cumulative non-cash credits; no cash payments                                                                                                                      | Adapter **0.60** + direct Note 10 numeric rows      | Q3 10-Q Note 10, Debt                                                                                                                                                                                                                                                          |
| 13  | Cash, restricted cash and investments = **$7.804820B**; $850M revolver undrawn                                                                                                                                   | Adapter **0.80**; precise sum is analyst arithmetic | Q3 10-Q balance sheet and Note 10 revolver section                                                                                                                                                                                                                             |
| 14  | Disclosure controls ineffective; deficiencies did not result in a material misstatement                                                                                                                          | Adapter **0.80**, `s_0004` + direct Item 4          | Q3 10-Q Part I Item 4, Controls and Procedures                                                                                                                                                                                                                                 |
| 15  | **700 gross MW** contracted for delivery by end-2027; production-scale heterogeneous disaggregation                                                                                                              | Direct exhibit; company claims only                 | Q3 Exhibit 99.1, Business Highlights. Not evidence of delivered/energized MW, utilization, acceptance, or realized economics.                                                                                                                                                  |

### What the positive core-net-income headline does not mean

Core net income was $29.823M while core operations lost $33.108M. The quarter also included substantial other income. The thesis should therefore track operating economics and cash conversion, not treat positive core net income as proof of positive operating profitability.

## Red-team case — disconfirming evidence first

1. **The kill condition is explicit, not interpretive.** The pre-existing rule fired on an SEC-disclosed delivery-tranche miss. Possible excused-delay adjustments limit contractual conclusions but do not erase the disclosure event. The bull case's on-schedule 750MW premise is false as written.
2. **RPO is conditional and composition-sensitive.** The $26.1B includes estimated variable consideration and pass-through amounts; delivery timing can change; terminated tranches reduce contract value and RPO. It is not guaranteed core revenue or high-margin cash flow.
3. **Fixed commitments can outlive customer revenue.** Delay shortens the applicable tranche term day-for-day, credits reduce future fees, and either party can elect to terminate an affected tranche after the contractual cure period. Cerebras warns it may be unable to offset committed expenditures with alternative revenue.
4. **Cash economics lag the income statement.** Nine-month simple FCF was $(1.435)B by analyst arithmetic while signed but uncommenced leases rose to approximately $8.5B. Liquidity is substantial, but the filing says future investments may require significant additional debt or equity.
5. **Concentration remains acute.** MBZUAI, OpenAI, and G42 represented 38%, 34%, and 7% of Q3 revenue; two customers represented 80% of AR. OpenAI remains customer, lender, and warrant holder.
6. **2027 tripling now requires delivery recovery plus financing and margin execution.** The official statement is management intent, not numeric guidance. Contracted MW must become delivered, accepted, utilized, revenue-producing MW.
7. **Controls and dilution remain unresolved.** Disclosure controls were still ineffective, and the company continues to carry substantial customer-warrant and equity-award overhang.

### Evidence against the red-team conclusion

The revenue and guidance beats were real; core cloud grew 272% YoY; RPO increased; liquidity was approximately $7.8B plus an undrawn revolver; no tranche termination or loan default was disclosed; new Oracle/Microsoft relationships and production-scale disaggregation provide diversification and architectural validation. These facts justify continued research coverage, but not continuation of the invalidated long thesis.

### Falsifiers of the adverse reassessment

A future long thesis could be reconsidered if primary disclosures show:

- delayed OpenAI tranches delivered and accepted, with no cancellations and bounded final credits;
- a clear RPO bridge separating new bookings, credits, pass-through estimate changes, term shortening, and cancellations;
- no adverse MRA amendment, collateral remedy, acceleration trigger, or cash-repayment demand;
- positive operating cash flow and FCF after capex, not merely core net income supported by other income;
- GAAP/core operating-margin convergence and evidence that fixed capacity is absorbed economically;
- revenue diversification through actual AWS/Oracle/Microsoft contribution rather than announcements alone;
- primary OpenAI evidence of continued material Cerebras decode usage.

## Earnings-call and IR source limitations

Research workers inspected the SEC release, 10-Q, partner announcements, and official product materials. Cerebras IR endpoints blocked retrieval in this environment. No official supplemental earnings deck, official call transcript, or official caption stream was inspected; this is an availability limitation, not a claim that those materials do not exist.

Third-party Yahoo Finance and StockAnalysis transcripts were used only for discovery. The following remain **UNVERIFIED** and were excluded from confirmed claims and the kill decision:

- delays attributed exclusively to land, power, and shell rather than chips;
- delay credits already deducted from RPO and return to schedule in 2H 2027;
- no delayed-capacity cancellations received as of the call;
- Q4 cloud revenue approximately flat sequentially;
- AMD production disaggregation live, Microsoft revenue beginning in 1H 2027, and Oracle launch narrowed to summer 2027;
- long-term 60% core GM and 40% operating-margin targets;
- additional 1.25GW OpenAI option not yet discussed;
- management's claimed throughput/TCO crossover points.

Fallback transcript: [Yahoo Finance automated transcript](https://finance.yahoo.com/quote/CBRS/earnings/CBRS-Q3-2026-earnings_call-731670.html). Two similar third-party transcripts do not constitute official verification.

## Open questions / unverified claims

1. What are delivered, energized, customer-accepted, and utilized MW by tranche—not merely gross contracted MW?
2. Which delays are contractually excused, and what are final net credits after adjustment?
3. How much RPO was reduced for delay credits, and what is the new-bookings/credits/pass-through/cancellation bridge?
4. Does the initial 250MW delivery milestone occur in 2026? The Q3 shortfall materially impairs the prior prediction, but its source/restriction requires the FY2026 10-K or Q4 materials for final resolution.
5. Can AWS, Oracle, and Microsoft convert agreements into disclosed revenue without preferential terms destroying margin?
6. Does OpenAI's future decode remain on Cerebras? The original SemiAnalysis report remains unread and the question unresolved.
7. What financing is required for the enlarged lease/capex stack, and on what dilution or borrowing terms?
8. When will disclosure-control material weaknesses be remediated and tested effectively?

## Action items

- Close the existing long thesis and disable its prior $50–70 entry zone; maintain 0 shares.
- Resolve `cbrs-q3-2026-core-revenue` TRUE and `cbrs-openai-mra-intact-fy26` FALSE on 2026-11-13. Leave the other predictions unresolved unless their exact criteria are met.
- Preserve the former scenario parameters only as a clearly labelled retired record; do not present their expected return as a live post-Q3 valuation signal.
- Re-underwrite only after tranche-level delivery/credit/cancellation evidence and cash-flow evidence arrive. Obtain the official supplemental deck/captions and original SemiAnalysis report before promoting call-only or secondary claims.
- Correct living prose that still treats the October/November lockup windows as upcoming and the Q2 core-GM denominator error; retain dated historical entries unchanged.

## Confirm-pass record

- **15 VERIFIED / 0 FAILED / 0 PARTIAL** in a fresh context.
- Ten-Q adapter results were **0.60–0.80** with `--doc fil_0001628280-26-073494`; displayed spans were inspected and supplemented by direct source reading where necessary.
- Exhibit-only claims were verified against the actual SEC Exhibit 99.1. The 8-K body was not used as a substitute.
- Claim 7 independently reconciled against the prediction's disclosure test: **FALSE**, even though termination/default had not occurred.
- Initial ingest failed with an SEC 403 under the first User-Agent. Direct SEC retrieval succeeded and a second ingest with a compliant contact-style User-Agent created `fil_0001628280-26-073494` and `fil_0001628280-26-073366`; no adapter defect action item is warranted.
