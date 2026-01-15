---
---

{% raw %}

# GOOG – Investment Thesis

- **Ticker / Name**: GOOG – Alphabet Inc.
- **Date**: 2025-11-15
- **Time Horizon**: 10 years
- **Benchmark (annual)**: 6.5% (approx. long-run equity market return)
- **Target CAGR (Hurdle)**: 12%

- **Model Settings**
    - Engine: fermat-pascal-kelly
    - Monte Carlo: false, paths: 10000
    - Kelly scale: 0.5

- **Position**
    - Current shares: (fill from portfolio)
    - Current portfolio weight: (fill from portfolio)
    - Constraints: min 0.0, max 0.25
    - Max Kelly weight (model): ~0.15 (scaled Kelly, heuristic)

---

## 1. Business Snapshot

### 1.1 What the company does

- Core business / segments:
    - **Google Services (Search, YouTube, Network, Android, Maps, Play, hardware, subscriptions)**
      Global search and advertising, online video (YouTube), mobile/desktop platforms (Android, Chrome), app store (Play), subscriptions (YouTube Premium, YouTube TV, Google One, Workspace consumer tiers), and first-party hardware (Pixel, Nest).
    - **Google Cloud (GCP + Workspace)**
      Infrastructure and platform cloud services (compute, storage, networking, data/analytics, ML/AI), plus SaaS (Workspace).
    - **Other Bets (Waymo, Verily, etc.)**
      Long-dated “moonshots” in autonomous driving, health/biology, logistics, and frontier tech.

- Geography / customer concentration:
    - Roughly half of revenue from the U.S., half from international markets.
    - Extremely diversified advertiser base; no material single-customer revenue dependence.
    - Some dependence on large distribution partners (e.g. Apple) for default search placement.

- Business model in one sentence:
    - Alphabet monetizes global attention, intent, and data via high-margin advertising, cloud/AI infrastructure, and subscription/platform services, reinvesting cash flows into AI, infra, and optionality bets.

### 1.2 Why this is in my universe

- Thesis type:
    - Quality compounder with AI/cloud growth and embedded options, priced like a mature mega-cap tech name.

- My edge / variant perception vs market:
    - Market still values Alphabet primarily as a maturing search/ads business; I see:
        - Under-appreciated **Cloud** earnings power and AI platform value.
        - **YouTube** as a structurally advantaged TV/streaming + subscription asset.
        - **Waymo/Other Bets** as cheap long-dated options with non-zero probability of becoming the next large leg.
        - Regulatory risk as serious but more likely to result in behavioral remedies and fines than value-destroying breakups.

### 1.3 Current valuation snapshot

- Price: ~277 USD (GOOG, Nov 2025)
- Trailing EPS / PE: ~8.5–9 / low-30s
- Forward EPS / forward PE: ~10–11 / mid-20s
- EV / EBITDA: low-20s (net cash >100B)
- Market cap / EV: ~3.0T / ~2.9T
- 52-week range: ~200 – ~300
- Volatility (used in model): ~0.32 (source: historical)

---

## 2. Business Quality & Moat

### 2.1 Moat / competitive advantage

- Sources of moat:
    - **Scale and data**: unmatched breadth and depth of search queries, web index, and user signals.
    - **Network effects**: more users → better results → better ROI for advertisers → more advertisers → better ads ecosystem.
    - **Distribution and defaults**: Android, Chrome, and paid default deals (e.g. Safari) keep Google front-and-center.
    - **AI and infra**: in-house TPUs, leading foundation models (Gemini, etc.), best-in-class data center infrastructure.
    - **Ecosystem**: Maps, Gmail, Drive, Photos, Docs, YouTube, Play Store – all reinforcing each other and increasing switching costs.
    - **Brand**: “Google” as a verb; strong trust/recognition in search, mail, maps, and video.

- Moat durability:
    - Likely durable over 10+ years:
        - User habit + default inertia + quality advantage in search and video.
        - Enormous AI/infra investments are hard to replicate.
    - Could be eroded by:
        - Regulation limiting defaults, bundling, or data use.
        - New AI interfaces/agents that bypass traditional search results pages.
        - Platform shifts (AR/VR, new OS layers) where Google fails to secure strong distribution.

### 2.2 Unit economics & returns

