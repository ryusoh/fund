# SEC filings toolkit — provenance

This directory contains code originally vendored from a third-party SEC
filings toolkit ("dayu Agent", Copyright 2026 Leo Liu), licensed under
Apache-2.0 (see `LICENSE` and `NOTICE` in this directory — both are reproduced
unmodified, as the license requires). It became first-party code under
`scripts/filings/` on 2026-10-12.

- **Vendored:** 2026-09-30
- **First-party move:** 2026-10-12 (`scripts/vendor/filings/` → `scripts/filings/`)
- **Scope:** the SEC filings download + read path only — the SEC downloader,
  the SEC-form processors (10-K/10-Q/20-F plus the generic SEC fallback), the
  filesystem-backed storage repositories, and the filings read-tool service
  and registration (`fins/tools/`).
- **Namespace:** importable as `scripts.filings.*`.

## Modifications relative to upstream

- Package namespace rewritten twice: to `scripts.vendor.filings.*` at vendoring,
  then to `scripts.filings.*` in the 2026-10-12 first-party move (all absolute
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
- **English translation:** all Chinese docstrings, comments, and log messages
  across the tree have been translated to English. Machine-consumed
  lookup dictionaries (`_search_synonyms.json` and `_financial_labels.json`)
  retain their bilingual terminology mappings for functional matching.

## Widening scope later

Copy additional processor/downloader modules from the **same upstream
version**, apply the `scripts.filings.*` namespace rewrite, and re-register the
added processors in `fins/processors/registry.py` (and re-export them from the
relevant `__init__.py`). The dependency closure is mechanical: run the import
smoke (`tests/python/test_filings_import.py`) and add modules until it passes.

## Tooling

This tree is excluded from automated gates: ruff/black (`pyproject.toml`), mypy
(`mypy.ini`), coverage (`[tool.coverage.run]` omit), pre-commit hooks
(`.pre-commit-config.yaml`), and the thinking-comment gate
(`scripts/check_thinking_comments.py`). Formatters and auto-fixers must never
rewrite it. As modules are genuinely adopted (fixed, refactored, owned), move
them under the first-party gates one at a time rather than normalizing the
whole tree at once.

Deliberate, hand-reviewed modifications **are** allowed: Apache-2.0 §4 permits
derivative works. When you change a file in this tree:

1. Add a brief change notice at the top of the modified file (Apache-2.0 §4(b)).
2. Record the change under "Modifications relative to upstream".

Note that each divergence from upstream raises the cost of pulling future
upstream fixes — prefer adapter-layer workarounds for anything cosmetic, and
modify this code only for real defects.
