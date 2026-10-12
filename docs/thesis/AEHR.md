---
---

{% raw %}

# AEHR – Investment Thesis

- **Ticker / Name**: AEHR – Aehr Test Systems
- **Date**: 2026-10-12
- **Time Horizon**: 5 years
- **Benchmark (annual)**: 6.5%
- **Target CAGR (Hurdle)**: 12%
- **Industry Layer**: none yet (candidate: semiconductor test / SiC–GaN power; AI angle overlaps [cloud-ai-ecosystem](industry/cloud-ai-ecosystem.md))
- **Findings doc**: [docs/research/aehr-initial-thesis.md](../research/aehr-initial-thesis.md) (deep-research run, 2026-10-12; confirm pass 6/6 PASS ≥ 0.80)

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
    - Watchlist: niche monopoly-ish capital-equipment story undergoing a demand-base rotation (SiC/EV → AI infrastructure), currently priced past its bull case.

- My edge / variant perception vs market:
    - The market prices AEHR as an AI momentum stock (~90× guided forward earnings); the scenario math says the base case is worth roughly half today's price.
    - The under-appreciated structural question is burn-in _intensity_: if AI-package values keep rising, 100% WLBI becomes standard (bull); if yields improve or sampling suffices, the category shrinks (bear, per AEHR's own risk factor).

### 1.3 Current valuation snapshot

- Price: 80.10 USD (2026-10-12, intraday)
- Trailing EPS / PE: −0.23 / n.m. (GAAP loss)
- Forward EPS / forward PE: ~0.85 (FY2027 guide midpoint, non-GAAP) / ~94. Note: yfinance analyst-consensus forward EPS is ~1.38 (forward PE ~57) — sell-side models well above the guide midpoint; this thesis deliberately models on the company's own guide, not consensus.
- P/S: ~55 trailing, ~20 forward-guided
- Market cap / EV: 2.61B / ~2.51B
- Net cash: ~106M (~3.26/share), no debt — but dilution-funded via FY2026 ATM sales (+97.2M financing)
- 52-week change: +244.8%; beta 3.48; short interest 16%

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
- Gross margin swung 49.1% → 35.3% (FY2024→FY2026) with mix and volume; guided recovery on FY2027 volume.
- Capital-light fabless-style model; new subcontractor for Sonoma final integration expands capacity without heavy capex.

### 2.3 Management & capital allocation

- Long-tenured team; executed the Incal acquisition that created the AI package-level leg (37% of FY2026 revenue vs 2% in FY2024).
- Opportunistic ATM issuance into strength ($25.89 → $73.87 tranches) built the cash fortress — good timing, but dilutive and repeated (new S-3 filed Aug 2026, terms unverified).
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
    - Backlog quality: POs cancellable with limited penalties; the FY2027 guide rests on the $100.6M effective backlog.
    - Customer re-concentration into 1–2 hyperscale AI accounts.
- Financial risks:
    - Valuation leaves no room for guide slippage (~90× guided earnings).
    - Serial dilution via ATM/S-3.
    - Tariffs raising cost of revenue (59% of FY2026 sales delivered outside the US).
- Governance / headline risks:
    - Key-person: unnamed officer death in FY2026; dismissed-then-stayed securities class action tied to the Lucid litigation.
- Explicit thesis-kill triggers (for the watchlist thesis itself):
    - Q1 FY2027 (2026-11-02) revenue materially below ~$25M run-rate → guide credibility breaks.
    - Evidence of a credible second WLBI supplier winning at the lead hyperscaler.
    - Lead AI customer pauses/cancels Sonoma or WLBI orders.

---

## 4. Scenario Design – Fermat–Pascal Three States

### 4.1 Shared baseline assumptions

- Starting EPS: **$0.85** = FY2027 guidance midpoint ($140M revenue × ~20% non-GAAP margin ≈ $28M) on ~32.6M shares. GAAP will be lower (SBC); the model runs on guided non-GAAP because trailing GAAP EPS is negative.
- Starting PE: ~94× (80.10 / 0.85).
- Time horizon: 5 years (to ~FY2031).
- Share count: assume continued modest dilution (ATM/S-3 history) roughly offsetting optionality; not modeled explicitly.
- Macro: AI capex cycle continues with normal digestion risk; SiC device market grows toward Yole's $11B-by-2031 after the 2027–28 correction.

### 4.2 Bull Case – "AI Burn-In Standard + SiC Recovery"

- JSON mapping: `prob`: 0.25, `growth.epsCagr`: 0.35, `valuation.exitPe`: 45

#### 4.2.1 Narrative

- WLBI becomes standard reliability screening for high-value AI packages; the lead hyperscaler ramps and the benchmarked second AI supplier converts to production orders.
- Sonoma owns ultra-high-power package burn-in for AI accelerators at OSATs.
- SiC recovers with the 200mm transition and 800V datacenter power; GaN and HBM contribute real revenue.
- Revenue approaches ~$500M by FY2031; non-GAAP EPS ~$3.8.

#### 4.2.2 Key assumptions

- FY2027 guide met or beaten; 25–35% revenue CAGR sustained through FY2029 before decelerating.
- Gross margin recovers toward 50%+ on volume and mix.
- No catastrophic cancellation from the lead AI customer.

#### 4.2.3 Why these numbers are reasonable

- Effective backlog ($100.6M) + order cadence ($41M Apr, $22M Aug, $6M Oct 2026) already covers most of the FY2027 low end.
- The company has done a 2.6–3× revenue year before (FY2021–FY2023 SiC ramp analog).
- 45× exit is a premium-but-seen multiple for a monopoly-ish niche equipment leader mid-cycle.

#### 4.2.4 Evidence & supporting material (Bull)

- `docs/thesis/AEHR/AEHR-bull-evidence.md`; findings doc §Guidance & recent bookings.

---

### 4.3 Base Case – "Guide Met, Then Deceleration"

- JSON mapping: `prob`: 0.45, `growth.epsCagr`: 0.20, `valuation.exitPe`: 30

#### 4.3.1 Narrative

- FY2027 lands in the guide ($130–150M); AI burn-in grows but stays concentrated in 1–2 hyperscale programs; SiC recovers slowly through the 2027–28 correction.
- Post-FY2027 growth decelerates to mid-teens as the AI comparison normalizes; revenue ~$300M and non-GAAP EPS ~$2.1 by FY2031.

#### 4.3.2 Key assumptions

- No major backlog cancellation; gross margin recovers to mid-40s.
- Concentration stays at roughly FY2026 levels (top customer ≤30%).

#### 4.3.3 Why these numbers are reasonable

- Matches "executes on what is already booked, then normalizes" — the default for a niche equipment vendor after a step-function year.

#### 4.3.4 Evidence & supporting material (Base)

- `docs/thesis/AEHR/AEHR-base-evidence.md`; findings doc §Customer concentration, §Industry context.

---

### 4.4 Bear Case – "Backlog Evaporates / Burn-In Intensity Falls"

- JSON mapping: `prob`: 0.30, `growth.epsCagr`: 0.05, `valuation.exitPe`: 20

#### 4.4.1 Narrative

- AI capex digestion or a lead-customer pause exposes backlog cancellability; FY2027 misses the low end.
- Yield improvements or sampling substitution cut burn-in intensity; SiC glut persists past 2028.
- Re-rating to a cyclical-equipment multiple (~20×); EPS ~$1.1 by FY2031.

#### 4.4.2 Why these numbers are reasonable

- The 10-K itself names both mechanisms (PO cancellability; failure-rate-driven demand destruction), and FY2025–26 already showed how fast revenue falls when one end-market stops (−15% and −32% YoY revenue quarters happened within this story).

#### 4.4.3 Evidence & supporting material (Bear)

- `docs/thesis/AEHR/AEHR-bear-evidence.md`; findings doc §Key risks.

#### 4.4.4 Tail risks beyond modeled Bear

- Export-control or China-related shocks (Asia 45.6% of revenue).
- Key-person loss atop the unnamed officer death in FY2026.

---

## 5. Quantitative Summary & Model Check

- Expected annualized return (CAGR): **≈ −0.5%** (scenario-weighted from $80.10 / ~94× guided forward EPS)
- Expected 5-year multiple: **~0.97×** (0.25 × 2.14 + 0.45 × 0.79 + 0.30 × 0.27)
- Fair value range today: **~40–55 USD** — the zone where the probability-weighted return clears the 12% hurdle (entry math: ~$44 clears 12%; current price needs the bull case to merely break even)

- Kelly outputs:
    - Full Kelly: 0% (negative expected return).
    - Scaled Kelly: 0%. Position policy is **watchlist only** until price or probabilities move.

### 5.1 Interpretation vs benchmark and hurdle

- Benchmark: 6.5%; hurdle: 12%. Expected ≈ −0.5%: fails both.
- This is a "great story, pre-paid price" situation: the business evidence is genuinely bullish (backlog, guide, diversification), but at ~90× guided earnings the bull case is the entry requirement, not the upside.
- Re-engagement rule: model clears the hurdle below ~$45, or at higher prices if FY2027 actuals raise the EPS base materially above $0.85.

---

## 6. Position Sizing & Trading Plan

### 6.1 Position policy

- Current: 0 shares (watchlist). Max allowed on entry: 5% (discretionary cap; Kelly currently 0%).
- Entry rule: consider a starter (≤2%) below ~$45 with thesis intact, or after FY2027 actuals reset the EPS base such that expected CAGR ≥ 12%.
- Add rule: raise toward scaled-Kelly sizing only after concentration and second-supplier predictions resolve favorably.
- Kill rule: thesis-kill triggers in §3.2 end coverage of the long thesis entirely.

### 6.2 Liquidity & execution

- Small-cap (~$2.6B) with high beta (3.48) and 16% short interest — violent moves both ways; stagger any entry; never chase post-earnings spikes.

---

## 7. Monitoring Checklist

### 7.1 Key metrics to track

- Quarterly revenue vs the ~$32.5M/quarter average implied by the FY2027 low end (next print 2026-11-02).
- Bookings/backlog cadence each quarter (watch for cancellation language).
- Customer count >10% and top-customer share in each 10-K/10-Q.
- Gross margin recovery trajectory (35.3% → target mid-40s+).
- S-3/ATM usage (dilution vs cash balance).

### 7.2 Scenario update triggers

- Toward Bull: second AI supplier production order; HBM/memory WLBI win; SiC orders from a second device maker; guide raise.
- Toward Bear: Q1 FY2027 revenue < ~$25M; backlog decline QoQ; lead-customer pause language; new dilution without order momentum.
- Remain in Base: guide-consistent quarters with stable concentration.

---

## 8. Evidence Log & Updates

Append-only log. Machine-readable records: `data/analysis/AEHR.evidence.jsonl`. Detailed notes: `docs/thesis/AEHR/`.

### 8.1 Log index

- Bull evidence file: `docs/thesis/AEHR/AEHR-bull-evidence.md`
- Base evidence file: `docs/thesis/AEHR/AEHR-base-evidence.md`
- Bear evidence file: `docs/thesis/AEHR/AEHR-bear-evidence.md`

### 8.2 High-level update entries (reverse chronological)

#### 2026-10-12 – Initial thesis from deep-research run

- What happened:
    - First coverage. Findings doc: `docs/research/aehr-initial-thesis.md` (3-subagent deep research; confirm pass 6/6 PASS ≥ 0.80 vs FY2026 10-K). Fiscal calendar corrected: FY ends Friday nearest May 31, moving to June 30 from FY2027; Q1 FY2027 prints 2026-11-02.
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
    - Q1 FY2027 run-rate vs guide (2026-11-02).
    - Identity/durability of lead hyperscale AI relationships; second-supplier conversion.
    - Aug 2026 S-3 shelf terms and dilution intent.
    - Named WLBI competitors; validity of the "only vendor offering both" claim.
    - Deceased-officer identity and key-person exposure (Sep 2026 proxy, DEF 14A filed 2026-09-09).
- Planned research:
    - Post-print `/thesis-update AEHR` on 2026-11-02 results with confirm pass against the 10-Q.
    - Consider authoring `docs/thesis/industry/semiconductor-test.md` if a second test-chain name joins coverage.
    - Fix vendored XBRL value extraction so future confirm passes can cross-check numbers (see findings doc §Filings-layer evaluation).

{% endraw %}