- Unit / contract economics (conceptual):
    - Ads:
        - Near-zero marginal cost per additional impression/click once infra/ranking systems are in place.
        - Very high incremental margins on additional ad revenue.
    - Cloud:
        - High upfront capex and R&D; strong operating leverage as utilization grows.
        - Margins scale into high-teens to ~30% range at mature scale.
    - Subscriptions:
        - High gross margin, relatively low incremental cost per subscriber.
    - Hardware:
        - Lower margins, but strategic to showcase AI and tightly integrate services.

- Returns on capital:
    - Very high ROIC in Services; reported ROIC diluted by heavy R&D and Other Bets losses.
    - Cloud ROIC rising as it scales and becomes consistently profitable.

- Cyclicality:
    - Ads: cyclical with macro and marketing budgets; can see declines in recessions.
    - Cloud: secular growth but can slow in downturns; typically more resilient than ads.
    - Other Bets: largely independent of macro (R&D-driven), but affect reported margins.

### 2.3 Management & capital allocation

- Management quality:
    - CEO Sundar Pichai: strong product/engineering background, has overseen the AI-first transition.
    - Experienced finance and product leadership; DeepMind and Google Research as AI “engines.”

- Capital allocation:
    - Large, consistent **buyback program**; modest dividend initiated.
    - Heavy but focused **R&D and capex** for AI and Cloud infra.
    - M&A: mostly small/tuck-in deals; large deals limited by antitrust scrutiny.

- Alignment:
    - Dual-class shares with founder control; long-term orientation, but some governance discount.
    - Management incentives tied to long-term equity value.

---

## 3. Key Drivers & Risk Map

### 3.1 Core value drivers (next 10 years)

- Volume drivers:
    - Continual growth in global digital ad spend and shift from offline → online.
    - Increases in **YouTube** consumption (especially CTV and Shorts).
    - Enterprise adoption of **Google Cloud** for data/analytics/AI workloads.
    - Growth in paid subscriptions (YouTube Premium/TV, Google One, Workspace).

- Price / mix:
    - Higher effective ad pricing via better AI targeting and optimization.
    - Mix shift toward higher-value ad formats (shopping ads, CTV, performance campaigns).
    - Cloud mix toward higher-margin platform and AI services vs commodity compute/storage.

- Margin drivers:
    - Operating leverage in Cloud and Services as revenue grows faster than core fixed costs.
    - Productivity and infra efficiency gains from AI (e.g. code gen, ops).
    - Opex discipline vs 2020–22 era (headcount/cost growth controlled).

- Balance sheet:
    - Net cash; no structural leverage risk.
    - High FCF supports sustained buybacks and dividends.

- Optionality:
    - **Waymo**: scalable robotaxi/logistics business.
    - Health/biology (Verily, Calico), logistics (Wing), other AI-native products.
    - External monetization of TPUs / AI infra to third parties.
    - Potential structural unlock (clearer segment disclosure or partial spin-outs).

### 3.2 Risk map and thesis killers

- Structural risks:
    - Antitrust and regulation:
        - Changes to default search deals, app bundling, or ad tech integration.
        - Possible structural remedies (forced divestitures) in the extreme.
    - AI disruption:
        - Agents or competing AI search experiences meaningfully displacing Google’s search funnel.
    - Platform shifts:
        - New OS/runtime layers (AR/VR, “super-apps”) where Google is not the default.

- Financial risks:
    - Deep or prolonged global ad recession.
    - Cloud price wars compressing margins and slowing growth.
    - Persistent high capex with underwhelming revenue/earnings response.

- Governance / headline risks:
    - Content moderation, misinformation, and brand safety issues on YouTube and Search.
    - Data privacy and security incidents.
    - Talent loss in AI/engineering.

- Explicit thesis-kill triggers:
    - Sustained global search share loss (e.g. <75%) or visible shift of ad spend to alternative AI/search channels.
    - Google Cloud revenue growth falling to low single digits for several years with no credible recovery path.
    - Major regulatory outcome that structurally breaks core integration (e.g. forced separation of ad tech and search) in a value-destructive way.
    - Multi-year EPS growth ≤3% without clear new growth drivers.

---

## 4. Scenario Design – Fermat–Pascal Three States

This section documents how the GOOG `scenarios` block is chosen and why.

### 4.1 Shared baseline assumptions

- Starting EPS: ~8.5–9
- Starting PE: low-30s on trailing, mid-20s on forward.
- Time horizon: 10 years
- Balance sheet / share count:
    - Net cash position persists.
    - Base/Bull: share count falls ~1.5–2% per year via buybacks.
    - Bear: share count roughly flat to slightly down.
