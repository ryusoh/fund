---
---

{% raw %}

# ANET – Investment Thesis

- **Ticker / Name**: ANET – Arista Networks
- **Date**: 2025-11-14
- **Time Horizon**: 5 years
- **Benchmark (annual)**: 6.5%
- **Target CAGR (Hurdle)**: 12%
- **Industry Layer**: [AI Data Center Networking](industry/ai-networking.md)

- **Model Settings**
    - Engine: fermat-pascal-v1
    - Monte Carlo: false, paths: 0
    - Kelly scale: 0.5

- **Position**
    - Current shares: 2418.36
    - Current portfolio weight: ~26%
    - Constraints: min 0%, max 30%
    - Max Kelly weight (model): mid single digits (~5–7% full Kelly; ~2.5–3.5% scaled under current assumptions)

---

## 1. Business Snapshot

### 1.1 What the company does

- Core business / segments:
    - **Cloud / Data Center Switching (Classic Cloud)**
      High-performance Ethernet switches and routing platforms for hyperscale and large enterprise data centers (100G/200G/400G/800G).
    - **AI Networking (Back-End Fabrics)**
      Ultra-high-bandwidth Ethernet fabrics for GPU/accelerator clusters used in AI training and inference.
    - **Campus & Enterprise Networking**
      Campus/LAN switching, Wi-Fi, and CloudVision management for enterprises (“client-to-cloud” solutions).

- Geography / customer concentration:
    - Revenue predominantly from North America and other developed markets.
    - Strong concentration in a few hyperscalers (e.g. Microsoft, Meta), each often >10% of revenue.
    - Thousands of enterprise/campus customers, still smaller share vs cloud titans.

- Business model in one sentence:
    - Sells high-performance network hardware tightly integrated with EOS software and support, monetizing initial deployments plus ongoing support/maintenance.

### 1.2 Why this is in my universe

- Thesis type:
    - Quality compounder with cyclical exposure to capex cycles, plus secular AI/cloud growth and campus/routing optionality.

- My edge / variant perception vs market:
    - View Arista as:
        - Software-levered AI infrastructure, not just a generic box vendor.
        - Key beneficiary of Ethernet winning AI fabrics over time.
        - A business where classic cloud + campus provide a cash-flow base, while AI networking is a high-convexity call option.
    - Market may:
        - Overfocus on near-term AI hype or single customers, underweight long-term EOS/platform stickiness.
        - Underestimate non-NVDA accelerator ecosystems (AMD, TPUs, custom ASICs) where Arista can be default fabric.
        - Underprice execution and cyclicality risk in position sizing.

### 1.3 Current valuation snapshot

- Price: 177.24 USD (2026-10-28)
- Trailing EPS / PE: 3.17 / 55.9
- Forward EPS / forward PE: ~5.22 / ~33.9
- EV / EBITDA: 47.2
- Market cap / EV: 232.5B / 219.1B
- 52-week range: 114.52 – 217.41
- Volatility (used in model): 0.54

---

## 2. Business Quality & Moat

### 2.1 Moat / competitive advantage

- Sources of moat:
    - **EOS (Extensible Operating System)**
      Single, modular network OS across all platforms; reliable, programmable, loved by operators.
    - **Cloud Titan relationships**
      Deep co-design with hyperscalers on architectures, features, and roadmaps; design-in status on new fabrics.
    - **High-end segment focus & first-mover on speeds**
      Early on 100G/400G/800G+; large share of fast ports in DC → default choice for demanding workloads.
    - **Merchant-silicon leverage**
      Broadcom alignment: fast time-to-market and scale while focusing differentiation on EOS and system design.
    - **Operational excellence**
      Lean org, high revenue and profit per employee, strong execution record.

- Moat durability:
    - EOS + tooling (CloudVision, telemetry, automation) creates switching costs via scripts, playbooks, and culture.
    - Hyperscaler relationships are multi-year and operationally risky to unwind.
    - Moat could erode if:
        - White-box + open NOS (SONiC, FBOSS) become good enough at hyperscale.
        - Hyperscalers fully vertically integrate networking.
        - NVDA or others succeed with tightly bundled “AI factory” stacks that displace merchant-silicon + EOS.

### 2.2 Unit economics & returns

