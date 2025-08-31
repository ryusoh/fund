from __future__ import annotations

import argparse
import json
import shlex
from pathlib import Path


def add_parser(subparsers):
    p = subparsers.add_parser(
        "complete-debug",
        help="Simulate shell completion for given words (for debugging)",
        description=(
            "Provide the partial command after 'fund' as a single string.\n"
            "Example: fund complete-debug \"holdings bu\""
        ),
    )
    p.add_argument(
        "cmdline",
        nargs="?",
        default="",
        help="Partial command after 'fund' (quoted). Defaults to empty (top-level).",
    )
    p.set_defaults(func=_run)


def _get_top_commands(parser: argparse.ArgumentParser) -> list[str]:
    for action in parser._actions:  # noqa: SLF001
        if isinstance(action, argparse._SubParsersAction):  # type: ignore[attr-defined]
            return list(action.choices.keys())
    return []


def _get_subparser(parser: argparse.ArgumentParser, name: str) -> argparse.ArgumentParser | None:
    for action in parser._actions:  # noqa: SLF001
        if isinstance(action, argparse._SubParsersAction):  # type: ignore[attr-defined]
            return action.choices.get(name)
    return None


def _read_tickers(file_arg: str | None) -> list[str]:
    base_dir = Path(__file__).resolve().parents[2]
    json_path = Path(file_arg) if file_arg else base_dir / "data" / "holdings_details.json"
    try:
        with json_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return sorted(map(str, data.keys()))
    except Exception:
        return []


def _run(args) -> None:
    from scripts.cli import create_parser

    parser = create_parser()
    line = args.cmdline
    words = shlex.split(line)
    ends_space = line.endswith(" ")

    cmds = _get_top_commands(parser)

    # No words -> suggest top-level commands
    if not words:
        print("\n".join(cmds))
        return

    first = words[0]

    # Completing the first word
    if len(words) == 1 and not ends_space:
        out = [c for c in cmds if c.startswith(first)]
        print("\n".join(out))
        return

    # After a subcommand and a space
    if len(words) == 1 and ends_space:
        if first == "holdings":
            print("\n".join(["buy", "sell", "list", "--file"]))
        elif first == "fund-data":
            # Positional files: suggest nothing by default
            print("")
        else:
            print("")
        return

    # Subcommand-specific logic
    if first == "holdings":
        action = words[1] if len(words) >= 2 else ""
        action_choices = ["buy", "sell", "list"]
        # Completing action
        if len(words) == 2 and not ends_space:
            out = [a for a in action_choices if a.startswith(action)]
            print("\n".join(out))
            return
        # After action and space
        if action == "list":
            # No further args
            print("")
            return
        if action in {"buy", "sell"}:
            # Next positional is ticker
            if len(words) == 2 and ends_space:
                tickers = _read_tickers(None)
                print("\n".join(tickers))
                return
            if len(words) == 3 and not ends_space:
                prefix = words[2]
                tickers = _read_tickers(None)
                out = [t for t in tickers if t.upper().startswith(prefix.upper())]
                print("\n".join(out))
                return
    # Default: no suggestions
    print("")
