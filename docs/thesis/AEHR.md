---
---

{% raw %}

# AEHR – Investment Thesis

- **Ticker / Name**: AEHR – Aehr Test Systems
- **Date**: 2026-11-04
- **Time Horizon**: 5 years
- **Benchmark (annual)**: 6.5%
- **Target CAGR (Hurdle)**: 12%
- **Industry Layer**: none yet (candidate: semiconductor test / SiC–GaN power; AI angle overlaps [cloud-ai-ecosystem](industry/cloud-ai-ecosystem.md))
- **Findings docs**: [initial thesis](../research/tickers/aehr-initial-thesis.md) (2026-10-12; confirm pass 6/6 PASS ≥ 0.80); [Q1 FY2027 earnings](../research/tickers/aehr-q1-fy2027-earnings.md) (2026-11-04; fresh-context confirm pass 9 groups confirmed, 2 wording revisions)

- **Model Settings**
    - Engine: fermat-pascal-v1
    - Monte Carlo: false, paths: 0
    - Kelly scale: 0.5

- **Position**
    - Watchlist: 0 shares (tracked via `data/analysis/watchlist.json`); live portfolio data is pipeline-owned — see `data/analysis/AEHR.json`.
    - Constraints: min 0%, max 5%
    - Max Kelly weight (model): a model output, not a fixed number — see `data/analysis/AEHR.json` `derived.kelly` and the analysis lab.

---

## 1. Business Snapshot

### 1.1 What the company does

- Core business / segments:
    - **Wafer-level test & burn-in (FOX platform)**: FOX-XP/NP/CP systems plus proprietary **WaferPak** full-wafer contactors and DiePak carriers — burn-in and stabilization of every die on up to 300mm wafers in parallel.
    - **Package-level burn-in (Sonoma/Tahoe/Echo, via Incal acquisition)**: ultra-high-power package burn-in targeting AI accelerators, GPUs, HPC processors.
    - **Consumables + services**: WaferPak contactors are recurring, design-locked consumables.

- Geography / customer concentration:
    - FY2026: Asia 45.6%, US 41.3%, Europe & ME 13.1%.
    - Top-5 customers ~70% of revenue; top customer 26.3% (down from 67.3% in FY2024). Customers are never named in filings.

- Business model in one sentence:
    - Sells burn-in/test capital equipment plus design-locked consumable contactors whose volume tracks customer device production.

### 1.2 Why this is in my universe

- Thesis type:
    - Watchlist: niche monopoly-ish capital-equipment story undergoing a demand-base rotation (SiC/EV → AI infrastructure); Q1 FY2027 strengthened near-term execution, but the scenario return still fails the hurdle.

