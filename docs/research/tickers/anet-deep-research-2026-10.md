# ANET Deep Research — 2026-10-28

Multi-agent deep-research run (`/deep-research ANET`): filings, internal-state, web
(primary sources), and red-team subagents, followed by an independent confirm pass.
**Confirm pass result: 12/12 load-bearing claims verified** (7 via SEC filings adapter
with confidence 0.80, 5 via direct source fetch). This is the first deep-research pass
on ANET; no prior `docs/research/tickers/anet*` doc exists.

Next hard catalyst: **Q3 FY2026 earnings after close Tuesday 2026-11-03**
([Arista PR, 2026-10-06](https://www.arista.com/en/company/news/press-release/24817-pr-20261006)).

## Executive summary

Operations are exceptionally strong and fully verified: first $3B quarter (Q2'26
$3,035.7M, +37.7% YoY), FY2026 guide raised a third time to $12.6B (+40%), deferred
revenue $6.87B, RPO $8.4B (up from $6.1B at FY25 year-end), >100 cumulative EtherLink
AI customers. The demand side of the thesis has never looked better.

The structural side has not: top-2 customer concentration **rose** to 42% in FY2025
(prediction resolved FALSE), gross margin is declining (GAAP 62.9% Q2'26 vs 65.2%),
guidance is explicitly supply-constrained into ~~2028, and NVIDIA's networking business
(~~$31B FY2026, Spectrum-X Ethernet +2.6x YoY) breaks the thesis's "Ethernet wins ⇒
Arista wins" syllogism — Spectrum-X *is* Ethernet. The red team's strongest finding is
internal: the thesis's own model (expected CAGR 7.28% vs 12% hurdle, fair value
$100–130 vs price ~$175, scaled Kelly 3%) does not support the ~26% actual position.

## Baseline (internal state) vs new evidence

Baseline per `data/analysis/ANET.json` (as_of 2026-10-23) and `docs/thesis/ANET.md`:

| Dimension          | Baseline belief                       | New evidence this run                                                                                                                         | Verdict                        |
| ------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Revenue momentum   | FY26 guide $12.6B, Q2'26 +37.7%       | Fully verified against 10-Q + 8-K; Q3 guide $3.3B                                                                                             | Confirming                     |
| Demand visibility  | Deferred rev ~$6.9B, RPO $6.1B        | RPO actually **$8.4B** at 2026-06-30 (belief_state stale — $6.1B was the Dec-2025 figure)                                                     | Confirming, update stale field |
| Margins            | GM guide 62–64%                       | GAAP GM 62.9% Q2'26 vs 65.2%; 10-Q attributes decline to large-customer discount mix; guide explicitly includes memory/silicon cost inflation | Watch — declining within guide |
| Diversification    | top-2 <38% predicted (p=0.4)          | Resolved FALSE: 42% FY2025 (26%+16%), up from 35%                                                                                             | **Disconfirming**              |
| AI revenue         | AI fabrics goal ≥$3.5B FY26           | Verified as management call language only; **never disclosed in SEC filings** (single reportable segment)                                     | Confirming but soft-sourced    |
| Competition        | NVIDIA bundling is the risk           | Spectrum-X Ethernet +2.6x YoY (NVDA Q2 FY27 call); NVIDIA FY26 networking ~$31B                                                               | Disconfirming pressure rising  |
| Supply             | tightness to ~2028, $9.7B commitments | 10-Q escalates: "tightening supply conditions in memory and silicon markets"; new purchase-commitment risk factor                             | Confirming (constraint real)   |
| Capital allocation | $1.5B buyback program                 | **Zero repurchases H1 2026**; $817.9M remaining; Ullal 10b5-1 sales Oct 8–9 (~$97M, pre-scheduled Nov 2025)                                   | Neutral                        |

Prediction track record: 0-for-2 on resolved items, both in the bear direction
(`anet-ai-rev-fy25` mis-specified — Arista never discloses AI revenue in filings;
`anet-top2-cust-conc-fy25` genuinely wrong). Four predictions pending, all resolving
on the FY2026 print/10-K (~Feb–Mar 2027).

## Claim-by-claim findings (all verified unless noted)

### Financials (10-K FY2025 filed 2026-02-17; 10-Q FY2026-Q2 filed 2026-08-05)

- FY2025 revenue **$9,005.7M, +28.6%** (product $7,576.9M, service $1,428.8M); GM 64.1%
  flat YoY. — 10-K FY2025, Item 7 (s_0010_c03/c04). Verify: PASS 80%.
- Q2 2026 revenue **$3,035.7M, +37.7% YoY**; H1 $5,744.7M +36.5%. GAAP GM **62.9%**
  (vs 65.2%), decline "primarily driven by an increased proportion of our sales to
  large end customers who generally receive higher discounts." GAAP op margin ~45.4%;
  diluted EPS $0.95. — 10-Q FY2026-Q2, Item 2 (s_0003_c03/c04), Note 7. Verify: PASS 80%.
- **GAAP vs non-GAAP GM labeling:** filings quote GAAP 62.9%/65.2%; the non-GAAP figures
  63.4%/65.6% appear only in the 8-K reconciliation. Thesis docs must label which basis
  they cite.
- Deferred revenue **$6,865.9M** at 2026-06-30 (vs $4,061.7M a year earlier); total RPO
  **$8.4B**, ~91% recognizable within two years. — 10-Q Note 3 (s_0002_c11/c13). Verify: PASS 80%.
- Cash + marketable securities **~$13.3B** at 2026-06-30. — 10-Q Item 2 (s_0003_c05). Verify: PASS 80%.
- Buybacks: **$0 in H1 2026**; $817.9M remaining of the $1.5B May-2025 program. FY2025
  repurchases were ~$1.60B. — 10-Q Part II Item 2; 10-K Item 7 (s_0010_c11). Verify: PASS (targeted read).
- FY2025 SBC $439.2M; H1'26 $241.3M. Dilution modest (~1.3% basic→diluted).

### Customer concentration & mix

- FY2025: two end customers at **26% and 16%** (2024: 20%+15%; 2023: 18%+21%) — 42%
  top-2, up from 35%. Customers never named in filings. — 10-K Item 1 (s_0002_c06),
  Note 1 (s_0012_c13). Verify: PASS 80%.
- Customer-category mix FY2025: ~48% Cloud & AI Titans, 32% Enterprise, 20% AI &
  Specialty Providers. Product mix: ~65% Core, 18% Cognitive Adjacencies, 17% Software
  & Services. — 10-K Item 7 Overview (s_0010_c02).
- Top two resellers = 52% of accounts receivable at 2025-12-31. — 10-K Note 1.

### Guidance & management language (soft evidence — calls, not filings)

- FY2026 guide raised third time to **$12.6B (+40%)**; within it, campus goal ≥$1.25B
  and AI fabrics goal ≥$3.5B (CFO Breithaupt). — [Q2'26 call transcript](https://www.fool.com/earnings/call-transcripts/2026/08/11/arista-anet-q2-2026-earnings-call-transcript/). Direct-fetch verified.
- Q3 2026 guide: revenue ~**$3.3B**, non-GAAP op margin 48–49%, non-GAAP EPS $1.06–1.08.
  — [Q2'26 earnings release, SEC Ex-99.1](https://www.sec.gov/Archives/edgar/data/1596532/000159653226000174/ex991q226-earningsrelease.htm). Direct-fetch verified.
- EtherLink **>100 cumulative AI customers** (from 4–5 in 2024); Scale-Across ~30% of
  the ≥$3.6B AI target; Scale-Across TAM claimed $15–20B by 2030 (Ullal's number).
- Supply: "The industry is going to have a 2-year problem… until 2028" (Ullal);
  purchase commitments tripled to $9.7B; memory secured into 2027. Guide is
  supply-constrained: "we are guiding based on what we're confident we can get the
  supply for" (CFO) — i.e., the $12.6B is a supply-delivery forecast, not booked demand.
- NVIDIA positioning: "we live in an NVIDIA world… there's very little participation
  from Arista" in full-stack NVLink domains; Arista wins in scale-out/scale-across (Ullal).

### Risk-factor changes (10-Q FY2026-Q2 vs 10-K FY2025)

- New: significant purchase commitments / supply-shortage risk bullet; memory **and
  silicon** tightening (10-K said memory only); tariff risk updated (Feb 2026 Supreme
  Court IEEPA ruling; Sections 122/301). — 10-Q Item 1A (s_0007_c02/c11).
- Persistent: "we have not established broad market awareness or acceptance of our AI
  Ethernet products"; reliance on Broadcom as predominant merchant-silicon vendor;
  white-box/open-source competition named. — 10-K Item 1A (s_0003_c09).

### Competitive landscape (primary sources)

- **NVIDIA**: networking record quarter, +18% QoQ; "Spectrum-X Ethernet… grew 2.6x
  year-over-year" (CFO Kress). — [NVDA Q2 FY2027 call transcript](https://s201.q4cdn.com/141608511/files/content_files/TRANSCRIPT_-NVIDIA-Corp-NVDA-US-Q2-2027-Earnings-Call-26-August-2026-5_00-PM-ET.pdf). Direct-fetch verified.
  FY2026 networking ~$31B "up more than 10x" (includes InfiniBand/NVLink/DPU — overstates
  overlap with Arista). Meta/Microsoft/Oracle named as Spectrum-X Ethernet adopters in
  [NVDA Q3 FY26 release](https://nvidianews.nvidia.com/news/nvidia-announces-financial-results-for-third-quarter-fiscal-2026).
- **Broadcom**: Q3 FY26 AI semis $16.7B (+221%); Tomahawk 6 (102.4 Tbps) in production
  volume — Arista's 1.6T platforms ride this silicon; Broadcom is both supplier and
  white-box enabler. — [AVGO Q3 FY26 release](https://investors.broadcom.com/news-releases/news-release-details/broadcom-inc-announces-third-quarter-fiscal-year-2026-financial).
- **Cisco**: FY26 AI infrastructure orders $9.3B (~4.5x FY25) — call language, not a
  reported segment.
- **UEC**: Spec 1.0 (June 2025) remains the latest; no newer release found.

### Product / insider

- 7060XE7 1.6T Etherlink (up to 100 Tbps system bandwidth, LPO cutting optics power
  ~60%); production 2027. — Q2'26 earnings release (above).
- CEO Ullal sold ~~455–460K shares (~~$96.5–97.6M) Oct 8–9, 2026 under Rule 10b5-1 plans
  adopted Nov 14, 2025 — recurring pre-scheduled pattern, not discretionary.

## Red-team case (preserved, not averaged away)

Ranked by thesis-killing potential. Full detail in the run; targets are
`data/analysis/ANET.json` belief_state (p=0.4, conf=0.7; scenarios 0.4/0.5/0.1) and
the driver build ($23.5B FY2030 revenue, EPS $7.18).

1. **The model disproves the sizing.** Expected CAGR 7.28% vs 12% hurdle; fair value
   $100–130 vs price ~$175; scaled Kelly 3% vs actual ~26% of portfolio (~9–13x the
   model-justified size). Even if every operational claim survives, the position is a
   conviction override the thesis's own math doesn't support. October's −18% drawdown
   ($216.74 high Oct 9 → ~$177 Oct 26, below the 50-day) is the market testing that gap.
2. **"Ethernet wins ⇒ Arista wins" is broken.** Spectrum-X _is_ Ethernet; NVIDIA's
   networking division (~$31B FY26) is >3x Arista's entire company; NVLink Fusion
   opening to third-party XPUs (incl. AWS Trainium) refutes the "non-NVDA accelerators
   pair with Arista by default" optionality.
3. **Margin erosion is live, not hypothetical.** GM down ~230bps YoY (both bases);
   driver build holds 39% net margin flat to 2030 through a supply-tight period the
   CFO says lasts to ~2028, with cloud-titan (lower-GM) mix _rising_.
4. **Concentration rose while anchors build exit ramps.** 42% top-2 (prediction resolved
   FALSE); Meta extended its Broadcom custom-silicon partnership through 2029; Microsoft
   SONiC added 800GbE; white-box growing ~18.5% CAGR.
5. **Acceptance clauses + 3x purchase commitments = bullwhip convexity.** Product
   deferrals (+$600M QoQ) are revenue customers can stall; $9.7B of locked supply
   purchases sit on the other side. The $12.6B guide is a supply forecast, not demand.
6. **The AI leg rests on unaudited IR constructs.** AI revenue is never in the filings;
   the $45B TAM is secondary-sourced; the scale-across TAM is Ullal's own number.
   Voluntary disclosure means goal abandonment would have no filing footprint.
7. **AI capex is now credit-financed; ANET is short the financing crack at 0.1 bear
   weight.** AI-related debt issuance forecast ~$570B in 2026; ANET's October selloff
   was attributed to AI-infrastructure-financing fear; the decision journal assigns
   only 0.1 to a demand-side break the week before the market started pricing it.

Falsifiers (confirm bear): Q3 print below $3.3B guide or GAAP GM <62%; FY26 10-K top-2
≥45% or no third ≥10% customer; deferred revenue stalling while purchase commitments
climb; any top-4 hyperscaler guiding 2027 capex flat/down; Dell'Oro/IDC share data
showing Spectrum-X > EtherLink in 2026 builds. (Kill bear): Q3 beat-and-raise with FY
guide ≥$13B + named third ≥10% customer; GM back above 64% in H2'26; AI fabrics ≥$3.5B
_and_ third-party AI-Ethernet share ≥20% corroborated; MSFT/META/GOOG/AMZN all guide
2027 capex up double digits.

Overconfidence vs its own evidence log: bear weight 0.1 contradicts the thesis's own
four-item evidence_against list; `docs/thesis/ANET/ANET-bear-evidence.md` is an empty
stub — the red-team process the template demands has never been run; resolved
predictions are 0-for-2, both bear-direction; the pending falsification apparatus is
single-sourced to one management team's self-set goals.

Steelman (where the bear case is weak): demand is real and unusually visible (verified
above); op-margin target was _raised_ to 48–49% — opex leverage is offsetting GM
pressure; NVIDIA's $31B overstates overlap; concentration rose because anchors grew
fastest (demand health); custom silicon cuts both ways — Meta/OpenAI custom accelerators
still need merchant-silicon Ethernet fabrics, which is the thesis's actual claim.

## Open questions / unverified claims

- `ANET.evidence.jsonl:1` (2026-02-15) claims "FY2025 AI networking revenue $850M, 800G
  shipments +120%" sourced to investors.arista.com — **irreconcilable with the filings**
  (no AI line item exists) and with the later log entry saying Arista never discloses AI
  revenue. Likely contaminated; needs correction or re-sourcing.
- `ANET.evidence.jsonl:3` (2026-07-20) says "Nvidia launches Spectrum-X" — Spectrum-X
  launched in 2024; the entry is misdated and its bearish weight never propagated.
- Quarterly (>10%) customer concentration is not disclosed in 10-Qs — no intra-year
  read on the 42% exists until the FY2026 10-K.
- White-box ODM primary statements (Accton/Celestica/Quanta) not retrieved this sweep;
  white-box threat covered only via Arista's own Q&A framing and market reports.
- The "2 Ms" 10%-customer Q&A exchange on the Q2'26 call was only partially captured;
  worth a full read before the Q3 print.
- `ANET.json` belief_state carries RPO $6.1B — stale (Dec-2025 figure); actual at
  2026-06-30 is $8.4B.
- Whether the Aug-2026 investor deck's open-CPO design signals a real LPO→CPO timeline
  (open question on record: 800G DSP → 1.6T LPO/CPO migration pace).

## Action items

1. **Populate the bear evidence file** (`docs/thesis/ANET/ANET-bear-evidence.md`,
   currently an empty stub) with the seven red-team arguments above, and re-justify or
   re-weight the 0.1 bear scenario before the 2026-11-03 Q3 print.
2. **Reconcile position sizing in the decision journal**: ~26% actual vs 3% scaled
   Kelly / $100–130 fair value — either document the discretionary override with
   explicit conditions, or trim toward model-justified size.
3. **Fix the evidence log**: correct or quarantine `ANET.evidence.jsonl` entries 1 and 3.
4. **Update stale belief_state fields**: RPO $6.1B → $8.4B (2026-06-30); label GM
   citations GAAP vs non-GAAP in `docs/thesis/ANET.md`.
5. **Q3 print checklist for 2026-11-03**: revenue vs ~$3.3B guide; GAAP GM vs 62–64%
   FY guide; deferred-revenue trajectory (stall = red flag 5 above); purchase-commitment
   balance; AI fabrics ≥$3.5B / campus ≥$1.25B progress language; any third ≥10%
   customer hint; FY guide raised a fourth time?
6. **Watch items into Feb–Mar 2027 resolution window**: FY26 10-K concentration
   disclosure (predictions `anet-third-10pct-customer-fy26`, top-2 share);
   Dell'Oro/Crehan AI-Ethernet share data for Spectrum-X vs EtherLink; hyperscaler
   2027 capex guides (Jan–Feb 2027 calls).

---

_Sources: SEC filings via `scripts.analysis.filings_adapter` (10-K FY2025
fil_0001596532-26-000013; 10-Q FY2026-Q2 fil_0001596532-26-000175), SEC Ex-99.1 Q2'26
earnings release, Arista IR press releases, Q2'26 earnings call transcript (Motley
Fool), NVDA Q2 FY2027 call transcript (NVIDIA IR), Broadcom IR releases, UEC. Confirm
pass: fresh-context agent, 12/12 verified (7 filings-adapter verifies at 0.80
confidence, 5 direct source fetches)._
