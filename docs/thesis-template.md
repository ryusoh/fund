---
render_with_liquid: false
---

# {{TICKER}} – Investment Thesis (Fermat–Pascal + Kelly System)

- **Ticker / Name**: {{TICKER}} – {{COMPANY_NAME}}
- **Date**: {{YYYY-MM-DD}}
- **Time Horizon**: {{H}} years
- **Benchmark (annual)**: {{BENCHMARK_RETURN}} (e.g. SP500, custom, RF+spread)
- **Target CAGR (Hurdle)**: {{TARGET_CAGR}}

- **Model Settings**
    - Engine: {{model.engine.type}}
    - Monte Carlo: {{true/false}}, paths: {{paths}}
    - Kelly scale: {{kellyScale}}

- **Position**
    - Current shares: {{position.shares}}
    - Current portfolio weight: {{position.currentWeight}}
    - Constraints: min {{position.constraints.minWeight}}, max {{position.constraints.maxWeight}}
    - Max Kelly weight (model): {{derived.kelly.scaledKelly}}

---

## 1. Business Snapshot

### 1.1 What the company does

- Core business / segments:
    - {{Segment 1 description}}
    - {{Segment 2 description}}
- Geography / customer concentration:
    - {{Key regions, key customers, % of revenue if relevant}}
- Business model in one sentence:
    - {{Describe how it makes money in one concise sentence}}

### 1.2 Why this is in my universe

- Thesis type:
    - {{Compounder / cyclical / deep value / special situation / macro-levered / turnaround / etc.}}
- My edge / variant perception vs market:
    - {{Where I think consensus is wrong: growth durability, risk mispricing, capital allocation, hidden assets, etc.}}

### 1.3 Current valuation snapshot

- Price: {{market.price}}
- Trailing EPS / PE: {{market.eps}} / {{market.pe}}
- Forward EPS / forward PE: {{market.forwardEps}} / {{market.forwardPe}}
- EV / EBITDA: {{market.evToEbitda}}
- Market cap / EV: {{market.marketCap}} / {{market.enterpriseValue}}
- 52-week range: {{market.fiftyTwoWeekLow}} – {{market.fiftyTwoWeekHigh}}
- Volatility (used in model): {{risk.volatility}} (source: {{risk.estimateSource}})

---

## 2. Business Quality & Moat

### 2.1 Moat / competitive advantage

- Sources of moat:
- {{Switching costs / scale / regulation / network effects / brand / cost advantage / IP, etc.}}
- Moat durability:
- {{Why this advantage might persist 5–10 years; what could erode it?}}

### 2.2 Unit economics & returns

- Unit / contract economics (conceptual):
    - {{Per-unit revenue, margin profile, capex intensity, payback, etc.}}
- Returns on capital:
    - {{ROIC / ROE quality, or qualitative assessment if numbers noisy}}
- Cyclicality:
    - {{How sensitive are volumes / prices / margins to macro, policy, or commodity prices?}}

### 2.3 Management & capital allocation

- Management quality:
    - {{Track record, credibility, execution history, key people}}
- Capital allocation:
    - {{Debt policy, buybacks vs dividends, M&A behavior, reinvestment discipline}}
- Alignment:
    - {{Insider ownership, comp structure, governance red flags or positives}}

---

## 3. Key Drivers & Risk Map

### 3.1 Core value drivers (next {{H}} years)

- Volume drivers:
    - {{Customer growth, penetration, utilization, capacity additions, etc.}}
- Price / mix:
    - {{Pricing power, mix shift toward higher-margin products or regions}}
- Margin drivers:
    - {{Operating leverage, cost initiatives, inflation pass-through, etc.}}
- Balance sheet:
    - {{Deleveraging plan, refinancing risk, interest cost sensitivity}}
- Optionality:
    - {{New products, new geographies, tech projects, regulatory upside, hidden assets, etc.}}

### 3.2 Risk map and thesis killers

- Structural risks:
    - {{Regulation, tech disruption, political risk, ESG, single-customer dependence, etc.}}
- Financial risks:
    - {{Leverage, liquidity, covenants, funding dependence, off-BS obligations}}
- Governance / headline risks:
    - {{Litigation, accounting complexity, fraud risk, key-man risk, controversies}}
- Explicit thesis-kill triggers:
    - {{Concrete, observable events that would make me materially cut Bull/Base probabilities or exit}}

---

## 4. Scenario Design – Fermat–Pascal Three States

This section documents how I choose the JSON `scenarios` block and why.

### 4.1 Shared baseline assumptions

- Starting EPS: {{market.eps}}
- Starting PE: {{market.pe}}
- Time horizon: {{H}} years
- Balance sheet / share count:
    - {{Assumptions about net debt, share issuance, buybacks, dilution}}
