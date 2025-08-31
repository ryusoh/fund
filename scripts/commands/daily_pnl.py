from __future__ import annotations

import argparse


def _run(args: argparse.Namespace) -> None:
    from ..pnl.update_daily_pnl import main as update_daily_pnl_main  # lazy import

    update_daily_pnl_main()
    print("Daily P&L updated successfully")


def add_parser(subparsers: argparse._SubParsersAction) -> None:
    parser = subparsers.add_parser("daily-pnl", help="Update daily P&L history")
    parser.set_defaults(func=_run)
