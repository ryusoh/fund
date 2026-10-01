"""Prediction Sweeper (scripts/analysis/prediction_sweeper.py).

Scans data/analysis/*.json for unresolved predictions past their target_date.
Emits human-readable reports and supports optional failure exit codes for CI.
"""

from __future__ import annotations

import argparse
import datetime
import json
import sys
from pathlib import Path
from typing import Any

DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "analysis"


def scan_predictions(
    data_dir: Path = DEFAULT_DATA_DIR,
    as_of: datetime.date | None = None,
    warn_days: int | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Scan data/analysis JSON files for stale and upcoming unresolved predictions.

    Returns:
        tuple of (stale_predictions, upcoming_predictions)
    """
    today = as_of or datetime.date.today()
    stale: list[dict[str, Any]] = []
    upcoming: list[dict[str, Any]] = []

    if not data_dir.exists() or not data_dir.is_dir():
        return stale, upcoming

    for file_path in sorted(data_dir.glob("*.json")):
        if file_path.name == "index.json":
            continue
        ticker = file_path.stem

        try:
            content = file_path.read_text(encoding="utf-8")
            data = json.loads(content)
        except Exception as e:
            sys.stderr.write(f"Warning: could not read {file_path}: {e}\n")
            continue

        predictions = data.get("predictions")
        if not isinstance(predictions, list):
            continue

        for p in predictions:
            if not isinstance(p, dict):
                continue
            if p.get("resolved") is True:
                continue

            target_date_str = p.get("target_date")
            if not target_date_str:
                continue

            try:
                target_date = datetime.date.fromisoformat(target_date_str)
            except (ValueError, TypeError):
                sys.stderr.write(
                    f"Warning: malformed target_date in {ticker} prediction {p.get('id')}: {target_date_str}\n"
                )
                continue

            record = {
                "ticker": ticker,
                "id": p.get("id", "unknown"),
                "claim": p.get("claim", ""),
                "target_date": target_date_str,
                "probability": p.get("probability"),
            }

            if target_date < today:
                days_overdue = (today - target_date).days
                record["days_overdue"] = days_overdue
                stale.append(record)
            elif warn_days is not None and 0 <= (target_date - today).days <= warn_days:
                days_due = (target_date - today).days
                record["days_due"] = days_due
                upcoming.append(record)

    return stale, upcoming


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Scan data/analysis/*.json for stale unresolved predictions."
    )
    parser.add_argument(
        "--fail-on-stale",
        action="store_true",
        help="Exit with code 1 if any stale unresolved predictions exist.",
    )
    parser.add_argument(
        "--warn-days",
        type=int,
        default=None,
        help="Also list unresolved predictions due within N days.",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=DEFAULT_DATA_DIR,
        help=f"Directory containing analysis JSON files (default: {DEFAULT_DATA_DIR})",
    )
    parser.add_argument(
        "--as-of",
        type=str,
        default=None,
        help="Override current date (ISO format YYYY-MM-DD) for evaluation.",
    )

    args = parser.parse_args(argv)

    as_of_date = None
    if args.as_of:
        try:
            as_of_date = datetime.date.fromisoformat(args.as_of)
        except ValueError:
            sys.stderr.write(f"Error: invalid --as-of date format: {args.as_of}\n")
            return 2

    stale, upcoming = scan_predictions(
        data_dir=args.data_dir, as_of=as_of_date, warn_days=args.warn_days
    )

    if stale:
        for p in stale:
            print(
                f"{p['ticker']} {p['id']} due {p['target_date']} ({p['days_overdue']} days overdue): {p['claim']}"
            )

    if upcoming:
        for p in upcoming:
            print(
                f"{p['ticker']} {p['id']} due {p['target_date']} (due in {p['days_due']} days): {p['claim']}"
            )

    tickers = {p["ticker"] for p in stale}
    if stale:
        print(f"Summary: {len(stale)} stale prediction(s) found across {len(tickers)} ticker(s).")
    else:
        print("Summary: 0 stale predictions found.")

    if args.fail_on_stale and len(stale) > 0:
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