- Macro / regime assumptions (mid-cycle):
    - Global nominal GDP ~3–4%.
    - Digital ad share of total ad spend continues to rise.
    - Cloud and AI spending grow faster than GDP.

- For macro-linked names (optional split):
    - Macro layer: normal business cycles, no permanent depression/war; a couple of recessions possible.
    - Company layer: Alphabet continues to invest heavily in AI and infra; execution quality remains broadly solid.

---

### 4.2 Bull Case – AI Powerhouse Unleashed

- JSON mapping:
    - `prob`: 0.20
    - `growth.epsCagr`: 0.15
    - `valuation.exitPe`: 25

#### 4.2.1 Narrative (world description)

- Google successfully integrates generative AI and agents into Search and YouTube with **no major monetization damage**; engagement and ad effectiveness improve.
- YouTube becomes the dominant global video/CTV platform, with strong ad and subscription growth; Shorts is fully monetized.
- Google Cloud compounds >20% for many years on AI/analytics leadership and reaches ~30% operating margins.
- At least one Other Bet (e.g. Waymo) reaches meaningful scale and turns profitable, adding a new leg of growth.
- Alphabet is viewed as the dominant AI and cloud platform of the 2030s, with multiple strong franchises and high ROIC.

#### 4.2.2 Key assumptions

- Revenue / volume:
    - Consolidated revenue CAGR ~11–12%.
    - Ads: ~7–8% CAGR, aided by AI optimization and new formats.
    - YouTube: low-teens CAGR, driven by CTV, Shorts, and subscriptions.
    - Cloud: ~20–25% CAGR for much of the decade.
    - Other Bets: reach mid-single-digit % of revenue.

- Margin structure:
    - Group operating margin holds in high-20s to low-30s despite heavy AI investment.
    - Cloud EBIT margin ~30% at mid-decade; Other Bets breakeven or slightly profitable.

- Capital allocation:
    - Buybacks retire ~20–25% of shares over 10 years.
    - R&D and capex remain high but ROI is strong; no major value-destructive M&A.

- Optionality realized:
    - Waymo operates profitable robotaxi networks in multiple large cities or licenses its stack widely.
    - Enterprise AI products (Workspace AI, developer platforms) become material contributors.

#### 4.2.3 Why these numbers are reasonable

- EPS CAGR rationale (15%):
    - Revenue ~11–12% CAGR, modest margin expansion, and ~2% annual share reduction → mid-teens EPS CAGR.
- Exit PE rationale (25x):
    - Wide-moat, double-digit grower with diversified AI/cloud/ads streams; 25x is consistent with premium large-cap tech in strong regimes.

#### 4.2.4 Evidence & supporting material (Bull)

- Company:
    - Strong recent Cloud growth and margin inflection.
    - Heavy AI investments and rapid productization (Gemini, Vertex AI, AI in Workspace, YouTube).
- Industry / macro:
    - Consensus expectations for multi-year growth in AI infra and cloud workloads.
- My interpretation:
    - If current AI and Cloud momentum persists and at least one moonshot hits, a “super-winner” outcome is plausible.
- Links / files:
    - `docs/thesis/GOOG/GOOG-bull-evidence.md`

---

### 4.3 Base Case – Steady Compounder

- JSON mapping:
    - `prob`: 0.60
    - `growth.epsCagr`: 0.10
    - `valuation.exitPe`: 20

#### 4.3.1 Narrative (world description)