- Unit / contract economics (conceptual):
    - High ASP switches with mid-60s gross margins; very high incremental margin once EOS is built.
    - Support and software subscriptions are high-margin recurring revenue.
    - Capex intensity is low; fabless, outsourced manufacturing.

- Returns on capital:
    - Very high ROIC: minimal physical assets, strong margins, low working capital.
    - Cash pile plus buybacks → capital-light compounding.

- Cyclicality:
    - Revenue sensitive to cloud capex cycles and upgrade transitions (100→400→800G, AI islands).
    - Less tied to consumer macro; more to enterprise/cloud IT budgets and AI phases.
    - Risk of multi-quarter digestion periods after big build-outs.

### 2.3 Management & capital allocation

- Management quality:
    - CEO Jayshree Ullal and founding team are highly respected in networking.
    - Conservative external guidance, strong history of hitting/raising numbers.
    - Culture: engineering-driven, focused, non-bureaucratic.

- Capital allocation:
    - No debt; large net cash.
    - Uses cash for R&D, tuck-in M&A (campus/SD-WAN/security), and share buybacks.
    - No dividend so far.

- Alignment:
    - Significant insider ownership, long-tenured leadership.
    - Tendency to under-promise and over-deliver.

---

## 3. Key Drivers & Risk Map

### 3.1 Core value drivers (next 5 years)

- Volume drivers:
    - AI cluster build-outs → demand for 400G/800G/1.6T Ethernet fabrics.
    - Ongoing cloud DC upgrades for non-AI workloads.
    - Campus wins in large enterprises, universities, healthcare, etc.

- Price / mix:
    - Shift toward higher-speed ports and AI-optimized platforms.
    - Higher software and services mix (CloudVision, telemetry, automation).

- Margin drivers:
    - Premium pricing based on performance and reliability.
    - Scale in R&D and support vs opex growth.
    - Mix of AI + software vs lower-margin campus or highly competitive deals.

- Balance sheet:
    - Growing cash, ongoing buybacks.
    - No leverage risk; room for opportunistic deployment.

- Optionality:
    - Default AI Ethernet fabric for non-NVDA accelerators.
    - Expansion in routing, SD-WAN, security, observability.
    - More software/subscription revenue on top of EOS footprint.

### 3.2 Risk map and thesis killers

- Structural risks:
    - OCP/white-box + SONiC/FBOSS displace branded switches at hyperscale.
    - NVDA Spectrum-X bundling (GPUs + DPUs + switches) crowds out Arista.
    - AI capex cannibalizes classic DC and campus networking budgets more than expected.
    - Export controls or policy shocks impacting key customers.

- Financial risks:
    - Sharp slowdown in hyperscaler capex → multi-year stagnation.
    - Gross margin compression from price competition vs Cisco/NVDA/ODMs.
    - Buybacks concentrated at peak multiples.

- Governance / headline risks:
    - Key-man risk (Jayshree or core founders).
    - Major EOS bug/outage causing widespread downtime at a top customer.
    - Customer concentration incidents (loss or scaling back of a top-2 account).

- Explicit thesis-kill triggers:
    - Clear evidence that major hyperscalers standardize on NVDA/ODMs or in-house switches for new AI fabrics.
    - Sustained YoY revenue growth < mid-single digits with no credible new drivers.
    - Gross margin structurally in high-50s, with no path back.
    - Data showing Ethernet losing share to alternatives for AI.

---

## 4. Scenario Design – Fermat–Pascal Three States

This section documents how the JSON `scenarios` block maps to the thesis and why.

### 4.1 Shared baseline assumptions

- Starting EPS: forward-normalized EPS for 2025 (from market data).
- Starting PE: current price / forward EPS.
- Time horizon: 5 years.
- Balance sheet / share count:
    - Net cash, no debt.
    - Buybacks reduce diluted share count by ~1–2% per year in bull/base.
    - No equity issuance assumed.

- Macro / regime assumptions:
    - Interest rates roughly stable vs today.
    - Global AI/data-center capex grows, with normal cycles.
    - No long-lasting global recession that permanently derails cloud/AI demand.

- Macro vs company layer:
    - Macro: AI infra capex grows high-teens to mid-20s % for several years, then slows; general DC/campus mid-single to low-double digits.
    - Company: Arista keeps up with silicon roadmaps, maintains top-tier status with cloud titans, executes competently in campus.

---

