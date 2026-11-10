# Cloudflare R2 for historical and large data files

Research date: 2026-10-28
Issue: [ryusoh/fund#108](https://github.com/ryusoh/fund/issues/108)

## Question

Is it necessary to move `historical_portfolio_values.csv`, Parquet files, and
other large historical assets from this repository to Cloudflare R2, as proposed
in issue #108? If external object storage is justified, what is the safest and
most effective migration approach?

## Answer

**Do not implement issue #108 as written. R2 is not necessary now for current
file-size, GitHub Pages-size, or frontend-retrieval reasons.**

The proposal targets the wrong assets for its stated frontend benefit: all
Parquet files together are only about 2.5 MiB, no JavaScript reads them, and
the named historical CSV is only about 136 KiB. The largest browser-consumed
asset is `data/historical_prices.json`, while most historical blob growth comes
from `data/output/` and that JSON file rather than CSV or Parquet.

Recommended order:

1. Keep the canonical CSV and Parquet pipeline files in Git for now.
2. Reduce derived frontend payloads, starting with narrower alternatives to
   the multi-megabyte `historical_prices.json` response. Investigate generating
   derived JSON during the Pages deployment instead of committing every
   revision, provided generation can reproduce current semantics.
3. If future Git-history growth remains the priority after those changes, pilot
   R2 only for selected derived browser assets. Use immutable, content-versioned
   releases plus a manifest updated last; do not directly overwrite a single
   public object on every pipeline run.
4. Treat existing Git-history reduction as a separate maintenance decision. R2
   and removing files from future commits do not remove old blobs from history.

This is a recommendation to defer and narrow the migration, not a claim that R2
would never be useful.

## Evidence

### Current size is not the same as historical bloat

Read-only local measurements on 2026-10-28 found:

| Measurement                            |                                 Result |
| -------------------------------------- | -------------------------------------: |
| Tracked working tree                   |           78,291,191 bytes (74.66 MiB) |
| Tracked `data/`                        | 26,211,520 bytes (25.00 MiB), 65 files |
| All tracked Parquet files              |               2,621,034 bytes, 8 files |
| `data/historical_portfolio_values.csv` |                          139,597 bytes |
| `data/historical_prices.json`          |                        8,934,455 bytes |
| `data/output/figures/pe_ratio.json`    |                        3,644,829 bytes |
| `data/output/figures/composition.json` |                        2,283,870 bytes |
| `data/historical_prices.parquet`       |                        2,156,825 bytes |
| Local `.git` directory                 |                                 1.0 GB |
| Local Git pack storage                 |                             972.29 MiB |

Sources: `git ls-files` and filesystem sizes in this checkout; `du` and Git pack
measurements for local storage. The local `.git` measurement includes local
refs and is not necessarily GitHub's reported hosted-repository size.

Reachable historical data blobs totalled **7.18 GB of uncompressed logical
bytes**, not packed disk usage:

| Historical path                  | Uncompressed logical blob total | Unique blobs |
| -------------------------------- | ------------------------------: | -----------: |
| `data/output/`                   |                        3.806 GB |        4,698 |
| `data/historical_prices.json`    |                        2.430 GB |          301 |
| `data/historical_prices.parquet` |                          606 MB |          306 |
| `data/checkpoints/`              |                          166 MB |          751 |
| Historical portfolio CSV         |                         36.2 MB |          325 |

Source: read-only `git rev-list`/`git cat-file` blob measurements in this
checkout. `data/output/` plus `historical_prices.json` therefore account for
approximately 87% of that logical historical footprint. Migrating only CSV and
Parquet would miss the main growth sources.

GitHub recommends keeping repositories ideally below 1 GB and strongly below
5 GB; this is guidance, not a 1 GB hard repository limit. GitHub Pages has a 1
GB published-site limit. The tracked working tree and current `data/` directory
are far below that Pages limit, although the local Git history warrants
monitoring. Sources: [GitHub: About large files on GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github),
[GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

Deleting or untracking a file affects future trees, not existing reachable
history. A history rewrite would require a separately reviewed, coordinated,
destructive maintenance operation; it is not an automatic benefit of R2.

### The proposed files do not explain frontend retrieval cost

- A repository search found **no `.parquet` reference under `js/`** on the
  research date. These files serve the Python pipeline, so relocating them
  cannot improve browser retrieval.
- The historical CSV is fetched during calendar initialization, but it is only
  139,597 bytes uncompressed. Sources: `js/config.js:381-386`,
  `js/services/dataService.js:694-700`, `data/historical_portfolio_values.csv`.
- `historical_prices.json` is fetched for filtered terminal views. R2 would
  relocate the same bytes without reducing JSON parse time or browser memory;
  per-ticker or otherwise narrower derived payloads address that problem more
  directly. Sources: `js/transactions/chart/renderers/contribution.js:238-255`,
  `js/transactions/terminal/snapshots.js:1293-1315`.
- Single production HEAD observations found gzip transfer sizes of 2,466,666
  bytes for `historical_prices.json` and 65,837 bytes for the historical CSV.
  These are header observations, not latency or parse-time benchmarks, and do
  not establish a retrieval problem requiring R2.

### A naive untracking migration would break pipeline assumptions

- The nightly CSV updater reads the existing CSV and bootstraps a new one if it
  is absent. Removing the tracked file without downloading the previous object
  first would lose historical continuity. Source:
  `scripts/pnl/update_daily_pnl.py:295-341`.
- The TWRR validation gate reads previous prices from `git HEAD` and skips its
  regression check when that baseline is unavailable. Removing the Parquet
  baseline without replacing this mechanism would weaken validation. Source:
  `scripts/twrr/step_validate.py:240-252`; governing pipeline documentation:
  `docs/twrr-data-pipeline.md`.
- Most Actions jobs already use shallow checkout to avoid downloading the
  approximately 1 GB history. `analysis-sync.yml` still uses `fetch-depth: 0`,
  making that job a narrower CI optimization candidate than an R2 migration.
  Sources: `.github/workflows/twrr-refresh.yaml:31-37`,
  `.github/workflows/analysis-sync.yml:25`.
- Bot data commits reach the live site through the explicit Pages deployment
  flow. Object uploads would add a second publication path that must remain
  synchronized with frontend and data versions. Source: `docs/pages-deploy.md`.

### R2 changes costs and failure modes; it is not just free hosting

- R2 does not charge for Internet egress, but storage and request charges still
  apply, and Infrequent Access storage has retrieval fees. "Zero egress" is not
  "zero cost." Source: [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/).
- Cloudflare documents `r2.dev` public development URLs separately from custom
  domains. A production browser design should use a controlled custom domain,
  with explicit CORS and Content Security Policy configuration. Sources:
  [Cloudflare: public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/),
  [Cloudflare: CORS](https://developers.cloudflare.com/r2/buckets/cors/).
- R2 provides strong consistency per object, but a release composed of multiple
  objects and a manifest is not automatically atomic. The release protocol must
  provide that property. Source: [Cloudflare: consistency model](https://developers.cloudflare.com/r2/reference/consistency/).
- Overwriting cached custom-domain objects can leave stale responses. Immutable
  object keys avoid making each data release depend on cache purges. Sources:
  [Cloudflare: public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/),
  [Cloudflare: consistency model](https://developers.cloudflare.com/r2/reference/consistency/).
- The existing service worker ignores cross-origin requests, so direct R2 reads
  would not inherit its current caching behavior. Source: `sw.js:132-148`.
- The existing Worker is prices-only; it is not a general historical-data proxy.
  Adding one would be new runtime behavior and another availability dependency.
  Source: `worker/src/index.js:297-303`.

## Best approach

### Phase 0: keep canonical data and establish baselines

Do not move the CSV or Parquet files yet. First record the actual GitHub-hosted
repository size, production transfer sizes and cache-hit rates, browser parse
and memory costs, and generated-data growth per release. These measurements
will show whether the primary problem is browser work, CI checkout time, or Git
history; each has a different remedy.

### Phase 1: reduce what is generated, committed, and downloaded

1. Replace filtered terminal use of the full `historical_prices.json` with
   per-ticker or otherwise bounded derived responses where practical.
2. Audit the rapidly changing files under `data/output/` and determine which
   are deploy artifacts rather than source-of-truth inputs.
3. Investigate generating deploy-only JSON in the Pages workflow from canonical
   inputs. Adopt this only after comparing generated artifacts and semantics
   with the current pipeline.
4. Change unnecessarily full CI checkouts separately, with any job-specific
   need for history made explicit.

This phase can reduce both browser work and future repository growth without
adding a storage service, credentials, CORS, or a second deploy target.

### Phase 2: conditional R2 pilot for derived browser assets

If measurements still justify object storage, start with one derived browser
asset such as `historical_prices.json`, not the canonical Parquet files.

1. **Generate and validate before publication.** Keep the existing local
   generation and `make twrr-validate` gate. Upload nothing from a failed run.
2. **Create an immutable release.** Upload objects under a content-hashed or
   run-identified prefix. Record schema version, source commit, object sizes,
   and cryptographic checksums in release metadata.
3. **Publish atomically.** Upload and verify every object first, then update one
   short-lived or no-cache `current.json` manifest last. Use conditional writes
   or an equivalent concurrency mechanism so simultaneous workflows cannot
   silently clobber the pointer. Clients must treat the manifest and its objects
   as one release.
4. **Dual-publish before cutover.** Keep the same-origin Pages copy as a
   fallback, compare release metadata and payloads, then enable R2 reads for
   the pilot asset only after the fallback path has been exercised.
5. **Restrict credentials.** Store a bucket-scoped Object Read & Write token
   only in GitHub Actions secrets. Never ship write credentials to browsers.
   Source: [Cloudflare: R2 API tokens](https://developers.cloudflare.com/r2/api/s3/tokens/).
6. **Prefer direct reads for public data.** Use a production custom domain,
   exact-origin GET CORS, and a matching CSP `connect-src`. Add a read-only
   Worker route or binding only if same-origin access, access control, or
   another measured requirement justifies the extra proxy. Sources:
   [Cloudflare: public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/),
   [Cloudflare: CORS](https://developers.cloudflare.com/r2/buckets/cors/),
   [Cloudflare: upload options](https://developers.cloudflare.com/r2/objects/upload-objects/).
7. **Retain rollback releases.** Keep prior immutable releases and repoint the
   manifest to roll back. If frontend compatibility also changes, restore the
   matching tracked frontend/data version. Define retention before deletion.
8. **Test failure behavior.** Exercise missing manifests, partially unavailable
   releases, stale caches, network failure, schema incompatibility, and Pages
   fallback. Strong per-object consistency alone does not cover these cases.

Do not rewrite Git history as part of this pilot. If later justified, plan that
separately with explicit coordination, backup, and verification.

## Action items (code-verified 2026-11-10)

Work one item at a time and commit after each item, but never push. Each `Find`
string is a unique current anchor; if it does not match, STOP and report rather
than improvising. Line numbers may drift. Format only touched files with the
repo's scoped Prettier/Black commands, run the item's scoped checks, and never
hand-edit `data/`. Do not rewrite Git history or start an R2 migration as part
of these items.

Confirmed constraints and current baselines:

- `historical_prices.json` is 8,883,926 bytes (2,453,977 bytes with local
  gzip-9). Equivalent payloads for the four current holdings total 198,937
  bytes, or 55,166 bytes as independently gzipped per-ticker responses.
- `step03_fetch_prices.py` writes the JSON from raw `combined_raw`, then
  forward-fills/back-fills that frame for Parquet. The existing
  `prepare_frontend_data.py` reads the transformed Parquet and therefore cannot
  reproduce the JSON's missing-date semantics.
- Both browser fetch sites can race because they check state before fetching
  without a shared in-flight promise: `renderers/contribution.js` and
  `terminal/snapshots.js`.
- The JSON is also a Python input to composition, geography, and P/E
  generation. Do not delete it until those readers have a replacement.
- Composition/sectors/marketcap are deterministic from tracked inputs.
  Geography and TWRR fetch external data; P/E reads its previous output for
  fail-open carry-forward; contribution output includes the current date.
- GitHub's repository API reported `size=909374` KiB (about 888 MiB). Current
  logical historical blobs total about 3.93 GB under `data/output/` and 2.52 GB
  for `historical_prices.json`; compaction does not remove existing history.

### AI-1 [trivial] — Stop fetching all history for analysis sync

- **File:** `.github/workflows/analysis-sync.yml`
- **Find:** `fetch-depth: 0`
- **Change:** Delete the two-line `with:` block containing this anchor, leaving
  the existing `Checkout` step and `uses: actions/checkout@v7` line unchanged.
  The sync script reads working-tree JSON and writes commits; it does not read
  Git history. The default shallow checkout still supports the existing rebase
  and push retry loop.

- **Verify:**

    ```bash
    npx prettier --check .github/workflows/analysis-sync.yml .github/workflows/pages.yml .github/workflows/twrr-refresh.yaml
    venv/bin/python -m pytest tests/python/test_sync_configs_*.py
    ```

- **Guardrail:** Do not change the full checkouts in CI, diff-coverage, or
  mutation-testing workflows; those have separate history requirements.

### AI-2 implementation sequence — bounded price loading

Run these items in order. **Price verification bundle (P)** means:

```bash
venv/bin/python -m pytest tests/python/test_prepare_frontend_data.py
npx jest tests/js/transactions/dataLoader.test.js tests/js/transactions/chart/data/contribution.test.js tests/js/transactions/chart/renderers/contribution.test.js tests/js/transactions/terminal/snapshots.test.js tests/js/transactions/terminal/snapshots_coverage.test.js tests/js/transactions/terminal/snapshots_more.test.js --runInBand
npx prettier --check .github/workflows/analysis-sync.yml .github/workflows/pages.yml .github/workflows/twrr-refresh.yaml
make smoke
```

#### AI-2A [low] — Add the deploy-only shard generator

- **Files:** new `scripts/prepare_historical_price_shards.py` and existing
  `tests/python/test_prepare_frontend_data.py`.
- **Find:** `def test_prepare_historical_prices_missing_parquet(self, mock_exists):`
  in the test file.
- **Change:** Implement `write_price_shards(source_path, output_dir)` using only
  the standard library and test it in the existing frontend-data test file. Add
  a CLI with positional source/output arguments defaulting to
  `data/historical_prices.json` and `data/historical_prices`.
- **Contract:**
    1. Read the raw monolith as UTF-8 JSON. Require a top-level object whose
       values are date-map objects; reject malformed input and non-finite numbers.
       Do not import pandas or read Parquet.
    2. For each symbol, serialize its date map directly with sorted keys, compact
       separators, and `allow_nan=False`. The shard body is the date map itself,
       not another symbol wrapper. Name it `<sha256-of-exact-shard-bytes>.json`.
    3. Write `index.json` last with `schema_version` integer `1`,
       `source_sha256` for the source bytes, and `symbols`. Each `symbols` entry
       maps a symbol to `{file, sha256}`. Add an entry for
       `symbol.replace('-', '').upper()` pointing to the same shard. Sort manifest
       keys so repeated runs are byte-identical.
    4. Create the output directory if needed and remove stale `.json` files only
       inside that dedicated generated directory. Write shards before the
       manifest. Return the parsed manifest. Keep the source monolith unchanged.
- **Tests:** Exact symbol/date/value parity; deterministic hashes across
  different insertion orders; normalized aliases sharing one file; malformed
  input and non-finite rejection; rerun removing a stale shard; source hash and
  source bytes unchanged. Use `tempfile.TemporaryDirectory` in the existing
  `unittest.TestCase` tests.
- **Verify:** Price bundle (P).
- **Guardrail:** The raw monolith is the only exact source; never use
  `prepare_historical_prices()` or the filled Parquet.

#### AI-2B [low] — Add the shared single-flight price loader

- **Files:** `js/transactions/dataLoader.js` and
  `tests/js/transactions/dataLoader.test.js`.
- **Find:** `let balanceSeriesPayloadPromise = null;` and
  `describe('snapshot data loaders', () => {`.
- **Change:** Export `loadHistoricalPrices(transactions)` and import
  `transactionState` plus `setHistoricalPrices` from `state.js`.
- **Contract:**
    1. Normalize and deduplicate `transaction.security` with uppercase and dash
       removal. Return the current price object immediately for an empty request.
       Do not inspect the filter text.
    2. Cache one manifest promise, one promise per normalized symbol, and one
       monolith promise at module scope. Load
       `../data/historical_prices/index.json` with `{ cache: 'no-cache' }`.
       Require schema version 1 and shard filenames matching exactly 64 lowercase
       hex characters plus `.json`. Fetch missing shards in parallel.
    3. Store each loaded date map under its normalized symbol. Merge into a new
       object only when a previously absent symbol arrives, using the latest
       `transactionState.historicalPrices` so concurrent calls cannot remove one
       another's symbols. Otherwise return the identical existing object.
    4. Cache null results for failed requests for the page session. Fall back to
       `../data/historical_prices.json` once only for an unavailable/invalid
       manifest or a failed referenced shard. A symbol absent from a valid
       manifest is a no-data result and must not trigger the monolith.
- **Tests:** Empty input; concurrent same-symbol and disjoint-symbol calls;
  multi-ticker loading; alias deduplication; manifest/schema/path validation;
  absent symbol without fallback; broken shard with one fallback; failed
  requests without a retry storm; object identity on cache hits and union on
  disjoint completions.
- **Verify:** Price bundle (P).
- **Guardrail:** Do not mutate an already cached price object; the contribution
  pipeline cache keys on its identity.

#### AI-2C [low] — Route both filtered consumers through the loader

- **Files:** `js/transactions/chart/renderers/contribution.js`,
  `js/transactions/terminal/snapshots.js`, and their existing Jest suites.
- **Find:** `const response = await fetch('../data/historical_prices.json');`
  once in each production file.
- **Change:** Import `loadHistoricalPrices` from `dataLoader.js`. Replace each
  check/fetch/parse block with an awaited call using the current filtered
  transactions. Preserve the non-filter path, empty-data behavior, raw date
  gaps, 10-day price lookup, split adjustments, and transaction-price fallback.
  `ensureHistoricalPricesAvailable` may remain as a thin wrapper.
- **Tests:** Mock the loader in both suites. Verify no load without filters,
  filtered transactions are passed through, renderer and snapshot calls share
  the loader API, loader failure produces the current empty-data behavior, and
  no direct monolith fetch remains in either production consumer.
- **Verify:** Price bundle (P).
- **Guardrail:** Do not call the loader with `activeFilterTerm`; order-type and
  other filters can produce multi-ticker transaction sets.
- **Guardrail:** `_getPortfolioSeriesForDrawdown` in `snapshots.js` reads
  `transactionState.historicalPrices` synchronously without loading. Today any
  earlier filtered load fills state with every symbol, so only the first
  filtered view can race. With per-symbol loading, every switch to a new
  ticker can race, and the drawdown snapshot would silently use
  transaction-price fallbacks. Trace each `getDrawdownSnapshotLine` caller
  (`viewUtils.js`, `handlers/plot.js`, `handlers/misc.js`). If any caller can
  run before the loader settles for the current filtered transactions, STOP
  and report. Do not make `getDrawdownSnapshotLine` async inside this item.

#### AI-2D [trivial] — Generate shards in the Pages artifact

- **Files:** `.github/workflows/pages.yml` and `.gitignore`.
- **Find:** `- name: Stamp service worker cache version` and
  `data/analysis/theme_timeline.json`.
- **Change:** Add `data/historical_prices/` to `.gitignore`. In Pages, set up
  Python 3.11 and run `prepare_historical_price_shards.py` with the tracked
  monolith as source and the ignored directory as output, after checkout and
  before service-worker stamping. Do not install pip packages or change the
  service worker, CSP, `twrr-refresh.yaml`, or any `data/` content.
- **Verify:** Price bundle (P). Also inspect the workflow diff to confirm the
  generator runs before both artifact upload and deployment.
- **Guardrail:** Keep `data/historical_prices.json` tracked and deployed for
  Python consumers and legacy fallback. Only its derived directory is ignored.

### AI-3 [dropped] — Compact ratio JSON

Dropped on review (2026-11-10); do not implement. Git stores blobs
zlib-compressed, so savings on raw bytes do not carry over. zlib-6 on the
current `data/output/*.json` files shrinks the compact form by only 0.3–2.7%
(contribution 245,331 → 243,964 bytes; performance 164,075 → 159,661). That
is negligible for both Git growth and transfer, and it does not justify a new
integration test that runs the whole `calculate_ratios.main()`.

### AI-4 implementation sequence — deploy-generated composition family

Run these items in order. **Figure verification bundle (F)** means:

```bash
npx prettier --check .github/workflows/analysis-sync.yml .github/workflows/pages.yml .github/workflows/twrr-refresh.yaml
venv/bin/python -m pytest tests/python/test_generate_composition_data.py tests/python/test_generate_marketcap_from_composition.py tests/python/test_twrr_refresh_workflow.py
make twrr-validate
make smoke
```

#### AI-4A [low] — Add figure validation and semantic comparison

- **Files:** new `scripts/validate_frontend_figures.py` and existing
  `tests/python/test_generate_composition_data.py`.
- **Find:** `def test_save_json_data_writes_compact_json(tmp_path):` in the test
  file.
- **Change:** Implement `validate_figure(payload)` and
  `compare_figures(expected, actual)` plus a CLI accepting a figure directory.
- **Contract:**
    1. Validate exactly the three filenames `composition.json`, `sectors.json`,
       and `marketcap.json`. Require top-level `dates`, `total_values`, and
       `series`; non-empty dates; equal date/total lengths; equally long,
       non-decreasing ISO date strings; object-valued series; and a same-length
       numeric array for every series entry.
    2. Reject bools as numbers and reject NaN or infinity. Require finite numeric
       totals and series values. Raise `ValueError` with the filename and field
       path on the first invalid value; the CLI exits non-zero on any failure.
    3. Compare object keys, list lengths, dates, strings, and booleans exactly.
       Compare ints/floats with `math.isclose(rel_tol=1e-12, abs_tol=1e-12)`.
       Return `None` on success and raise `ValueError` with the differing path on
       mismatch.
- **Tests:** Valid fixtures; each missing/wrong-length/non-finite case; key,
  date, and list mismatches; values inside/outside tolerance; bool rejection;
  CLI success and failure. Use temporary files, never `data/` writes.
- **Verify:** Figure bundle (F).
- **Guardrail:** Numeric tolerance is only for float round-off. Do not relax
  dates, dimensions, series membership, or finite-number checks.

#### AI-4B [low] — Make marketcap generation fail closed

- **Files:** `scripts/generate_marketcap_from_composition.py` and
  `tests/python/test_generate_marketcap_from_composition.py`.
- **Find:** `if not composition_path.exists():`,
  `if not fund_mc_path.exists():`, and
  `sys.exit(0)  # Exit with success to keep workflow going`.
- **Change:** Raise `FileNotFoundError` for either missing input. Return `True`
  only after writing output. Replace the top-level catch-and-exit-zero behavior
  with normal non-zero failure; do not catch exceptions just to preserve stale
  output. Update the existing missing-input and `__main__` tests to assert the
  new failure behavior, retaining all calculation tests.
- **Verify:** Figure bundle (F).
- **Guardrail:** This deterministic local transform must never silently deploy
  stale or missing output. Do not change its allocation calculations.

#### AI-4C [low] — Add the dual-mode deploy orchestrator

- **Files:** new `scripts/generate_deploy_figures.py`, existing
  `scripts/generate_composition_data.py`,
  `scripts/validate_frontend_figures.py`, and
  `tests/python/test_generate_composition_data.py`.
- **Find:** `def main():` in the composition generator and
  `def test_save_json_data_writes_compact_json(tmp_path):` in the test file.
- **Change:** Implement `generate_deploy_figures(root=Path('.'))` and a CLI that
  runs composition/sectors first and marketcap second, then validates all three
  outputs.
- **Contract:**
    1. Resolve all input/output paths from `root`. Before generation, read any of
       the three committed outputs that exist. All three present means
       baseline-comparison mode; none present means clean-generation mode; a
       partial set raises `ValueError` before running generators.
    2. Run both generator scripts by absolute path in subprocesses with
       `cwd=root` and `check=True`; do not change the caller's process-wide cwd
       or refactor generator path handling. Calculations and output schemas stay
       unchanged.
    3. Validate all regenerated files. In baseline mode, compare each regenerated
       payload with its in-memory baseline using AI-4A. In clean mode, successful
       generation and structural validation are sufficient. Propagate failures.
    4. Tests cover exact composition/marketcap parity, sectors round-off within
       tolerance, clean generation with no baselines, partial-baseline rejection,
       generator failure, and validator failure. Use temporary input trees based
       on the already verified symlink/copy approach; never overwrite `data/`.
- **Verify:** Figure bundle (F).
- **Guardrail:** There is no command-line mode flag to remove later. Baseline
  detection is all-or-none so the same Pages step works before and after AI-4E.

#### AI-4D [trivial] — Wire generation into Pages and nightly validation

- **Files:** `.github/workflows/pages.yml` and `Makefile`.
- **Find:** `- name: Stamp service worker cache version`, `twrr-validate:`, and
  `$(PYTHON_BIN) scripts/twrr/step_validate.py`.
- **Change:** In Pages, set up Python 3.11, install only the pandas/pyarrow
  constraints already declared in `requirements.txt`, and run the AI-4C
  orchestrator before service-worker stamping and artifact upload. Add the
  AI-4A structural validator to `twrr-validate` after the existing TWRR check.
  Do not alter the existing TWRR validator or Pages deployment permissions.
- **Verify:** Figure bundle (F). At this point baselines are still tracked, so
  the orchestrator tests and local run must exercise comparison mode.
- **Guardrail:** Any generation, comparison, or validation failure must stop
  before artifact upload, leaving the previous live deployment active.

#### AI-4E [trivial] — Stop committing the three derived figures

- **Files:** `.gitignore`, `.github/workflows/update-vt-sectors.yml`, and the
  Git index entries for `data/output/figures/composition.json`, `sectors.json`,
  and `marketcap.json`.
- **Find:** `data/analysis/theme_timeline.json` in `.gitignore`;
  `- name: Regenerate market cap data with updated VT breakdown`,
  `- name: Regenerate composition data`, and
  `data/output/figures/composition.json data/output/figures/sectors.json` in
  the workflow.
- **Change:** Add exactly those three generated paths to `.gitignore`. Remove
  them from the Git index without editing their contents or deleting the local
  generated working copies. In `update-vt-sectors.yml`, take the three paths
  out of the explicit `git add` list. Delete the two regeneration steps named
  above: after this item they produce output nobody commits, and on a fresh
  checkout the marketcap step runs before composition exists. Leave the
  geography and P/E steps alone; neither reads these files. Do not change the
  Pages orchestrator. Nightly still generates and validates the files, and the
  existing `git add data/output` leaves ignored untracked copies unstaged.
- **Why the workflow edit is mandatory:** if you `git add` an ignored path by
  name, Git exits 1 ("paths are ignored by one of your .gitignore files";
  verified 2026-11-10). That would fail the weekly commit step before it
  commits the VT allocation, HHI, geography, and P/E updates.
- **Verify:** Figure bundle (F). Confirm `git status --short` shows only the
  intended index removals plus the `.gitignore` and workflow modifications,
  with no unrelated `data/` changes. Confirm
  `git grep -n -e composition.json -e sectors.json -e marketcap.json -- .github`
  finds no explicit `git add` of the three paths. AI-4C tests must also pass
  in clean-generation mode.
- **Guardrail:** Do not ignore all of `data/output/`, rewrite history, manually
  edit generated JSON, or remove the broad staging rule. Existing blobs remain
  in history; this stops roughly 3.15 MB of future snapshots per changed run.

AI-4 has no production-wait gate: the implementation sequence proves both
baseline-comparison and clean-generation modes locally. Normal post-merge
deploys provide operational monitoring; failed generation blocks publication
and leaves the previous site active. A temporary-directory probe reproduced
composition and marketcap exactly; sectors had identical structure, dates, and
totals with numeric differences around `10^-15`, within AI-4A's tolerance.

## Open questions / what I could not verify

- Whether GitHub's reported repository size is causing an operational
  restriction today; the public API size is now recorded above.
- Production Pages bandwidth, cache-hit rates, browser parse timing, memory
  use, and user-perceived latency.
- Whether deploy-time generation can reproduce every current derived JSON
  artifact and its point-in-time semantics.
- Which `data/output/` artifacts must remain canonical for validation or later
  pipeline runs.
- R2 latency, availability, request/storage cost, and operational behavior for
  this workload; no R2 resources or uploads were tested.
- Required release retention, recovery objectives, and who would operate bucket
  credentials, custom-domain settings, and rollback.
- Whether the existing gzip transfer behavior is consistent across all relevant
  production responses; only single HEAD observations were made.
