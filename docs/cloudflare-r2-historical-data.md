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

### AI-2 [skip] — Generate bounded price shards during Pages deployment

- **Files:** `.github/workflows/pages.yml`, `.gitignore`, new
  `scripts/prepare_historical_price_shards.py`,
  `tests/python/test_prepare_frontend_data.py`,
  `js/transactions/dataLoader.js`,
  `js/transactions/chart/renderers/contribution.js`,
  `js/transactions/terminal/snapshots.js`, and their existing Jest suites.
- **Find:** `- name: Stamp service worker cache version`;
  `data/analysis/theme_timeline.json`;
  `let balanceSeriesPayloadPromise = null;`; and
  `const response = await fetch('../data/historical_prices.json');` at both
  browser call sites.
- **Change:** Split the existing raw JSON into deploy-only, content-hashed
  per-symbol artifacts and add one shared, single-flight loader used by both
  consumers. Do not generate or commit shards in `step03`.
- **Design:**
    1. Use only the Python standard library. Read
       `data/historical_prices.json`, preserve every symbol/date/value without
       arithmetic, and serialize each symbol's date map compactly. Name each
       shard after its content SHA-256 and write `index.json` last with
       `schema_version=1`, the source SHA-256, and a symbol-to-shard map. Include
       normalized ticker aliases in the map. Content hashes prevent mixed-release
       responses without retaining old releases in the Pages artifact.
    2. Add `data/historical_prices/` to `.gitignore`. In Pages, set up Python
       3.11 and run the generator after checkout but before service-worker
       stamping and artifact upload. No pip packages are needed. The monolith
       remains tracked and deployed for Python compatibility and legacy fallback.
    3. In `dataLoader.js`, cache one manifest promise, one promise per shard, and
       one legacy-monolith promise. Derive requested symbols from
       `filteredTransactions`, not the filter text, and fetch missing shards in
       parallel. Validate the manifest schema before using it.
    4. Merge loaded series into `transactionState.historicalPrices`. Return the
       existing object unchanged when no new series arrives; otherwise set a new
       object containing the union of the latest state and loaded series. This
       prevents stale concurrent responses from dropping symbols and avoids
       invalidating the contribution pipeline cache on every frame. Cache failed
       promises for the page session so a failed render cannot trigger a fetch
       storm; reload the page to retry.
    5. Fall back to the monolith only when the manifest is unavailable/invalid
       or a referenced shard fails. A symbol absent from a valid manifest is a
       real no-data case: do not download the monolith. `CHX` currently exercises
       this path and must continue using transaction-price fallback.
    6. Replace both browser fetch blocks with the shared loader. Keep the
       existing raw-price gaps, ticker normalization, 10-day lookup fallback,
       split adjustment, and last-transaction-price behavior unchanged.
    7. Add generator tests for exact per-symbol parity, deterministic hashes,
       aliases, and malformed input. Add loader tests for concurrent callers,
       multi-ticker filters, object identity, absent symbols, broken shards, and
       fallback fetch counts. Keep renderer and snapshot regression suites.
- **Tradeoff:** The Pages artifact grows by roughly the 8.9 MB shard payload,
  but Git history does not grow and filtered browsers avoid the monolith. The
  current four-holding estimate is about 55 KiB gzipped versus 2.45 MiB.
- **Verify:**

    ```bash
    venv/bin/python -m pytest tests/python/test_prepare_frontend_data.py
    npx jest tests/js/transactions/dataLoader.test.js tests/js/transactions/chart/data/contribution.test.js tests/js/transactions/chart/renderers/contribution.test.js tests/js/transactions/terminal/snapshots.test.js tests/js/transactions/terminal/snapshots_coverage.test.js tests/js/transactions/terminal/snapshots_more.test.js --runInBand
    npx prettier --check .github/workflows/analysis-sync.yml .github/workflows/pages.yml .github/workflows/twrr-refresh.yaml
    make smoke
    ```

- **Guardrail:** Never rebuild the shards from the forward/back-filled Parquet
  or `prepare_historical_prices()`; the raw monolith is the only exact source.

### AI-3 [skip] — Compact ratio JSON without changing parsed values

- **Files:** `scripts/ratios/calculate_ratios.py` and
  `tests/python/test_calculate_ratios.py`.
- **Find:** `with open(OUTPUT_DIR / 'balance_series.json', 'w') as f:` and
  `def test_get_performance_series(self):`.
- **Change:** Add one temporary-directory integration test, then add compact
  separators to the six existing `json.dump` calls in `main()`.
