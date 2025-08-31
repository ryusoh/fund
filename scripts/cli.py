#!/usr/bin/env python3
"""
Fund CLI - Command Line Interface for Fund Portfolio Management

Subcommands are auto-discovered from modules in `scripts.commands`.
Each command module must implement `add_parser(subparsers)`.
"""

import argparse
import importlib
import pkgutil
import sys
from typing import List


def _load_command_modules() -> List[str]:
    names: List[str] = []
    import scripts.commands as commands_pkg

    for mod in pkgutil.iter_modules(commands_pkg.__path__, commands_pkg.__name__ + "."):
        module_name = mod.name
        try:
            module = importlib.import_module(module_name)
        except Exception:
            # Skip modules that fail to import; they won't be registered
            continue
        if hasattr(module, "add_parser"):
            names.append(module_name)
        # else: ignore non-command modules
    return names


def _register_commands(subparsers: argparse._SubParsersAction) -> None:
    for module_name in _load_command_modules():
        module = importlib.import_module(module_name)
        module.add_parser(subparsers)  # type: ignore[attr-defined]


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="fund",
        description="Fund Portfolio Management CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Portfolio management
  fund holdings list
  fund holdings buy AAPL 10 150.50
  fund holdings sell AAPL 5 155.00

  # Data updates
  fund forex
  fund fund-data
  fund daily-pnl
  fund update-all

  # Historical analysis
  fund extract-history
        """,
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    _register_commands(subparsers)
    return parser


def main() -> None:
    """Main CLI entry point."""
    parser = create_parser()
    # Optional: enable shell completion via argcomplete if installed
    try:
        import argcomplete  # type: ignore

        argcomplete.autocomplete(parser)  # type: ignore[attr-defined]
    except Exception:
        pass
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    # Execute the appropriate command
    try:
        args.func(args)
    except KeyboardInterrupt:
        print("\nOperation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
