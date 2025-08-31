from __future__ import annotations

import argparse
import sys


def _run(args: argparse.Namespace) -> None:
    cmd_args = ["update_fund_data.py"]
    if args.holdings_file:
        cmd_args.append(args.holdings_file)
    if args.output_file:
        cmd_args.append(args.output_file)

    original_argv = sys.argv
    sys.argv = cmd_args
    try:
        from ..data.update_fund_data import main as update_fund_data_main  # lazy import

        update_fund_data_main()
        print("Fund data updated successfully")
    finally:
        sys.argv = original_argv


def add_parser(subparsers: argparse._SubParsersAction) -> None:
    parser = subparsers.add_parser("fund-data", help="Update fund market data")
    parser.add_argument("holdings_file", nargs="?", help="Path to holdings file (optional)")
    parser.add_argument("output_file", nargs="?", help="Path to output file (optional)")
    parser.set_defaults(func=_run)

    # Optional: path completion for files
    try:
        from argcomplete.completers import FilesCompleter  # type: ignore

        for act in parser._actions:
            if getattr(act, "dest", "") in {"holdings_file", "output_file"}:
                act.completer = FilesCompleter()
    except Exception:
        pass
