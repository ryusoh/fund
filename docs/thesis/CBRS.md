---
---

{% raw %}

# CBRS – Investment Thesis

- **Ticker / Name**: CBRS – Cerebras Systems (Nasdaq; wafer-scale AI inference)
- **Date**: 2026-10-14
- **Time Horizon**: 5 years
- **Benchmark (annual)**: 6.5%
- **Target CAGR (Hurdle)**: 12%
- **Industry Layer**: none yet (candidate: merchant AI accelerators / inference; overlaps [cloud-ai-ecosystem](industry/cloud-ai-ecosystem.md) and the Ethernet-vs-alternatives battle in [ai-networking](industry/ai-networking.md))
- **Findings doc**: [docs/research/tickers/cerebras-systems.md](../research/tickers/cerebras-systems.md) (deep-research run, 2026-10-13; confirm pass 6/6 PASS @ 0.80 vs Q2 2026 10-Q + 3 S-1 claims verbatim-confirmed); [docs/research/tickers/cerebras-customer-economics.md](../research/tickers/cerebras-customer-economics.md) (customer-economics deep dive, 2026-10-23)

- **Model Settings**
    - Engine: fermat-pascal-v1
    - Monte Carlo: false, paths: 0
    - Kelly scale: 0.5

- **Position**
    - Current shares: 0 (watchlist; tracked via `data/analysis/watchlist.json`)
    - Current portfolio weight: 0%
    - Constraints: min 0%, max 5%
    - Max Kelly weight (model): 0% — expected return is negative from the current price

---

## 1. Business Snapshot

### 1.1 What the company does

- Core business / segments:
    - **Hardware (CS-3 systems)**: wafer-scale WSE-3 processor (4T transistors, ~900K cores, 44 GB on-chip SRAM, TSMC 5nm) sold as CS-3 appliances; CS-4 (3× WSE-3 Turbo, Nexus rack) announced 2026-08-18.
    - **Cloud / inference services**: Cerebras Cloud (launched Aug 2024) — take-or-pay Dedicated Capacity and per-token On-Demand contracts; distribution via AWS Marketplace, Microsoft Marketplace, IBM watsonx, OpenRouter, Hugging Face, Vercel. Cloud was $126.0M of $180.1M Q2 2026 revenue (70%).
- Geography / customer concentration:
    - FY2025: MBZUAI 62% / G42 24% of revenue (FY2024: G42 85%); Q2 2026: Customer A 34% / B 32% / C 10%. UAE-related parties still dominate receivables (76% in two customers at 2026-06-30).
- Business model in one sentence:
    - Sells the fastest AI decode/inference (wafer-scale SRAM beats HBM bandwidth limits) as systems and as a cloud, anchored by a >$20B multi-year OpenAI capacity contract.

### 1.2 Why this is in my universe

- Thesis type:
    - Watchlist: category-defining inference architecture with real backlog, currently priced past its base case, with the two decisive unknowns (SemiAnalysis Nvidia-for-decode report; ~171M-share lockup expiry ~2026-11-09) resolving within weeks.
- My edge / variant perception vs market:
    - The market is pricing CBRS as an OpenAI derivative. The under-priced question is architectural: whether decode disaggregation (accelerator prefill + wafer-scale decode, per the AWS and AMD deals) becomes standard — in which case Cerebras's wedge survives GPU roadmap progress — or whether GPUs absorb decode too (the bear/SemiAnalysis path).

### 1.3 Current valuation snapshot

