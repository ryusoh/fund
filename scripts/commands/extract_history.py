from __future__ import annotations

import argparse


def _run(args: argparse.Namespace) -> None:
    from ..pnl.extract_pnl_history import main as extract_pnl_history_main  # lazy import

    extract_pnl_history_main()
    print("Historical P&L data extracted successfully")


def add_parser(subparsers: argparse._SubParsersAction) -> None:
    parser = subparsers.add_parser(
        "extract-history", help="Extract historical P&L data from git history"
    )
    parser.set_defaults(func=_run)
