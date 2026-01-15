---
---

{% raw %}

# VT – Investment Thesis

- **Ticker / Name**: VT – Vanguard Total World Stock ETF
- **Date**: 2025-11-15
- **Time Horizon**: 10+ years
- **Benchmark (annual)**: S&P 500 total return (USD)
- **Target CAGR (Hurdle)**: 8% nominal

- **Model Settings**
    - Engine: fermat-pascal-kelly
    - Monte Carlo: true, paths: 10000
    - Kelly scale: 0.5

- **Position**
    - Current shares: 2600
    - Current portfolio weight: 0.30
    - Constraints: min 0.00, max 0.30
    - Max Kelly weight (model): 0.30

---

## 1. Business Snapshot

### 1.1 What the company does

- Core business / segments:
    - Global equity index ETF tracking the FTSE Global All Cap Index (large, mid, small caps, developed + emerging).
    - One-ticket world allocation across ~10,000 stocks, representing >98% of global investable market cap.
- Geography / customer concentration:
    - ~63% U.S. equities, ~37% ex-U.S. (Japan, UK, China, Canada, Europe, EM).
    - Investor base is diversified, mostly long-term index investors; no single “customer” dependence.
- Business model in one sentence:
    - Charges a 0.06% expense ratio to passively track the global equity market and deliver total world equity beta.

### 1.2 Why this is in my universe

- Thesis type:
    - Core global equity index / long-term compounder via global GDP + earnings growth.
- My edge / variant perception vs market:
    - Willing to run a **large, persistent allocation** to global equities (not just U.S.) through full cycles.
    - Belief that the U.S. outperformance + strong USD cycle is unusually extended and that global diversification (especially into cheaper non-U.S. markets) has a good chance of improving **risk-adjusted** returns over 10–20 years.
    - Edge comes from **discipline + horizon** rather than security selection: stick with VT even when global ex-U.S. lags badly vs S&P 500.

### 1.3 Current valuation snapshot

- Price: ≈ $139
- Trailing EPS / PE: EPS ≈ $6.2 / PE ≈ 22.5×
- Forward EPS / forward PE: N/A at fund level (index-level forward EPS not consistently published) / N/A
- EV / EBITDA: Not meaningful for a fund (no operating EV).
- Market cap / EV: Market cap ≈ $55B / EV ≈ market cap (no debt).
- 52-week range: ≈ $101 – $142
- Volatility (used in model): 13% annualized (conservative, based on 3–5Y VT/ACWI vol).

---

## 2. Business Quality & Moat

### 2.1 Moat / competitive advantage

- Sources of moat:
    - Cost advantage: 0.06% expense ratio is structurally lower than most global equity products.
    - Breadth: owns almost the entire investable global market; automatically owns future winners as they rise in market cap.
    - Vanguard brand and structure: investor-owned, scale advantages, strong trust and stickiness.
    - Tax and operational efficiency: low turnover, ETF share-class structure, tight tracking.
- Moat durability:
    - Cost leadership is likely to persist; competitors have limited room to sustainably undercut fees.
    - Global index tracking is commoditized, but Vanguard’s scale + structure give durable economics.
    - The “business” of VT is owning global capitalism; as long as public markets exist, this remains relevant.

### 2.2 Unit economics & returns

- Unit / contract economics (conceptual):
    - For Vanguard: revenue = 0.06% of AUM, marginal costs low.
    - For us as holder: net return ≈ global equity index return – 0.06% fee – minimal tracking error.
- Returns on capital:
    - Underlying holdings: high aggregate ROE (~high teens).
    - VT itself is just a pass-through; economic quality is that of the underlying global corporate sector.
- Cyclicality:
    - Fully exposed to global equity cycles; drawdowns can be large in recessions.
    - Diversification across sectors and regions mitigates idiosyncratic/country-specific cyclicality.

### 2.3 Management & capital allocation

- Management quality:
    - Vanguard index team with long track record, low tracking error, no star-manager risk.
- Capital allocation:
    - Rules-based: replicates FTSE Global All Cap; no discretionary capital allocation.
    - Turnover kept low; trading focused on efficient index tracking.
- Alignment:
    - Investor-owned Vanguard structure → strong fee pressure downward; no incentive to take active risk.
    - Governance and index methodology transparent.

---

## 3. Key Drivers & Risk Map

### 3.1 Core value drivers (next 10 years)

