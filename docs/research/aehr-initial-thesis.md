# AEHR (Aehr Test Systems) — Initial Deep Research

**Date: 2026-10-12**
**Method:** `/deep-research AEHR` — three parallel subagents (SEC filings, internal state, web primary sources) + deterministic confirm pass via `scripts/analysis/filings_adapter.py verify`.
**Status:** Findings doc only. No thesis/belief-state artifacts created yet (see Action items).

## Executive summary

Aehr Test Systems (Fremont, CA; Nasdaq: AEHR) sells wafer-level and package-level burn-in/test systems (FOX-XP/NP/CP + WaferPak contactors; Sonoma/Tahoe/Echo package systems via the Incal acquisition). The story has **rotated from a single-thread SiC/EV bet to an AI-infrastructure bet**: fiscal 2024 was 92% EV/power-semiconductor revenue with one customer at 67%; fiscal 2026 was 17% EV/power with the top customer at 26% and growth driven by silicon photonics and AI-processor burn-in.

The bull case rests on hard numbers: **$80.6M backlog (5.3× YoY), $100.6M effective backlog, FY2027 guidance of $130–150M revenue (~2.6–3× growth) with 18–22% non-GAAP net margin**, $116.5M cash and no debt. The bear case is equally concrete: the market already prices this in — **$2.61B market cap on $50M trailing revenue (P/S ~55, ~90× guided forward non-GAAP earnings)**, +244.8% over 52 weeks, 16% short interest, FY2026 was GAAP-loss-making (−$0.23 diluted), and concentration has shifted to new unnamed AI/hyperscale customers rather than disappeared. Next hard catalyst: **Q1 FY2027 earnings on 2026-11-02** — the first print against the FY2027 guide.

## Baseline vs. new evidence

**Internal baseline: clean.** Zero AEHR artifacts anywhere in the repo — no `data/analysis/AEHR.json`, no `docs/thesis/AEHR.md`, no price-pipeline coverage (the TWRR universe derives from `data/transactions.csv`), no industry-layer doc for semiconductor test/SiC. Existing analysis tickers: ANET, GOOG, PDD, VT only.

**Premise corrections found during research:**

- AEHR's fiscal year ends the **Friday nearest May 31** (FY2026 ended 2026-05-29), not ~July 31. On 2026-04-02 the board approved changing it to the **Friday nearest June 30**, effective FY2027 (ends 2027-06-25). [10-K FY2026, Item 7]
- Q1 FY2027 (Jun 27 – Sep 25, 2026) has **not** been reported; it prints **2026-11-02 after close**. Latest actuals: Q4/FY2026, reported 2026-07-14. [aehr.com 2026-10-08 release]

## Claim-by-claim breakdown (confirm-pass verified)

