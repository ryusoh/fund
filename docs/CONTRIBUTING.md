# Contributing

## Project Layout Overview

- `scripts/cli.py`: Main CLI entry point. Auto-discovers subcommands from
  `scripts/commands`.
- `scripts/commands/`: CLI subcommands (one file per subcommand). Each module
  must expose `add_parser(subparsers)` and set a callable at `func` on its
  subparser.
- `scripts/data/`: Data fetch/update tasks (e.g., `fetch_forex.py`,
  `update_fund_data.py`).
- `scripts/pnl/`: P&L and history tasks (e.g., `update_daily_pnl.py`,
  `extract_pnl_history.py`).
- `scripts/portfolio/`: Portfolio management tasks (e.g.,
  `manage_holdings.py`).
- `scripts/vendor/`: Node scripts to fetch/verify/clean vendor assets.
- `bin/`: Thin launchers for local use (`./bin/fund`, etc.).

## Add a new CLI subcommand

1. Create `scripts/commands/<name>.py`:
    - Implement `_run(args)` to execute your logic (perform lazy imports inside
      handlers when possible).
    - Implement `add_parser(subparsers)` to register a subparser and set
      `func=_run`.

    Example:

    ```python
    # scripts/commands/example.py
    import argparse
    def _run(args: argparse.Namespace) -> None:
        print("ran example", args)
    def add_parser(subparsers: argparse._SubParsersAction) -> None:
        p = subparsers.add_parser("example", help="Example command")
        p.add_argument("name")
        p.set_defaults(func=_run)
    ```

2. Run: `python3 -m scripts.cli --help` to verify it appears.
3. Add tests under `tests/python/` (see `tests/python/test_cli.py` for
   patterns). Prefer unit tests with dependency stubs over networked calls.

## Python development

- Install dev deps: `pip install -r requirements-dev.txt`
- Install git hooks: `pre-commit install` (optional but recommended)
- Lint: `ruff check scripts tests` and `black --check .`
- Types: `mypy`
- Security: `bandit -r scripts -lll`
- Tests: `pytest`

Run hooks manually anytime with `pre-commit run --all-files`.

## Packaging and entry point

- The `fund` console script is defined in `pyproject.toml`
  (`scripts.cli:main`). Install locally with `pip install -e .`.

## GitHub Actions

- Workflows update data via scripts under `scripts/data/` and `scripts/pnl/`.
  If you move or add scripts that are used by workflows, update
  `.github/workflows/*.yml` accordingly.
