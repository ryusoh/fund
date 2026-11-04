---
---

{% raw %}

# ANET Bear Evidence Log

- _Store red-team findings, variant risks, and disconfirming evidence here._
- _Only promote the actionable conclusions into the main thesis file._

## 2026-10-28 – First red-team pass (deep-research run)

Source: `docs/research/tickers/anet-deep-research-2026-10.md` (multi-agent red-team
subagent + independent confirm pass, 12/12 claims verified). Ranked by
thesis-killing potential. Falsifiers are registered as dated predictions in
`data/analysis/ANET.json` where noted.

### 1. The thesis's own model disproves the position size

- Expected CAGR ~8.0% vs 12% hurdle; fair value $100–130 vs price ~$177; scaled
  Kelly ~3% vs ~26% actual portfolio weight (~9–13× the model-justified size).
- The October drawdown (−18% from the 2026-10-09 high of $216.74, price below the
  50-day average) is the market testing exactly this valuation gap, attributed to
  AI-infrastructure-financing fears — a risk the decision journal carried at only 0.1
  the week before.
- Falsifier (confirms bear): Q3 print (2026-11-03) below the ~$3.3B guide or GAAP GM
  below 62% → registered as `anet-q3-fy26-print` / `anet-fy26-gm-guide`.

### 2. "Ethernet wins ⇒ Arista wins" is broken — Spectrum-X IS Ethernet

- NVIDIA Spectrum-X Ethernet grew 2.6x YoY (CFO Kress, NVDA Q2 FY27 call,
  2026-08-26, primary transcript). NVIDIA networking was ~$31B in FY2026, >3×
  Arista's entire revenue (includes InfiniBand/NVLink/DPU — overstates overlap, but
  the Ethernet portion alone exceeded $10B annualized as of Nov 2025).
- NVLink Fusion opened to third-party XPUs (incl. AWS Trainium), refuting the
  thesis's "non-NVDA accelerators pair with Arista by default" optionality.
- NVIDIA's own releases name Meta/Microsoft/Oracle as Spectrum-X Ethernet adopters —
  Arista's core customers.
- Falsifier: Dell'Oro/IDC 2026 share data showing Spectrum-X ahead of EtherLink in
  AI back-end builds; a named neocloud standardizing end-to-end on Spectrum-X.

### 3. Margin erosion is live, not hypothetical

- GAAP GM 62.9% in Q2'26 vs 65.2% a year earlier (non-GAAP 63.4% vs 65.6%) — 10-Q
  attributes it to large-customer discount mix; FY guide 62–64% explicitly includes
  memory/silicon cost inflation, and the 10-Q escalated supply-risk language from
  memory-only to memory **and** silicon with cost pass-through timing mismatches.
- The driver build holds 39% net margin flat to 2030 through a period management
  says stays supply-tight to ~2028, with cloud-titan (lower-GM) mix rising.
- Counter-evidence (steelman): non-GAAP op-margin target was _raised_ to 48–49% —
  opex leverage is offsetting GM pressure so far. Peak margin is asserted, not yet
  observed at the operating line.

### 4. Concentration rose while anchor customers build exit ramps

- Top-2 = 42% of FY2025 revenue, up from 35% (prediction `anet-top2-cust-conc-fy25`
  resolved FALSE). Rising concentration means falling pricing power over the two
  buyers funding 42% of revenue.
- Meta extended its Broadcom custom-silicon partnership through 2029
  (multi-gigawatt); Microsoft-authored SONiC added 800GbE support; white-box market
  growing ~18.5% CAGR (Quanta/Celestica anchoring hyperscaler ToR).
