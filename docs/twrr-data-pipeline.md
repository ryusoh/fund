# TWRR data pipeline — silent-failure modes and the validation gate

Read this before touching `scripts/twrr/`, `scripts/ratios/calculate_ratios.py`,
or anything that consumes `data/output/balance_series.json`.

## The data path (balance chart)

```text
transactions.csv
  → step01 load → step02 splits → step03 fetch prices (yfinance batch
    → single-ticker → stooq fallbacks; writes historical_prices.parquet/.json)
  → step04 holdings × prices → daily_market_value.parquet   [fillna(0.0)!]
  → step05 cashflows → step06 TWRR → step07 plot
  → ratios/calculate_ratios.py → data/output/balance_series.json
  → js/transactions/dataLoader.js loadPortfolioSeries()
    merges a real-time point from realtimeData.js
    (holdings_details.json × fund_data.json / Cloudflare Worker prices)
  → terminal `plot balance` / contribution chart
```

The real-time point comes from a **different share-count source**
(`holdings_details.json`) than the historical series (transactions checkpoint).
Drift between the two shows up as a jump at the seam.

## Silent-failure modes (all produce wrong data with no error)

1. **All-NaN batch column counted as fetch success.** yfinance sometimes
   returns a ticker column that exists but is entirely NaN (rate limit,
   transient upstream gap). Fixed 2026-09-03: `step03` treats all-NaN as a
   failure so fallbacks run. (The 2026-09-02 ANET incident: one flaky run
   wiped ANET's entire history → balance understated ~45%.)
2. **`step04` `fillna(0.0)`** — any missing price for a held position is
   silently valued at $0. This is where missing prices become wrong numbers.
3. **Flat-lining staleness** — `ffill().bfill()` in step03/step04 carries a
   stopped series at its last price forever, no error.
4. **`delisted_tickers.csv` ∩ holdings** — a held ticker wrongly on the list
   is skipped by step03 → $0 forever.
5. **Fractional-share dust** — checkpoints carry tiny negative residues
   (e.g. `-0.00074` shares) on sold-out tickers. "Held" means `> 0.01` shares;
   don't use a tighter floor or dust demands live price coverage.
6. **Bot data commits carry `[skip ci]`** — the generated-data commit bypasses
   the CI gate entirely; only `twrr-refresh.yaml`'s own steps guard it.

## The gate

`make twrr-validate` (`scripts/twrr/step_validate.py`) runs in
`twrr-refresh.yaml` **between the pipeline and the auto-commit** and fails the
run — so nothing is committed — when:

- a held ticker lacks a non-NaN price in the last 7 days (modes 1–4),
- any ticker's non-null price count drops vs the committed parquet at `HEAD`
  (full-history wipes, deterministically),
- a held ticker is on the delisted list (mode 4),
- the historical tail and the real-time balance differ by > 10% (seam drift).

Regression tests: `tests/python/test_step_validate.py` (includes a smoke test
running the gate against the real repo data) and
`tests/python/test_step03_fetch_prices.py` (all-NaN batch handling).

## Debugging a suspected data regression

The bots commit `data/`, so use git forensics: `git log --oneline --
data/historical_prices.parquet`, then `git show <rev>:<file>` and diff the
same logical record (one date, one ticker) across revisions. When a value
changed tells you which step; which tickers changed tells you why.
