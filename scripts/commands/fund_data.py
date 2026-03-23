from __future__ import annotations

import argparse


def _run(args: argparse.Namespace) -> None:
    from scripts.data.update_fund_data import main

    main()


def add_parser(subparsers: argparse._SubParsersAction) -> None:
    parser = subparsers.add_parser("fund-data", help="Fetch fund data")
    parser.set_defaults(func=_run)
