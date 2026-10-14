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
the skills enforce **≥ 0.60**. Confidence is count/exactness-based (0.60/0.80/0.95),
but displayed spans are re-ranked so number-bearing matches lead, cover-page
sections are demoted, and a claim containing numerals is capped at 0.60 unless a
matched span actually contains one of its numbers (`numbers_anchored` field).
Treat it as coarse grounding, not proof.

## Known gaps (found in the 2026-10-12 AEHR appliance test)

- None currently open. Fixed since the appliance test: `list` showed
  `form_type: N/A` (adapter now maps `document_type`); XBRL statement values
  returned empty (period-column suffix parsing, fixed 2026-10-12); `verify`
  spans were raw BM25 order (now numeric-anchored, see above).

## Known gaps (confirmed in the 2026-10-13 CBRS deep-research run)

- **`verify` silently defaults to the newest filing** when `--doc` is omitted.
  Claims sourced from an older filing then FAIL at 0%, and PASSes can anchor on
  non-number-bearing boilerplate spans. Always pass `--doc fil_<accession>`;
  check that matched spans actually contain the claim's numbers.
- **`sections` CLI prints only the first 25 of N sections** (hard-coded
  `sections[:25]`, `scripts/analysis/filings_adapter.py:648`) though the header
  reports the true count. Page via the underlying `get_document_sections_tree`
  API for longer filings.
- **Large HTML prospectuses (S-1/424B4) have no processor**: `sections` and
  `verify` on an ~8.5MB S-1 raise `ValueError: no usable processor found`
  (reproduced 3/3). Workaround: direct text extraction of the cached `.htm`
  under `~/.cache/filings/portfolio/<T>/filings/fil_<accession>/` (strip tags,
  regex the number with context) — verbatim quotes from that file are an
  acceptable confirm-pass substitute.
- `ingest` pulls only the **latest filing per form** — an original S-1 is not
  fetched once a refiled S-1 exists; the 8-K exhibit 99.1 (earnings release) is
  not downloaded either (body only).
