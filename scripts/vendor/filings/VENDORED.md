# Vendored SEC filings toolkit

This directory contains a vendored subset of a third-party SEC filings
toolkit, licensed under Apache-2.0 (see `LICENSE` and `NOTICE` in this
directory — both are reproduced unmodified, as the license requires).

- **Vendored:** 2026-09-30
- **Scope:** the SEC filings download + read path only — the SEC downloader,
  the SEC-form processors (10-K/10-Q/20-F plus the generic SEC fallback), the
  filesystem-backed storage repositories, and the filings read-tool service
  and registration (`fins/tools/`).
- **Namespace:** importable as `scripts.vendor.filings.*`.

## Modifications relative to upstream

- Package namespace rewritten to `scripts.vendor.filings.*` (all absolute
  imports; relative imports unchanged).
- Non-SEC processors and downloaders omitted (8-K/SC 13/DEF 14A/6-K forms,
  docling and markdown processors, cninfo/hkex downloaders), along with the
  ingestion/download tool registration (`fins/tools/ingestion_tools.py` and
  `register_fins_ingestion_tools`) and all UI/host/CLI/service-layer code.
- `fins/processors/registry.py` pruned to register only the included SEC
  processors (it upstream registers every processor).
- `fins/tools/fins_tools.py` pruned to the read-tool registration only.
- `workspace_paths.py` pruned to the SEC cache/throttle path helpers; the
  hidden workspace state directory is renamed from its upstream name to
  `.filings` (the same rename is applied to the batch/lock state dir in
  `fins/storage/_fs_storage_infra.py`).
- Package `__init__.py` files pruned so importing the package never pulls in
  omitted modules.
- No upstream docs/AGENTS/constraints files are vendored.
- **Cleanroom English Translation:** All Chinese docstrings, comments, and log messages
  across the vendored tree have been translated to English. Machine-consumed
  lookup dictionaries (`_search_synonyms.json` and `_financial_labels.json`)
  retain their bilingual terminology mappings for functional matching.

## Future Integration Roadmap

This vendored tree is not intended as a permanent foreign island; we plan to
integrate these primary-source filings tools into our first-party codebase
(e.g., under `scripts/filings/` or direct tools) in subsequent phases.
Attribution is preserved in `NOTICE` per Apache-2.0 §4(d).

## Widening scope later

Copy additional processor/downloader modules from the **same upstream
version**, apply the same namespace rewrite, and re-register the added
processors in `fins/processors/registry.py` (and re-export them from the
relevant `__init__.py`). The dependency closure is mechanical: run the import
smoke (`tests/python/test_vendor_filings_import.py`) and add modules until it
passes.

## Tooling

This tree is third-party code: it is excluded from ruff/black (`pyproject.toml`),
mypy (`mypy.ini`), coverage (`[tool.coverage.run]` omit), pre-commit hooks
(`.pre-commit-config.yaml`), and the thinking-comment gate
(`scripts/check_thinking_comments.py`). Do not reformat or "fix" it.
