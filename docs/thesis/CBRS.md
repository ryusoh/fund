---
---

{% raw %}

# CBRS – Investment Thesis

- **Ticker / Name**: CBRS – Cerebras Systems (Nasdaq; wafer-scale AI inference)
- **Date**: 2026-11-13 (long thesis closed; research tracking only)
- **Time Horizon**: 5 years
- **Benchmark (annual)**: 6.5%
- **Target CAGR (Hurdle)**: 12%
- **Industry Layer**: none yet (candidate: merchant AI accelerators / inference; overlaps [cloud-ai-ecosystem](industry/cloud-ai-ecosystem.md) and the Ethernet-vs-alternatives battle in [ai-networking](industry/ai-networking.md))
- **Findings doc**: [docs/research/tickers/cerebras-q3-2026.md](../research/tickers/cerebras-q3-2026.md) (Q3 2026 earnings/call deep research, 2026-11-13; fresh-context confirm 15/15; commit `6fa19047`); [docs/research/tickers/cerebras-systems.md](../research/tickers/cerebras-systems.md) (initial deep research, 2026-10-13); [docs/research/tickers/cerebras-customer-economics.md](../research/tickers/cerebras-customer-economics.md) (customer-economics deep dive, 2026-10-23); [docs/research/tickers/cerebras-wafer-scale-rebuttal.md](../research/tickers/cerebras-wafer-scale-rebuttal.md) (Culper/Feldman reliability rebuttal, 2026-11-07)

- **Model Settings**
    - Engine: fermat-pascal-kelly
    - Monte Carlo: false, paths: 10,000
    - Kelly scale: 0.5

- **Position**
    - Research tracking only: 0 shares; the long thesis closed on 2026-11-13. Watchlist registration is retained solely for evidence/prediction history, not as an active entry candidate.
    - Constraints: min 0%, max 5% (entry disabled under the closed thesis)
    - Max Kelly weight: 0%; the former fair-value range and scenario outputs are retired.

---

## 1. Business Snapshot

### 1.1 What the company does

- Core business / segments:
    - **Hardware (CS-3 systems)**: wafer-scale WSE-3 processor (4T transistors, ~900K cores, 44 GB on-chip SRAM, TSMC 5nm) sold as CS-3 appliances; CS-4 (3× WSE-3 Turbo, Nexus rack) announced 2026-08-18.
    - **Cloud / inference services**: Cerebras Cloud (launched Aug 2024) — take-or-pay Dedicated Capacity and per-token On-Demand contracts. Q3 2026 GAAP cloud/other revenue was $141.928M of $210.809M total revenue (67%); core cloud revenue was $144.914M.
- Geography / customer concentration:
    - Q3 2026: MBZUAI 38% / OpenAI 34% / G42 7% of revenue; two customers represented 80% of receivables at 2026-09-30. The Q3 Risk Factors resolve the former Customer A/B identity question.
- Business model in one sentence:
    - Sells high-speed AI decode/inference as systems and as a cloud, anchored by a >$20B multi-year OpenAI capacity contract whose delivery schedule is now impaired.

### 1.2 Why this is in my universe

- Thesis type:
    - **Closed long thesis / research tracking only.** The Q3 10-Q's OpenAI delivery-shortfall disclosure fired the pre-committed kill trigger on 2026-11-13. Q3 revenue/guidance strength remains relevant to a future re-underwrite but does not preserve the old thesis.
- My edge / variant perception vs market:
    - The remaining architectural question is whether decode disaggregation becomes standard—partner announcements describe accelerator prefill plus wafer-scale decode—or GPUs absorb decode too. The immediate gating question is more basic: delivered and accepted MW, final delay credits, cancellations, and cash returns on the enlarged fixed-cost stack.

### 1.3 Current valuation snapshot

Live valuation data is pipeline-owned and intentionally **not transcribed into this document** — see `data/analysis/CBRS.json` (`market` block auto-refreshed by `sync_configs`; `derived` block auto-recomputed from scenarios + market data) and the analysis lab. Dated prices/valuations belong only in §8.2 log entries and `decision_journal` entries as historical records.

