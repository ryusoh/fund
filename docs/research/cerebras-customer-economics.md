# Cerebras Systems (CBRS) — Customer-Economics Deep Dive

- **Date**: 2026-10-23
- **Method**: deep-research run — 3 parallel subagents (filings / internal state / primary-web) + orchestrator confirm pass
- **Question**: How much compute, financing support, and equity upside did CBRS's customers receive? How much sustainable real margin and cash flow did Cerebras receive? What future performance obligations and dilution do public shareholders carry?
- **Prior doc**: [cerebras-systems.md](cerebras-systems.md) (2026-10-13 initial coverage)

## 1. Executive summary

The three-sided structure, all primary-sourced (details §3):

1. **What customers got.** OpenAI: >$20B of contracted capacity (750MW committed 2026–2028 + 1.25GW option to 2.0GW), a warrant over 33.4M shares at a $0.00001 strike (grant-date FV $82.02/sh → ~$2.7B potential value transfer), **and** first-priority collateral + acceleration rights on the $1.0B loan it extended to fund Cerebras's own build-out. G42: two immediately-vested, unconditionally-exercised warrants totaling 3.51M shares @ $0.01 (~$302M grant-date value for ~$35K cash). AWS: pricing commitments, exclusivity, and minimum-capacity guarantees, plus a $100-strike warrant whose 90% only vests if AWS actually spends beyond the initial lease (10%, ~$50M FV, vested unconditionally at issuance). The user's framing — near-zero-strike incentives for OpenAI/G42 vs a conditional $100-strike warrant for AWS — is **confirmed**, with the refinements in §3.1.
2. **What Cerebras got.** $25.4B RPO and a revenue ramp, but Q2 2026 GAAP gross margin was **14%** (hardware **2%**; cloud 20%); core (non-GAAP) gross profit $85.2M ≈ 47% of revenue. H1 2026 operating cash flow **$(47.5)M**, capex **$(548.9)M** → FCF ≈ **$(596)M**. A $1,128.4M customer-warrant asset remains to be amortized as contra-revenue through October 2031. Notably, Q2's GAAP revenue suppression was predominantly **G42-linked (~$41.8M of $44.3M)**; OpenAI-linked amortization was only $2.5M because OpenAI revenue is only beginning.
3. **What public shareholders carry.** The full 750MW tranche-delivery + SLA obligation — failure lets OpenAI terminate the MRA **and** accelerate the $918.2M loan (seizing the lockbox collateral). Dilution: 76.0M anti-dilutive shares (26.1M warrants, 23.8M options, 16.5M RSUs, 9.0M PRSUs) plus 25.8M unvested customer warrants (OpenAI 23.4M + AWS 2.4M), a 42.7M-share 2026 Plan reserve, a 48.9M-share ESPP, and founder PRSUs at $75B/$150B/$250B market-cap hurdles — against 112.2M Class A outstanding. Class N warrant shares auto-convert 1:1 into voting Class A on any sale, so customer equity migrates directly into the public float. Voting power: 95.2% Class B. Zero cash has been repaid on the OpenAI loan ($86.3M credited in services instead).