All six load-bearing quantitative claims **PASSED** `filings_adapter verify` at 80% confidence (threshold 60%) against the FY2026 10-K (accession 0001654954-26-006919, filed 2026-07-27; https://www.sec.gov/Archives/edgar/data/1040470/000165495426006919/aehr_10k.htm).

### Financials (10-K FY2026, Item 8; $ thousands)

|                  | FY2026   | FY2025  | FY2024 |
| ---------------- | -------- | ------- | ------ |
| Revenue          | 50,001   | 58,968  | 66,218 |
| Gross margin     | 35.3%    | 40.6%   | 49.1%  |
| Operating income | (14,149) | (5,677) | 10,078 |
| Net income       | (7,126)  | (3,910) | 33,156 |
| Diluted EPS      | $(0.23)  | $(0.13) | $1.12  |

FY2024 net income included a $21.9M deferred-tax valuation-allowance release (Item 7) — underlying profitability was ~$11.3M. FY2026 decline: −$19.9M wafer-level contactor revenue (EV/SiC softness), partly offset by +$10.4M systems revenue (silicon photonics). ✅ confirm pass.

### Customer concentration (10-K Item 1 / Note 1)

|                           | FY2026 | FY2025 | FY2024 |
| ------------------------- | ------ | ------ | ------ |
| Top-5 customers % revenue | ~70%   | 77%    | 93%    |
| Largest customer          | 26.3%  | 38.6%  | 67.3%  |

Customers are never named (letters only). The onsemi identification is widely reported but **unverified from primary sources**. Diversification is real and measurable. ✅ confirm pass (70% claim).

### Revenue mix (10-K Note 11 / Item 1)

- Product: Systems $28.7M / Contactors $14.9M / Services $6.4M (FY2026).
- Wafer-level lines: 63% of FY2026 revenue vs 98% FY2024; package-level (Incal) 37% vs 2%.
- **EV & power semiconductor: 17% / 41% / 92% of revenue (FY26/25/24).** ✅ confirm pass.
- Geography: Asia 45.6%, US 41.3%, Europe & ME 13.1% (FY2026).

### Backlog, cash, capital structure (10-K Item 1 / Item 8 / Note 10)

- **Backlog $80.6M at 2026-05-29 vs $15.2M at 2025-05-30** (12-month shippable POs). ✅ confirm pass. Effective backlog incl. post-quarter bookings: **$100.6M** [Q4 FY2026 release, 2026-07-14: https://www.aehr.com/2026/07/aehr-test-systems-reports-fiscal-2026-fourth-quarter-and-full-year-financial-results-with-record-quarterly-bookings-and-100-million-effective-backlog/].
- **Cash $116.4M, no debt, equity $219.5M** at FYE2026. ✅ confirm pass. Caveat: FY2026 financing inflow +$97.2M came from **ATM equity sales** under a $100M shelf (Nov 2025 @ $25.89 → Apr 2026 @ $73.87; fully utilized) — the fortress balance sheet is dilution-funded. A new S-3 shelf was filed ~Aug 2026 (details unverified).
- Shares outstanding: 32,620,450 (2026-07-20, 10-K cover).

### Guidance & recent bookings (company statements, aehr.com)

- **FY2027 guide: revenue $130–150M; non-GAAP net income 18–22% of revenue** [Q4 FY2026 release].
- 2026-04-16: record $41M follow-on Sonoma order from lead hyperscale AI customer. 2026-08-~12: $22M follow-on AI-processor WLBI order. 2026-10-07: ~$6M follow-on Sonoma orders for the customer's **second** next-gen AI processor, ramp at a Taiwan OSAT in CY2027 [https://www.aehr.com/2026/10/aehr-receives-follow-on-sonoma-production-orders-for-lead-hyperscale-customer-s-next-generation-ai-processor/].
- ~$8M new SiC WaferPak orders in the month before 2026-07-14, incl. "a key order directly from one of the largest automotive companies in the world" for SiC qualification.
- New silicon photonics customer win 2026-03-31 ("global leader in networking"); follow-on SiPh orders Jun/Jul/Aug 2026.
- WLBI benchmark with a "major supplier of AI accelerators, CPUs, and network processors" exceeded expectations; pilot production interest expressed [Q4 FY2026 release].

### Industry context (PCIM/Mesago 2026-07-29, citing TrendForce/Yole: https://news.pcim.mesago.com/sic-vs-gan-in-2026-and-beyond-a-947d5edd20f5b5a7f22b8fbecd6f9ec3/)

- SiC recovering: 1.17M EV traction inverters in Q1 2026 (17.2% attach); 800V vehicles +21% YoY.
- But SiC overcapacity persists until **2027–2028** (Yole: ~~50% substrate utilization 2025); Chinese substrate price war (~~$400/6-inch).
- Yole: $11B power SiC device market by 2031. New vector: 800V DC data-center power (~2027).
- Named WLBI competitors: **unverified** — the 10-K names none; Jefferies' "only vendor offering both wafer- and package-level burn-in" is sell-side opinion.

### Key risks (10-K Item 1A, near-verbatim)

1. Customer concentration — "operating results could suffer dramatically."
2. Backlog quality — POs cancellable/reschedulable with limited penalties; "backlog … is not necessarily indicative of actual sales." Sales typically realized near quarter-end.
3. FOX/Sonoma market acceptance — lengthy customer qualification/correlation before production adoption.
4. **Demand obsolescence from yield improvement** — customers improving failure rates or switching to sampling (vs 100% burn-in) reduces demand. This is the structural bear case on the whole category.
5. Tariffs/trade — tariffs raised FY2026 cost of revenue; 59% of FY2026 sales delivered outside the US.

### Valuation snapshot (stockanalysis.com, 2026-10-12 ~10:20 EDT, intraday — cross-check before acting)

Price **$80.10**; market cap **$2.61B**; EV $2.51B; P/S 55.2 TTM / ~20 forward-guided; P/B 12.5; net cash $3.26/share; beta 3.48; short interest 16%; 52-wk +244.8%. Sell-side consensus "Strong Buy," avg target $128 (6 analysts — aggregator data). At guidance midpoint ($140M rev, ~20% non-GAAP margin ≈ $0.85/sh), price ≈ **~90× guided forward earnings** (our arithmetic).

## Open questions / unverified claims

1. **Q1 FY2027 print (2026-11-02)** — first evidence for/against the FY2027 guide; nothing pre-Nov is actuals.
2. onsemi as lead SiC customer — never confirmed in a primary document.
3. Identity of the deceased officer (Q4 FY2026 non-GAAP footnote: severance "due to the passing of an officer") — check the Sep 2026 proxy (DEF 14A filed 2026-09-09; annual meeting 2026-10-19).
4. Aug 2026 S-3 shelf size/terms — check EDGAR before assuming dilution intent.
5. Named wafer-level burn-in competitors — not established from primary sources this pass.
6. CEO ~40k-share sale (~Aug 2026, secondary sources) — verifiable via Form 4 if relevant.
7. XBRL values in the vendored filings layer returned null — numbers here are from HTML statement text, not XBRL cross-check (see tooling notes).

## Filings-layer evaluation (feeds the engine's "unevaluated" component)

The vendored stack **partially worked**, first real appliance test:

- **Works:** `SecDownloader` ingestion (driven via a throwaway script; the CLI has no download command and the ingestion host layer was deliberately not vendored — `scripts/vendor/filings/VENDORED.md`); `list`/`sections`/`read`/`verify` against `~/.cache/filings`. SEC User-Agent via `SEC_USER_AGENT` env var.
- **Broken/gaps:** (1) XBRL value extraction returns nulls (`get_financial_statement` labels OK, all values empty); (2) `list` CLI prints `form_type` as N/A; (3) `verify` passes but its top BM25 spans are noisy cover-page fragments, not the load-bearing paragraph.
- **Implication:** usable for section reading and coarse confirm passes; not yet trustworthy for XBRL-grade number extraction. A small ingestion CLI wrapper would remove the throwaway-script step.

## Action items

1. **`/thesis-update AEHR`** — create `docs/thesis/AEHR.md` (house structure per ANET.md), `data/analysis/AEHR.json` (schema 1.1.0), and `AEHR.evidence.jsonl` seeded from this doc. Decision first: does the user want AEHR in the tracked analysis universe at all, given ~90× guided earnings valuation?
2. **Calendar the 2026-11-02 Q1 FY2027 print** as the first falsifiable checkpoint; candidate predictions (with target dates): FY2027 revenue ≥ $130M (guide low end); top-customer concentration stays ≤ 30% in FY2027; SiC/power revenue mix continues recovering off the 17% trough.
3. **Resolve open items 3–5** (proxy, S-3, competitor naming) before any sizing decision.
4. **Decide on an industry-layer doc** — nothing in `docs/thesis/industry/` covers semiconductor test/SiC; AEHR's AI angle overlaps `cloud-ai-ecosystem.md` but its SiC leg does not.
5. **Filings-layer follow-ups** — evaluate fixing XBRL value extraction and adding an ingestion CLI to the vendored adapter (out of scope for this research run).
6. **Pipeline note** — AEHR prices are not fetched (TWRR universe derives from `transactions.csv`); if price monitoring is wanted pre-position, an explicit mechanism is needed.