- My edge / variant perception vs market:
    - The market prices AEHR as an AI momentum stock; the scenario math continues to separate a strong one-year equipment ramp from a durable multi-year, cash-generative annuity.
    - The under-appreciated structural question is burn-in _intensity_: if AI-package values keep rising, 100% WLBI becomes standard (bull); if yields improve or sampling suffices, the category shrinks (bear, per AEHR's own risk factor).

### 1.3 Current valuation snapshot

Live valuation data is pipeline-owned and intentionally **not transcribed into this document** — see `data/analysis/AEHR.json` (`market` block auto-refreshed by `sync_configs`; `derived` block auto-recomputed from scenarios + market data) and the analysis lab. Dated prices/valuations belong only in §8.2 log entries and `decision_journal` entries as historical records.

Valuation-relevant context after Q1 FY2027 (reported 2026-11-02):

- The model uses a conservative **$0.895 starting EPS override**: $150M guided revenue × 20% minimum non-GAAP net margin ÷ 33.520M Q1 diluted weighted shares. This is not company-issued EPS guidance or sell-side consensus.
- Q1 GAAP net income was $7.181M ($0.21 diluted), but FY2026 GAAP EPS was −$0.23; one profitable quarter does not erase the prior loss history.
- Cash, equivalents, and restricted cash were $105.052M at Q1. FY2026 reported no debt and +$97.2M financing from dilutive ATM sales; remaining shelf capacity is unverified.

---

## 2. Business Quality & Moat

### 2.1 Moat / competitive advantage

- Sources of moat:
    - **WaferPak design-lock**: contactors are custom per device; qualification cycles are long, so consumables recur once a device ramps.
    - **Full-wafer contact capability**: parallel burn-in of entire 300mm wafers is a hard engineering problem; AEHR is the established supplier for SiC WLBI.
    - **Only vendor spanning wafer-level + package-level burn-in** (Sonoma) — sell-side claim (Jefferies), not yet verified against named competitors.
    - Installed base + correlation data with lead customers create switching costs.

- Moat durability / erosion paths:
    - Customer yield improvements reduce required burn-in intensity (explicit 10-K risk factor).
    - Lengthy customer qualification cuts both ways: new competitors face the same barrier, but so does AEHR at new accounts.
    - Named competitors are not established from primary sources — moat breadth is an open question, not a verified fact.

### 2.2 Unit economics & returns

- Systems are capital equipment (lumpy, cancellable POs); contactors are recurring consumables — FY2026 contactor revenue fell $19.9M on EV softness, showing consumables are volume-tied, not annuity-tied.
- Gross margin swung 49.1% → 35.3% (FY2024→FY2026) with mix and volume, then recovered to 47.5% GAAP / 48.5% non-GAAP in Q1 FY2027. Full-year durability remains unproven; Q1 operating cash flow was −$3.054M as receivables and inventory absorbed cash.
- Capital-light fabless-style model; new subcontractor for Sonoma final integration expands capacity without heavy capex.

### 2.3 Management & capital allocation

- Long-tenured team; executed the Incal acquisition that created the AI package-level leg (37% of FY2026 revenue vs 2% in FY2024).
- Opportunistic ATM issuance into strength ($25.89 → $73.87 tranches) built the cash fortress — good timing, but dilutive and repeated (remaining S-3/ATM shelf capacity unverified).
- Governance watch item: severance paid in FY2026 "due to the passing of an officer" (unnamed); CEO sold ~40k shares Aug 2026 (Form 4, secondary-source).

---

## 3. Key Drivers & Risk Map

### 3.1 Core value drivers (next 5 years)

- AI processor burn-in intensity: wafer-level migration for custom ASICs/GPUs (lead hyperscaler ramping; second supplier benchmarked).
- Silicon photonics: two customers ramping (lead + "global leader in networking" won Mar 2026).
- SiC recovery: 200mm transition + 800V datacenter power (~2027) re-opening the WLBI installed base; SiC glut clears 2027–28 (Yole).
- GaN and HBM/memory WLBI as optionality legs.

### 3.2 Risk map and thesis killers

- Structural risks:
    - Burn-in intensity falls (yield improvement / sampling substitution) — category-level risk stated in the 10-K.
    - Backlog quality: most POs are cancellable/reschedulable with limited penalties; effective backlog was $109.3M at 2026-11-01, but its fiscal-quarter delivery schedule is undisclosed.
    - Customer re-concentration into 1–2 hyperscale AI accounts; the second Sonoma processor increases exposure to the same lead customer.
- Financial risks:
    - Valuation leaves little room for guide slippage; see live engine outputs and the dated §8.2 snapshot.
    - Q1 operating cash flow was negative despite strong earnings; receivables and inventory amplify downside if orders slip.
    - Serial dilution via ATM/S-3.
    - Tariffs raising cost of revenue (59% of FY2026 sales delivered outside the US).
- Governance / headline risks:
    - Key-person: unnamed officer death in FY2026; dismissed-then-stayed securities class action tied to the Lucid litigation.
- Explicit thesis-kill triggers (for the watchlist thesis itself):
    - ~~Q1 FY2027 revenue materially below ~$25M~~ — **did not fire**: actual revenue was $33.007M on 2026-11-02.
    - Evidence of a credible second WLBI supplier winning at the lead hyperscaler.
    - Lead AI customer pauses/cancels Sonoma or WLBI orders.

---

## 4. Scenario Design – Fermat–Pascal Three States

### 4.1 Shared baseline assumptions

- Starting EPS: **$0.895** = revised FY2027 guidance ($150M revenue × 20% minimum non-GAAP net margin = $30M) ÷ 33.520M Q1 diluted weighted shares. This is a conservative floor-case override, not company EPS guidance; GAAP is lower after SBC and acquisition adjustments.
- Starting PE: calculated by the engine from the live pipeline price and `model.preferences.overrides.eps`; dated values are logged only in §8.2.
- Time horizon: five model compounding periods. The narrative terminal year is ~FY2031, four fiscal-year intervals after FY2027; this timing convention is an explicit model limitation, not a hidden extra year of operating forecast.
- Share count: future dilution is not modeled explicitly and is **not** assumed to be offset by optionality; share-count growth without corresponding per-share earnings growth is a Base/Bear falsifier.
- Macro: AI capex cycle continues with normal digestion risk; SiC device market grows toward Yole's $11B-by-2031 after the 2027–28 correction.

### 4.2 Bull Case – "AI Burn-In Standard + SiC Recovery"

- JSON mapping: `prob`: 0.25, `growth.epsCagr`: 0.35, `valuation.exitPe`: 45

#### 4.2.1 Narrative

- WLBI becomes standard reliability screening for high-value AI packages; the lead hyperscaler ramps and the benchmarked second AI supplier progresses from its planned evaluation cell to high-volume production orders.
- Sonoma owns ultra-high-power package burn-in for AI accelerators at OSATs.
- SiC recovers with the 200mm transition and 800V datacenter power; GaN and HBM contribute real revenue.
- Revenue approaches ~$500M by FY2031; non-GAAP EPS ~$4.0 under the engine's five-period convention.

#### 4.2.2 Key assumptions

- Revised FY2027 guide ($150M, at least 20% non-GAAP net margin) met or beaten; 25–35% revenue CAGR sustained through FY2029 before decelerating.
- Q1's 47.5% GAAP / 48.5% non-GAAP gross-margin recovery proves durable toward 50%+ on volume and mix.
- No catastrophic cancellation from the lead AI customer; the second supplier validates and adopts FOX-XP in production.

#### 4.2.3 Why these numbers are reasonable

- Q1 bookings were $46.7M and effective backlog $109.3M, arithmetically covering 93.4% of the remaining FY2027 revenue requirement; cancellability and delivery timing prevent treating that as contracted revenue.
- The company has done a 2.6–3× revenue year before (FY2021–FY2023 SiC ramp analog).
- 45× exit is a premium-but-seen multiple for a monopoly-ish niche equipment leader mid-cycle; Q1 does not justify raising it.

#### 4.2.4 Evidence & supporting material (Bull)

- `docs/thesis/AEHR/AEHR-bull-evidence.md`; Q1 findings doc §Claim-by-claim breakdown.

---

### 4.3 Base Case – "Guide Met, Then Deceleration"

- JSON mapping: `prob`: 0.50, `growth.epsCagr`: 0.20, `valuation.exitPe`: 30

#### 4.3.1 Narrative

- FY2027 meets the revised $150M guide: after $33.007M in Q1, Q2–Q4 average approximately $39.0M. AI burn-in grows but stays concentrated in 1–2 hyperscale programs; SiC recovers slowly through the 2027–28 correction.
- Post-FY2027 growth decelerates to high-teens as the AI comparison normalizes; revenue ~$300M and non-GAAP EPS ~$2.2 by FY2031 under the engine's five-period convention.

#### 4.3.2 Key assumptions

- No major backlog cancellation; gross margin remains in the mid-to-high 40s; receivables and inventory convert into cash as shipments ramp.
- Concentration stays at roughly FY2026 levels (top customer ≤30%).

#### 4.3.3 Why these numbers are reasonable

- Matches "executes on what is already booked, then normalizes" — the default for a niche equipment vendor after a step-function year. Q1 profitability, 1.4 book-to-bill, and $109.3M effective backlog support execution, while the 18.1% required remaining-quarter ramp preserves execution risk.

#### 4.3.4 Evidence & supporting material (Base)

- `docs/thesis/AEHR/AEHR-base-evidence.md`; Q1 findings doc §Baseline vs. new evidence and §Red-team case.

---

### 4.4 Bear Case – "Backlog Evaporates / Burn-In Intensity Falls"

- JSON mapping: `prob`: 0.25, `growth.epsCagr`: 0.05, `valuation.exitPe`: 20

#### 4.4.1 Narrative

- AI capex digestion or a lead-customer pause exposes backlog cancellability; FY2027 misses or cuts the revised $150M target.
- Yield improvements or sampling substitution cut burn-in intensity; working capital does not convert to cash; SiC glut persists past 2028.
- Re-rating to a cyclical-equipment multiple (~20×); EPS ~$1.1 by FY2031.

#### 4.4.2 Why these numbers are reasonable

- The 10-K itself names both mechanisms (PO cancellability; failure-rate-driven demand destruction), and FY2025–26 already showed how fast revenue falls when one end-market stops. Q1's negative $3.054M operating cash flow and $19.723M combined receivables/inventory cash use add a cash-conversion downside mechanism.

#### 4.4.3 Evidence & supporting material (Bear)

- `docs/thesis/AEHR/AEHR-bear-evidence.md`; Q1 findings doc §Red-team case.

#### 4.4.4 Tail risks beyond modeled Bear

- Export-control or China-related shocks (Asia 45.6% of revenue).
- Key-person loss atop the unnamed officer death in FY2026.

---

## 5. Quantitative Summary & Model Check

- Expected annualized return and five-year multiple: **pipeline-owned engine outputs** — see `data/analysis/AEHR.json` `derived.expectedCagr` / `derived.expectedMultiple` and the analysis lab. The dated post-Q1 calculation is recorded in §8.2 rather than duplicated here.
- Fair-value judgment range: **$45–50** under the current scenarios; the exact 12%-hurdle calculation is logged in §8.2. This range is a scenario input, not a live market quote.

- Kelly outputs:
    - Full Kelly: 0%.
    - Scaled Kelly: 0%. Position policy is **watchlist only** until price or probabilities move.

### 5.1 Interpretation vs benchmark and hurdle

- Benchmark: 6.5%; hurdle: 12%. The post-Q1 expected return improves but still fails both at the 2026-11-03 pipeline price.
- This remains a "great story, pre-paid price" situation: revenue, margins, bookings, backlog, and guidance improved, but durable second-customer adoption, realized diversification, multi-year recurrence, and cash conversion remain unproven.
- Re-engagement rule: model clears the hurdle below approximately **$48** under current assumptions, or at higher prices if actual per-share earnings and scenario evidence improve materially.

---

## 6. Position Sizing & Trading Plan

### 6.1 Position policy

- Current: 0 shares (watchlist). Max allowed on entry: 5% (discretionary cap; Kelly currently 0%).
- Entry rule: consider a starter (≤2%) below ~$48 with thesis intact, or after actuals reset the EPS base such that expected CAGR ≥ 12%.
- Add rule: raise toward scaled-Kelly sizing only after concentration, cash-conversion, and second-supplier predictions resolve favorably.
- Kill rule: thesis-kill triggers in §3.2 end coverage of the long thesis entirely.

### 6.2 Liquidity & execution

- Small-cap, high-beta trading can produce violent moves in both directions; check live pipeline metrics before execution, stagger any entry, and never chase post-earnings spikes.

---

## 7. Monitoring Checklist

### 7.1 Key metrics to track

- Q2–Q4 revenue vs the **$38.998M quarterly average** required to reach $150M after Q1; nine-month revenue below ~$105M would require >$45M in Q4.
- Bookings/backlog cadence and fiscal-quarter delivery timing (watch for cancellation/rescheduling language).
- Customer count >10% and top-customer share in each 10-K/10-Q; Q1 concentration remains undisclosed pending the 10-Q.
- Gross-margin durability after Q1's 47.5% GAAP / 48.5% non-GAAP recovery.
- Operating cash flow, receivables, and inventory conversion versus non-GAAP earnings.
- Second-supplier FOX-XP installation, validation, and any HVM production order.
- S-3/ATM usage and diluted share count (dilution vs per-share earnings growth).

### 7.2 Scenario update triggers

- Toward Bull: second AI supplier HVM production order; HBM/memory WLBI win; SiC orders from a second device maker; FY2028 guide consistent with the Bull path; strong cash conversion. The FY2027 guide raise fired, but was insufficient alone to raise Bull probability.
- Toward Bear: official FY2027 guide cut; nine-month revenue below ~$105M without identified Q4 coverage; backlog decline QoQ; lead-customer pause/insourcing; persistent negative cash conversion; new dilution without per-share earnings momentum.
- Remain in Base: revised-guide-consistent quarters, stable concentration, and improving cash conversion.

---

## 8. Evidence Log & Updates

Append-only log. Machine-readable records: `data/analysis/AEHR.evidence.jsonl`. Detailed notes: `docs/thesis/AEHR/`.

### 8.1 Log index

- Bull evidence file: `docs/thesis/AEHR/AEHR-bull-evidence.md`
- Base evidence file: `docs/thesis/AEHR/AEHR-base-evidence.md`
- Bear evidence file: `docs/thesis/AEHR/AEHR-bear-evidence.md`

### 8.2 High-level update entries (reverse chronological)

#### 2026-11-04 – Q1 FY2027 print: execution upgraded, WATCH retained

- What happened:
    - Aehr reported Q1 on 2026-11-02 (November 1 was the effective-backlog cutoff). Primary source: [SEC Exhibit 99.1](https://www.sec.gov/Archives/edgar/data/1040470/000165495426009385/aehr_ex991.htm). Findings: `docs/research/tickers/aehr-q1-fy2027-earnings.md` (four research workstreams + fresh-context confirm pass; 9 groups confirmed, 2 wording revisions).
    - Revenue $33.007M (+200% YoY, +75% sequentially); bookings $46.7M; backlog $100.9M; effective backlog $109.3M; GAAP/non-GAAP GM 47.5%/48.5%; GAAP EPS $0.21; non-GAAP EPS $0.28. FY2027 guide raised to $150M with non-GAAP net income at least 20% of revenue.
    - Second AI supplier has decided to purchase one FOX-XP evaluation cell for Taiwan OSAT validation, not an HVM award. Lead Sonoma customer ships/installs >12 systems/month and qualified a second processor. OCF was −$3.054M; receivables and inventory consumed $19.723M combined.
    - Official webcast exists, but no official public transcript/captions were found. Third-party transcript claims are quarantined in the findings doc and were not used for numeric scenario changes.
- Impact on scenarios:
    - Bull 0.25 unchanged / Base 0.45 → 0.50 / Bear 0.30 → 0.25. Near-term execution risk fell; durable multi-year Bull evidence did not increase enough to upgrade Bull.
- Impact on assumptions:
    - Starting EPS override $0.85 → **$0.895** ($30M guided minimum non-GAAP net income ÷ 33.520M Q1 diluted shares); EPS CAGRs 35%/20%/5% and exit P/Es 45/30/20 unchanged.
    - Dated valuation snapshot at the 2026-11-03 pipeline price of **$64.52**: expectedMultiple **1.3060×**, expectedCagr **5.4849%**, 12%-hurdle entry **$47.81**, fair-value judgment range **$45–50**. Full/scaled Kelly remain 0%.
- Action:
    - **WATCH / 0 shares.** `aehr-q1fy27-revenue` resolved TRUE ($33.007M ≥ $25M); `aehr-second-ai-supplier` remains open. Added a separate revised-guide prediction ($150M revenue and $30M non-GAAP net income).
- TODO:
    - Confirm Q1 10-Q concentration, inventory, receivables, equity, subsequent events, and backlog timing when filed; verify transcript-only claims against official audio/captions; track the $38.998M Q2–Q4 average revenue requirement and cash conversion.

#### 2026-10-12 – Initial thesis from deep-research run

- What happened:
    - First coverage. Findings doc: `docs/research/tickers/aehr-initial-thesis.md` (3-subagent deep research; confirm pass 6/6 PASS ≥ 0.80 vs FY2026 10-K). Fiscal calendar corrected: FY ends Friday nearest May 31, moving to June 30 from FY2027; Q1 FY2027 prints 2026-11-02.
- Impact on scenarios:
    - Initial probabilities set: Bull 0.25 / Base 0.45 / Bear 0.30.
- Impact on assumptions:
    - EPS base = $0.85 guided FY2027 non-GAAP midpoint; entry PE ~94×.
- Action:
    - WATCH (no position). Four dated predictions registered (`data/analysis/AEHR.json`).
- TODO:
    - Q1 FY2027 print 2026-11-02; resolve proxy/S-3/competitor open questions before any entry.

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
    - Q1 FY2027 10-Q concentration, inventory, receivables, equity detail, subsequent events, and backlog timing.
    - Identity/durability of lead hyperscale AI relationships; second-supplier evaluation, validation, and HVM conversion.
    - Remaining S-3/ATM shelf capacity and post-quarter dilution intent.
    - Named WLBI competitors; validity of the "only vendor offering both" claim.
    - Official audio/caption confirmation of transcript-only consumables, margin, capacity, and market-opportunity claims.
    - Deceased-officer identity and key-person exposure (Sep 2026 proxy, DEF 14A filed 2026-09-09).
- Planned research:
    - Re-run filings ingest and `/thesis-update AEHR` when the Q1 FY2027 10-Q posts.
    - Consider authoring `docs/thesis/industry/semiconductor-test.md` if a second test-chain name joins coverage.
    - ~~Fix vendored XBRL value extraction~~ — done 2026-10-13: XBRL statements return values and the FY2026 figures were cross-checked against the 10-K XBRL (see initial findings doc §Filings-layer evaluation).

{% endraw %}
