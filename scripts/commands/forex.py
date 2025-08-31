from __future__ import annotations

import argparse


def _run(args: argparse.Namespace) -> None:
    from ..data.fetch_forex import fetch_forex_data  # lazy import

    fetch_forex_data()
    print("Forex data updated successfully")


def add_parser(subparsers: argparse._SubParsersAction) -> None:
    parser = subparsers.add_parser("forex", help="Update forex exchange rates")
    parser.set_defaults(func=_run)