- Steelman: concentration rose because the anchors grew fastest — mechanically a
  demand-health signal; custom accelerators still need merchant-silicon Ethernet
  fabrics (the thesis's actual claim).
- Falsifier: FY2026 10-K top-2 ≥45% or no third ≥10% customer
  (`anet-third-10pct-customer-fy26` resolves FALSE).

### 5. Acceptance clauses + 3× purchase commitments = bullwhip convexity

- Product deferrals +$600M QoQ on customer acceptance clauses: revenue that ships
  but isn't recognized until the customer accepts — exactly where hyperscalers stall
  in a capex pause.
- Against that, Arista holds ~$9.7B of purchase commitments (~3× YoY) with memory
  secured into 2027. The $12.6B guide is a supply-delivery forecast ("we are guiding
  based on what we're confident we can get the supply for"), not booked demand.
- Falsifier: deferred-revenue growth stalls or reverses while inventory/purchase
  commitments keep climbing; a miss attributed to "customer acceptance timing."

### 6. The AI leg rests on unaudited IR constructs

- Arista never discloses AI revenue in SEC filings (verified via filings adapter) —
  the ≥$3.5B AI-fabrics goal exists only in earnings calls. Voluntary disclosure
  means goal abandonment would leave no filing footprint.
- The $45B 2030 TAM is secondary-sourced; the $15–20B scale-across TAM is Ullal's
  own number. The anchor cross-check ($3.5B FY2026 ⇒ 27% CAGR to $9B FY2030)
  compounds an unverified goal at a heroic rate.
- Falsifier: FY2026 call reports AI fabrics <$3.5B or quietly drops the goal
  language (`anet-ai-fabrics-fy26`).

### 7. The AI capex cycle is now credit-financed

- AI-related debt issuance forecast to roughly double to ~$570B in 2026; OpenAI
  credit deterioration and capex-freeze signals already hit Oracle hard in 2026.
- With 42% two-customer concentration and $9.7B of locked supply, Arista is a
  high-beta short on the AI credit complex at ~35x forward earnings.
- Falsifier: any top-4 hyperscaler guides 2027 capex flat/down (Jan–Feb 2027 calls);
  widening neocloud credit spreads. Kills bear: MSFT/META/GOOG/AMZN all guide 2027
  capex up double digits with named Ethernet fabric expansions.

## 2026-11-04 – Q3 FY2026 reconciliation

Source: `docs/research/tickers/anet-q3-2026-deep-research.md` (SEC Exhibit 99.1,
official Q3/2027 decks and official webcast captions; independent confirm pass).

- **Near-term bear branch failed.** Revenue $3,657.6M beat the ~$3.3B guide by 10.8%;
  GAAP/non-GAAP GM 63.6%/64.0% stayed within the framework; FY2026 guide rose to ~$13.3B
  and FY2027 opened at ~$18.5B. `anet-q3-fy26-print` resolved TRUE.
- **Bullwhip watch triggered, bear not confirmed.** Inventory rose 26.6% QoQ to
  $3,209.8M and purchase commitments rose 17.5% to $11.4B while deferred revenue slipped
  0.4% to $6,839.5M. This is the predeclared early-warning combination, but there was no
  acceptance-related miss and deferred revenue remains 27.3% above FY2025 year-end.
- **Margin pressure persists.** GM recovered sequentially but remained down YoY
  (Q3'25 GAAP/non-GAAP 64.6%/65.2%); FY2027 non-GAAP GM guidance remains 62–64%.
  Operating leverage, not gross-margin expansion, drove the stronger operating margin.
- **Concentration remains unresolved.** Management expects at least three and perhaps
  four 10% customers, conditional on shipments through December 31. Do not resolve the
  third-customer prediction before the FY2026 10-K.
- **AI evidence strengthened without proving share.** Official FY2027 targets are ~$7B
  AI fabrics and ~$2B campus. Scale-up has no material FY2027 revenue expected and may
  contribute in 2028; independent EtherLink versus Spectrum-X share evidence is absent.
- **Capital-return assumption falsified.** Nine-month repurchases were zero. Replace the
  former 1–2% annual share-shrink assumption with approximately flat diluted shares.
- **Scenario response:** retain 0.35/0.50/0.15. Escalate bear toward 0.25 only on another
  product-deferral decline plus rising inventory/commitments, an acceptance miss or
  reserve, an FY2027 guide cut, or confirmed hyperscaler share loss.

## Process notes

- This file was an empty stub until 2026-10-28 — the red-team process the thesis
  template demands had never been run. The 0.10 bear weight predating this pass was
  a probability assertion, not an evidence-weighted one.
- Prediction track record at time of writing: 0-for-2 resolved, both bear-direction
  (concentration rose; AI revenue disclosure never came). All pending predictions
  resolve on the FY2026 print/10-K window.

{% endraw %}