### 4.2 Bull Case – “AI Ethernet Champion”

- JSON mapping:
    - `prob`: 0.35
    - `growth.epsCagr`: 0.28
    - `valuation.exitPe`: 38

#### 4.2.1 Narrative (world description)

- Ethernet becomes the default fabric for AI clusters.
- Arista becomes the leading AI Ethernet vendor; AI networking is a very large share of revenue.
- Cloud titans keep Arista as primary vendor for AI clusters; non-NVDA accelerators pair with Arista by default.
- Classic DC networking grows well as digestion ends and Arista gains more share from Cisco.
- Campus adoption accelerates; Arista becomes clear #2 in campus/enterprise switching.
- Margins stay close to best-in-class, with some upside from more software.

#### 4.2.2 Key assumptions

- Revenue / volume:
    - AI networking TAM in 2030 ~60–70B; Arista share ~30%+ → ~15–21B AI networking revenue.
    - Classic DC revenues grow high-teens %.
    - Campus grows 25–30% CAGR, reaching multi-billion scale.

- Margin structure:
    - Gross margin mid-60s to high-60s.
    - Operating margin mid-40s.

- Capital allocation:
    - Strong, steady buybacks funded by high FCF.
    - Only small, focused acquisitions.

- Optionality realized:
    - Arista as de facto AI Ethernet standard.
    - CloudVision/EOS subscriptions more meaningful.

#### 4.2.3 Why these numbers are reasonable

- AI build-out and networking intensity are very large.
- Arista is already winning fast-port and AI share.
- Campus is a big market; single-digit share is enough for multi-billion revenue.
- Combined, revenue and margin assumptions support EPS CAGR around 28% (matching the JSON bull scenario).

#### 4.2.4 Evidence & supporting material (Bull)

- Company:
    - Upward revisions to AI revenue expectations.
    - High-share AI design wins and strong commentary in calls and investor days.
    - Launch of R4 family (7020R4/7280R4/7700R4/7800R4) with Jericho 3-AI/3+ and HyperPort-capable 7800R4 modular chassis, explicitly targeting large AI clusters and scale-across DC/region networking (Arista press + The Next Platform coverage, Nov 2025).
- Industry / macro:
    - DC/AI Ethernet TAM forecasts with strong growth.
    - Trend of AI clusters moving from InfiniBand toward Ethernet.
    - Growing ecosystem focus on Ethernet-based “scale-up” and “scale-across” fabrics (e.g., large two-tier Clos topologies) for 50k–100k+ GPU/XPUs clusters and cross-datacenter AI complexes.
- Links / files:
    - `docs/thesis/ANET/ANET-bull-evidence.md`

---

### 4.3 Base Case – “Strong but Shared AI Winner”

- JSON mapping:
    - `prob`: 0.5
    - `growth.epsCagr`: 0.18
    - `valuation.exitPe`: 28

#### 4.3.1 Narrative (world description)

- AI networking is big and growing; share is split among Arista, NVDA, Cisco, ODMs.
- Arista remains a top-tier player with solid share, but not a monopoly.
- Classic DC grows modestly as cloud expands through cycles.
- Campus grows nicely from a small base; Arista is important but not dominant.
- Margins normalize slightly below peak but still strong.

#### 4.3.2 Key assumptions

- Revenue / volume:
    - AI networking TAM in 2030 ~40–50B; Arista share ~20% → ~8–10B AI revenue.
    - Classic DC revenue grows ~10–12% CAGR.
    - Campus grows ~15% CAGR; routing/adjacencies add incremental revenue.

- Margin structure:
    - Gross margin ~62–64%.
    - Operating margin low- to mid-40s.

- Capital allocation:
    - Buybacks + R&D.
    - Occasional small acquisitions.

#### 4.3.2a Driver-based revenue build (pilot, added 2026-10-23)

Machine-readable version lives in `data/analysis/ANET.json` base-scenario `drivers`
(survives nightly sync per WO-4a). FY2025 → FY2030, four legs:

