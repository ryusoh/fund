from __future__ import annotations

import argparse
import json
from pathlib import Path


def _run(args: argparse.Namespace) -> None:
    base_dir = Path(__file__).resolve().parents[2]
    json_path = Path(args.file) if args.file else base_dir / "data" / "holdings_details.json"
    try:
        with json_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        tickers = sorted(map(str, data.keys()))
    except FileNotFoundError:
        print(f"No holdings file found at {json_path}")
        return
    except Exception as e:
        print(f"Failed to read {json_path}: {e}")
        return

    for t in tickers:
        print(t)


def add_parser(subparsers: argparse._SubParsersAction) -> None:
    parser = subparsers.add_parser(
        "tickers", help="Print detected tickers from holdings JSON (for completion debug)"
    )
    parser.add_argument(
        "--file", help="Path to holdings JSON (default: data/holdings_details.json)"
    )
    parser.set_defaults(func=_run)

    try:
        from argcomplete.completers import FilesCompleter  # type: ignore

        for act in parser._actions:
            if any(opt == "--file" for opt in getattr(act, "option_strings", [])):
                act.completer = FilesCompleter()
    except Exception:
        pass
