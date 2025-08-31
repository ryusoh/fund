from __future__ import annotations

import argparse
import sys
from pathlib import Path


def _run(args: argparse.Namespace) -> None:
    print("Updating all data...")

    try:
        from ..data.fetch_forex import fetch_forex_data  # lazy import

        fetch_forex_data()
        print("Forex data updated")
    except Exception as e:
        print(f"Forex update failed: {e}")

    try:
        original_argv = sys.argv
        sys.argv = ["update_fund_data.py"]
        from ..data.update_fund_data import main as update_fund_data_main  # lazy import

        BASE_DIR = Path(__file__).resolve().parent.parent.parent
        holdings_path = BASE_DIR / "data" / "holdings_details.json"
        output_path = BASE_DIR / "data" / "fund_data.json"
        update_fund_data_main(holdings_path, output_path)
        print("Fund data updated")
    except Exception as e:
        print(f"Fund data update failed: {e}")
    finally:
        sys.argv = original_argv

    try:
        from ..pnl.update_daily_pnl import main as update_daily_pnl_main  # lazy import

        update_daily_pnl_main()
        print("Daily P&L updated")
    except Exception as e:
        print(f"Daily P&L update failed: {e}")

    print("All updates completed.")


def add_parser(subparsers: argparse._SubParsersAction) -> None:
    parser = subparsers.add_parser(
        "update-all", help="Update all data (forex, fund data, daily P&L)"
    )
    parser.set_defaults(func=_run)