| Driver                                | Formula             | Inputs         | FY2030 value | Source                                                                                                                                                  |
| ------------------------------------- | ------------------- | -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI fabrics (scale-out + scale-across) | AI TAM × share      | $45B × 20%     | **$9.0B**    | TAM 40–50B (thesis, secondary); cross-check: FY2026 AI goal ≥$3.5B (Q2'26 call, CFO) ⇒ 27% CAGR to 2030; scale-across TAM alone $15–20B by 2030 (Ullal) |
| Core DC frontend + routing            | FY26 base × 1.11⁴   | $6.2B × 1.11⁴  | **$9.4B**    | FY26 base derived: $12.6B guide − $3.5B AI − $1.25B campus − ~$1.65B service                                                                            |
| Campus & enterprise                   | FY26 goal × 1.15⁴   | $1.25B × 1.15⁴ | **$2.2B**    | FY2026 campus goal ≥$1.25B (Q2'26 call)                                                                                                                 |
| Services (PCS/subscriptions)          | FY25 actual × 1.15⁵ | $1.43B × 1.15⁵ | **$2.9B**    | FY2025 service revenue $1,428.8M (10-K)                                                                                                                 |

- **Derived**: revenue $23.5B (FY2030) × net margin 39% (FY2025 and H1'26 both 38.9%) ÷ 1,276M diluted shares (flat: buybacks ≈ SBC) = **EPS ~$7.18**.
- **Reconciliation**: ~21% EPS CAGR from FY2025 ($2.74) — _above_ the scenario's `epsCagr` 0.18. The scenario stays at 0.18 (the build is one day old; promote only after it survives a quarterly reconciliation). The gap is the upside the driver model makes visible.
- **Falsification drivers** (registered as dated predictions, swept by `prediction_sweeper.py`): `anet-ai-fabrics-fy26` (≥$3.5B), `anet-campus-fy26` (≥$1.25B), `anet-fy26-revenue-guide` (≥$12.6B), `anet-third-10pct-customer-fy26`.

#### 4.3.3 Why these numbers are reasonable

- Matches a “meets expectations” path:
    - AI tailwind, but competitive.
    - Campus accretive, not explosive.
    - Some pricing pressure but margins remain above peers.
- This yields EPS CAGR around 18% (matching the JSON base scenario).

#### 4.3.4 Evidence & supporting material (Base)

- Company:
    - Current guidance and revenue mix.
    - AI and campus targets.
- Industry / macro:
    - DC/AI networking forecasts with multiple strong vendors.
- Links / files:
    - `docs/thesis/ANET/ANET-base-evidence.md`

---

### 4.4 Bear Case – “Capex Hangover & Competition Bite”

- JSON mapping:
    - `prob`: 0.15
    - `growth.epsCagr`: 0.08
    - `valuation.exitPe`: 20

#### 4.4.1 Narrative (world description)

- Hyperscaler capex slows sharply after an AI boom; multi-year digestion.
- NVDA Spectrum-X, white-box switches, and in-house designs take meaningful share in AI and classic DC.
- Campus penetration disappoints.
- Arista is still profitable but looks more like a mature cyclical.

#### 4.4.2 Key assumptions

- Revenue / volume:
    - AI networking TAM grows, but Arista’s share stagnates or declines into low/mid-teens.
    - Classic DC revenues are flat to low-single-digit growth, with occasional declines.
    - Campus remains sub-scale.

- Margin structure:
    - Gross margin high-50s to about 60%.
    - Operating margin mid-30s.

- Capital allocation:
    - Slower buybacks; focus on preserving cash and R&D.

#### 4.4.3 Why these numbers are reasonable

- Networking history includes long capex hangovers and price wars.
- Customer concentration makes share loss from a few large decisions hurt.
- EPS CAGR around 3% reflects sluggish revenue and some margin compression.

#### 4.4.4 Evidence & supporting material (Bear)

- Company:
    - Signals of weaker bookings, price pressure, or share loss.
- Industry / macro:
    - Rapid NVDA/ODM share gains, DC capex slowdown.
- Links / files:
    - `docs/thesis/ANET/ANET-bear-evidence.md`

#### 4.4.5 Tail risks beyond modeled Bear

- Major EOS security or stability event requiring recalls or mass replacements.
- Regulatory or geopolitical events that disrupt manufacturing or customer operations.
- Structural shift to alternative fabrics that make Ethernet less relevant for AI.

---

## 5. Quantitative Summary & Model Check

- Expected annualized return (CAGR): ~8.0% (scenario-weighted, engine-computed on refreshed market data 2026-10-28: price $177.24, trailing EPS $3.17, horizon 5; weights bull 0.35 / base 0.5 / bear 0.15)
- Expected exit multiple: ~30x probability-weighted across 38x / 28x / 20x (5-year expected price multiple 1.469x)
- Fair value range today: ~100–130 USD per share (base-case band; unchanged — scenario growth/exit params unchanged, only probabilities moved)

- Kelly outputs:
    - Full Kelly weight: mid single digits (~5–7% of portfolio).
    - Scaled Kelly weight (× kellyScale = 0.5): ~2.5–3.5% as practical cap.

### 5.1 Interpretation vs benchmark and hurdle

- Benchmark return: 6.5%
- Target (hurdle) CAGR: 12%

- Commentary:
    - Scenario-weighted expected return with the updated weights (bull 0.35 / base 0.5 / bear 0.15) is ~8.0% CAGR, modestly above the 6.5% benchmark but still below the 12% hurdle. This is consistent with “great business, pretty full price” from today’s ~34x forward P/E.
    - Upside depends on some combination of: (a) the bull outcome (“AI Ethernet champion”) being realised or getting repriced sooner, and/or (b) the market sustaining a structurally higher exit multiple than the probability-weighted ~30x we are using here.
    - Downside in the bear case remains meaningful (slower growth plus multiple compression toward ~20x), so the model still points to mid single‑digit full‑Kelly and low‑single‑digit scaled‑Kelly sizing; going materially above that is a discretionary conviction call rather than what the math alone would recommend.

---

## 6. Position Sizing & Trading Plan

### 6.1 Position policy

- Target weight range:
    - Normal target: 2–4% of portfolio (around the scaled Kelly range).
    - Max allowed (constraints): 10–15% (discretionary risk cap, well above model).
    - Model-justified max (scaled Kelly): ~1.5–2%.

- Entry / add rules:
    - Add or overweight when:
        - Expected 5-year CAGR ≥ 12–15%.
        - Price trades well below base-case fair value (e.g., < ~100) without thesis-kill evidence.
        - New information shifts probability toward Bull (big AI wins, Ethernet wins vs NVDA/IB).

- Trim / exit rules:
    - Trim when:
        - Expected 5-year CAGR drops near/below benchmark due to price run-up.
        - Price trades far above bull-case value without fundamentals catching up.
        - Position drifts above risk cap (15%).
    - Exit or major downsize when:
        - Thesis-kill triggers: structural share loss, margin collapse, structural AI/Ethernet disappointments.

### 6.2 Liquidity & execution

- Liquidity considerations:
    - Large-cap, ample daily volume.
    - Easy to move several % of portfolio with low market impact.

- Execution notes:
    - Stagger entries across volatility events (earnings, macro).
    - Use pullbacks during AI/tech sentiment scares to add, if thesis intact.

---

## 7. Monitoring Checklist

### 7.1 Key metrics to track

- Business KPIs:
    - AI networking revenue and growth.
    - Port mix (100G vs 400G vs 800G+).
    - Campus and enterprise revenue growth, notable logos.
    - Customer concentration (MSFT/META share).

- Financials:
    - Revenue growth by segment where disclosed.
    - Gross and operating margin trends.
    - FCF and cash balance.
    - R&D and S&M as % of revenue.

- Qualitative:
    - Cloud titan commentary on networking architectures.
    - NVDA, Cisco, ODM announcements on AI networking.
    - EOS/CloudVision feature roadmap, routing/SD-WAN/security expansions.
    - Management and board changes, capital allocation moves.

### 7.2 Scenario update triggers

- Signals toward Bull:
    - AI networking beat-and-raise pattern.
    - Large AI fabric wins, especially with non-NVDA accelerators.
    - Evidence of Ethernet clearly beating InfiniBand for large clusters.
    - Campus growth >25–30% with marquee deployments.

- Signals toward Bear:
    - Material slowdown in hyperscaler orders.
    - NVDA/ODM share growing faster than Arista’s in AI/DC switching.
    - Step-down and persistence in gross margin.
    - Clear hyperscaler pivot to in-house or white-box.

- Signals we remain in Base:
    - Arista hitting guidance with moderate beats.
    - Healthy but not explosive AI share; active but not dominant competition.
    - Double-digit but not hyper growth in campus.
    - Margins stable within a narrow range.

---

## 8. Evidence Log & Updates

Append-only log of new information and how it affects Bull/Base/Bear.
Detailed notes live under `docs/thesis/ANET/`.

### 8.1 Log index

- Bull evidence file: `docs/thesis/ANET/ANET-bull-evidence.md`
- Base evidence file: `docs/thesis/ANET/ANET-base-evidence.md`
- Bear evidence file: `docs/thesis/ANET/ANET-bear-evidence.md`

### 8.2 High-level update entries (reverse chronological)

#### 2026-10-28 – Deep-research synthesis: bear weight raised, sizing override documented

- What happened:
    - Full multi-agent deep-research run ([findings doc](../research/tickers/anet-deep-research-2026-10.md)); confirm pass verified 12/12 load-bearing claims (7 via filings adapter at 0.80 confidence, 5 via direct source fetch).
    - Operations confirmed: Q2'26 $3,035.7M (+37.7%), RPO **$8.4B** at 2026-06-30 (belief_state corrected — the $6.1B it carried was the FY25 year-end figure), deferred revenue $6.87B, Q3 guide ~$3.3B for the **2026-11-03** print.
    - Red team landed structural hits: Spectrum-X **is** Ethernet (+2.6x YoY, NVDA Q2 FY27 call) — the "Ethernet wins ⇒ Arista wins" bull syllogism is broken; GAAP GM 62.9% vs 65.2% on large-customer mix + memory/silicon inflation; zero buybacks H1'26; top-2 at 42% with Meta-Broadcom custom silicon extended through 2029 and Microsoft SONiC at 800GbE.
    - Log hygiene: two evidence-log entries marked superseded (`valid_to` 2026-10-28): the 2026-02-15 "$850M AI revenue" entry (irreconcilable with filings — Arista discloses no AI revenue line) and the 2026-07-20 "Spectrum-X launch" entry (launched 2024, misdated).
- Impact on scenarios:
    - **Bull 0.40 → 0.35, Bear 0.10 → 0.15** (Base 0.50 unchanged). Two resolved predictions went bear-direction and the 0.10 bear weight contradicted this thesis's own evidence_against list; evidence-weighted honesty argues for moving now rather than waiting for the Q3 print. Not raised higher: no bear leg is yet _confirmed_ (GM declining within guide; no observed Arista share loss; credit-financing fear is sentiment, not orders).
    - `epsCagr` / `exitPe` unchanged in all scenarios — the driver build's first reconciliation is the Q3 print.
- Impact on assumptions:
    - Derived block recomputed (lab.js engine: trailing EPS $3.17, price $177.24, horizon 5): expectedMultiple 1.469, expectedCagr **8.0%** (stored 7.28% was stale — old weights on refreshed market data would have read 9.29%), weighted exit P/E 30.3x. Kelly ≈ unchanged (full 6% / scaled 3%).
    - New predictions registered: `anet-q3-fy26-print` (Q3 ≥ $3.3B, resolves ~2026-11-03) and `anet-fy26-gm-guide` (FY26 GM inside 62–64%).
- Action:
    - **HOLD.** The ~26% position vs ~3% scaled Kelly is now explicitly documented in the decision journal as a discretionary override with kill conditions, not silently carried. Bear evidence file (`ANET-bear-evidence.md`) populated — it was an empty stub.
- TODO:
    - Q3 print 2026-11-03 after close: revenue vs ~$3.3B, GAAP GM vs 62–64% guide, deferred-revenue trajectory, purchase commitments, 4th FY raise?, third ≥10% customer language → reconcile against decision-journal expected outcomes (review date 2026-11-04).
    - Get third-party AI-Ethernet share data (Dell'Oro/Crehan/IDC) for Spectrum-X vs EtherLink in 2026 builds.

#### 2026-10-23 – Driver-model pilot (WO-4c) + prediction housekeeping

- What happened:
    - Ingested ANET into the filings workspace (FY2025 10-K `fil_0001596532-26-000013`, Q2 FY2026 10-Q `fil_0001596532-26-000175`) and built the base scenario's four-driver revenue model (§4.3.2a) from verified anchors: FY2025 revenue $9,005.7M (+28.6%), GM 64.1%, net income $3.5B [10-K, confirm pass 80%]; Q2'26 revenue $3,035.7M (+37.7%), H1 op margin 44.1% [10-Q]; FY2026 guide raised 3x to $12.6B with AI fabrics ≥$3.5B and campus ≥$1.25B goals [Q2'26 earnings call 2026-08-04, primary].
    - Resolved two stale predictions FALSE: `anet-top2-cust-conc-fy25` (FY2025 top-2 = 42%, up from 35% — concentration rose, 10-K `s_0003_c09`) and `anet-ai-rev-fy25` (mis-specified: Arista never discloses AI revenue in SEC filings; superseded by `anet-ai-fabrics-fy26`).
    - Registered four dated falsification-driver predictions; aligned the stale §4.2/4.3/4.4 JSON-mapping lines and §1.3 snapshot with `ANET.json` (bull 0.4/0.28/38, base 0.5/0.18/28, bear 0.1/0.08/20; price $184.33).
- Impact on scenarios:
    - Unchanged: Bull 0.4 / Base 0.5 / Bear 0.1. The driver build implies ~21% base EPS CAGR vs the scenario's 18% — held as documented upside, not promoted, until the build survives one quarterly reconciliation (Q3 print ~early Nov 2026, then FY2026 call ~Feb 2027).
- Impact on assumptions:
    - None to scenario parameters. Belief state refreshed (guide raises, backlog/deferred-revenue evidence, supply-securement; concentration rose to 42%).
- Action:
    - HOLD. Next reconciliation: Q3 FY2026 print (~early Nov 2026) — check revenue vs ~$3.3B guide, GM vs ~63%, and any AI-fabrics trajectory language.
- TODO:
    - Watch for the third ≥10% customer disclosure (Q4 2026 / FY2026 10-K); 1.6T trials H2 2026 → production 2027; supply-chain commentary vs the "~2028" industry-tightness framing.

#### 2025-11-04 – Arista R4 family (7800R4 etc.) for AI-scale and scale-across networks

- What happened:
    - The Next Platform and Arista’s own news/blogs detailed the launch of the R4 family (7020R4/7280R4/7700R4/7800R4) using Broadcom Jericho 3-AI/3+ with deep buffers and 3.2 Tbps HyperPorts, aimed at building large two-tier Clos networks and scale-across interconnects for 50k–100k+ GPU/XPUs clusters and cross-datacenter AI fabrics.

- Impact on scenarios:
    - Bull: Qualitatively strengthens the “AI Ethernet champion” path; no explicit change to numeric probability yet.
    - Base: Consistent with expectations for Arista to be a key AI Ethernet vendor; no change.
    - Bear: Slightly weakens the argument that Ethernet cannot scale technically, but competitive and share risks remain.

- Impact on assumptions:
    - Confirms that current EPS CAGRs and exit P/Es in Bull/Base are technically plausible given Arista’s platform roadmap; no changes made.

- Action:
    - Hold; continue to monitor customer adoption (clouds, neoclouds, AI-specialist SPs) and commentary on AI-scale deployments.

- TODO:
    - Track follow-on customer announcements and deployments using 7800R4/HyperPorts; watch 2026–2027 commentary on Ethernet AI fabrics vs InfiniBand/NVSwitch/Spectrum-X.

#### {{YYYY-MM-DD}} – {{Event title}}

- What happened:
    - {{Short description + link / source}}
- Impact on scenarios:
    - Bull: {{e.g., probability +5% → 0.30, or no change}}
    - Base: {{…}}
    - Bear: {{…}}
- Impact on assumptions:
    - {{Changes to epsCagr / exitPe in any scenario?}}
- Action:
    - {{Hold / add / trim / exit / no action}}
- TODO:
    - {{Further research, data to watch next quarter}}

(Repeat a block like this for each new material event.)

---

## 9. Open Questions / Research To-Do

- Unresolved uncertainties:
    - Durability of Arista’s AI share vs NVDA/ODMs over a full cycle.
    - Realistic campus/enterprise scale by 2030+.
    - Whether Ethernet fully dominates AI fabrics or alternative architectures gain share.
    - Extent of hyperscaler push toward white-box and open NOS.

- Planned research:
    - Latest Arista 10-K/10-Q and AI-focused investor materials.
    - Dell’Oro / IDC on DC/AI Ethernet and NVDA/ODM share.
    - Hyperscaler earnings calls on networking choices.
    - Technical deep-dive on NVDA Spectrum-X and alternative fabrics.

{% endraw %}
