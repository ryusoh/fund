# Filings adapter — operational guide

How to drive the vendored SEC filings stack (`scripts/vendor/filings/`) from this repo.
Design/evaluation context: `docs/research/external-filings-agent-evaluation.md`;
first appliance-test results: `docs/research/aehr-initial-thesis.md` (§Filings-layer
evaluation, 2026-10-12).

## Invocation

Always use the module form — the direct script path fails with
`ModuleNotFoundError: No module named 'scripts'`:

```bash
venv/bin/python -m scripts.analysis.filings_adapter {list,sections,read,export-manifest,verify,candidates} --ticker <T>
```

## Workspace resolution

`filings_adapter.resolve_workspace` (`scripts/analysis/filings_adapter.py:29`):

1. `--workspace <dir>` CLI override
2. `FILINGS_WORKSPACE` env var
3. `~/.cache/filings` (default)

The workspace is **not** in the repo; ingested filings live under
`<workspace>/portfolio/<TICKER>/filings/fil_<accession>/` and are machine-generated
(don't hand-edit, same rule as `data/`).

## Ingesting a new ticker

`list --ticker <T>` fails with `Financial Document Tools do not have this company`
until the ticker is ingested. The CLI has **no download command** — the upstream
ingestion/host layer was deliberately not vendored (`scripts/vendor/filings/VENDORED.md`).
Ingestion means driving the vendored pieces directly (verified working 2026-10-12
with AEHR; SEC requires a User-Agent via the `SEC_USER_AGENT` env var):

1. `SecDownloader(workspace_root)` → `resolve_company(ticker)` gives `(cik, name, cik10)`.
2. `fetch_submissions(cik10)` → pick filings from `filings.recent` (match `form`,
   take `accessionNumber`, `primaryDocument`, `filingDate`, `reportDate`).
3. `FsCompanyMetaRepository(workspace).upsert_company_meta(CompanyMeta(...))` —
   registers the ticker so `list`/`verify` resolve it.
4. Per filing: `list_filing_files(...)` → `download_files(...)` with a `store_file`
   callback that persists via `LocalFileStore(root=workspace / "portfolio", scheme="local").put_object(f"{TICKER}/filings/fil_{accession}/{name}", stream)`.
5. `FsSourceDocumentRepository(workspace).create_source_document(SourceDocumentUpsertRequest(...), SourceKind.FILING)`
   with meta keys: `accession_number`, `company_id`, `filing_date`, `report_date`,
   `fiscal_year`, `fiscal_period`, `ingest_method="download"`, `ingest_complete=True`,
   `source_url`.
6. Fiscal-period mapping is per-company: derive `fiscal_period` (Q1–Q3/FY) from
   `report_date` against the company's fiscal calendar — AEHR's FY ends the Friday
   nearest May 31 (June 30 from FY2027), so the naive calendar-quarter mapping was wrong.

A proper `ingest` subcommand in `filings_adapter.py` would replace this recipe;
until then, copy this sequence (the working AEHR version was ~125 lines).

## Confirm pass semantics

`verify --ticker <T> --claim "<text>"` returns PASS/FAIL with a confidence score;
the skills enforce **≥ 0.60**. Treat it as coarse grounding, not proof — see gaps below.

## Known gaps (found in the 2026-10-12 AEHR appliance test)

- **XBRL value extraction returns nulls** — `get_financial_statement` returns correct
  row labels with empty `values`; `query_xbrl_facts` finds facts but `value: None`.
  Read numbers from the section HTML text (`read`) instead.
- **`list` CLI prints `form_type` as N/A** — the service strips `form_type` from list
  output and the adapter doesn't map `document_type` back.
- **`verify` BM25 evidence spans are noisy** — top hits are often cover-page fragments
  rather than the load-bearing paragraph; the PASS/FAIL + confidence is still usable.
