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
   stopped series at its last price forever, no error. Two variants: a ticker
   that stops trading, and a **stale upstream snapshot** — 2026-09-22: an
   Actions-congested run hit Yahoo at 20:04 ET while its equity daily bars
   still ended at Friday, though the index bars in the same response had
   Monday. All 172 tickers counted as fetch successes and the ffill
   flat-lined a real trading day. Defenses: step03 ends the date range at
   the last _completed_ session (a forming today-bar is never a close),
   `refresh_stale_tails` refetches tickers whose tail lags the benchmark
   indices (the market-was-open oracle), and the gate's fleet freshness
   check (below) fails the run when the refetch doesn't cure it.
   **The ~20:00-22:00 ET Yahoo rollover window is a systematic variant of
   this**: at the 20:00 ET overnight open Yahoo rolls equity daily bars to
   the next session and the just-completed session's bar temporarily
   vanishes (indices don't trade overnight, so they stay current). Actions
   congestion regularly delays the 21:15 UTC run into this window —
   2026-10-07/08: all 165 equities missing the just-completed session and
   the yfinance/stooq refetch no-opped for every one (a 21:57 ET run was
   clean, so the window settles by ~22:00 ET). Defenses added 2026-10-09:
   (1) when a majority of the fleet is stale and the run is inside
   20:00-23:30 ET, step03 waits 15 minutes and refetches, up to 4 attempts
   — the primary, yfinance-only mechanism; (2) `fetch_polygon_daily_closes`
   backstops still-stale tails with Polygon grouped daily bars (one call per
   missing date covers all US tickers) as a fail-open extra layer — needs
   `POLYGON_KEY` in the "Run TWRR pipeline" step env of
   `twrr-refresh.yaml`, but nothing depends on it succeeding; (3)
   `fetch_alpaca_daily_closes` backstops whatever is still stale with Alpaca
   daily bars — added 2026-10-14 after a congestion-delayed run (20:15 ET)
   exhausted all four Yahoo retries by 21:04 ET and the Polygon free plan
   refused same-day grouped daily ("today's data before end of day"),
   failing the gate. Alpaca serves the completed session's regular daily bar
   from the 16:00 ET close on, so it decouples the tail from Yahoo's clock;
   it needs `ALPACA_API_KEY`/`ALPACA_API_SECRET` in the same step env and
   only covers US-listed equities/ETFs (mutual funds and indices come back
   absent). `refresh_stale_tails` returns the post-backstop laggards, so a
   rescued fleet does not keep polling Yahoo through the window.
4. **`delisted_tickers.csv` ∩ holdings** — a held ticker wrongly on the list
   is skipped by step03 → $0 forever.
5. **Fractional-share dust** — checkpoints carry tiny negative residues
   (e.g. `-0.00074` shares) on sold-out tickers. "Held" means `> 0.01` shares;
   don't use a tighter floor or dust demands live price coverage.
6. **Bot data commits carry `[skip ci]`** — the generated-data commit bypasses
   the CI gate entirely; only `twrr-refresh.yaml`'s own steps guard it.
7. **Generated-but-not-committed artifacts freeze silently** — a data file the
   workflow writes but omits from its `git add` list never updates on the
   deployed site, with no error anywhere. (2026-09-08: `data/prev_close.json`
   froze at its first commit; /position/ day-change diffed live prices against
   a days-old baseline. The sidecar was removed 2026-09-09 — the baseline is
   now `fund_data.json` itself.) `tests/python/test_twrr_refresh_workflow.py`
   guards the commit list for the price artifacts.

## Position day-change baseline (`fund_data.json`)

The `/position/` day-change column diffs live prices (Cloudflare Worker, static
fallback) against `data/fund_data.json` itself — the latest official
regular-session close per held ticker, written nightly by
`scripts/data/update_fund_data.py`. Consumed in `js/services/dataService.js`
`processAndEnrichHoldings` as a plain `{ticker: price}` map, gated to trading
days by `isTradingDay`.

- **The fetchers must return the official close of the last _completed_
  session, never a forming bar or latest trade** — latest-trade fields carry
  after-hours drift, and a provider's "current daily bar" is only the
  completed session between the 16:00 ET close and the 20:00 ET overnight
  open. The scheduled run lands at 21:15 UTC (17:15 ET), but Actions
  congestion can delay it past 20:00 ET (2026-09-22 incident: a ~3h delay made
  Alpaca's `dailyBar` the forming _overnight_ bar, and the next trading day
  diffed live prices against mid-overnight quotes). So each fetcher selects by
  session date vs. run time instead of position: yfinance drops today's daily
  bar while the session is still open (`_last_completed_close`), Alpaca picks
  `dailyBar.c` vs `prevDailyBar.c` (`_select_alpaca_close`), Polygon `day.close`
  vs `prev_day.close` (`_select_polygon_close`), each falling back to the
  latest trade when no daily bar is available. A bar dated before today
  (weekend/holiday run) is always completed and used as-is.
  **Yahoo rolls its daily bar to the _next_ trading day at the 20:00 ET
  overnight open**, so during the 20:00-24:00 ET window the forming bar is
  dated _tomorrow_ and a same-day comparison does not catch it (2026-09-30
  incident: a run at 20:27 ET wrote overnight quotes as the baseline — VT's
  baseline landed 0.8% high and flipped the next session's day-change sign —
  and PDD's fetch failed outright, so `main()`'s retain-on-failure kept the
  previous night's forming-bar value for a second day).
  `_last_completed_close` therefore drops the last bar whenever it is dated
  _after_ ET-today, not only when dated today before 16:00 ET.
- **Never pass `feed=overnight` to the Alpaca snapshots call.** With the
  overnight feed, `dailyBar`/`prevDailyBar` are overnight-_session_ bars
  (20:00-04:00 ET), not regular-session bars, so `_select_alpaca_close`
  returns an overnight-session close as the baseline (2026-10-01 incident:
  the 20:45 ET run wrote VT 158.75 / GOOG 348.48 vs. true closes 157.80 /
  334.93; the prior night Alpaca 403'd and the yfinance fallback wrote
  correct values). The feed parameter dates from when this script fetched
  _live_ prices via `latestTrade`; for a completed-session baseline it is
  pure poison. The default feed keeps the daily bars regular-session, which
  the session-date selection handles in every window.
- **Alpaca and yfinance disagree on the same official close by cents** —
  verified 2026-10-14: Alpaca's 2026-10-13 closes were VT 159.73 / GOOG 349.60
  where yfinance (and the TWRR parquet) had 159.76 / 349.52. Fetch priority
  flips with run time (yfinance-first 04:00-20:00 ET, Alpaca-first overnight),
  so the committed baseline's provider depends on when the run landed.
  Negligible at cent scale, but it makes a same-evening rerun non-idempotent
  and can move the /position/ day-change by a tick; if that column ever looks
  off by a few cents, check which provider wrote the baseline.
- After-hours the live quote ≈ the baseline, so the day change reads ~0 / the
  pure after-hours drift by design.
- The previous `prev_close.json` sidecar was removed (2026-09-09): written
  before the pipeline appended the latest close, it was always one trading
  session stale during the following session (two after a holiday).

## The gate

`make twrr-validate` (`scripts/twrr/step_validate.py`) runs in
`twrr-refresh.yaml` **between the pipeline and the auto-commit** and fails the
run — so nothing is committed — when:

- a held ticker lacks a non-NaN price in the last 7 days (modes 1–4),
- any ticker's non-null price count drops vs the committed parquet at `HEAD`
  (full-history wipes, deterministically),
- a held ticker is on the delisted list (mode 4),
- the held fleet lags the benchmark indices' (`^GSPC`/`^IXIC`/`^DJI`) last
  price date — one lagger is a halt or a non-US calendar, a majority means
  the upstream snapshot was stale (mode 3, second variant),
- the historical tail and the real-time balance differ by > 10% (seam drift).

The workflow also has a **safety-net cron at 05:12 UTC Tue–Sat** (~00:12 ET,
past Yahoo's rollover window) that rescues the day when the main run failed or
was congestion-delayed into the window. The pipeline is **not idempotent** —
verified 2026-10-14: a same-evening rerun rewrote `fund_data.json` (Alpaca is
the overnight-first provider and its closes differ from yfinance's by cents),
re-adjusted historical prices (2023 annual return moved 37.41% → 37.39%), and
stamped fresh `generated_at` metadata — so a redundant run would commit a
provider flip-flop and dispatch Pages every night. A precheck step therefore
skips the whole job when a bot data commit already exists within the last 12
hours; the skip applies only to the safety-net cron expression, never to the
main cron or manual dispatches.

Regression tests: `tests/python/test_step_validate.py` (includes a smoke test
running the gate against the real repo data) and
`tests/python/test_step03_fetch_prices.py` (all-NaN batch handling).

## Debugging a suspected data regression

The bots commit `data/`, so use git forensics: `git log --oneline --
data/historical_prices.parquet`, then `git show <rev>:<file>` and diff the
same logical record (one date, one ticker) across revisions. When a value
changed tells you which step; which tickers changed tells you why.

To test whether a rerun changes the data (an idempotency question), don't
reason from the code — exercise it. Back up first (`cp -a data
/tmp/data_backup`), rerun the workflow steps (`venv/bin/python
scripts/data/update_fund_data.py`, `venv/bin/python
scripts/pnl/update_daily_pnl.py`, `make twrr-refresh`), inspect `git status
--porcelain data/`, and compare parquet contents against HEAD with
`git show HEAD:<path>` piped through `pd.read_parquet(io.BytesIO(...))`.
Restore with `rm -rf data && cp -a /tmp/data_backup data` — never
`git checkout -- data/` (AGENTS.md non-negotiable 11: concurrent agents share
the worktree). As of 2026-10-14 the pipeline is **not** idempotent: a rerun
rewrites `fund_data.json` (provider flip, see above), re-adjusts history, and
restamps `generated_at` metadata.