- Volume drivers:
    - Global nominal GDP (real growth + inflation).
    - Corporate earnings growth in DM + EM.
    - Market cap growth of listed equities vs private/other assets.
- Price / mix:
    - Sector mix shift toward higher-margin, higher-ROE businesses (tech, services).
    - Regional mix shift as EM grows and successful new companies scale.
    - FX effects on non-USD assets for a USD-based investor.
- Margin drivers:
    - Aggregate corporate profit share of GDP (margins); potential mean reversion from elevated U.S. margins.
    - Impact of rates, taxes, regulation on net margins.
- Balance sheet:
    - Aggregate corporate leverage and refinancing costs globally.
    - VT has no fund-level leverage; balance sheet risk is at underlying company level.
- Optionality:
    - EM convergence (India, ASEAN, etc.).
    - Global AI/productivity tailwinds.
    - USD weakening over long run, boosting non-U.S. returns in USD terms.

### 3.2 Risk map and thesis killers

- Structural risks:
    - Long-run global stagnation (low real growth, demographics, deglobalization).
    - Persistent inflation / high real rates compressing valuations.
    - Deglobalization, capital controls, sanctions impacting cross-border investments.
    - Climate transition shocks or extreme physical risks.
- Financial risks:
    - Starting valuations (P/E ~22.5×) leave room for significant multiple compression.
    - Equity risk premium could shrink if bond yields stay attractive.
    - Currency risk (strong USD periods) hurting ex-U.S. returns.
- Governance / headline risks:
    - Geopolitical conflict, war, sanctions affecting large regions.
    - Regulatory/tax changes on foreign investors and fund structures.
- Explicit thesis-kill triggers:
    - 15+ years where VT meaningfully and persistently underperforms S&P 500 and other reasonable diversified allocations despite cheaper non-U.S. valuations and no compelling structural reason.
    - Structural break making global diversification clearly inferior to concentrating in a single region (e.g., systemic permanent impairment in EM/Europe without offsetting upside).

---

## 4. Scenario Design – Fermat–Pascal Three States

### 4.1 Shared baseline assumptions

- Starting EPS: ≈ $6.2 (implied)
- Starting PE: 22.5×
- Time horizon: 10 years (for modeling)
- Balance sheet / share count:
    - VT share count changes with flows but irrelevant to per-share economics.
    - Assume no structural dilution; focus on index-level EPS.
- Macro / regime assumptions (if relevant):
    - Base regime: real global GDP 2–3%, inflation ~2%, nominal GDP 4–5%.
    - No extreme regime shift (no permanent ZIRP, no 1970s-style sustained stagflation baked into the base).

- For macro-linked names (optional split):
    - Macro layer: global GDP growth, inflation, rates, FX, trade regime.
    - Company layer: aggregate corporate margins, capex discipline, capital returns.

---

### 4.2 Bull Case – Global Productivity Super-Cycle

- JSON mapping:
    - `prob`: 0.20
    - `growth.epsCagr`: 0.08
    - `valuation.exitPe`: 25

#### 4.2.1 Narrative (world description)

- Strong global growth driven by AI, automation, and energy tech.
- EM reforms and investment unlock higher sustained growth; DM avoids deep recessions.
- Corporate margins remain high; tax/regulatory drag manageable.
- Investor risk appetite healthy, real rates moderate; equities remain attractive vs bonds.

#### 4.2.2 Key assumptions

- Revenue / volume:
    - Global nominal revenue/EPS growth ~8% annually.
- Margin structure:
    - Margins stable to slightly expanding as productivity outpaces wage/regulatory pressure.
- Capital allocation:
    - Continued buybacks + dividends in DM; high reinvestment in EM at good ROIC.
- Optionality realized:
    - EM convergence and AI/productivity optionality both pay off.

#### 4.2.3 Why these numbers are reasonable

- EPS CAGR rationale (8%):
    - 3–4% real growth + 2–3% inflation + 1–2% from margin + buybacks/leverage.
- Exit PE rationale (25):
    - High but plausible for a global index in a benign macro regime with strong growth and moderate real yields.

#### 4.2.4 Evidence & supporting material (Bull)

- Historical periods of strong global or U.S. growth produced similar return/growth regimes.
- Current tech wave provides a plausible mechanism for above-trend productivity.

---

### 4.3 Base Case – Decent but Not Heroic Global Growth