- Price: 108.94 USD (2026-10-23; 52wk low 107.895); 41% below the $185 IPO price (2026-05-14/15). The $146.62→$108.94 slide had **no company-originated catalyst** (zero SEC filings since 2026-08-12): Maia 300 reveal (Oct 12), Oct 14 lockup tranche, TD Cowen target cut $275→$175 (Oct 19), pre-Nov-9 positioning.
- Trailing EPS / PE: GAAP deeply negative (IPO SBC + warrant amortization) / n.m.
- Core (non-GAAP): Q2 2026 net loss only $(6.9)M — near breakeven; FY2026 core revenue guide $880–890M, core GM 41–43%. GAAP GM Q2 was **14%** (hardware 2%, cloud 20%) after $44.3M warrant amortization (mostly G42-linked; OpenAI-linked only $2.5M).
- P/S: ~32x FY2026 core guide at ~$28B market cap
- Net liquidity: $7.4B cash+restricted + $1.2B securities + undrawn $850M revolver (2026-06-30); H1 2026 FCF ≈ $(596)M (OCF $(47.5)M − capex $548.9M)
- 52-week range: $115.13–$386.34 (IPO-era range); stock debuted +68% at $311

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
    - GPU decode catches up / OpenAI shifts decode to Nvidia (SemiAnalysis report) — the RPO anchor and the speed premium die together.
    - Concentration: top-3 customers = 76% of Q2 revenue; receivables 76% in two names.
    - Export controls: UAE exposure (D:1/D:4 country groups); G42/MBZUAI export licenses revocable.
    - TSMC sole-source, no long-term supply commitments.
- Financial risks:
    - OpenAI WC loan ($918.2M) accelerates if the MRA terminates other than for OpenAI breach.
    - Fixed-cost leases (~$2.25B) vs consumption-priced contracts — model mismatch flagged in the 10-Q.
    - Warrant amortization suppresses GAAP revenue/margin through 2031; serial dilution embedded in the customer-acquisition model.
- Market-structure risks:
    - **Lockup is staggered, not a single expiry** (S-1 lock-up section, verbatim): early releases of 6.7% of each holder's Eligible Securities on Aug 19 / Sep 2 / Sep 16 (elapsed) and **8.9% on Sep 30 / Oct 14 (elapsed) / Oct 28 (upcoming)**; up to ~171.1M shares total early-releasable (incl. ~15M directors/officers, vs 103.2M Class A outstanding); full expiry ~2026-11-09 (180 days post-prospectus — the Q3 print lands Nov 12, so the 180-day prong binds, not the post-earnings prong). Release ≠ sale, but the supply calendar is still running.
- Explicit thesis-kill triggers (for the watchlist thesis itself):
    - Any filing disclosing an OpenAI MRA tranche miss, termination, or material renegotiation.
    - Q3 2026 core revenue below the $214M guide low end.
    - Confirmation (at source) that OpenAI's future decode runs on Nvidia — unless explicitly prefill-only framing.

---

## 4. Scenario Design – Fermat–Pascal Three States

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

## 5. Quantitative Summary & Model Check

- Expected annualized return (CAGR): **≈ +2.5%** (scenario-weighted from $108.94 / ~109× the $1.00 FY2027 core-EPS base; was −3.4% at $146.62 — the price decline improves but does not clear the hurdle)
- Expected 5-year multiple: **~1.13×** (0.25 × 2.94 + 0.40 × 0.91 + 0.35 × 0.10)
- Fair value range today: **~50–70 USD** — the zone where the probability-weighted return clears the 12% hurdle (entry math: ~$70 clears 12%)

- Kelly outputs:
    - Full Kelly: 0% (negative expected return).
    - Scaled Kelly: 0%. Position policy is **watchlist only** until price or probabilities move.

### 5.1 Interpretation vs benchmark and hurdle

- Benchmark: 6.5%; hurdle: 12%. Expected ≈ +2.5% at $108.94: still fails both.
- Same shape as AEHR: genuinely strong business evidence (RPO, guide raise, AWS/AMD validation) at a price that requires the bull case. Unlike AEHR, two near-term events (Q3 print + lockup, ~Nov 9–15) will re-price it before any long thesis needs to act.
- Re-engagement rule: model clears the hurdle below ~$70, or at higher prices if (a) the SemiAnalysis claim is refuted at source and (b) FY2027 actuals raise the EPS base materially above $1.00.

---

## 6. Position Sizing & Trading Plan

### 6.1 Position policy

