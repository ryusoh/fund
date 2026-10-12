# Filings adapter — operational guide

How to drive the SEC filings stack (`scripts/filings/`, Apache-2.0 — see its
`PROVENANCE.md`) from this repo.
Design/evaluation context: `docs/research/external-filings-agent-evaluation.md`;
first appliance-test results: `docs/research/aehr-initial-thesis.md` (§Filings-layer
evaluation, 2026-10-12).

## Invocation

Always use the module form — the direct script path fails with
`ModuleNotFoundError: No module named 'scripts'`:

```bash
venv/bin/python -m scripts.analysis.filings_adapter {ingest,list,sections,read,export-manifest,verify,candidates} --ticker <T>
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
until the ticker is ingested. Ingestion downloads the latest filing per form from
SEC EDGAR and registers the company:

```bash
SEC_USER_AGENT="Your Name contact@example.com" \
    venv/bin/python -m scripts.analysis.filings_adapter ingest --ticker <T>
# subset of forms: --forms 10-K
```

- SEC fair-access policy requires a real User-Agent; without `SEC_USER_AGENT` the
  downloader falls back with a warning and risks throttling.
- Ingest is **idempotent**: filings already in the workspace are updated in place,
  so re-running `ingest` is how you pick up a new 10-K/10-Q.
- Fiscal-year/period are inferred from `reportDate` against the year-end month of
  the latest 10-K — per-company fiscal calendars differ (AEHR's FY ends the Friday
  nearest May 31, June 30 from FY2027), so never assume calendar quarters.

## Confirm pass semantics

`verify --ticker <T> --claim "<text>"` returns PASS/FAIL with a confidence score;
the skills enforce **≥ 0.60**. Treat it as coarse grounding, not proof — see gaps below.

## Known gaps (found in the 2026-10-12 AEHR appliance test)

- **XBRL value extraction returns nulls** — `get_financial_statement` returns correct
  row labels with empty `values`; `query_xbrl_facts` finds facts but `value: None`.
  The XBRL instance/linkbase files are ingested on disk, so this is an extraction
  gap in `scripts/filings/` (fixable as first-party code — record per
  `scripts/filings/PROVENANCE.md`). Read numbers from the section HTML text
  (`read`) instead, or cross-check via the SEC company-facts API.
- **`verify` BM25 evidence spans are noisy** — top hits are often cover-page fragments
  rather than the load-bearing paragraph; the PASS/FAIL + confidence is still usable.