**Price-drop decomposition (2026-10-14 → 10-22, $146.62 → $117.98):** no company-originated catalyst exists — EDGAR shows zero Cerebras filings since 2026-08-12. The slide is composite: Microsoft Maia 300 reveal (Oct 12, −10.7%), the Oct 14 lockup tranche (~19.4M shares), TD Cowen (IPO bookrunner) target cut $275→$175 (Oct 19), and positioning ahead of the Oct 28 tranche / Nov 9 full expiry — with the SemiAnalysis Nvidia-for-Ultrafast claim (still only X posts; Altman's "close partner" post neither confirms nor denies) as backdrop. The drop is supply + unresolved anchor-customer doubt, **not new primary information**. Q3 earnings confirmed for **Thursday 2026-11-12 AMC**.

## 2. Baseline vs new evidence

Baseline (2026-10-14 thesis): warrant economics recorded only as one-line summaries; cash flow absent from the model layer; dilution never consolidated; belief state stale vs the ~20% price decline.

New this run:

| Area           | Baseline                            | Now                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI warrant | "33.4M @ $0.00001; 10.0M exercised" | Full tranche structure: 4,459,337 (loan funding, vested Jan 2026) + 5,574,171 ($40B-mkt-cap/fee tranche, vested Jun 2026) + 23,411,518 delivery-contingent (deemed **not probable**, not yet an asset); FV $82.02/sh; expiry Dec 24 2035                                                                                                                                            |
| G42 warrant    | "tranches @ $0.01" (unquantified)   | Two discrete warrants, 1,857,516 (Dec 2025) + 1,655,975 (Apr 2026), both immediately vested and fully exercised; ~$301.8M grant-date value; **no performance conditions**                                                                                                                                                                                                           |
| AWS warrant    | "2.7M @ $100" (one line)            | 269,668 (10%) vested at issuance ($50.0M asset); 2,427,010 vest on AWS **payment thresholds** within 5 years; Black-Scholes FV $185.38/sh; expires Jun 19 2033                                                                                                                                                                                                                      |
| GAAP margin    | "optically suppressed by warrants"  | Quantified: Q2 GAAP GM 14% (hardware 2%, cloud 20%) vs core GP $85.2M (~47%); suppression attribution: G42 ~$41.8M / OpenAI $2.5M / AWS $0 of Q2's $44.3M                                                                                                                                                                                                                           |
| Cash flow      | absent                              | H1 2026: OCF $(47.5)M, capex $(548.9)M, FCF ≈ $(596.4)M; $86.3M of the OpenAI loan repaid in service credits, zero cash                                                                                                                                                                                                                                                             |
| Dilution       | "~260M base, not modeled"           | Full build-up: 112.2M A + 111.6M B + 13.7M N (Aug 5) + 76.0M anti-dilutive + 25.8M unvested customer warrants + 91.5M plan/ESPP reserves                                                                                                                                                                                                                                            |
| Corrections    | —                                   | "Trainium-3 prefill + Cerebras decode" role split is **not** stated in filings (S-1 says workloads "partitioned across Trainium3 and CS-3"); "Bedrock Q1 2027" is press-release/IR-only, not in filings; G42's May 2024 purchase-commitment agreement was terminated in entirety Q3 2025 (CFIUS restructuring) — current G42 revenue has **no disclosed minimum-purchase backstop** |

## 3. Claim-by-claim with source anchors

### 3.1 What customers received

- **OpenAI — compute**: 750MW Committed Capacity, tranches 2026–2028, 3–4yr term extendable to 5 by OpenAI; option +1.25GW by end-2030; "valued at more than $20 billion" (S-1 CEO letter, verbatim). Take-or-pay capacity commitments with time-based milestones. [10-Q `fil_0001628280-26-056357` s_0001_c07, s_0002_c02; S-1 raw]
- **OpenAI — financing**: Working Capital Loan — **$1,004.6M funded Jan 2026** (recorded as restricted cash, use-restricted to the MRA build-out); 6%/yr; matures ≤ Dec 31 2032; first-priority security interest in the lockbox; repayment in cash **or non-cash credits** (service fees, compute, hardware, pass-through MRCs, asset transfers); scheduled to amortize over 3 years after delivery of the final tranche of the initial 250MW. Through 2026-06-30: zero cash paid, $86.3M non-cash credited, balance $918.2M ($736.0M current). Interest $19.7M Q2 / $38.6M H1 booked as interest expense with an offsetting increase to deferred revenue. [10-Q s_0001_c10; S-1 raw]
- **OpenAI — equity**: warrant 33,445,026 Class N @ $0.00001. Vesting: 4,459,337 on loan funding (vested Jan 2026); 5,574,171 on earlier of >$40B market cap (30-day VWAP) or certain fee payments (vested Jun 2026); 23,411,518 in delivery-contingent tranches incl. Additional Capacity (deemed not probable of vesting; not yet a warrant asset). 10,033,508 exercised Jul 2026. Grant-date FV $82.02/sh. Expiry: earlier of Dec 24 2035 and 5 business days after no binding commitments remain. [10-Q s_0001_c20 + Note 12 raw; S-1 raw; confirm pass 60%]
- **G42 — equity**: Dec 2025 warrant 1,857,516 Class N @ $0.01 (FV $82.02 → $152.4M asset), fully vested at issuance, expired 5 days after issuance (structured for immediate exercise), exercised Jan 2026; Apr 2026 warrant 1,655,975 @ $0.01 (FV $90.23 → $149.4M asset), fully vested, exercised Apr 2026. Combined ~$301.8M grant-date value, no performance conditions. [10-Q Note 12 raw; S-1 Note 13 raw]
- **AWS — guarantees + equity**: June 2026 Commercial Agreement (from a binding Mar 13 2026 term sheet): initial multi-year lease, options, **pricing commitments, exclusivity, minimum manufacturing-capacity guarantees** in AWS's favor; disaggregated Trainium3/CS-3 inference partitioning. Lease-commencement conditions not satisfied at 2026-06-30 → **$0 AWS revenue recognized**. Warrant 2,696,678 Class N @ $100.00: 269,668 vested at issuance ($50.0M asset); 2,427,010 vest on aggregate AWS payment thresholds within 5 years of issuance; FV $185.38/sh; expires Jun 19 2033. [10-Q risk factors + MD&A raw; S-1 raw; confirm pass 60%]
- **G42/MBZUAI purchase backstop**: none current — the May 2024 pricing/volume agreement was terminated in entirety in Q3 2025 (CFIUS restructuring). [S-1 raw]

### 3.2 What Cerebras received (margin & cash reality)

- Q2 2026 GAAP: revenue $180.1M; gross profit $25.6M = **14%** GM (hardware **2%** vs 34% PY; cloud 20% vs 26% PY). H1: 30%. Warrant amortization cut hardware revenue $28.0M and cloud revenue $16.2M in Q2. [10-Q statements + MD&A raw; confirm pass 60%]
- Core (non-GAAP): Q2 gross profit $85.2M (~47%); core operating loss $(33.6)M Q2 / $(37.1)M H1; core net loss $(6.9)M Q2 (after adding back $377.0M SBC, incl. $273.6M IPO-triggered RSU vesting). [10-Q MD&A raw; s_0001_c02]
- Warrant-asset balance **$1,128.4M** at 2026-06-30 ($167.8M current + $960.6M non-current), amortizing as contra-revenue through Oct 2031. Attribution of Q2's $44.3M: OpenAI-linked $2.5M, G42-linked ~$41.8M, AWS $0. [10-Q balance sheet + s_0001_c05/c07 + Note 12 raw; confirm pass 60%]
- H1 2026 cash flow: OCF **$(47.5)M** (deferred revenue +$126.4M, customer deposits −$111.8M, AR −$72.9M); capex $(548.9)M; **FCF ≈ $(596.4)M**; financing +$6,232.5M IPO + $1,004.6M WC loan. Cash+restricted $7,426.8M + securities $1,179.4M + undrawn $850M revolver. [10-Q cash-flow/balance-sheet raw; confirm pass 60%]
- Lease stack: commenced leases $690.3M future payments (PV $568.8M, 5.5yr wtd-avg); **~$2.25B not yet commenced** ($1.5B signed Q2 + $753.4M signed Q3). [10-Q leases note raw; s_0001_c19/20]

### 3.3 What public shareholders carry

- **Performance obligation**: tranche delivery across specified data centers with minimum capacity thresholds on time-based milestones + SLAs; failure → OpenAI may terminate part/all of the MRA → WC-loan acceleration (principal + interest immediately due; OpenAI may direct the lockbox bank). [S-1 raw risk factors; 10-Q s_0001_c10]
- **RPO quality**: $25.4B, "significant amount" OpenAI MRA; ~22% recognizable within 24 months, 43% months 25–48; pass-through data-center costs for undelivered Committed Capacity **excluded** from RPO. [10-Q s_0001_c08]
- **Share structure** (Aug 5 2026 cover): A 112,247,109 / B 111,601,424 (20 votes → 95.2% of votes) / N 13,715,508 (0 votes, economics identical, auto-convert 1:1 to A on transfer). [10-Q cover + s_0001_c12/13]
- **Dilution inventory** (Jun 30 2026): 76.0M anti-dilutive (26.1M contingently-issuable warrants, 23.8M options, 16.5M RSUs, 9.0M PRSUs, 0.6M early-exercised); unvested customer warrants 23,411,518 (OpenAI) + 2,427,010 (AWS); 2026 Plan reserve 42,650,268 + evergreen from 2027; ESPP up to 48,870,099; founder PRSUs 5.7M/3.3M at $75B/$150B/$250B market-cap hurdles. [10-Q Note 5/12 raw; S-1 raw]
- **Concentration/circularity**: Q2 revenue A 34% (MBZUAI, named) / B 32% (unnamed) / C 10% / D 9% (G42); receivables B 57% + D 19% = 76%; A and D are ASC 850 related parties. OpenAI is simultaneously anchor customer, lender, and warrant holder. [10-Q s_0001_c06/07; risk factors raw]

### 3.4 Market events 2026-10-12 → 10-22 (web subagent, source-graded)

- [PRIMARY] Zero Cerebras SEC filings / press releases since 2026-08-12; Q3 earnings announced for **2026-11-12 AMC** (IR + GlobeNewswire).
- [PRIMARY] SemiAnalysis claim exists only as X posts (2026-09-29 alert; 2026-10-01 partial walk-back "Cerebras is actually sold out"); Altman 2026-10-02 "close partner" post neither confirms nor denies the GPT-6.1 Sol Ultrafast silicon. No full report located.
- [SECONDARY] Catalyst chain: Microsoft Maia 300 reveal (Oct 12, −10.7%); Oct 14 lockup tranche ~19.4M shares; TD Cowen target $275→$175 (Oct 19); drift into Oct 28/Nov 9 windows to $117.98 (52wk low $115.13).

## 4. Open questions / unverified claims

- AWS payment-threshold schedule for the 2,427,010 unvested warrant shares — amounts undisclosed.
- The 250/500/750MW per-year MRA schedule remains NOT-IN-FILINGS (prediction `cbrs-ye2026-250mw-delivery` stands); S-1 loan-amortization language referencing "the final tranche of the initial 250 MW" is the first filing-text evidence consistent with a 250MW initial block — upgrade from "absent" to "indirectly corroborated," still not a confirmed annual schedule.
- "Bedrock integration Q1 2027" — press/IR-only; treat as target, not contract term.
- Oct 28 lockup window absorption; insider Form 4 cadence since Oct 14 window.
- G42 post-IPO stake and Class N→A conversion status of its 3.5M shares.

## 5. Action items

1. Thesis/JSON/evidence updates via `/thesis-update` (this run): warrant economics, cash-flow reality, dilution inventory, price-drop decomposition, two corrections (Trainium role-split; Bedrock-in-filings).
2. Refresh stale valuation snapshot ($146.62 → $117.98) and derived block; scenario probabilities unchanged (per the thesis's own rule, probabilities move on the SemiAnalysis original or the Q3 print — neither has occurred).
3. 2026-10-28: watch lockup-window absorption; 2026-10-29: decision-journal review date; 2026-11-12: Q3 print AMC.

## 6. Confirm-pass note

Orchestrator ran `filings_adapter verify` on 6 load-bearing claims: all PASS at the 60% confidence floor, but the adapter's section detector resolved only the 8-K shell sections, so the matched spans do not anchor the numbers. The quantitative content was therefore verified by **direct extraction from the cached filing HTML** (10-Q `fil_0001628280-26-056357`, S-1 `fil_0001628280-26-025762`) by the filings subagent — every figure in §3 carries its note/statement locator. The adapter's weak-span behavior on this workspace is a tooling limitation to note for future runs, not a defect in the underlying facts.
