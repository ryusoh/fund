#!/usr/bin/env python3
"""
Fill missing executed prices in transactions.csv using Yahoo Finance closes.

Example:
    python scripts/fill_zero_prices.py \
        --input data/transactions.csv \
        --output data/transactions_with_prices.csv

Use --in-place to overwrite the input file.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

try:
    import yfinance as yf
except ImportError as exc:  # pragma: no cover - guidance for users
    raise SystemExit("Please install yfinance (pip install yfinance)") from exc

DEFAULT_TRANSACTIONS = Path("data") / "transactions.csv"
DEFAULT_SPLITS = Path("data") / "split_history.csv"
DATE_FORMAT = "%m/%d/%Y"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_TRANSACTIONS,
        help="Path to transactions CSV (default: data/transactions.csv)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional output file. If omitted, a new file with suffix '_updated' is written.",
    )
    parser.add_argument(
        "--splits",
        type=Path,
        default=DEFAULT_SPLITS,
        help="Path to split history CSV (default: data/split_history.csv)",
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Overwrite the input file instead of writing a separate output file.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Do not write any files; just report planned updates.",
    )
    parser.add_argument(
        "--reset-zero-net",
        action="store_true",
        help="Reset net amount when price is updated (useful if quantity * price should be recomputed).",
    )
    return parser.parse_args()


def load_split_history(path: Path) -> Dict[str, List[Tuple[dt.date, float]]]:
    history: Dict[str, List[Tuple[dt.date, float]]] = defaultdict(list)
    if not path.exists():
        return history

    with path.open("r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            symbol = (row.get("Symbol") or "").strip()
            split_date = (row.get("Split Date") or "").strip()
            multiplier_raw = row.get("Split Multiplier") or row.get("split_multiplier")

            if not symbol or not split_date or not multiplier_raw:
                continue

            try:
                multiplier = float(multiplier_raw)
                date_obj = dt.date.fromisoformat(split_date)
            except (ValueError, TypeError):
                continue

            normalized_symbol = normalize_symbol(symbol)
            history[normalized_symbol].append((date_obj, multiplier))

    for entries in history.values():
        entries.sort(key=lambda item: item[0])

    return history


def normalize_symbol(symbol: str) -> str:
    return symbol.replace(".", "-").strip().upper()


def compute_split_adjustment(
    splits: Dict[str, List[Tuple[dt.date, float]]],
    symbol: str,
    trade_date: dt.date,
) -> float:
    """Return multiplier to undo future splits relative to trade_date."""
    normalized = normalize_symbol(symbol)
    total = 1.0
    for split_date, multiplier in splits.get(normalized, []):
        if split_date > trade_date:
            total *= multiplier
    return total


def fetch_close_price(symbol: str, trade_date: dt.date) -> float | None:
    start = trade_date
    end = trade_date + dt.timedelta(days=1)
    try:
        data = yf.download(
            symbol,
            start=start.strftime("%Y-%m-%d"),
            end=end.strftime("%Y-%m-%d"),
            progress=False,
            auto_adjust=False,
            actions=False,
        )
    except Exception as exc:  # pragma: no cover - network errors
        print(
            f"[WARN] Failed to download price for {symbol} on {trade_date}: {exc}", file=sys.stderr
        )
        return None

    if data.empty:
        print(f"[WARN] No data for {symbol} on {trade_date}", file=sys.stderr)
        return None
    close_series = data["Close"]
    if close_series.empty:
        print(f"[WARN] Missing close for {symbol} on {trade_date}", file=sys.stderr)
        return None
    return float(close_series.iloc[0])


def maybe_parse_price(value: str) -> float | None:
    try:
        price = float(value)
    except (ValueError, TypeError):
        return None
    return price


def update_transactions(
    rows: Iterable[Dict[str, str]],
    splits: Dict[str, List[Tuple[dt.date, float]]],
    reset_zero_net: bool,
) -> Tuple[List[Dict[str, str]], List[Dict[str, str]]]:
    updated_rows: List[Dict[str, str]] = []
    modifications: List[Dict[str, str]] = []

    for row in rows:
        price_raw = row.get("Executed Price") or row.get("Price")
        price = maybe_parse_price(price_raw)
        if price is None or price > 0:
            updated_rows.append(row)
            continue

        symbol = (row.get("Security") or "").strip()
        date_str = (row.get("Trade Date") or row.get("tradeDate") or "").strip()
        quantity_raw = row.get("Quantity") or ""
        try:
            trade_date = dt.datetime.strptime(date_str, DATE_FORMAT).date()
        except ValueError:
            print(f"[WARN] Could not parse date '{date_str}' for symbol {symbol}", file=sys.stderr)
            updated_rows.append(row)
            continue

        yf_symbol = normalize_symbol(symbol)
        close_price = fetch_close_price(yf_symbol, trade_date)
        if close_price is None:
            updated_rows.append(row)
            continue

        adjustment = compute_split_adjustment(splits, symbol, trade_date)
        final_price = close_price * adjustment

        row = dict(row)  # copy so we do not mutate caller's data
        row["Executed Price"] = f"{final_price:.4f}"

        if reset_zero_net:
            try:
                quantity = float(quantity_raw)
                net_amount = quantity * final_price
                sign = 1 if (row.get("Order Type", "").lower() == "buy") else -1
                row["Net Amount"] = f"{net_amount * sign:.4f}"
            except (ValueError, TypeError):
                pass

        updated_rows.append(row)
        modifications.append(
            {
                "Security": symbol,
                "Trade Date": date_str,
                "Price": row["Executed Price"],
                "Adjustment": f"{adjustment:.4f}",
            }
        )

    return updated_rows, modifications


def read_transactions(path: Path) -> Tuple[List[str], List[Dict[str, str]]]:
    with path.open("r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fieldnames = reader.fieldnames or []
    return fieldnames, rows


def write_transactions(path: Path, fieldnames: List[str], rows: Iterable[Dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main() -> int:
    args = parse_args()

    output_path = args.input if args.in_place else args.output
    if not args.in_place and output_path is None:
        output_path = args.input.with_name(f"{args.input.stem}_updated{args.input.suffix}")

    fieldnames, rows = read_transactions(args.input)
    splits = load_split_history(args.splits)

    updated_rows, modifications = update_transactions(rows, splits, args.reset_zero_net)

    if not modifications:
        print("No zero-price transactions found or updated.")
        return 0

    print(f"Updated {len(modifications)} transactions:")
    for item in modifications:
        print(
            f"  {item['Trade Date']} {item['Security']}: price={item['Price']} (split adj {item['Adjustment']})"
        )

    if args.dry_run:
        print("Dry-run enabled; no files written.")
        return 0

    if output_path is None:
        print("No output path provided; aborting without writing.", file=sys.stderr)
        return 1

    write_transactions(output_path, fieldnames, updated_rows)
    print(f"Wrote updated transactions to {output_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
