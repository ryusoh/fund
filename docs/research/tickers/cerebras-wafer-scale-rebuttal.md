# Cerebras Systems (CBRS): wafer-scale reliability rebuttal vs commercial economics

- **Research date:** 2026-11-07
- **Trigger:** Andrew Feldman's 2026-11-05 response to Culper Research, plus a secondary Chinese essay distinguishing technical leadership from pricing power and ROIC.
- **Method:** parallel SEC, internal-state, primary-web and red-team investigations; independent fresh-context confirm pass. SEC adapter results were accepted only at confidence >= 0.60 with primary text; large S-1/424B4 items were checked directly in SEC HTML. The Q2 earnings 8-K was checked through Exhibit 99.1, not the body alone.
- **Primary limitation:** the Culper PDF returned Cloudflare 403 in both the web worker and a direct orchestrator retry. Culper-specific numbers available only through secondary retellings remain unverified and are not used as confirmed facts.

## 1. Executive summary

**Classification: Neutral to modestly bullish for physical reliability; neutral for the existing investment scenarios.**

1. Feldman's response materially weakens the narrow claim that CS-3 wafers necessarily suffer heat-induced physical failure after roughly two years. His criticism of scaling a GPU's 5–7 year **economic** retirement period into a **physical** lifetime is logically sound. His own 33-year / century-scale Arrhenius outputs and <0.5% fleet decommissioning figure, however, remain issuer assertions without the underlying TSMC qualification package, model parameters, fleet denominator, age cohorts or independent field audit. [Cerebras CEO response, 2026-11-05](https://www.cerebras.ai/blog/what-it-took-to-build-wafer-scale-and-why-it-lasts)
2. The SEC record confirms the accounting-useful-life change, but not Feldman's technical reliability numbers. The precise filing comparison is **computer equipment 1.5–3 years** in the 2024-09-30 S-1 versus **data center and computer equipment 3–5 years** in the 2026-05-14 424B4. The categories changed as well as the durations. KPMG audited the 2025 financial statements; it was not engaged to audit ICFR and did not certify wafer lifetime. [2024 S-1](https://www.sec.gov/Archives/edgar/data/2021728/000162828024041596/cerebras-sx1.htm), [2026 424B4](https://www.sec.gov/Archives/edgar/data/2021728/000162828026035214/cerebras-424b4.htm)
3. Physical durability, accounting useful life and economic life must remain separate. The Q2 10-Q records approximately **$19.2M** of H1 excess, obsolete and scrapped inventory charges, primarily related to the transition to the next product generation. Long physical life does not prevent economic obsolescence, price erosion or weak ROIC. [Q2 2026 10-Q, Note 8](https://www.sec.gov/Archives/edgar/data/2021728/000162828026056357/cbrs-20260630.htm)
4. The current bear scenario was never built on the Culper two-year-failure thesis. Its load-bearing mechanism is OpenAI shifting future decode to Nvidia, delivery/SLA failure triggering termination rights and loan acceleration, and fixed-cost capacity pressure. Feldman's response does not resolve those risks, nor does it resolve the secondary essay's pricing-power, utilization and capital-return questions.
5. **Decision:** retain Bull / Base / Bear at **0.25 / 0.40 / 0.35**, retain all EPS CAGR and exit-P/E assumptions, keep all five predictions unresolved, and remain **WATCH, 0 shares**. Add bounded positive reliability evidence, not a commercial-moat upgrade.

## 2. Baseline vs new evidence

| Dimension                | Baseline before this run                                                                                                | New evidence                                                                                                                                                           | Thesis effect                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Physical reliability     | Not a core scenario driver; long-term reliability had limited operating history.                                        | Feldman supplies specific temperature, qualification, Arrhenius and fleet-retirement assertions; SEC filings do not independently substantiate them.                   | Weakens a new peripheral bear branch; does not raise bull economics.                                    |
| Accounting life          | Existing thesis tracked heavy capex, depreciation and margin quality.                                                   | SEC confirms 1.5–3 years to 3–5 years, with a changed asset category; Feldman says the asset mix moved from R&D equipment toward owned cloud production systems.       | Confirms disclosure change; neither accounting life nor audit proves economic life.                     |
| Economic obsolescence    | Base case already assumes GPU decode improvement and pricing erosion.                                                   | H1 $19.2M inventory charge tied primarily to next-generation transition; Feldman himself expects economic retirement.                                                  | Reinforces separation of reliability from returns.                                                      |
| OpenAI anchor            | 750MW commitment, 1.25GW option, $25.4B total RPO, delivery and SLA termination rights.                                 | No new contract, delivery, price or utilization disclosure in the blog.                                                                                                | Unchanged.                                                                                              |
| Competitive architecture | Nvidia-for-decode claim remains unverified at original source; AMD disaggregation is a possible heterogeneous template. | NVIDIA documents GB300 power burner mode and GB200 power-smoothing mechanisms; this addresses power-transient engineering, not CBRS pricing or reliability.            | Dummy operations are not unique evidence of bad engineering; competitive pricing question remains open. |
| Commercial premium       | Key unknown is whether speed becomes durable high-ROIC revenue after capex, leases, warrants and financing.             | OpenAI describes "long outputs" and a portfolio matching "the right systems to the right workloads"; this is not exclusivity for all decode or long-context workloads. | Unchanged; no basis to raise margins, growth or exit multiple.                                          |

## 3. Confirmed SEC claim map

Statuses below mean **confirmed as filing text**, not independently proven as commercial or technical truth. Adapter confidence is shown where available; direct SEC HTML was used where the adapter had no usable processor or displayed a mismatched excerpt.

| Claim                                                                                                                                                                    | Result                                            | Locator / exact anchor                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Early computer-equipment useful life was 1.5–3 years; final prospectus uses 3–5 years for data-center and computer equipment.                                            | **CONFIRMED-DIRECT-SEC**                          | 2024-09-30 S-1, accession 0001628280-24-041596, Property and Equipment: "Computer equipment 1.5–3"; 2026-05-14 424B4, accession 0001628280-26-035214: "Data center and computer equipment … 3–5". |
| Q2 GAAP revenue $180.110M; gross profit $25.559M; GAAP GM 14.2%.                                                                                                         | **CONFIRMED, 0.80**                               | Q2 10-Q, accession 0001628280-26-056357; 8-K accession 0001628280-26-056186, Exhibit 99.1: "Total revenue 180,110"; "Gross profit 25,559".                                                        |
| Q2 Core revenue $209.869M; Core GM 40.6%; Core net loss $6.908M.                                                                                                         | **CONFIRMED, 0.80 / direct exhibit**              | Same Exhibit 99.1, non-GAAP reconciliation: "Core revenue … 209,869"; "Core gross margin 40.6%"; "Core net loss … (6,908)". These are non-GAAP measures.                                          |
| H1 operating cash flow -$47.488M and PP&E purchases $548.873M.                                                                                                           | **CONFIRMED, 0.80 / 0.80**                        | Q2 10-Q, Condensed Consolidated Statements of Cash Flows. Simple OCF-minus-capex calculation = **-$596.361M**; this is an analyst calculation, not a company-defined FCF metric.                  |
| H1 inventory charge approximately $19.2M, primarily from next-generation transition.                                                                                     | **CONFIRMED, 0.80**                               | Q2 10-Q, Note 8, Inventories: "primarily related to the transition to the next generation of the Company's product offering."                                                                     |
| The company first substantially scaled its data-center footprint in 2025 and has limited time to gauge long-term performance/reliability.                                | **CONFIRMED, 0.80 + direct HTML**                 | Q2 10-Q, Part II Item 1A: "we and our customers have not had a significant amount of time to gauge the long-term performance and reliability of our offerings."                                   |
| OpenAI committed capacity is 750MW, expected in tranches during 2026–2028; services term is three or four years, extendable by OpenAI to five; option is another 1.25GW. | **CONFIRMED after scope correction, 0.80 / 0.60** | Q2 10-Q, Note 3. The filing supports the **services arrangement** term; do not rewrite it as an explicit term for every tranche.                                                                  |
| Total RPO was $25.4B; a significant amount was attributable to OpenAI; 22% expected in the first 24 months and 43% in months 25–48.                                      | **CONFIRMED, 0.80 / 0.80**                        | Q2 10-Q, Note 3, Remaining Performance Obligation. Do not attribute the entire RPO to OpenAI.                                                                                                     |
| Delivery-timeline or specified service-level failure gives OpenAI rights to terminate part or all of the agreement.                                                      | **CONFIRMED, 0.80**                               | Q2 10-Q, Part II Item 1A: "OpenAI has the right to terminate a portion or all of the agreement."                                                                                                  |
| Q2 top three customers were 34% / 32% / 10% of revenue; two customers were 76% of receivables.                                                                           | **CONFIRMED, 0.80 / 0.80 + direct HTML**          | Q2 10-Q, Note 3. Receivables specifically were Customer B 57% and Customer D 19%; do not conflate these letters with the revenue A/B/C ranking.                                                   |
| OpenAI loan principal was $918.244M; no cash repayments; $86.327M of non-cash repayments.                                                                                | **CONFIRMED, 0.80 / 0.80**                        | Q2 10-Q, Note 10, Working Capital Loan. Table values are in thousands.                                                                                                                            |
| OpenAI warrant covers up to 33,445,026 Class N shares at $0.00001; 10,033,508 were partially exercised in July 2026.                                                     | **CONFIRMED, 0.80 / 0.80 + direct HTML**          | Q2 10-Q, OpenAI Warrant Exercise / subsequent events.                                                                                                                                             |
| No AWS arrangement revenue had been recognized by Q2 end.                                                                                                                | **CONFIRMED, 0.80 + direct HTML**                 | Q2 10-Q, Item 2, Recent Developments: lease commencement conditions were unsatisfied and "we had not recognized revenue under the arrangement."                                                   |
| TSMC produces all wafers; there are no formal long-term supply or allocation commitments.                                                                                | **CONFIRMED, 0.80 + direct HTML**                 | Q2 10-Q, Part II Item 1A, supply-chain risks.                                                                                                                                                     |
| Disclosure controls were ineffective at reasonable assurance due to material weaknesses; KPMG expressed no ICFR opinion because it was not engaged to audit ICFR.        | **CONFIRMED, 0.80 + direct SEC**                  | Q2 10-Q, Part I Item 4; 424B4 F-4. This is a scope limitation, not an adverse ICFR opinion.                                                                                                       |
| Q3 Core revenue guidance $214–216M; FY2026 Core revenue guidance $880–890M.                                                                                              | **CONFIRMED, 0.60 / 0.60 + Exhibit 99.1**         | Q2 8-K Exhibit 99.1, Third Quarter / Full Year 2026 Financial Outlook. Forward-looking non-GAAP guidance, not actual results.                                                                     |

## 4. Primary-web claims and evidentiary boundaries

### 4.1 Feldman's response: confirmed text, company-asserted substance

The official blog does state all of the following:

- TSMC qualification for 10 years of continuous operation at 105°C; deployed CS-3 average junction temperature below 65°C and no higher than 85°C.
- Arrhenius estimates of 33 years at a constant 85°C and more than a century at 65°C.
- Less than 0.5% of deployed CS-3 wafers decommissioned since 2024.
- No shipped system uses PariPoser; dummy operations smooth power and temperature; accounting life moved to 3–5 years as owned cloud production assets entered the fixed-asset mix.
- Feldman discloses: "I am long Cerebras stock."

**Verification status: COMPANY-ASSERTED.** The post supplies no TSMC report, activation energy, failure distribution, sensor methodology, deployed-wafer denominator, age cohort, cumulative operating hours, decommissioning reasons or independent attestation. The figures are valuable because they are specific and falsifiable, not because they are independently proven. [Cerebras CEO response](https://www.cerebras.ai/blog/what-it-took-to-build-wafer-scale-and-why-it-lasts)

### 4.2 Power smoothing is not unique to Cerebras

NVIDIA explicitly describes a **GB300 power burner mode** and separately describes GB200 programmable ramp rates, minimum power floors and stop-delay timers. This supports the narrow engineering point that controlled power draw is an established technique. It does not establish Cerebras's connector, cold-plate or whole-system reliability, and it does not establish either vendor's commercial advantage. [NVIDIA Developer Blog](https://developer.nvidia.com/blog/how-new-gb300-nvl72-features-provide-steady-power-for-ai/)

### 4.3 OpenAI validates a workload, not exclusive architectural victory

OpenAI's announcement says Cerebras accelerates **long outputs**, while its compute portfolio matches "the right systems to the right workloads." That validates low-latency demand and a meaningful deployment role, but does not prove all decode, long-prompt / large-KV-cache, or future Ultrafast workloads are exclusive to Cerebras. [OpenAI partnership announcement](https://openai.com/index/cerebras-partnership/)

### 4.4 Culper claims under quarantine

The original PDF was not readable during this run (Cloudflare 403). Therefore:

- The alleged 3–3.5x thermal scaling, specific temperature inputs, 20%–77% customer-price comparison and negative NPV figures are **UNVERIFIED** and excluded from confirmed fact tables.
- The methodological criticism of mapping GPU economic life to physical failure is anchored in Feldman's direct characterization of the report, not an independent reading of the full Culper model.
- No action item claims the Culper report itself has been fully refuted; only its two-year physical-failure branch is materially weakened by Feldman's specific counter-evidence, pending primary-source and independent-field-data checks.

## 5. Red-team case — disconfirming evidence first

This section is intentionally preserved rather than averaged into the summary.

### 5.1 Reliability rebuttal could overreach from wafer qualification to whole-system life

- **Thesis-killing potential: High for the reliability relief trade.** Arrhenius extrapolation applies to a specific failure mechanism and distribution; a wafer process qualification does not by itself establish elastomeric connectors, sliding thermal interfaces, cold plates, power delivery or full-system service life.
- **Current evidence:** company assertions only for 105°C / 10 years, 65°C / 85°C, 33 years and <0.5%; SEC explicitly says long-term performance history is limited.
- **Falsifier of the red-team concern:** TSMC qualification package plus independent, age-stratified fleet data showing failure/free-replacement rates consistent with the claimed model across connectors and complete systems.
- **Falsifier of Feldman's strong interpretation:** rising warranty replacements or early retirements concentrated in older cohorts, or disclosed failures outside the modeled thermal mechanism.

### 5.2 Longer accounting life can improve reported margins without improving cash returns

- **Thesis-killing potential: High for margin extrapolation.** The useful-life extension is real; so is the risk of treating lower accounting depreciation as incremental economic value.
- **Current evidence:** 1.5–3 to 3–5 years; H1 OCF -$47.488M and capex $548.873M; KPMG's audit does not cover ICFR or technical life.
- **Falsifier:** asset-level rollforward, residual values and cash-flow disclosure showing deployed assets earn above cost of capital under conservative 3-year and 5-year sensitivities.

### 5.3 RPO and OpenAI demand do not guarantee cash ROIC

- **Thesis-killing potential: Highest for the existing long thesis.** The $25.4B RPO is substantial but conditional on deployment and service performance; OpenAI is also lender and warrant holder. Revenue concentration, non-cash loan repayment and customer-warrant contra-revenue complicate unit economics.
- **Current evidence:** 750MW commitment, termination rights, $918.244M loan, $86.327M non-cash credits, 33.445M-share low-strike warrant, top-three Q2 customers at 76% of revenue.
- **Falsifier:** disclosed $/MW-year technology revenue net of pass-through costs, utilization, service credits, replacement capex and renewal pricing demonstrating attractive cash returns without relying on the 1.25GW option.

### 5.4 Technical leadership can coexist with a shrinking premium

- **Thesis-killing potential: High for bull multiples.** GPUs or heterogeneous systems need only become "good enough" at lower total cost in valuable workloads; they need not match peak wafer-scale speed everywhere.
- **Current evidence:** OpenAI explicitly uses a multi-system portfolio; Cerebras and AMD pursue disaggregated inference; no new disclosure in Feldman's post establishes durable $/token pricing or renewal premiums.
- **Falsifier:** matched-model, matched-context, matched-concurrency third-party benchmarks tied to realized pricing, P99 latency, utilization and gross margin over multiple product cycles.

### 5.5 Economic obsolescence is already observable

- **Thesis-killing potential: Medium-high.** The H1 inventory charge tied to next-generation transition is direct evidence that economic obsolescence can occur independently of heat-induced failure.
- **Falsifier:** subsequent filings showing minimal impairment, strong used-system residual values and high utilization of prior-generation systems through their accounting lives.

## 6. Synthesis and scenario impact

- **Bull (0.25, unchanged):** Feldman's response removes a potential physical-reliability objection, but bull assumes 750MW on-time delivery, exercise of the 1.25GW option, AWS/AMD distribution, ~$9B 2031 revenue and ~25% Core net margin. None is advanced by the post.
- **Base (0.40, unchanged):** committed capacity delivers while optionality lapses and GPU improvement erodes pricing. Reliability relief is compatible with this base case; economic obsolescence and price erosion remain central.
- **Bear (0.35, unchanged):** OpenAI decode migration, MRA termination, loan acceleration and fixed-cost pressure are untouched. Culper's physical-failure claim was not the bear scenario's mechanism, so there is no mechanical probability transfer from Bear to Bull.
- **Confidence (0.50, unchanged):** both the short seller and CEO have economic exposure; primary technical evidence remains incomplete; commercial questions did not advance.
- **Predictions:** no existing resolution criterion intersects with the post. Do not resolve or reprice any of the five dated predictions.
- **Decision:** WATCH, 0 shares. Do not interpret the rebuttal as refuting the separate SemiAnalysis Nvidia-for-decode claim.

## 7. Open questions / unverified claims

1. What are the deployed-wafer denominator, install-date cohorts, cumulative operating hours, decommissioning reasons, free replacements and residual values behind the <0.5% figure?
2. What exact TSMC qualification report, failure mechanism, activation energy and confidence interval support 105°C / 10 years and the 33-year extrapolation? Does it cover the whole system or only silicon?
3. Can a supplier confirmation, production BOM or independent teardown resolve the PariPoser dispute?
4. What is the asset-level depreciation impact of the useful-life change, including placed-in-service dates and residual values?
5. What share of RPO is fixed technology revenue versus pass-through economics, and what cash margin remains after utilization, warranties, replacements and service credits?
6. What are actual $/MW-year pricing, power-cost allocation, deployment acceptance and renewal terms for OpenAI tranches?
7. Does the original SemiAnalysis report establish swapped-out, sold-out or heterogeneous inference? Feldman's response does not answer this.
8. Can matched workloads demonstrate durable pricing and ROIC rather than only peak token/s?
9. Culper's original report and full model remain unread; no secondary numerical retelling should be promoted until the PDF is obtained.

## 8. Action items

1. **Before / at Q3 2026 results (2026-11-12 AMC):** request or look for age-cohort reliability data, warranty/free-replacement disclosure, depreciation sensitivity and OpenAI unit economics. Compare Q3 Core revenue with the confirmed $214–216M guide; update the thesis from the new 10-Q and Exhibit 99.1, not from the blog.
2. **Primary-source acquisition:** obtain the Culper PDF outside the blocked fetch path and the original SemiAnalysis report; until then retain both as unverified source claims.
3. **Monitoring:** separate three dashboards of evidence — physical failure, accounting depreciation and economic return — so a positive datapoint in one cannot silently upgrade another.
4. **Next thesis review:** 2026-11-13 after Q3. Preserve WATCH / 0 shares unless price and verified commercial assumptions independently satisfy the existing re-engagement rule.

## 9. Primary source index

- [Feldman, "What It Took to Build Wafer-Scale, and Why It Lasts," 2026-11-05](https://www.cerebras.ai/blog/what-it-took-to-build-wafer-scale-and-why-it-lasts)
- [Cerebras Q2 2026 10-Q, accession 0001628280-26-056357](https://www.sec.gov/Archives/edgar/data/2021728/000162828026056357/cbrs-20260630.htm)
- [Cerebras Q2 2026 earnings 8-K Exhibit 99.1, accession 0001628280-26-056186](https://www.sec.gov/Archives/edgar/data/2021728/000162828026056186/cbrsannouncesfinancialresu.htm)
- [Cerebras 2024 S-1, accession 0001628280-24-041596](https://www.sec.gov/Archives/edgar/data/2021728/000162828024041596/cerebras-sx1.htm)
- [Cerebras 2026 final 424B4, accession 0001628280-26-035214](https://www.sec.gov/Archives/edgar/data/2021728/000162828026035214/cerebras-424b4.htm)
- [OpenAI–Cerebras partnership announcement](https://openai.com/index/cerebras-partnership/)
- [NVIDIA GB300/GB200 steady-power engineering](https://developer.nvidia.com/blog/how-new-gb300-nvl72-features-provide-steady-power-for-ai/)
- [Culper PDF — located but unreadable in this run](https://culperresearch.com/wp-content/uploads/2026/10/Culper_CBRS_10-28-2026.pdf)