- Macro / regime assumptions (if relevant):
    - {{Interest rates, GDP growth, industry cycle, commodity price bands, regulatory regime, etc.}}
- For macro-linked names (optional split):
    - Macro layer: {{e.g. WTI mid-cycle price, housing cycle, credit cycle}}
    - Company layer: {{Company execution conditional on that macro}}

---

### 4.2 Bull Case – {{Bull Title}}

- JSON mapping:
    - `prob`: {{scenarios.bull.prob}}
    - `growth.epsCagr`: {{scenarios.bull.growth.epsCagr}}
    - `valuation.exitPe`: {{scenarios.bull.valuation.exitPe}}

#### 4.2.1 Narrative (world description)

- {{Describe the world if Bull plays out: product adoption, market share, macro conditions, margins, regulation, etc.}}

#### 4.2.2 Key assumptions

- Revenue / volume:
    - {{What drives top-line growth in Bull (units, price, market share)}}
- Margin structure:
    - {{How margins evolve and why (scale, mix, cost controls)}}
- Capital allocation:
    - {{Deleveraging speed, capital returns, reinvestment, M&A}}
- Optionality realized:
    - {{Which “options” actually pay off (new products, DAC, AI, etc.)}}

#### 4.2.3 Why these numbers are reasonable

- EPS CAGR rationale ({{scenarios.bull.growth.epsCagr}}):
    - {{High-level link between revenue CAGR, margin profile, interest, share count → EPS CAGR}}
- Exit PE rationale ({{scenarios.bull.valuation.exitPe}}):
    - {{Compare to historical peaks, peer valuation in strong conditions, business quality under Bull}}

#### 4.2.4 Evidence & supporting material (Bull)

- Company:
    - {{Earnings call quotes, guidance, investor day slides, KPIs that support Bull assumptions}}
- Industry / macro:
    - {{External data/reports consistent with the Bull world}}
- My interpretation:
    - {{Why this evidence increases Bull plausibility}}
- Links / files:
    - {{docs/thesis/{{TICKER}}/{{TICKER}}-bull-evidence.md or external URLs}}

---

### 4.3 Base Case – {{Base Title}}

- JSON mapping:
    - `prob`: {{scenarios.base.prob}}
    - `growth.epsCagr`: {{scenarios.base.growth.epsCagr}}
    - `valuation.exitPe`: {{scenarios.base.valuation.exitPe}}

#### 4.3.1 Narrative (world description)

- {{“Nothing heroic” world: steady or moderate growth, no extreme shocks, normal execution, mixed news}}

#### 4.3.2 Key assumptions

- Revenue / volume:
    - {{Stable to modest growth; core business intact}}
- Margin structure:
    - {{Mostly flat; mild expansion or compression}}
- Capital allocation:
    - {{Typical deleveraging, moderate capital returns, no crazy M&A}}

#### 4.3.3 Why these numbers are reasonable

- EPS CAGR rationale ({{scenarios.base.growth.epsCagr}}):
    - {{Revenue CAGR + small margin moves + interest savings + modest buybacks}}
- Exit PE rationale ({{scenarios.base.valuation.exitPe}}):
    - {{“Normal” multiple given growth and risk, anchored in history and peers}}

#### 4.3.4 Evidence & supporting material (Base)

- Company:
    - {{Current trajectory and guidance that line up with Base}}
- Industry / macro:
    - {{Data suggesting status quo / mid-cycle regime}}
- My interpretation:
    - {{Why Base is my anchor scenario right now}}
- Links / files:
    - {{docs/thesis/{{TICKER}}/{{TICKER}}-base-evidence.md or external URLs}}

---

### 4.4 Bear Case – {{Bear Title}}

- JSON mapping:
    - `prob`: {{scenarios.bear.prob}}
    - `growth.epsCagr`: {{scenarios.bear.growth.epsCagr}}
    - `valuation.exitPe`: {{scenarios.bear.valuation.exitPe}}

#### 4.4.1 Narrative (world description)

- {{Adverse but non-apocalyptic world: structural issues, negative surprises, prolonged headwinds}}

#### 4.4.2 Key assumptions

- Revenue / volume:
    - {{Stagnation or decline; customer loss; policy/commodity/competition headwinds}}
- Margin structure:
    - {{Margin compression from underutilization, pricing pressure, cost inflation, mix}}
- Capital allocation:
    - {{Slower deleveraging, constrained capital returns, possible equity issuance}}

#### 4.4.3 Why these numbers are reasonable

- EPS CAGR rationale ({{scenarios.bear.growth.epsCagr}}):
    - {{How flat/declining EPS arises from revenue/margin/interest dynamics}}