- Search and YouTube remain dominant but mature; AI protects the franchise more than it expands it.
- Cloud grows mid-teens for several years, then slows to low-teens; it is an important but not dominant player (solid #3).
- Other Bets mostly net out to small losses or small profits; no “second Google,” but also no catastrophic cash drain.
- Alphabet becomes a stable, high-quality compounder: mid-single to high-single digit revenue growth, ~10% EPS growth, steady buybacks and modest dividend.

#### 4.3.2 Key assumptions

- Revenue / volume:
    - Consolidated revenue CAGR ~8–9%.
    - Ads: ~4–6% CAGR; Search + YouTube roughly in line with digital ad market growth.
    - Cloud: ~15–18% CAGR in early years, slowing over time.
    - Subscriptions: high-single to low-teens CAGR off a smaller base.

- Margin structure:
    - Operating margin ~27–30%.
    - Cloud margin improves, Other Bets’ drag diminishes but doesn’t disappear.

- Capital allocation:
    - Share count down ~15–20% over the decade.
    - Dividend grows slowly; buybacks remain main return of capital.

#### 4.3.3 Why these numbers are reasonable

- EPS CAGR rationale (10%):
    - Revenue ~8–9% + flat/slightly rising margins + ~1.5–2% share count reduction = ~10% EPS CAGR.
- Exit PE rationale (20x):
    - Reasonable multiple for a mega-cap with ~10% EPS growth, strong moat, and net cash.

#### 4.3.4 Evidence & supporting material (Base)

- Company:
    - Recent results show healthy growth across Search, YouTube, and Cloud.
    - Operating margin has rebounded after cost discipline and infra efficiencies.
- Industry / macro:
    - Digital ad and cloud markets expected to grow mid-single to mid-teens.
- My interpretation:
    - This is the “no heroics” path and my anchor scenario.
- Links / files:
    - `docs/thesis/GOOG/GOOG-base-evidence.md`

---

### 4.4 Bear Case – Moat Erosion and Stagnation

- JSON mapping:
    - `prob`: 0.20
    - `growth.epsCagr`: 0.04
    - `valuation.exitPe`: 15

#### 4.4.1 Narrative (world description)

- AI agents/search alternatives steadily eat into Google’s search usage and/or monetization.
- YouTube growth slows sharply as competition intensifies and regulatory/content-cost pressures mount.
- Cloud growth slows into high single digits with margin pressure from price competition and customer bargaining power.
- Regulatory actions significantly constrain defaults, data use, or ad targeting; compliance costs rise.
- Other Bets continue to bleed cash or are written down; no meaningful positive option.

#### 4.4.2 Key assumptions

- Revenue / volume:
    - Consolidated revenue CAGR ~5–6%.
    - Ads: ~1–3% CAGR; Search and YouTube barely outpace inflation.
    - Cloud: ~8–10% CAGR, with occasional weak years.
- Margin structure:
    - Operating margin slips into mid-20s due to competitive and regulatory pressures.
- Capital allocation:
    - Buybacks slower; share count nearly flat.
    - Dividend grows modestly; no major M&A.

#### 4.4.3 Why these numbers are reasonable

- EPS CAGR rationale (4%):
    - Revenue ~5–6% + mild margin compression + limited buyback benefit → ~4% EPS CAGR.
- Exit PE rationale (15x):
    - Reflects a mature “cash cow” with structural headwinds and higher regulatory/disruption risk.

#### 4.4.4 Evidence & supporting material (Bear)

- Company:
    - Any signs of sustained misses on Search/YouTube growth, Cloud disappointments, or capex/AI spend not translating into revenue.
- Industry / macro:
    - Strong traction of competing AI search/agent platforms; adverse regulations limiting targeting or defaults.
- My interpretation:
    - Low-probability but non-trivial path; important to model explicitly.
- Links / files:
    - `docs/thesis/GOOG/GOOG-bear-evidence.md`

#### 4.4.5 Tail risks beyond modeled Bear

- Forced breakup of core units in a value-destructive way.
- Severe legal/AI liability events (e.g. major data/privacy scandal).
- Large-scale geopolitical disruption that hits global internet usage or ad markets.

---

## 5. Quantitative Summary & Model Check

- Expected annualized return (CAGR): ≈8% (scenario-weighted)
- Expected exit multiple: ≈20x (probability-weighted between 25/20/15)
- Fair value range today (rough band, not engine output):
    - Low: price consistent with Bear/Base mix – modest upside vs current.
    - High: price consistent with Base/Bull mix – higher multiple on better growth.

- Kelly outputs (conceptual):
    - Full Kelly weight: ~0.30 (30% of portfolio, mathematically, if scenarios perfectly calibrated).
    - Scaled Kelly weight (×0.5): ~0.15 (15% of portfolio as a practical ceiling).

### 5.1 Interpretation vs benchmark and hurdle

- Benchmark return: 6.5%
- Target (hurdle) CAGR: 12%

- Commentary:
    - Expected ~8% CAGR is above benchmark but below a 12% hurdle at current price.
    - Upside skew: Bull adds disproportionate upside; Bear still likely positive nominal return over 10 years.
    - Overall, attractive as a **core compounder** and “quality ballast,” not a deep value/high-octane name at today’s price.

---

## 6. Position Sizing & Trading Plan

### 6.1 Position policy

- Target weight range:
    - Normal target: 5–10% of portfolio.
    - Max allowed (constraints): 20–25%.
    - Model-justified max (scaled Kelly): ~15%.

- Entry / add rules:
    - Consider adding / overweighting when:
        - Scenario-weighted 10-yr expected CAGR ≥ 10–12% (e.g. price corrects materially with thesis intact).
        - Multiple compresses (e.g. forward PE low-20s or below) without structural deterioration.
        - Evidence shifts probabilities toward Bull (Cloud/AI outperformance, Waymo/Other Bets traction).

- Trim / exit rules:
    - Trim when:
        - Expected CAGR falls near benchmark (~6–7%) due to price run-up without fundamental upgrade.
        - Position drifts above 15–20% due to outperformance.
        - Valuation stretches (e.g. >30x forward) without a clear acceleration in growth.
    - Consider major reduction/exit when:
        - One or more thesis-kill triggers in 3.2 are hit.
        - Bear-world dynamics clearly playing out (e.g. sustained search share loss, regulatory structural break).

### 6.2 Liquidity & execution

- Liquidity considerations:
    - Mega-cap with enormous daily volume; capacity limits irrelevant for personal portfolio.
- Execution notes:
    - Prefer limit orders, especially around earnings/reg headlines.
    - Stagger entries on volatility spikes; avoid chasing short-term euphoria.

---

## 7. Monitoring Checklist

### 7.1 Key metrics to track

- Business KPIs:
    - Search query volume and market share by region.
    - YouTube watch time, Shorts engagement, CTV usage; YouTube ad and subscription revenue growth.
    - Google Cloud revenue growth, backlog, and operating margin.
    - Paid subscription counts (YouTube Premium/TV, Google One, Workspace).

- Financials:
    - Consolidated revenue and EPS growth vs guidance/Street.
    - Operating margin trends by segment (Services, Cloud, Other Bets).
    - FCF and capex as % of revenue; infra ROI.
    - Share count and buyback pacing.

- Qualitative:
    - AI product progress and user adoption (Gemini, agents, AI features in Search/Workspace/Android).
    - Regulatory developments (DOJ, EU, other jurisdictions).
    - Competitive moves from Microsoft, Amazon, Meta, Apple, TikTok, etc.
    - Management commentary on capital allocation, cost discipline, and AI/Cloud strategy.

### 7.2 Scenario update triggers

- Signals toward Bull:
    - Cloud consistently outgrows peers with rising margins.
    - Evidence that AI features increase user engagement and ad monetization.
    - Waymo or other moonshots reaching commercial scale or high-valuation external funding.

- Signals toward Bear:
    - Sustained decline in search share or monetization.
    - Multi-year slowdown in Cloud to low single-digit growth; margin compression.
    - Adverse structural regulatory outcomes (e.g. forced separation, strict targeting bans).

- Signals we remain in Base:
    - Search/YouTube growth roughly in line with digital ad market.
    - Cloud growing mid-teens with gradual margin improvement.
    - Regulatory noise but no game-changing remedies.

---

## 8. Evidence Log & Updates

Append-only log of new information and how it affects Bull/Base/Bear.
Detailed notes can live in separate files under `docs/thesis/GOOG/`.

### 8.1 Log index

- Bull evidence file: `docs/thesis/GOOG/GOOG-bull-evidence.md`
- Base evidence file: `docs/thesis/GOOG/GOOG-base-evidence.md`
- Bear evidence file: `docs/thesis/GOOG/GOOG-bear-evidence.md`

### 8.2 High-level update entries (reverse chronological)

#### YYYY-MM-DD – Event title

- What happened:
    - Short description + link / source.
- Impact on scenarios:
    - Bull: …
    - Base: …
    - Bear: …
- Impact on assumptions:
    - Any changes to epsCagr / exitPe in any scenario?
- Action:
    - Hold / add / trim / exit / no action.
- TODO:
    - Further research, data to watch next quarter.

(Repeat a block like this for each new material event.)

---

## 9. Open Questions / Research To-Do

- Unresolved uncertainties:
    - Long-run impact of generative AI and agents on search behavior and ad formats.
    - True economic potential and timing for Waymo and Other Bets.
    - Sustainable Google Cloud growth and margins once the AI capex boom normalizes.
    - Magnitude and form of future regulatory remedies in the US/EU.

- Planned research:
    - Read each new 10-K/10-Q and earnings call transcript.
    - Track ad and cloud market reports from independent sources.
    - Follow technical analysis of AI model progress vs. peers.
    - Re-run the 10-year DCF + three-state model annually with updated inputs and probabilities.

{% endraw %}
