# ANET Q3 FY2026 Deep Research — 2026-11-04

Multi-agent deep-research run covering the Q3 FY2026 earnings release, official
prepared materials, official webcast captions, internal thesis state, and an adversarial
red team. A fresh-context confirm pass verified **10/10 factual and arithmetic claim
groups** and separately reviewed the scenario recommendation. Q3 figures were read
directly from the SEC earnings-release exhibit because the local 8-K adapter omits
exhibit contents; applicable Q2/FY2025 adapter checks passed at 0.80 confidence.

## Primary sources

- **S1:** [Q3 FY2026 earnings release, SEC Exhibit 99.1, 2026-11-03](https://www.sec.gov/Archives/edgar/data/1596532/000159653226000252/ex991q326-earningsrelease.htm).
- **S2:** [Arista Q3 FY2026 earnings presentation](https://s21.q4cdn.com/861911615/files/doc_financials/2026/q3/ANET_Earnings_Presentation_Q326.pdf).
- **S3:** [Arista 2027 Outlook presentation](https://s21.q4cdn.com/861911615/files/doc_financials/2026/q3/Arista_Supplemental_Presentation_2027_Outlook.pdf).
- **S4:** [Arista Q3 FY2026 earnings event and official webcast](https://investors.arista.com/Events/Events/Event-Details/2026/Arista-Networks-Q3-2026-Earnings-Conference-Call--Webcast/default.aspx).
- **C:** [Official automated webcast captions](https://dvr.events.q4inc.com/captions/864449039/c7fa6753-75fa-4740-8445-f74459440a3a/subtitles.m3u8), cited below by segment range. Captions are noisy ASR; all material numbers were cross-checked to S1–S3.
- **F1:** Q2 FY2026 10-Q `fil_0001596532-26-000175`.
- **F2:** FY2025 10-K `fil_0001596532-26-000013`.

## Executive summary

**Classification: near-term Bull; long-term scenario weights unchanged.** Q3 revenue of
**$3,657.6M** exceeded the approximately $3.3B guide by **$357.6M / 10.8%** and grew
**58.5% YoY**. GAAP/non-GAAP gross margin was **63.6% / 64.0%**, operating margin was
**44.9% / 49.1%**, and diluted EPS was **$1.22 / $1.20**. The near-term supply-miss and
margin-break branches did not occur. [S1, pp. 1, 3–4](https://www.sec.gov/Archives/edgar/data/1596532/000159653226000252/ex991q326-earningsrelease.htm)

Management raised FY2026 revenue guidance for the fourth time to approximately
**$13.3B / +48%**, then issued an initial FY2027 outlook of **38–40% growth / about
$18.5B**, including approximately **$7B AI fabrics** and **$2B campus**. FY2027
non-GAAP gross-margin and operating-margin frameworks are **62–64%** and about **49%**.
These are official guidance targets, not actual revenue. [C1090–1095](https://dvr.events.q4inc.com/captions/864449039/c7fa6753-75fa-4740-8445-f74459440a3a/segment_1090.vtt), [S3, pp. 15, 17](https://s21.q4cdn.com/861911615/files/doc_financials/2026/q3/Arista_Supplemental_Presentation_2027_Outlook.pdf)

The main bear evidence is now working-capital convexity rather than a demand miss:
inventory rose **26.6% QoQ**, purchase commitments rose **17.5%** to **$11.4B**, and
total deferred revenue edged down **0.4%**. The print therefore strengthens the
operating thesis while leaving acceptance timing, customer concentration, and
post-2027 growth durability unresolved. [S1, p. 5](https://www.sec.gov/Archives/edgar/data/1596532/000159653226000252/ex991q326-earningsrelease.htm), [S2, pp. 6–7](https://s21.q4cdn.com/861911615/files/doc_financials/2026/q3/ANET_Earnings_Presentation_Q326.pdf)

**Recommendation:** resolve `anet-q3-fy26-print` **TRUE**; retain bull/base/bear at
**0.35 / 0.50 / 0.15** and EPS CAGRs at **28% / 18% / 8%**. Rebase the driver model to
the new FY2026/FY2027 evidence, but do not promote the base EPS CAGR until the Q3 10-Q
clarifies deferred-revenue churn and inventory exposure and the model's different time
bases are explicitly reconciled.

## Baseline versus new evidence

| Dimension                | Pre-print baseline                                 | Q3 evidence                                                                                 | Verdict                                                          |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Q3 revenue               | Guide approximately $3.3B                          | $3,657.6M; +10.8% versus guide                                                              | Bull; prediction resolves TRUE                                   |
| FY2026 revenue           | $12.6B after three raises                          | Fourth raise to approximately $13.3B / +48%                                                 | Bull; old driver anchor stale                                    |
| FY2027                   | No official outlook in model                       | 38–40% / about $18.5B                                                                       | Bull, but guidance rather than actual                            |
| AI fabrics               | FY2026 goal at least $3.5B; FY2030 model $9B       | FY2027 target about $7B                                                                     | Strong near-term validation; post-2027 growth still unproven     |
| Campus                   | FY2026 goal at least $1.25B; FY2030 model $2.2B    | FY2027 target about $2B                                                                     | Strong near-term validation; terminal leg nearly pulled forward  |
| Gross margin             | 62–64% framework; Q2 GAAP 62.9%                    | Q3 GAAP/non-GAAP 63.6%/64.0%; FY2027 non-GAAP 62–64%                                        | Stabilized within framework; still down YoY                      |
| Deferred revenue         | Q2 $6,865.9M and rising                            | Q3 $6,839.5M, down 0.4% QoQ                                                                 | Bear-watch, not a demand miss                                    |
| Inventory / commitments  | Q2 inventory $2,535.3M; commitments $9.7B          | Inventory $3,209.8M; commitments $11.4B                                                     | Bear exposure increased                                          |
| Customer diversification | FY2025 top two 42%; third-customer prediction open | Management expects at least three, perhaps four 10% customers if shipments land by year-end | Encouraging, unresolved until FY2026 10-K                        |
| Capital returns          | Zero H1 repurchases; driver shares flat            | Zero 9M repurchases; Q4 diluted-share guide 1.280B                                          | Flat-share assumption confirmed; 1–2% shrink assumption rejected |

## Claim-by-claim findings

### Q3 financials and quality of the beat

- Revenue was **$3,657.6M**, up **58.5% YoY** and **20.5% QoQ**. Product revenue was
  **$3,190.0M** and service revenue **$467.6M**, a calculated **87.2% / 12.8%** mix.
  Nine-month service revenue was **$1,295.8M**, up **25.0% YoY**. [S1, p. 3](https://www.sec.gov/Archives/edgar/data/1596532/000159653226000252/ex991q326-earningsrelease.htm)
- GAAP/non-GAAP gross margin was **63.6% / 64.0%**, up from Q2's 62.9% / 63.4% but down
  from Q3 2025's 64.6% / 65.2%. GAAP/non-GAAP operating margin was **44.9% / 49.1%**.
  Opex leverage therefore offset gross-margin pressure. [S1, p. 4](https://www.sec.gov/Archives/edgar/data/1596532/000159653226000252/ex991q326-earningsrelease.htm), [S2, pp. 9–10](https://s21.q4cdn.com/861911615/files/doc_financials/2026/q3/ANET_Earnings_Presentation_Q326.pdf)
- GAAP net income was **$1,560.4M** versus non-GAAP **$1,530.8M**. The reconciliation
  excludes **$134.5M of strategic-investment gains**, so GAAP EPS growth overstates the
  operating improvement; non-GAAP EPS still grew to **$1.20** from a recast $0.77. [S1, p. 4](https://www.sec.gov/Archives/edgar/data/1596532/000159653226000252/ex991q326-earningsrelease.htm)
- Cash plus marketable securities was **$14,359.0M**. Nine-month CFO was **$3,977.4M**;
  capex was **$184.9M**, giving calculated FCF of **$3,792.5M**. Nine-month repurchases
  were zero. [S1, pp. 5–6](https://www.sec.gov/Archives/edgar/data/1596532/000159653226000252/ex991q326-earningsrelease.htm)
- FY2025 diluted EPS was **$2.75**, not the $2.74 used in the prior driver note.
  Adapter verification: PASS, 0.80; F2 `s_0012`, income statement p. 69.

### Guidance and management commentary

- Q4 guidance is **$3.9–4.0B revenue**, **63–64% non-GAAP gross margin**, **48–49%
  non-GAAP operating margin**, and **$1.26–1.30 non-GAAP EPS**. Adding revenue guidance
  to 9M revenue implies FY2026 revenue of **$13.3023–13.4023B** (calculated, not a
  separately reported range). [S1, pp. 2–3](https://www.sec.gov/Archives/edgar/data/1596532/000159653226000252/ex991q326-earningsrelease.htm), [S2, p. 15](https://s21.q4cdn.com/861911615/files/doc_financials/2026/q3/ANET_Earnings_Presentation_Q326.pdf)
- The FY2027 outlook targets approximately **$7B AI fabrics** and **$2B campus**, from
  implied FY2026 bases of $3.5B and $1.25B. The presentation explicitly labels those
  bases as implied from the FY2027 targets and growth rates. [S3, p. 15](https://s21.q4cdn.com/861911615/files/doc_financials/2026/q3/Arista_Supplemental_Presentation_2027_Outlook.pdf)
- Scale-up remains in early trials, with no material FY2027 revenue expected and
  possible contribution in 2028. FY2026 scale-out/scale-across was described as roughly
  70/30, with scale-across at least one-third and likely higher in FY2027. [C1431–1455](https://dvr.events.q4inc.com/captions/864449039/c7fa6753-75fa-4740-8445-f74459440a3a/segment_1431.vtt)
- Management expects the existing two 10% customers to remain and to add at least one
  and possibly two more, subject to shipping enough product through December 31. This
  does **not** resolve `anet-third-10pct-customer-fy26`. [C1488–1509](https://dvr.events.q4inc.com/captions/864449039/c7fa6753-75fa-4740-8445-f74459440a3a/segment_1488.vtt)
- Management characterized deferred revenue as variable/lumpy, with large inflows and
  outflows; the full-year trend remains upward and year-end 2026 is expected above
  year-end 2025. This is guidance intent, not a hard balance forecast. [C2004–2058](https://dvr.events.q4inc.com/captions/864449039/c7fa6753-75fa-4740-8445-f74459440a3a/segment_2004.vtt)

### Working capital and supply exposure

- Inventory increased to **$3,209.8M** from $2,535.3M at Q2, up **26.6% QoQ**.
  Purchase commitments increased to**$11.4B** from $9.7B, up **17.5%**, with about 80%
  expected to be used within 12 months. [S1, p. 5](https://www.sec.gov/Archives/edgar/data/1596532/000159653226000252/ex991q326-earningsrelease.htm), [S2, p. 7](https://s21.q4cdn.com/861911615/files/doc_financials/2026/q3/ANET_Earnings_Presentation_Q326.pdf)
- Current plus non-current deferred revenue was **$6,839.5M**, down $26.4M / 0.4% from
  Q2 but up $1,467.1M / 27.3% from FY2025 year-end. The sequential stall is a bear-watch
  signal, while the annual trend remains positive. [S1, p. 5](https://www.sec.gov/Archives/edgar/data/1596532/000159653226000252/ex991q326-earningsrelease.htm), [S2, p. 6](https://s21.q4cdn.com/861911615/files/doc_financials/2026/q3/ANET_Earnings_Presentation_Q326.pdf)

## Red-team case — preserved

Ranked by thesis-killing potential.

1. **Inventory and binding commitments can outlive the demand cushion.** Inventory rose
   26.6% and commitments 17.5% QoQ while deferred revenue stopped growing. If customer
   acceptances slow, Arista can be left converting locked supply into discounted or
   reserved inventory. The Q3 revenue beat rules out a current demand miss; it does not
   remove this forward risk.
2. **The old FY2030 ladder was internally stale.** The old $23.5B FY2030 model still
   started from the $12.6B FY2026 guide. Against the new FY2027 targets, unchanged
   terminal values would imply only 8.7% AI and 3.2% campus annual growth after FY2027.
   The model must say explicitly that this is a digestion/normalization case rather than
   silently carrying obsolete FY2026 anchors.
3. **Concentration and competitive share remain unproven.** FY2025's top-two share was
   42%. Management's three/four-customer expectation is shipment-dependent, and no Q3
   filing table updates concentration. Record Arista growth and NVIDIA Spectrum-X growth
   can coexist while the TAM expands; neither establishes share.
4. **Quality adjustments matter, but do not overturn the beat.** Strategic-investment
   gains flattered GAAP EPS, service mix fell to 12.8%, and gross margin remained down
   YoY. Against that, non-GAAP operating income and margin still grew strongly.
5. **The capital-return tailwind is absent.** Zero 9M repurchases falsify the thesis's
   former 1–2% annual share-shrink assumption. Flat diluted shares are now the more
   defensible base assumption; refusing to repurchase at a premium may be rational, but
   it is not an EPS tailwind.
6. **Position governance is separate from operating strength.** The prior journal's
   discretionary position-size override remains a risk decision, not something a strong
   quarter automatically validates. Live market data and derived sizing belong to the
   pipeline, not this dated research document.

### Bear falsifiers after Q3

- Confirm bear: another product-deferral decline alongside inventory/commitment growth;
  an acceptance-related miss or inventory reserve; FY2027 guidance cut; no third 10%
  customer in the FY2026 10-K; independent evidence of EtherLink share loss.
- Kill or weaken bear: deferred revenue/RPO resumes growth while inventory converts
  without discounting; FY2026 and FY2027 guidance is delivered; a third/fourth 10%
  customer is disclosed; scale-up reaches production orders in 2028.

## Driver-model reconciliation

The base driver build is rebased as follows. Dollar values are billions except EPS.

| Driver            | Revised formula                  | FY2030 value | Evidence / interpretation                                                          |
| ----------------- | -------------------------------- | -----------: | ---------------------------------------------------------------------------------- |
| AI fabrics        | $45B TAM × 20% share             |       $9.000 | Terminal assumption retained; new ~$7B FY2027 target implies 8.74% CAGR thereafter |
| Core DC / routing | $6.7866 FY2026 residual × 1.11⁴  |      $10.303 | Residual = $13.3B guide − $3.5B AI − $1.25B campus − $1.7634B service estimate     |
| Campus            | $2.0B FY2027 target × 1.032³     |       $2.198 | Explicit post-2027 normalization                                                   |
| Services          | $1.7634B FY2026 estimate × 1.15⁴ |       $3.084 | FY2026 estimate = 9M actual $1.2958B + flat-Q4 $0.4676B; estimate, not guidance    |
| **Total**         | Sum                              |  **$24.585** | Approximately 9.94% CAGR from the ~$18.5B FY2027 target                            |

At a 39% net margin and 1,280M diluted shares, derived FY2030 EPS is approximately
**$7.49**, a **22.2%** FY2025–FY2030 CAGR from actual FY2025 EPS of $2.75. This is a
cross-check, not the engine's rolling-five-year CAGR. The base scenario's `epsCagr`
remains **18%** as a distinct, more conservative assumption: the driver build embeds
unproven terminal AI share and management's FY2027 targets, while the scenario does not
capitalize the full driver-implied upside.

## Open questions / unverified claims

- The Q3 10-Q was not yet available in the local filings workspace. RPO, binding
  future-shipment obligations, inventory composition, evaluation inventory, deferred
  COGS, gross deferred-revenue churn, strategic-investment detail, and remaining buyback
  authorization still require the 10-Q.
- Q3 customer-concentration percentages and actual AI/campus revenue were not disclosed.
  Management targets must not be promoted into actuals.
- The FY2026 service value and core residual in the revised driver build are analytical
  estimates, not company guidance.
- Independent Dell'Oro/Crehan/IDC evidence for Spectrum-X versus EtherLink share remains
  missing.
- Official captions are automated and contain numeric ASR errors. This research uses
  them only for management intent and cross-checks every material number to S1–S3.

## Action items

1. Resolve `anet-q3-fy26-print` TRUE and keep all full-year predictions open until actual
   FY2026/FY2027 results.
2. Rebase the base drivers to approximately $24.585B FY2030 revenue and $7.49 EPS;
   retain scenario probabilities and EPS CAGRs with the explicit distinction documented
   above.
3. Replace the 1–2% share-shrink assumption with approximately flat shares until
   repurchases resume; use the 1.280B Q4 diluted-share guide in the driver cross-check.
4. Add dated FY2027 predictions for total revenue, AI fabrics, and campus.
5. On Q3 10-Q publication, first inspect deferred-revenue roll-forward, purchase
   commitments, inventory composition, RPO, investment gains, and Part II repurchases.
6. Keep the position-size override under separate review; refresh market data and
   derived sizing through `sync_configs`, not by hand.