- JSON mapping:
    - `prob`: 0.60
    - `growth.epsCagr`: 0.05
    - `valuation.exitPe`: 20

#### 4.3.1 Narrative (world description)

- World muddles through: decent growth, normal recessions, no collapse.
- EPS grows mid-single digits; some regions do well, some lag.
- Valuations normalize mildly from today’s levels.

#### 4.3.2 Key assumptions

- Revenue / volume:
    - Nominal EPS growth ~5% per year.
- Margin structure:
    - Margins roughly flat; mild give-and-take between tech and other sectors.
- Capital allocation:
    - Balanced: steady dividends, moderate buybacks, capex that broadly matches opportunities.

#### 4.3.3 Why these numbers are reasonable

- EPS CAGR rationale (5%):
    - 2–3% real + ~2% inflation + small buyback effect → 4–6%, anchor at 5%.
- Exit PE rationale (20):
    - Classic “normal” multiple given mid-single-digit growth and non-extreme macro.

#### 4.3.4 Evidence & supporting material (Base)

- Most institutional capital market assumptions now put global equity returns in the mid-single-digit range from current valuations.

---

### 4.4 Bear Case – Stagnation & De-Rating

- JSON mapping:
    - `prob`: 0.20
    - `growth.epsCagr`: 0.02
    - `valuation.exitPe`: 15

#### 4.4.1 Narrative (world description)

- Structural stagnation: aging demographics, deglobalization, repeated shocks.
- Profit margins grind lower; political/regulatory pressure on capital rises.
- Real rates stay elevated or volatile, risk premiums widen.
- Equities de-rate as an asset class.

#### 4.4.2 Key assumptions

- Revenue / volume:
    - Nominal EPS growth only ~2%/yr (near-stagnant in real terms).
- Margin structure:
    - Sustained margin compression; some sectors structurally impaired.
- Capital allocation:
    - Weaker buybacks, more defensive balance-sheet moves, occasional dilutive equity issuance.

#### 4.4.3 Why these numbers are reasonable

- EPS CAGR rationale (2%):
    - 0–1% real GDP in DM, 2–3% EM but offset by margins and shocks.
- Exit PE rationale (15):
    - In line with historic trough/mid-cycle valuations in tougher macro regimes.

#### 4.4.4 Evidence & supporting material (Bear)

- Historical periods (1970s, “lost decade” 2000–2010 for U.S.) show such low-return environments are possible.

#### 4.4.5 Tail risks beyond modeled Bear

- Major great-power wars or systemic conflict.
- Capital controls, nationalization, widespread expropriation.
- Severe climate catastrophe.
- Systemic political backlash against capital leading to much lower profit share.

---

## 5. Quantitative Summary & Model Check

- Expected annualized return (CAGR): ≈ 5.7%
- Expected exit multiple: ≈ 20×
- Fair value range today: ≈ $120 – $155 per share

- Kelly outputs:
    - Full Kelly weight: ≈ 0.60 (rough ballpark for VT as a single asset vs cash, given modest excess return and vol).
    - Scaled Kelly weight (× kellyScale = 0.5): ≈ 0.30

### 5.1 Interpretation vs benchmark and hurdle

- Benchmark return: S&P 500 forward expectation ≈ 6–7%/yr (total return).
- VT expected total return (scenarios + yield): ≈ 6%/yr in the current calibration, i.e. roughly in line with S&P with wide error bars.
- Target (hurdle) CAGR: 8%/yr (portfolio-level ambition, not a forecast for VT or S&P).

- Commentary:
    - Expected VT CAGR (~5–6% in the scenarios, ~6% including dividends) is below the 8% hurdle but broadly consistent with realistic global equity forecasts from today’s valuation starting point.
    - Relative to the S&P 500, my macro view is that VT’s long-run expected return is roughly similar, with a small chance of modest outperformance if non-U.S. markets and FX partially mean-revert, and a small chance of modest underperformance if U.S. dominance persists.
    - Any small negative "Edge vs S&P 500" that appears in the JSON/config should be interpreted as a conservative modeling choice, not a strong conviction that the international/small-cap sleeve will structurally underperform U.S. large caps by 1–2%/yr.
    - VT is mainly a beta + diversification tool; I am not relying on a large, persistent alpha vs S&P 500 in this thesis, only on global capitalism continuing to compound earnings over the next 10+ years.

---

## 6. Position Sizing & Trading Plan

### 6.1 Position policy