- Exit PE rationale ({{scenarios.bear.valuation.exitPe}}):
    - {{Stress / trough-like multiple relative to history and “hairy” peers}}

#### 4.4.4 Evidence & supporting material (Bear)

- Company:
    - {{Warnings, missed guidance, deteriorating metrics, governance issues, etc.}}
- Industry / macro:
    - {{Data pointing to structural decline, disruption, regulation, weak demand, etc.}}
- My interpretation:
    - {{Why Bear probability is non-trivial; what would move it higher}}
- Links / files:
    - {{docs/thesis/{{TICKER}}/{{TICKER}}-bear-evidence.md or external URLs}}

#### 4.4.5 Tail risks beyond modeled Bear

- {{Extreme events not explicitly modeled in 5-year EPS/PE: nationalization, ban, war, fraud, etc.}}

---

## 5. Quantitative Summary & Model Check

(Usually filled after running the engine and writing back to `derived` in JSON.)

- Expected annualized return (CAGR): {{derived.expectedCagr}}
- Expected exit multiple: {{derived.expectedMultiple}}
- Fair value range today: {{derived.fairValueRange}}

- Kelly outputs:
    - Full Kelly weight: {{derived.kelly.fullKelly}}
    - Scaled Kelly weight (× kellyScale): {{derived.kelly.scaledKelly}}

### 5.1 Interpretation vs benchmark and hurdle

- Benchmark return: {{BENCHMARK_RETURN}}
- Target (hurdle) CAGR: {{TARGET_CAGR}}

- Commentary:
    - {{Is expected CAGR above/below benchmark and hurdle?}}
    - {{Does this feel consistent with the narrative and risks?}}
    - {{Is the market over/under-pricing my three-state expectations?}}

---

## 6. Position Sizing & Trading Plan

### 6.1 Position policy

- Target weight range:
    - Normal target: {{LOW_TARGET_WEIGHT}} – {{HIGH_TARGET_WEIGHT}}
    - Max allowed (constraints): {{position.constraints.maxWeight}}
    - Model-justified max (scaled Kelly): {{derived.kelly.scaledKelly}}

- Entry / add rules:
    - {{Valuation thresholds, expected CAGR thresholds, or qualitative triggers}}

- Trim / exit rules:
    - {{Valuation rich vs expectations, expected CAGR falls below hurdle, scenario probabilities shift, thesis-kill events}}

### 6.2 Liquidity & execution

- Liquidity considerations:
    - {{Average daily volume, spread, market cap, capacity limits}}
- Execution notes:
    - {{Limit vs market orders, time of day, trade slowly vs quickly}}

---

## 7. Monitoring Checklist

### 7.1 Key metrics to track

- Business KPIs:
    - {{User growth, utilization, load factor, ARPU, churn, contract wins/losses, etc.}}
- Financials:
    - {{Revenue growth, margins, FCF, leverage, interest coverage, capex}}
- Qualitative:
    - {{Management changes, regulatory news, competitor moves, product launches, tech shifts}}

### 7.2 Scenario update triggers

- Signals toward Bull:
    - {{Specific KPIs, events, or behaviors that make Bull more likely}}
- Signals toward Bear:
    - {{Specific KPIs, events, or behaviors that make Bear more likely}}
- Signals we remain in Base:
    - {{Conditions consistent with “status quo” trajectory}}

---

## 8. Evidence Log & Updates

Append-only log of new information and how it affects Bull/Base/Bear.
Detailed notes can live in separate files under `docs/thesis/{{TICKER}}/`.

### 8.1 Log index

- Bull evidence file: `docs/thesis/{{TICKER}}/{{TICKER}}-bull-evidence.md`
- Base evidence file: `docs/thesis/{{TICKER}}/{{TICKER}}-base-evidence.md`
- Bear evidence file: `docs/thesis/{{TICKER}}/{{TICKER}}-bear-evidence.md`

### 8.2 High-level update entries (reverse chronological)

#### {{YYYY-MM-DD}} – {{Event title}}

- What happened:
    - {{Short description + link / source}}
- Impact on scenarios:
    - Bull: {{e.g. probability +5% → 0.35, or no change}}
    - Base: {{…}}
    - Bear: {{…}}
- Impact on assumptions:
    - {{Any changes to epsCagr / exitPe in any scenario?}}
- Action:
    - {{Hold / add / trim / exit / no action}}
- TODO:
    - {{Further research, data to watch next quarter}}

(Repeat a block like this for each new material event.)

---

## 9. Open Questions / Research To-Do

- Unresolved uncertainties:
    - {{Valuation questions, accounting issues, regulatory unknowns, tech risk you don’t fully grok yet}}

- Planned research:
    - {{Filings to read, calls to listen to, external reports, academic papers, people to talk to, experiments to run}}
