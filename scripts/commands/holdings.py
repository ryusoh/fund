from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _run(args: argparse.Namespace) -> None:
    cmd_args = ["manage_holdings.py"]
    if getattr(args, "file", None):
        cmd_args.extend(["--file", args.file])
    if getattr(args, "transactions", None):
        cmd_args.extend(["--transactions", args.transactions])
    cmd_args.append(args.action)

    if args.action in {"buy", "sell"}:
        if not all([args.ticker, args.shares, args.price]):
            raise SystemExit(f"{args.action} requires ticker, shares, and price")
        cmd_args.extend([args.ticker, args.shares, args.price])

    original_argv = sys.argv
    sys.argv = cmd_args
    try:
        # Lazy import to avoid importing dependencies at CLI startup
        from ..portfolio.manage_holdings import main as manage_holdings_main  # type: ignore

        manage_holdings_main()
    finally:
        sys.argv = original_argv


def add_parser(subparsers: argparse._SubParsersAction) -> None:
    parser = subparsers.add_parser(
        "holdings",
        help="Manage portfolio holdings (buy, sell, list)",
    )
    parser.add_argument(
        "--file",
        help="Path to holdings JSON file (default: data/holdings_details.json)",
    )
    parser.add_argument(
        "--transactions",
        help="Path to transactions CSV file (default: data/transactions.csv)",
    )
    parser.add_argument(
        "action",
        choices=["buy", "sell", "list"],
        help="Action to perform",
    )
    parser.add_argument("ticker", nargs="?", help="Stock ticker symbol")
    parser.add_argument("shares", nargs="?", help="Number of shares")
    parser.add_argument("price", nargs="?", help="Price per share")
    parser.set_defaults(func=_run)

    # Optional: argcomplete dynamic ticker completion from holdings file
    try:
        from argcomplete.completers import ChoicesCompleter, FilesCompleter  # type: ignore
    except Exception:  # pragma: no cover - optional dependency
        FilesCompleter = None  # type: ignore

    def ticker_completer(prefix, parsed_args, **kwargs):  # pragma: no cover - runtime completion
        try:
            file_arg = getattr(parsed_args, "file", None)
            base_dir = Path(__file__).resolve().parents[2]
            default_path = base_dir / "data" / "holdings_details.json"
            json_path = Path(file_arg) if file_arg else default_path
            if json_path.exists():
                with json_path.open("r", encoding="utf-8") as f:
                    data = json.load(f)
                return [t for t in data.keys() if str(t).upper().startswith(prefix.upper())]
        except Exception:
            return []
        return []

    try:  # Attach completers if argcomplete is available

        if FilesCompleter is not None:
            # Provide path completion for --file
            for act in parser._actions:
                if any(opt in ("--file", "--transactions") for opt in getattr(act, "option_strings", [])):
                    act.completer = FilesCompleter()
        # Attach dynamic completer for ticker positional
        for act in parser._actions:
            if getattr(act, "dest", "") == "ticker":
                act.completer = ticker_completer
            if getattr(act, "dest", "") == "action" and 'choices' in act.__dict__:
                # Explicitly attach choices completer for clarity
                act.completer = ChoicesCompleter(list(act.choices))
    except Exception:
        pass