- Current: 0 shares (watchlist). Max allowed on entry: 5% (discretionary cap; Kelly currently 0%).
- Entry rule: consider a starter (≤2%) below ~$70 with thesis intact, or after the SemiAnalysis question resolves negatively for the bear path AND FY2027 guidance lifts the EPS base such that expected CAGR ≥ 12%.
- Add rule: raise toward scaled-Kelly sizing only after the `cbrs-openai-mra-intact-fy26` and `cbrs-fy2027-revenue-triple` predictions resolve favorably.
- Kill rule: thesis-kill triggers in §3.2 end coverage of the long thesis entirely.

### 6.2 Liquidity & execution

- Recent IPO with demonstrated ±10–20% event moves and a 171M-share unlock ahead — never hold through the lockup window without a resolved view on the SemiAnalysis question; stagger any entry.

---

## 7. Monitoring Checklist

### 7.1 Key metrics to track

- Q3 2026 print (~mid-Nov 2026): core revenue vs $214–216M guide; RPO balance QoQ; any OpenAI-tranche language.
- **The utilization chain: deployment → utilization → cloud revenue → gross margin** — contracted MW only matter if machines deploy on time, run at high utilization, convert to cloud revenue (core cloud +287% YoY in Q2), and hold core gross margin (41% Q2) as capacity scales.
- Lockup early-release windows **Oct 14 (elapsed — the stock fell through it, −10.5% on Oct 16 with no headline; absorption weak)** and **Oct 28** (8.9% of Eligible Securities each): watch volume vs price-decline absorption; then full expiry ~2026-11-09 and insider Form 4 cadence.
- Customer-letter distribution each 10-Q (A/B/C/D shares; AR concentration).
- AWS revenue emergence (Bedrock integration Q1 2027) and AMD partnership production ramp (Q4 2026).
- Warrant amortization trajectory and core-vs-GAAP margin bridge each quarter.

### 7.2 Scenario update triggers

- Toward Bull: OpenAI 1.25GW option exercised; AWS becomes a lettered ≥10% customer; SemiAnalysis claim refuted; CS-4 independent benchmarks confirming the speed gap.
- Toward Bear: confirmation of Nvidia-for-decode at OpenAI; Q3 guide miss; MRA renegotiation language; heavy lockup-absorption selling with no insider buys.
- Remain in Base: guide-consistent quarters, committed tranches delivering, optionality silent.

---

## 8. Evidence Log & Updates

Append-only log. Machine-readable records: `data/analysis/CBRS.evidence.jsonl`. Detailed notes: `docs/thesis/CBRS/`.

### 8.1 Log index

- Bull evidence file: `docs/thesis/CBRS/CBRS-bull-evidence.md`
- Base evidence file: `docs/thesis/CBRS/CBRS-base-evidence.md`
- Bear evidence file: `docs/thesis/CBRS/CBRS-bear-evidence.md`

### 8.2 High-level update entries (reverse chronological)

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
    - GPT-6.1 Ultrafast on Nvidia — three hypotheses: **swapped out** (Nvidia won on production TCO), **sold out** (Cerebras lacked capacity; market mispriced a supply problem as technology failure), **heterogeneous** (prefill/decode and latency/cost tiers split permanently across architectures). Read the original SemiAnalysis report to discriminate.
    - Customer B (32% Q2 revenue) identity — OpenAI by magnitude, unconfirmed in filings.
    - CS-3/CS-4 cluster fabric: Ethernet at scale? Whose? (Feeds the ANET Ethernet-dominance open question at `docs/thesis/ANET.md:526`.)
    - MRA delivery schedule: verify the article-claimed 250/500/750MW per-year tranches against the 424B4 or MRA exhibit (absent from the 10-Q and April S-1).
    - RPO survivability under OpenAI tranche-termination rights.
    - Utilization chain: which of deployment → utilization → cloud revenue → gross margin is the binding constraint? Q3 print should show whether the 600MW+ contracted capacity converts.
    - G42 post-IPO stake and Class N mapping (UNVERIFIED).
- Planned research:
    - Post-print `/thesis-update CBRS` on Q3 2026 results (~mid-Nov 2026) with confirm pass against the 10-Q.
    - Consider authoring `docs/thesis/industry/ai-accelerators.md` (merchant ASIC tier) if a second accelerator name joins coverage; cross-log the wafer-scale counter-architecture into ANET bear evidence after these findings are committed.

{% endraw %}
