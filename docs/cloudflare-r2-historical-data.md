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

### AI-2 [skip] — Load only filtered tickers through one shared loader

- **Files:** `scripts/twrr/step03_fetch_prices.py`,
  `js/transactions/dataLoader.js`,
  `js/transactions/chart/renderers/contribution.js`, and
  `js/transactions/terminal/snapshots.js`.
- **Find:** `write_raw_json_prices(combined_raw)`;
  `let balanceSeriesPayloadPromise = null;`; and
  `const response = await fetch('../data/historical_prices.json');` at both
  browser call sites.
- **Change:** Route to a stronger model. Generate per-ticker browser artifacts
  from `combined_raw` and add one shared, single-flight loader used by both
  consumers. Add monolith-versus-shard parity, multi-ticker, alias,
  missing/failed response, and fetch-count tests. Keep the monolith until its
  Python readers migrate.
- **Verify:**

    ```bash
    venv/bin/python -m pytest tests/python/test_step03_fetch_prices.py
    npx jest tests/js/transactions/chart/data/contribution.test.js tests/js/transactions/chart/renderers/contribution.test.js tests/js/transactions/terminal/snapshots.test.js tests/js/transactions/terminal/snapshots_coverage.test.js tests/js/transactions/terminal/snapshots_more.test.js --runInBand
    ```

- **Guardrail:** Do not regenerate these browser artifacts from
  `historical_prices.parquet` or `prepare_frontend_data.py`; both lose the raw
  JSON's missing-date semantics. Preserve the existing 10-day price fallback.

### AI-3 [skip] — Compact ratio JSON without changing parsed values

- **Files:** `scripts/ratios/calculate_ratios.py` and
  `tests/python/test_calculate_ratios.py`.
- **Find:** `with open(OUTPUT_DIR / 'balance_series.json', 'w') as f:` and
  `def test_get_performance_series(self):`.
- **Change:** Route to a stronger model to add output coverage first, then use
  compact JSON separators for the JSON writes in `main()`. Compare parsed
  before/after payloads. Current raw-size savings are 7.5% for contribution,
  7.6% for performance and balance, and 11.1% for daily FX; gzip savings are
  negligible, so this targets future Git growth rather than latency.
- **Verify:** `venv/bin/python -m pytest tests/python/test_calculate_ratios.py`
- **Guardrail:** Do not round values, reorder series, or change the
  current-date padding behavior as part of this serialization-only item.

### AI-4 [skip] — Prove deploy generation on the composition family first

- **Files:** `.github/workflows/pages.yml`,
  `.github/workflows/twrr-refresh.yaml`,
  `scripts/generate_composition_data.py`, and
  `scripts/generate_marketcap_from_composition.py`.
- **Find:** `- name: Stamp service worker cache version`;
  `- name: Validate generated data`; `def main():` in each
  generator; and `composition_path = Path('data/output/figures/composition.json')`.
- **Change:** Route to a stronger model. Add a clean-checkout parity harness
  for composition, sectors, and marketcap, then generate them during Pages
  deployment only if parsed artifacts match. Make deploy generation fail
  closed and keep nightly validation ahead of publication. Remove future
  committed copies only as a separate reviewed step with explicit staging.
- **Verify:**

    ```bash
    npx prettier --check .github/workflows/analysis-sync.yml .github/workflows/pages.yml .github/workflows/twrr-refresh.yaml
    venv/bin/python -m pytest tests/python/test_generate_composition_data.py tests/python/test_generate_marketcap_from_composition.py tests/python/test_twrr_refresh_workflow.py
    ```

- **Guardrail:** Do not include geography, TWRR, or P/E in this pilot: their
  current generators have network, timestamp, or previous-output dependencies.
  Marketcap currently exits successfully on generation failure, which is not
  acceptable for a clean deploy artifact.

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
