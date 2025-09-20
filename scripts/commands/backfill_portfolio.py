"""CLI command for backfilling historical portfolio values."""

from __future__ import annotations

from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parents[2]


def _run(args: Any) -> None:
    from scripts.data import backfill_portfolio_history

    backfill_portfolio_history.main(
        start_date=args.start_date,
        csv_path=args.csv,
        holdings_path=args.holdings,
    )


def add_parser(subparsers) -> None:
    parser = subparsers.add_parser(
        "backfill-portfolio",
        help="Backfill missing portfolio history prior to the earliest recorded date",
    )
    parser.add_argument("start_date", help="Earliest date (YYYY-MM-DD) to backfill")
    parser.add_argument(
        "--csv",
        type=Path,
        default=BASE_DIR / "data" / "historical_portfolio_values.csv",
        help="Path to historical portfolio CSV",
    )
    parser.add_argument(
        "--holdings",
        type=Path,
        default=BASE_DIR / "data" / "holdings_details.json",
        help="Path to holdings details JSON",
    )
    parser.set_defaults(func=_run)