Valuation-relevant context (as of 2026-10-23; Q2 2026 10-Q fundamentals):

- IPO 2026-05-14/15 at $185; debuted +68% at $311. The slide below the IPO price had **no company-originated catalyst** (zero SEC filings since 2026-08-12): Maia 300 reveal (Oct 12), Oct 14 lockup tranche, TD Cowen target cut $275→$175 (Oct 19), pre-Nov-9 positioning. ~171M-share lockup expiry ~2026-11-09.
- Trailing GAAP EPS deeply negative (IPO SBC + warrant amortization); P/E n.m.
- Core (non-GAAP): Q2 2026 net loss only $(6.9)M — near breakeven; FY2026 core revenue guide $880–890M, core GM 41–43%. GAAP GM Q2 was **14%** (hardware 2%, cloud 20%) after $44.3M warrant amortization (mostly G42-linked; OpenAI-linked only $2.5M).
- Net liquidity: $7.4B cash+restricted + $1.2B securities + undrawn $850M revolver (2026-06-30); H1 2026 FCF ≈ $(596)M (OCF $(47.5)M − capex $548.9M).

---

## 2. Business Quality & Moat

### 2.1 Moat / competitive advantage

- Sources of moat:
    - **Wafer-scale integration**: one wafer = one node; 44 GB on-chip SRAM with 21 PB/s bandwidth eliminates the HBM bandwidth wall for decode — the source of the 750–1,000+ tok/s inference claims (company-published; Artificial Analysis independently measured Kimi K2.6 at ~1,000 tok/s).
    - **Supply-chain orthogonality**: "We do not use HBM memory, CoWoS packaging or 3nm fabrication technology, all of which are currently supply limited" (Q2'26 release) — Cerebras can scale while GPU supply is rationed.
    - **OpenAI co-design lock-in**: MRA includes co-designing future models for future Cerebras hardware; switching costs rise per tranche delivered.
    - **Contracted backlog**: $25.4B RPO vs ~$0.9B FY2026 revenue — ~28x coverage, unusual for a newly public hardware company.
- Moat durability / erosion paths:
    - GPU decode improvements (the SemiAnalysis report claims OpenAI's future Ultrafast mode runs on Nvidia GPUs — UNVERIFIED at source) compress the speed gap the pricing rests on.
    - The moat is rented from one customer: OpenAI is anchor buyer, $918M lender, and warrant holder, with termination rights on tranche misses — alignment and hostage risk in one contract.
    - No MLPerf submissions found (UNVERIFIED absence) — independent benchmarking is thin beyond Artificial Analysis.

### 2.2 Unit economics & returns

- Core gross margin 41–47% (2026 quarters); GAAP Q2 2026 GM was 14% (hardware 2%, cloud 20%), suppressed by warrant amortization ($1.13B asset remaining, contra-revenue through **Oct 2031**; Q2's $44.3M was ~$41.8M G42-linked vs only $2.5M OpenAI-linked) and IPO SBC.
- Heavy fixed-cost buildout ahead: ~$2.25B of data-center leases signed Q2+Q3 2026 not yet commenced, plus $548.9M H1 capex — H1 2026 FCF ≈ $(596)M (OCF $(47.5)M − capex); the OpenAI loan has been repaid only in $86.3M of non-cash service credits, zero cash.
- Dilution inventory vs 112.2M Class A: 76.0M anti-dilutive shares + 25.8M unvested customer warrants + 42.7M 2026-Plan + 48.9M ESPP reserves; Class N warrant shares auto-convert 1:1 into voting Class A on transfer.
- TSMC single-foundry dependence, purchase-order basis, no long-term capacity commitments (10-Q risk factors); wafer supply described as "secured" for growth (Q2'26 release).
- **Physical life ≠ accounting life ≠ economic life.** Feldman's 2026-11-05 rebuttal cites TSMC 105°C/10-year qualification, CS-3 average junction <65°C / maximum ≤85°C, 33-year Arrhenius life at 85°C and <0.5% deployed-wafer decommissioning, but these remain issuer assertions without independent qualification or age-cohort fleet data. SEC confirms only the separate useful-life disclosure change from computer equipment **1.5–3 years** (2024 S-1) to data-center and computer equipment **3–5 years** (2026 424B4). H1's ~$19.2M inventory charge tied primarily to next-generation transition shows that economic obsolescence can occur without physical failure; reliability relief therefore does not upgrade pricing, utilization or ROIC assumptions.

### 2.3 Management & capital allocation

- Founder-CEO Andrew Feldman; Class B (20 votes) holds ~95% of votes — public holders have no say.
- Insider behavior post-IPO is a negative tell: 46 Forms 4 in 4 months, zero open-market buys, ~1.29M shares sold at $161–$250 (incl. CEO 237,559 sh via 10b5-1).
- Customer-warrant financing (OpenAI 33.4M shares @ $0.00001, grant-date FV $82.02/sh — 10.0M vested on loan-funding/market-cap triggers, 23.4M delivery-contingent and deemed not probable; AWS 2.7M @ $100, 10% vested at issuance and 90% conditional on AWS payment thresholds; G42 two warrants totaling 3.5M @ $0.01, ~$302M grant value, no performance conditions, fully exercised) buys revenue at the cost of multi-year margin suppression — rational for land-grab, corrosive to GAAP optics.
- Governance watch: material weaknesses in ICFR, disclosure controls "not effective" at 2026-06-30; law-firm investigation announced Jul 2026 (SECONDARY).

---

## 3. Key Drivers & Risk Map

### 3.1 Core value drivers (next 5 years)

- OpenAI MRA execution: 750MW committed 2026–2028 deployed in tranches (a third-party article claims 250MW by YE2026 / 500MW cumulative YE2027 / 750MW YE2028 — **not found in the 10-Q or April S-1; unverified**); the 1.25GW option (to 2.0GW total) by 2030.
- AWS ramp: first hyperscaler deployment; Bedrock integration targeted Q1 2027; AWS "may represent a material percentage of revenue."
- Decode disaggregation becoming standard (AMD partnership in production Q4 2026 is the template).
- CS-4/CS-5/CS-6 roadmap: doubling token-generation speed YoY sustains the speed premium.
- Sovereign/enterprise diversification away from UAE-related parties (Cognition, Lovable, Block, Figma, GSK, CrowdStrike; EU capacity end-2026 → 200MW by 2027).

### 3.2 Risk map and thesis killers

- Structural risks:
    - GPU decode catches up / OpenAI shifts decode to Nvidia (SemiAnalysis report remains unverified at source).
    - Q3 concentration: MBZUAI 38% / OpenAI 34% / G42 7%; two customers = 80% of receivables.
    - **OpenAI delivery shortfall**: filed below-MRA-quantity delivery, possible delays through part of 2027, credits and conditional tranche-termination rights.
    - Export controls and TSMC sole-source supply remain unresolved.
- Financial risks:
    - OpenAI WC loan $829.082M after $175.489M cumulative non-cash credits; termination/trigger events—not a shortfall alone—can accelerate remedies.
    - Signed but uncommenced data-center leases ≈$8.5B vs consumption-priced contracts; nine-month simple FCF was $(1.435)B by analyst arithmetic.
    - Warrant amortization suppresses GAAP revenue/margin through 2031; disclosure controls remained ineffective.
- Market-structure risks:
    - All early-release windows and the ~2026-11-09 full lockup expiry have elapsed. Monitor actual Form 4 sales and absorption; releasable shares are not proof of sales.
- Explicit thesis-kill triggers (for the former watchlist thesis):
    - **FIRED 2026-11-13**: the Q3 10-Q disclosed an OpenAI delivery-tranche miss. This closes the long thesis; it does not assert tranche/full-MRA termination or loan default.
    - Q3 2026 core revenue below the $214M guide low end — did not fire; actual core revenue was $230.873M.
    - Confirmation at source that OpenAI's future decode runs on Nvidia — unresolved and not needed for the closure decision.

---

## 4. Retired Scenario Design – Fermat–Pascal Three States

**Retired 2026-11-13.** The parameters below preserve the pre-kill record only. They are not a live post-Q3 valuation, have no active fair-value range, and must not be reweighted as though the invalidated on-schedule-capacity thesis remained intact. A new long thesis requires a fresh underwrite.

### 4.1 Shared baseline assumptions

- Starting EPS: **$1.00** = FY2027 core non-GAAP proxy (guide-implied ~$2.7B revenue — "more than triple" the $885M FY2026 midpoint — at ~9–10% core net margin on ~260M diluted shares incl. warrants). GAAP will be far lower (SBC, warrants); trailing GAAP is meaningless, so the model runs on guided core economics, mirroring the AEHR approach.
- Starting PE: ~147× (146.62 / 1.00) on that base.
- Time horizon: 5 years (to ~2031).
- Share count: customer warrants and SBC dilute; not modeled beyond the ~260M base.
- Macro: AI inference demand compounds; decode disaggregation vs GPU absorption is the open architectural question.

### 4.2 Bull Case – "OpenAI MRA Delivers, Wafer-Scale Decode Wins"

- JSON mapping: `prob`: 0.25, `growth.epsCagr`: 0.52, `valuation.exitPe`: 40

#### 4.2.1 Narrative

- 750MW deploys on schedule; OpenAI exercises the 1.25GW option; AWS Bedrock + AMD disaggregation make Cerebras the default fast-decode layer; CS-4/CS-5 sustain the speed gap. Revenue ~$9B by 2031 at ~25% core net margin → EPS ~$8.

#### 4.2.2 Why these numbers are reasonable

- $25.4B RPO with ~65% recognizable within 48 months already implies multi-billion annual revenue by 2028 if contracts perform.
- 40× exit is a category-leader multiple for a company still compounding >30% with contracted backlog.

#### 4.2.3 Evidence & supporting material (Bull)

- `docs/thesis/CBRS/CBRS-bull-evidence.md`; findings doc §2 (RPO, guidance), §3 (OpenAI/AWS/AMD).

---

### 4.3 Base Case – "Committed Capacity Delivers, Optionality Lapses"

- JSON mapping: `prob`: 0.40, `growth.epsCagr`: 0.27, `valuation.exitPe`: 30

#### 4.3.1 Narrative

- The committed 750MW and the initial AWS lease deliver; the 2GW option lapses; inference pricing erodes as GPU decode improves. Revenue ~$4.5B by 2031 at ~18% core net margin → EPS ~$3.3; growth normalizes post-2028.

#### 4.3.2 Why these numbers are reasonable

- Matches "contracted base converts, upside options expire worthless" — the default for capacity-contract businesses once the anchor customer's marginal needs are met.

#### 4.3.3 Evidence & supporting material (Base)

- `docs/thesis/CBRS/CBRS-base-evidence.md`; findings doc §2, §4.

---

### 4.4 Bear Case – "OpenAI Entanglement Breaks / Decode Reverts to GPU"

- JSON mapping: `prob`: 0.35, `growth.epsCagr`: -0.10, `valuation.exitPe`: 18

#### 4.4.1 Narrative

- The SemiAnalysis claim is confirmed: OpenAI moves future decode to Nvidia GPUs; a tranche miss triggers MRA termination rights and WC-loan acceleration; RPO impairs; the ~$2.25B lease stack bites. Revenue stalls near $1.5B; EPS ~$0.6 by 2031 on an 18× sub-scale-hardware multiple.

#### 4.4.2 Why these numbers are reasonable

- The 10-Q itself supplies the mechanism (termination rights, loan acceleration, lease mismatch); the stock has already demonstrated −20% weeks on exactly this news category.

#### 4.4.3 Evidence & supporting material (Bear)

- `docs/thesis/CBRS/CBRS-bear-evidence.md`; findings doc §3 (entanglement), §5 (overhang).

#### 4.4.4 Tail risks beyond modeled Bear

- UAE export-license revocation (G42/MBZUAI remain ~49% of H1 revenue).
- TSMC supply shock with no alternate foundry.
- Lockup-expiry cascade: ~171M shares vs a float that absorbed 34.5M at IPO.

---

## 5. Retired Quantitative Summary & Model Check

- The former +2.5% expected CAGR, ~1.13× expected multiple, and **$50–70** fair-value range were pre-kill estimates anchored to the retired scenarios. They are **not live post-Q3 outputs**.
- `data/analysis/CBRS.json` now carries `fairValueRange: null`; Kelly remains 0%. Scenario names are prefixed `RETIRED` so their preserved probabilities cannot be mistaken for an active recommendation.
- No replacement CAGR, fair value, or probability set is estimated here: the old EPS base assumed timely delivery, and the Q3 filing does not provide the tranche-level delivery/credit/cancellation data needed for a sound rebuild.

### 5.1 Re-engagement rule

A new long thesis—not merely a lower price—is required before re-engagement. Minimum inputs: delivered/accepted MW and final excused-delay/credit treatment; tranche cancellations and RPO bridge; cash conversion and funding needs; evidence that new hyperscaler revenue and margins can absorb fixed costs. The unresolved SemiAnalysis question remains a separate required check.

---

## 6. Position Sizing & Trading Plan

### 6.1 Position policy

- Current: 0 shares; **long thesis closed**. Watchlist registration is retained only to preserve evidence and prediction history.
- Entry rule: none under the retired thesis. Any future entry requires a new thesis and a fresh valuation review.
- Add rule: disabled. `cbrs-openai-mra-intact-fy26` has resolved FALSE and cannot support the former add condition.
- Kill rule: executed 2026-11-13 after the Q3 delivery-shortfall disclosure.

### 6.2 Liquidity & execution

- No trade is indicated by this research-only record. The early-release windows and full lockup expiry have elapsed; use actual Form 4/144 evidence rather than treating releasable shares as sold shares.

---

## 7. Monitoring Checklist

### 7.1 Key metrics to track

- **OpenAI delivery bridge**: contemplated vs delivered/accepted MW by tranche, excused-delay treatment, final credits, term shortening, and cancellations.
- **RPO bridge**: new bookings vs delay credits, variable/pass-through estimate changes, term shortening, and terminations; $26.1B is not guaranteed core revenue.
- **Cash and fixed costs**: OCF, capex, simple FCF, commenced vs uncommenced leases, financing/dilution requirements.
- Q4 2026 core revenue vs $310–330M guide and core GM vs 47–49%; distinguish hardware/cloud mix and operating profit from other-income-supported core net income.
- Actual AWS/Oracle/Microsoft revenue and milestones; official Q3 supplemental deck/captions if retrievable; original SemiAnalysis report.
- Customer concentration, warrant amortization, core-vs-GAAP operating margin bridge, controls remediation, reliability cohort data, and realized cash ROIC.

### 7.2 New-thesis gates

- Delivery recovery without cancellations and with bounded final credits.
- Positive cash conversion and credible funding for the enlarged lease/capex stack.
- Actual customer diversification and margins that cover fixed capacity.
- No adverse loan/MRA remedy; primary evidence on OpenAI decode allocation.
- Until those gates produce a new underwrite, remain closed to entry rather than assigning cosmetic Bull/Base/Bear changes.

---

## 8. Evidence Log & Updates

Append-only log. Machine-readable records: `data/analysis/CBRS.evidence.jsonl`. Detailed notes: `docs/thesis/CBRS/`.

### 8.1 Log index

- Bull evidence file: `docs/thesis/CBRS/CBRS-bull-evidence.md`
- Base evidence file: `docs/thesis/CBRS/CBRS-base-evidence.md`
- Bear evidence file: `docs/thesis/CBRS/CBRS-bear-evidence.md`

### 8.2 High-level update entries (reverse chronological)

#### 2026-11-13 – Q3 revenue beat, but OpenAI delivery miss closes the long thesis

- What happened:
    - Four-track Q3 deep research plus fresh-context confirm pass verified **15/15** load-bearing claims; findings: `docs/research/tickers/cerebras-q3-2026.md` (committed `6fa19047`). Q3 GAAP revenue was **$210.809M**, core revenue **$230.873M** (above the $214–216M guide), GAAP/core GM **20.0% / 41.0%**. FY2026 core guidance rose to **$940–960M**; Q4 core guide is **$310–330M** with 47–49% GM.
    - The Q3 10-Q discloses that, before possible excused-delay adjustments, Cerebras delivered **less OpenAI capacity than the MRA contemplated**, with delays potentially continuing through part of 2027. Credits began October 1 before excused-delay adjustment; an uncured shortfall 90 days after the relevant milestone gives either party a tranche-termination election. This is a disclosed delivery miss, not proof of tranche/full-MRA termination or loan default.
    - RPO was **$26.1B**, but includes variable/pass-through estimates and can decline on termination. Nine-month OCF was **$(388.894)M**, capex **$1,046.059M**, analyst simple FCF **$(1,434.953)M**; signed but uncommenced leases reached approximately **$8.5B**. Named Q3 revenue shares were MBZUAI 38% / OpenAI 34% / G42 7%.
    - Official call captions and the supplemental deck were not inspected. Transcript-only claims about land/power/shell causation, 2H27 recovery, RPO credit deductions, no cancellations, partner timing, and long-term margins remain **UNVERIFIED** and did not affect the decision.
- Impact on scenarios:
    - **The former Bull 0.25 / Base 0.40 / Bear 0.35 framework is retired, not reweighted.** Its on-schedule-capacity premise is invalid; assigning new probabilities without tranche-level evidence would create false precision. JSON scenario names are marked `RETIRED` solely to preserve history.
- Impact on assumptions:
    - `cbrs-q3-2026-core-revenue` resolved **TRUE**; `cbrs-openai-mra-intact-fy26` resolved **FALSE**. The other predictions remain open under their exact criteria. The old $50–70 entry range is withdrawn (`fairValueRange: null`); no replacement CAGR or EPS base is estimated.
- Action:
    - **CLOSE LONG THESIS / 0 shares.** The explicit delivery-miss kill rule in §3.2 was executed. Watchlist registration now serves only research/evidence history; any future entry requires a new underwrite.
- TODO:
    - Obtain delivered/accepted MW, final excused-delay/credit treatment, cancellations and an RPO bridge; reassess cash conversion and financing for the enlarged lease stack. Retrieve official supplemental/caption materials and the original SemiAnalysis report before promoting unresolved call/secondary claims.

#### 2026-11-07 – Feldman rebuts Culper; reliability relief is not an ROIC upgrade

- What happened:
    - Four-track deep research plus fresh-context confirm pass on Feldman's [2026-11-05 CEO response](https://www.cerebras.ai/blog/what-it-took-to-build-wafer-scale-and-why-it-lasts); findings: `docs/research/tickers/cerebras-wafer-scale-rebuttal.md` (commit `ad06a57b`). The response supplies specific company-asserted temperature, Arrhenius and <0.5% fleet-decommissioning evidence against a ~2-year physical-failure claim. SEC confirms the accounting-life change (**1.5–3** to **3–5** years) and the H1 ~$19.2M next-generation inventory charge, but not the technical/fleet figures. Culper's PDF returned 403 in both worker and orchestrator attempts, so secondary numerical retellings remain unverified.
- Impact on scenarios:
    - Unchanged: Bull 0.25 / Base 0.40 / Bear 0.35. The existing bear case is OpenAI decode migration + MRA/loan/fixed-cost stress, not Culper physical failure; reliability relief does not transfer probability to Bull.
- Impact on assumptions:
    - None to EPS CAGRs, exit P/Es, prediction probabilities or confidence. Add bounded positive reliability evidence and two open questions on independent durability data and commercial ROIC; do not treat this as refuting the separate SemiAnalysis claim.
- Action:
    - WATCH, 0 shares. The overdue 2026-10-29 review is closed by this entry; next review remains 2026-11-13 after Q3.
- TODO:
    - At Q3, seek TSMC/fleet-age reliability support, warranty/free-replacement and residual-value data, asset-level depreciation sensitivity, and OpenAI $/MW-year economics net of pass-through, service credits and replacement capex. Obtain the original Culper and SemiAnalysis reports before promoting their claims.

#### 2026-10-23 – Customer-economics deep dive + price-drop decomposition

- What happened:
    - Three-subagent deep research on the three-sided customer-financing structure; findings doc: `docs/research/tickers/cerebras-customer-economics.md` (confirm pass 6/6 PASS @ 0.60 floor + direct extraction from cached 10-Q/S-1 HTML). Key new verified facts: OpenAI warrant tranche structure (4.46M on loan funding + 5.57M on $40B-market-cap/fee trigger + 23.4M delivery-contingent deemed not probable; FV $82.02/sh); G42's two warrants (3.51M sh @ $0.01, ~$302M, no performance conditions, fully exercised); AWS warrant 90% conditional on undisclosed AWS payment thresholds (10%, ~$50M, vested at issuance); Q2 GAAP GM 14% with hardware at 2%; H1 FCF ≈ $(596)M; Q2's GAAP revenue suppression was mostly G42-linked ($41.8M), not OpenAI ($2.5M); full dilution inventory (~76M anti-dilutive + 25.8M unvested customer warrants + 91.5M plan/ESPP reserves vs 112.2M Class A). Corrections: filings describe Trainium3/CS-3 workload partitioning without a prefill/decode role split; "Bedrock Q1 2027" is press/IR-only.
    - Price fell $146.62 → $117.98 (Oct 22) → $108.94 (Oct 23; 52wk low $107.90) with **no company-originated catalyst** — zero SEC filings since Aug 12. Decomposition: Microsoft Maia 300 reveal (Oct 12), Oct 14 lockup tranche, TD Cowen (bookrunner) target cut $275→$175 (Oct 19), pre-Oct-28/Nov-9 positioning; SemiAnalysis claim still only X posts, Altman's "close partner" post neither confirms nor denies. Q3 earnings confirmed for **Nov 12 AMC**.
- Impact on scenarios:
    - Unchanged: Bull 0.25 / Base 0.40 / Bear 0.35. The drop is supply + unresolved anchor-customer doubt, not new primary information; the deep dive confirmed the structure the scenarios already price.
- Impact on assumptions:
    - None to scenario parameters. Derived block refreshed: at $108.94 (the decline extended from $117.98 on Oct 22) the scenario-weighted expected CAGR is ≈ +2.5% (was −3.4% at $146.62) — still far below the 12% hurdle; entry zone $50–70 unchanged.
- Action:
    - WATCH (no position; $117.98 still ~1.7× the top of the entry zone). Q3 print Nov 12 AMC is now the single next catalyst, landing after the Nov 9 full lockup expiry.
- TODO:
    - Watch Oct 28 window absorption and post-Oct-14 Form 4 cadence; Q3 10-Q: AWS revenue emergence (lease-commencement conditions were unsatisfied at Jun 30), warrant-amortization trajectory, and any OpenAI-tranche language; resolve the SemiAnalysis question at source when the Q3 print forces disclosure.

#### 2026-10-14 – Third-party article review: Ultrafast hardware swap + lockup calendar

- What happened:
    - Reviewed a third-party research piece on GPT-6.1 Sol Ultrafast moving from Cerebras to Nvidia, the SemiAnalysis critique, and the lockup. Confirm pass against primary sources: (1) lockup early-release calendar **verified verbatim from the S-1** — 6.7% of Eligible Securities on Aug 19 / Sep 2 / Sep 16, 8.9% on Sep 30 / **Oct 14 / Oct 28**; the market's "Sep 30 all-clear" narrative is wrong, two windows remain; (2) Q2'26 earnings release **verified**: core cloud revenue +287% YoY, >600MW data-center capacity live/contracted for delivery by end-2027, manufacturing >10x in 2026 (Flex/Sanmina/Rocket EMS), TSMC wafer supply secured; (3) the article's per-year MRA delivery schedule (250/500/750MW by YE2026/27/28) **not found in the 10-Q or S-1** — held as unverified.
- Impact on scenarios:
    - Unchanged: Bull 0.25 / Base 0.40 / Bear 0.35. The article's three-hypothesis framing (swapped out / sold out / heterogeneous inference) sharpens the SemiAnalysis question but adds no primary fact that moves probabilities.
- Impact on assumptions:
    - None. Monitoring upgraded: the article's four-step chain (deployment → utilization → cloud revenue → gross margin) adopted into §7.1.
- Action:
    - WATCH (no position; price ~$149 still >2× the $50–70 entry zone). One new prediction registered: `cbrs-ye2026-250mw-delivery` (P=0.55, resolves on FY2026 10-K) — tests both the existence of the per-year tranche schedule and execution against it.
- TODO:
    - Verify the 250/500/750MW schedule against the 424B4 or MRA exhibit; read the original SemiAnalysis report; watch Oct 28 window absorption.

#### 2026-10-14 – Initial thesis from deep-research run

- What happened:
    - First coverage. Findings doc: `docs/research/tickers/cerebras-systems.md` (3-subagent deep research; confirm pass 6/6 PASS @ 0.80 vs Q2 2026 10-Q `fil_0001628280-26-056357`; 3 S-1 claims verbatim-confirmed by direct extraction after reproducing the S-1 processor failure).
- Impact on scenarios:
    - Initial probabilities set: Bull 0.25 / Base 0.40 / Bear 0.35.
- Impact on assumptions:
    - EPS base = $1.00 FY2027 core non-GAAP proxy; entry PE ~147×.
- Action:
    - WATCH (no position). Four dated predictions registered (`data/analysis/CBRS.json`); review 2026-11-15 (post-Q3 print + lockup).
- TODO:
    - Read the original SemiAnalysis report before the lockup window; resolve Customer B identity; confirm lockup share count from the 424B4.

#### {{YYYY-MM-DD}} – {{Event title}}

- What happened:
    - {{Short description + link / source}}
- Impact on scenarios:
    - Bull: {{…}} / Base: {{…}} / Bear: {{…}}
- Impact on assumptions:
    - {{Changes to epsCagr / exitPe?}}
- Action:
    - {{Watch / enter / add / trim / exit}}
- TODO:
    - {{Next data to watch}}

---

## 9. Open Questions / Research To-Do

- Unresolved uncertainties (mirrors `belief_state.open_questions`):
    - Contemplated vs delivered, energized, customer-accepted and utilized MW by OpenAI tranche; which delays are contractually excused?
    - Final net delay credits, day-for-day term shortening, tranche cancellations and the resulting RPO bridge.
    - Funding terms for the ≈$8.5B uncommenced-lease stack and capex; when do OCF and FCF after capex turn positive?
    - Can AWS, Oracle and Microsoft convert agreements/milestones into disclosed revenue without preferential terms destroying margins?
    - OpenAI future decode allocation: original SemiAnalysis report still unread; the closure decision does not depend on resolving it.
    - Did the initial ≈250MW delivery milestone occur in 2026? Resolve the existing prediction only from its designated FY2026 10-K or Q4 materials.
    - Can official supplemental materials/captions substantiate transcript-only claims about delay causation, 2H27 recovery, RPO credit deductions and cancellations?
    - Controls remediation, independent fleet-reliability evidence, and realized cash ROIC.
- Planned research:
    - Re-underwrite only after tranche-level delivery/credit/cancellation and cash-flow evidence arrives; obtain the official Q3 supplemental deck/captions and original SemiAnalysis report.
    - Preserve this document as the closed-thesis record. Any future long candidate should be authored as a new thesis rather than silently changing the retired probabilities.

{% endraw %}