- Target weight range:
    - Normal target: 25% – 30%
    - Max allowed (constraints): 30%
    - Model-justified max (scaled Kelly): ≈ 30%

- Entry / add rules:
    - Maintain VT around 25–30% as the core equity allocation.
    - Add / rebalance toward 30% when:
        - VT/global equities sell off ≥20% with no long-term thesis break.
        - Global valuations de-rate to P/E ≤ 18× with intact earnings power.
        - Non-U.S. vs U.S. valuation gap becomes extreme in favor of non-U.S.

- Trim / exit rules:
    - Trim if VT grows >3–5 percentage points above 30% due to outperformance.
    - Consider modest trims if:
        - Global P/E pushes into 30×+ without earnings acceleration.
        - Updated scenario work drops expected 10Y CAGR <4–5%.
    - Full exit only if major thesis-kill conditions are met.

### 6.2 Liquidity & execution

- Liquidity considerations:
    - Very high AUM and daily volume; negligible capacity concerns at current size.
- Execution notes:
    - Use limit orders during regular hours, avoid open/close extremes.
    - Rebalance in 1–2 tranches; no need for fine slicing.

---

## 7. Monitoring Checklist

### 7.1 Key metrics to track

- Business KPIs:
    - Global real and nominal GDP growth.
    - MSCI ACWI / FTSE Global EPS growth and revisions.
    - Regional performance splits: U.S. vs ex-U.S., DM vs EM.
- Financials:
    - Global index P/E, CAPE, dividend yield.
    - Corporate profit margins and profit share of GDP.
    - 10Y sovereign yields and credit spreads (equity risk premium).
- Qualitative:
    - Big geopolitical developments (wars, sanctions, trade regime shifts).
    - Structural reforms in EM, EU integration, China policy direction.
    - Tech/productivity shocks (AI, energy tech) and their diffusion.

### 7.2 Scenario update triggers

- Signals toward Bull:
    - Sustained global real GDP >3% with stable inflation.
    - Broad-based EPS growth >8% across regions, not just U.S. mega-cap tech.
    - Evident productivity acceleration in macro stats and margins.
    - Improving EM governance/reforms, stable geopolitical backdrop.

- Signals toward Bear:
    - Repeated GDP misses, low growth, or multiple recessions without strong recoveries.
    - Persistent margin compression and downgrades to long-run EPS expectations.
    - Prolonged high real rates or stagflation-like regime.
    - Escalating deglobalization, capital controls, broad sanctions.

- Signals we remain in Base:
    - Global growth/inflation close to consensus, no big regime shifts.
    - EPS growth ~5%, valuations oscillating around mid-teen/low-20s P/E.
    - Normal cycle of risk-on/risk-off without structural break.

---

## 8. Evidence Log & Updates

### 8.1 Log index

- Bull evidence file: `docs/thesis/VT/VT-bull-evidence.md`
- Base evidence file: `docs/thesis/VT/VT-base-evidence.md`
- Bear evidence file: `docs/thesis/VT/VT-bear-evidence.md`

### 8.2 High-level update entries (reverse chronological)

#### 2025-11-15 – Initial VT Global Thesis

- What happened:
    - Wrote initial 10+ year VT thesis and three-state scenario design.
- Impact on scenarios:
    - Bull: 0.20
    - Base: 0.60
    - Bear: 0.20
- Impact on assumptions:
    - Set EPS CAGRs at 8/5/2% and exit PEs at 25/20/15 in Bull/Base/Bear.
- Action:
    - Maintain 30% VT allocation, rebalance around band.
- TODO:
    - Refresh capital-market assumptions yearly; revisit scenarios and expected CAGR.

---

## 9. Open Questions / Research To-Do

- Unresolved uncertainties:
    - How much of current high profit margins (esp. U.S.) is structural vs cyclical?
    - Long-term impact of AI/automation on global productivity and profit share.
    - How much mean reversion to expect between U.S. and non-U.S. equities over 10–20 years.
    - Climate policy path and its net effect on global earnings and valuations.

- Planned research:
    - Track annual CMAs from Vanguard / BlackRock / others for global vs U.S. equities.
    - Study historical U.S. vs ex-U.S. relative return cycles and valuation gaps.
    - Follow EM reform trajectories (India, Indonesia, Brazil, etc.).
    - Read deeper work on global diversification vs home bias over multi-decade horizons.

{% endraw %}
