from __future__ import annotations

import argparse
from pathlib import Path


def _run(args: argparse.Namespace) -> None:
    # This is a bit of a hack to reuse the main logic from the old script
    # The old script takes sys.argv, so we patch it here.
    # A better long-term solution would be to refactor the logic from
    # update_fund_data.main() into a function that accepts arguments.
    from scripts.data.update_fund_data import main

    BASE_DIR = Path(__file__).resolve().parent.parent.parent
    holdings_path = BASE_DIR / "data" / "holdings_details.json"
    output_path = BASE_DIR / "data" / "fund_data.json"
    main(holdings_path, output_path)


def add_parser(subparsers: argparse._SubParsersAction) -> None:
    parser = subparsers.add_parser("fund-data", help="Fetch fund data")
    parser.set_defaults(func=_run)