- **Design:**
    1. In the existing test class, skip when pandas is unavailable, patch
       `OUTPUT_DIR` to a temporary directory, and call the real `main()` against
       tracked inputs. This covers all six JSON writes without mocking financial
       calculations or modifying `data/`.
    2. For balance, contribution, daily FX, performance, transaction stats, and
       holdings, assert each generated file equals
       `json.dumps(json.loads(text), separators=(',', ':'))`. This test fails
       with the current spaced serialization and passes after the change.
    3. Change only the `json.dump` keyword arguments. Do not add a helper or
       refactor `main()`, and do not compare against committed files whose
       current-date padding can legitimately differ.
- **Measured baseline:** A temporary-directory run reproduced all six committed
  parsed payloads exactly. Expected raw-size savings are 7.5% for contribution,
  7.6% for performance and balance, and 11.1% for daily FX; gzip savings are
  negligible, so this targets future Git growth rather than latency.
- **Verify:** `venv/bin/python -m pytest tests/python/test_calculate_ratios.py`
- **Guardrail:** Do not round values, reorder series, or change the
  current-date padding behavior as part of this serialization-only item.

### AI-4 [skip] — Deploy-generate the composition family in two stages

- **Files:** `.github/workflows/pages.yml`,
  `.github/workflows/twrr-refresh.yaml`, `.gitignore`, `Makefile`,
  `scripts/generate_composition_data.py`,
  `scripts/generate_marketcap_from_composition.py`, new
  `scripts/generate_deploy_figures.py` and
  `scripts/validate_frontend_figures.py`, and the existing generator/workflow
  test files.
- **Find:** `- name: Stamp service worker cache version`;
  `- name: Validate generated data`; `twrr-validate:`;
  `data/analysis/theme_timeline.json`; `def main():` in each generator; and
  `composition_path = Path('data/output/figures/composition.json')`.
- **Change:** Add a reusable generator/validator and prove it during Pages
  deployment before stopping future commits of composition, sectors, and
  marketcap.
- **Design:**
    1. `generate_deploy_figures.py` reads the three committed baselines into
       memory, runs composition/sectors followed by marketcap, validates the
       regenerated files, and compares them with the baselines. Its initial
       `--require-baseline` mode must fail when a baseline is absent.
    2. `validate_frontend_figures.py` requires `dates`, `total_values`, and
       `series`; equal non-zero lengths; matching series lengths; sorted date
       strings; and finite numbers. Comparison keeps object keys, list lengths,
       dates, and strings exact, using `math.isclose` with relative and absolute
       tolerance `1e-12` only for numeric values. Reject NaN and infinity.
    3. Make marketcap fail closed: missing composition or fund-breakdown inputs
       raise an error, and its top-level exception handler must not exit zero.
       Update its existing fail-open tests. This deterministic local transform
       must never silently deploy a stale or missing file.
    4. In Pages, set up Python 3.11, install only the pandas and pyarrow
       constraints already declared in `requirements.txt`, and run the deploy
       generator before service-worker stamping and artifact upload. Generation,
       comparison, or validation failure prevents upload, leaving the previous
       deployment active.
    5. Add the structural validator to `make twrr-validate`, so nightly input
       commits remain gated after the derived files become untracked. Keep the
       existing TWRR validation unchanged.
    6. **Stage A — dual-publish:** keep nightly output commits and run Pages
       generation with `--require-baseline`. Require successful parity on several
       data deploys. An intentional generator change must update the committed
       baseline before it can deploy.
    7. **Stage B — stop future snapshots:** in a separate reviewed change, add
       exactly the three generated paths to `.gitignore`, remove them from
       version control without rewriting history, and drop `--require-baseline`.
       Nightly still generates and validates them, but ignored files are not
       staged by the existing `git add data/output`. Continue generating them in
       Pages from tracked canonical inputs.
- **Measured baseline:** Temporary-directory generation reproduced composition
  and marketcap exactly. Sectors had identical structure, dates, and totals,
  with numeric differences around `10^-15`; this justifies tolerant numeric
  comparison rather than byte equality. The three current files total
  3,147,117 bytes per snapshot. Existing history remains unchanged.
- **Tradeoff:** Pages gains a Python/pandas setup step, while future nightly
  commits avoid roughly 3.15 MB of derived JSON per changed run. The deployed
  artifact and browser payload remain the same size.
- **Verify:**

    ```bash
    npx prettier --check .github/workflows/analysis-sync.yml .github/workflows/pages.yml .github/workflows/twrr-refresh.yaml
    venv/bin/python -m pytest tests/python/test_generate_composition_data.py tests/python/test_generate_marketcap_from_composition.py tests/python/test_twrr_refresh_workflow.py
    make twrr-validate
    make smoke
    ```

- **Guardrail:** Do not include geography, TWRR, or P/E in this pilot: their
  current generators have network, timestamp, or previous-output dependencies.
  Do not ignore the whole `data/output/` directory or remove its broad staging
  rule without replacing coverage for every remaining artifact.

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
