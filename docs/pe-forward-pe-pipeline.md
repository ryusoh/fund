# Forward P/E pipeline & the PER column

The position-page table's **PER** column shows `trailing/forward` P/E per holding.
The forward number is produced by a Python scrape, written into a generated JSON,
and **derived again on the frontend**. The two ends are coupled by one field name,
and a missing value degrades **silently** (trailing-only, no error) — so read this
before touching forward-PE in either `scripts/generate_pe_data.py` or
`js/services/dataService.js`.

## Data flow (Python writes → JS reads)

```text
scripts/generate_pe_data.py  ──writes──►  data/output/figures/pe_ratio.json
        (fetch_forward_pe)                        forward_pe.msci_pe_ratio
                                                          │
                                                          ▼
js/services/dataService.js   ──reads──►  PER column in position/ table
   fetchMarketRatiosForTickers → _calculateDynamicPeValues → formatPerDisplayForTicker
```

- `pe_ratio.json` is **also** consumed by the transactions P/E chart
  (`js/transactions/chart/renderers/pe.js`) — don't assume the table is the only reader.

## The VT special case (why this is fragile)

VT (Vanguard Total World, an index fund) has **no native forward estimate** —
`data/analysis/VT.json` has `market.forwardPe = null` and `market.forwardEps = null`.
So VT's forward P/E is **derived**, not fetched:

```text
forwardPE_VT = trailingPE_VT / msci_pe_ratio.ratio
```

`msci_pe_ratio` lives in `pe_ratio.json` under `forward_pe.msci_pe_ratio`
(`{trailing_pe, forward_pe, ratio, last_updated}`). The frontend applies the
derivation in **two** places — keep them in sync:

1. `fetchMarketRatiosForTickers` (`dataService.js` ~L179): builds the snapshot and
   attaches `snapshot.msciPeRatio` for VT.
2. `_calculateDynamicPeValues` (`dataService.js` ~L280): the daily derivation that
   actually feeds the cell. Guarded by `ratioSnapshot.msciPeRatio > 0`.

**If `ratio` is missing/null, both guards fail and VT shows trailing-only.** It is
not an error — the cell just renders `24.81` instead of `24.81/19.66`. This is the
same silent-degradation class as the chart-crosshair `dates`-field gotcha
(`docs/chart-crosshair-layout.md`): a dropped data field reads as a plausible wrong
value, not a crash. **Verify forward-PE changes in the rendered table**, not just
green unit tests.

## The scrape is flaky → fail-open architecture

`scrape_msci_pe_data` (`generate_pe_data.py`) is a regex scrape of an MSCI HTML page.
It fails intermittently. When it failed on 2026-06-24, `msci_pe_ratio` went `null`
and VT's forward P/E silently vanished. The pipeline now defends in three layers —
each loads the **previous** `pe_ratio.json` (`existing_pe_data`) and carries good
values forward:

- `carry_forward_msci_pe_ratio` — if a run produces a `forward_pe` block but the
  MSCI sub-scrape failed (block present, `msci_pe_ratio` absent), reuse the last
  good ratio. Without this, a _partial_ success overwrites the good ratio with
  nothing.
- `apply_fail_open_backstop` — general net before write: any top-level key the
  previous file had that this run produced empty/missing (`{}`/`[]`/absent) is
  restored. Covers `benchmark_pe`, `^IXIC` forward, etc. Fresh data is never
  overwritten.
- `warn_if_msci_ratio_stale` + `last_updated` stamp + `MSCI_RATIO_STALE_DAYS` —
  a successful scrape stamps `last_updated`; a carried-forward ratio that ages past
  the threshold logs a `WARNING` so a prolonged outage is visible, not silent.

These carry forward because each run writes the (possibly carried) value back, and
the next run reads it as its baseline — the good value propagates indefinitely until
a fresh scrape replaces it.

**Tests:** `tests/python/test_generate_pe_data.py` (helpers, fail-open, staleness)
and `tests/js/services/dataService.test.js` (`_calculateDynamicPeValues` VT
derivation). No unit test can catch a live scrape failing — the fail-open + stale
warning _is_ the guard.

## Gotcha: repairing pe_ratio.json by hand

`data/` is generated (don't hand-edit — see CLAUDE.md). But a one-time regression
repair is occasionally warranted. If so: the file is written **compact** with
`json.dump(..., separators=(",", ":"))`. Re-serializing with `indent=` produces a
~660k-line diff. Match the original format:

```python
json.dump(data, f, separators=(",", ":"))   # not indent=2
```
