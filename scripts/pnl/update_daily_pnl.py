#!/usr/bin/env python3

"""
Updates the historical portfolio value CSV with the latest daily data.
"""

import atexit
import csv
import json
import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, cast
from zoneinfo import ZoneInfo

import pandas as pd
import yfinance as yf

# Configure yfinance to use a temporary directory for timezone cache
_yf_cache_dir = tempfile.mkdtemp(prefix="yf-cache-")
yf.set_tz_cache_location(_yf_cache_dir)
atexit.register(shutil.rmtree, _yf_cache_dir, ignore_errors=True)

# --- Configuration ---
REPO_PATH = Path(__file__).resolve().parents[2]
HOLDINGS_FILE = REPO_PATH / "data" / "holdings_details.json"
FOREX_FILE = REPO_PATH / "data" / "fx_data.json"
HISTORICAL_CSV = REPO_PATH / "data" / "historical_portfolio_values.csv"
# --- End Configuration ---


def load_json_data(file_path: Path) -> Optional[Dict[str, Any]]:
    if not file_path.exists():
        print(f"Error: Data file not found at {file_path}", file=sys.stderr)
        return None
    try:
        with file_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                return cast(Dict[str, Any], data)
            print(
                f"Error: Expected a JSON object in {file_path}, got {type(data).__name__}",
                file=sys.stderr,
            )
            return None
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error reading or parsing {file_path}: {e}", file=sys.stderr)
        return None


def _fetch_histories_batch(tickers: List[str], period: str = "5d") -> Dict[str, Any]:
    """Fetch history for all tickers in one yf.download call.

    Returns a mapping of ticker -> per-ticker history DataFrame. Tickers
    missing from the batch response are absent; the caller falls back to a
    per-ticker fetch for those.
    """
    if not tickers:
        return {}
    try:
        data = yf.download(
            tickers,
            period=period,
            group_by="ticker",
            auto_adjust=False,
            progress=False,
            threads=True,
        )
    except Exception as e:
        print(
            f"Warning: batched yf.download failed ({e}); per-ticker fallback applies.",
            file=sys.stderr,
        )
        return {}
    histories: Dict[str, Any] = {}
    if len(tickers) == 1:
        # Single-ticker downloads come back with single-level columns.
        if isinstance(data, pd.DataFrame) and not data.empty:
            histories[tickers[0]] = data
        return histories
    for ticker in tickers:
        try:
            frame = data[ticker].dropna(how="all")
        except (KeyError, TypeError):
            continue
        if isinstance(frame, pd.DataFrame) and not frame.empty:
            histories[ticker] = frame
    return histories


def calculate_daily_values_with_date(
    holdings: Dict, forex: Dict
) -> tuple[Dict[str, Any], Optional[str]]:
    """Calculate portfolio values and return the actual date of the market data.

    Returns:
        Tuple of (daily_values dict, actual_data_date as YYYY-MM-DD string or None)
    """
    total_value_usd = 0.0
    fx_rates = forex.get("rates", {}).copy()
    fx_rates["USD"] = 1.0

    actual_date = None

    histories = _fetch_histories_batch(list(holdings.keys()))

    for ticker, holding_details in holdings.items():
        try:
            shares = float(holding_details["shares"])
            ticker_obj = yf.Ticker(ticker)
            hist = histories.get(ticker)
            if hist is None or hist.empty:
                # Batch fetch missed this ticker; direct per-ticker fallback.
                hist = ticker_obj.history(period="5d")
            if hist.empty:
                print(
                    f"Warning: Could not get historical data for {ticker}. Skipping.",
                    file=sys.stderr,
                )
                continue

            # Get the actual date of the latest close price
            last_idx = hist.index[-1]
            market_price = hist["Close"].iloc[-1]

            # If history() returns NaN for the latest row, fall back to
            # yfinance info["regularMarketPrice"] which is the official
            # regular-session close price (available immediately after close,
            # unlike history() which has a delay finalising daily bars).
            if pd.isna(market_price):
                try:
                    reg_price = ticker_obj.info.get("regularMarketPrice")
                except Exception as e:
                    print(f"Warning: Failed to fetch regularMarketPrice for {ticker}: {e}")
                    reg_price = None
                if reg_price is not None and pd.notna(reg_price):
                    print(
                        f"Warning: history() returned NaN for {ticker} on "
                        f"{last_idx.strftime('%Y-%m-%d')}. "
                        f"Using regularMarketPrice={reg_price}.",
                        file=sys.stderr,
                    )
                    market_price = float(reg_price)
                else:
                    # Last resort: walk backwards for an older valid close
                    close_col = hist["Close"]
                    resolved = False
                    for offset in range(1, len(close_col)):
                        idx = -(offset + 1)
                        price_candidate = close_col.iloc[idx]
                        if pd.notna(price_candidate):
                            last_idx = hist.index[idx]
                            market_price = price_candidate
                            resolved = True
                            break
                    if not resolved:
                        print(
                            f"Warning: No valid close price found for {ticker}. Skipping.",
                            file=sys.stderr,
                        )
                        continue

            actual_date = last_idx.strftime("%Y-%m-%d")
            currency = "USD"

            fx_to_usd = fx_rates.get(currency)
            if fx_to_usd is None:
                print(
                    f"Warning: Missing FX rate for {currency}. Assuming 1.0.",
                    file=sys.stderr,
                )
                fx_to_usd = 1.0

            value_in_usd = (shares * market_price) / fx_to_usd
            total_value_usd += value_in_usd
        except (ValueError, TypeError) as e:
            print(
                f"Warning: Could not process ticker {ticker}. Details: {e}",
                file=sys.stderr,
            )
        except Exception as e:
            print(
                f"Warning: An error occurred while fetching data for {ticker}: {e}",
                file=sys.stderr,
            )

    daily_values = {}
    for ccy, rate in fx_rates.items():
        daily_values[f"value_{ccy.lower()}"] = total_value_usd * rate

    return daily_values, actual_date


def calculate_daily_values(holdings: Dict, forex: Dict) -> Dict[str, Any]:
    """Calculate portfolio values (legacy function, date is discarded)."""
    values, _ = calculate_daily_values_with_date(holdings, forex)
    return values


def calculate_daily_values_by_date(
    holdings: Dict, forex: Dict, period: str = "1mo"
) -> Dict[str, Dict[str, Any]]:
    """Portfolio values for every trading day in the recent window.

    Returns {'YYYY-MM-DD': daily_values}. The nightly append alone never
    recovers days lost to failed runs (the 2026-10-07 hole: the 10-06 and
    10-08 rows landed but 10-07 was never written); this fills any gap
    inside the window, interior or tail. A ticker without a bar on a date
    carries its last close within the window (pipeline ffill semantics).
    """
    fx_rates = forex.get("rates", {}).copy()
    fx_rates["USD"] = 1.0

    histories = _fetch_histories_batch(list(holdings.keys()), period=period)
    closes_by_ticker: Dict[str, Dict[str, float]] = {}
    shares_by_ticker: Dict[str, float] = {}
    for ticker, holding_details in holdings.items():
        try:
            shares = float(holding_details["shares"])
            hist = histories.get(ticker)
            if hist is None or hist.empty:
                hist = yf.Ticker(ticker).history(period=period)
            if hist.empty:
                print(
                    f"Warning: Could not get historical data for {ticker}. Skipping.",
                    file=sys.stderr,
                )
                continue
            closes = hist["Close"].dropna()
            if closes.empty:
                print(
                    f"Warning: No valid close price found for {ticker}. Skipping.",
                    file=sys.stderr,
                )
                continue
            closes_by_ticker[ticker] = {
                idx.strftime("%Y-%m-%d"): float(price) for idx, price in closes.items()
            }
            shares_by_ticker[ticker] = shares
        except (ValueError, TypeError) as e:
            print(
                f"Warning: Could not process ticker {ticker}. Details: {e}",
                file=sys.stderr,
            )
        except Exception as e:
            print(
                f"Warning: An error occurred while fetching data for {ticker}: {e}",
                file=sys.stderr,
            )

    values_by_date: Dict[str, Dict[str, Any]] = {}
    all_dates = sorted({day for closes in closes_by_ticker.values() for day in closes})
    last_known: Dict[str, float] = {}
    for day in all_dates:
        for ticker, closes in closes_by_ticker.items():
            if day in closes:
                last_known[ticker] = closes[day]
        if len(last_known) < len(closes_by_ticker):
            continue  # some ticker has no bar yet inside the window
        total_usd = sum(shares_by_ticker[t] * last_known[t] for t in closes_by_ticker)
        values_by_date[day] = {
            f"value_{ccy.lower()}": total_usd * rate for ccy, rate in fx_rates.items()
        }
    return values_by_date


def main():
    print("Starting daily portfolio value update...")

    all_data = {
        "holdings": load_json_data(HOLDINGS_FILE),
        "forex": load_json_data(FOREX_FILE),
    }

    if not all(all_data.values()):
        print("One or more essential data files are missing. Aborting.", file=sys.stderr)
        sys.exit(1)

    header = []
    last_date = None
    file_content = ""
    all_rows = []
    if HISTORICAL_CSV.exists():
        with HISTORICAL_CSV.open("r", encoding="utf-8") as f:
            file_content = f.read()
            f.seek(0)
            reader = csv.reader(file_content.splitlines())
            try:
                header = next(reader)
                all_rows = list(reader)
                if all_rows:
                    last_date = all_rows[-1][0]
            except StopIteration:
                import logging

                logging.warning("Historical CSV is empty")

    # Drop trailing row if all value columns are NaN (corrupt from a previous failed run)
    if header and all_rows:
        last_row_values = all_rows[-1][1:]  # skip the date column
        if all(v.strip().lower() == "nan" or v.strip() == "" for v in last_row_values):
            corrupt_date = all_rows[-1][0]
            print(
                f"Dropping corrupt NaN row for {corrupt_date} from CSV.",
                file=sys.stderr,
            )
            all_rows.pop()
            last_date = all_rows[-1][0] if all_rows else None
            # Rebuild file_content without the corrupt row
            lines = [",".join(header)]
            for row in all_rows:
                lines.append(",".join(row))
            file_content = "\n".join(lines) + "\n"
            with HISTORICAL_CSV.open("w", encoding="utf-8") as f:
                f.write(file_content)

    # Fetch market data ONCE per run: it both bootstraps the CSV header when
    # the file is new and provides today's values plus the data date.
    print("Fetching latest market data...")
    current_values, market_data_date = calculate_daily_values_with_date(**all_data)

    if not header:
        print("Calculating current portfolio value...")
        header = ["date"] + list(current_values.keys())
        with HISTORICAL_CSV.open("w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(header)
        with HISTORICAL_CSV.open("r", encoding="utf-8") as f:
            file_content = f.read()

    if market_data_date is None:
        print("Error: Could not determine the date of market data. Aborting.", file=sys.stderr)
        sys.exit(1)

    print(f"Latest market data date: {market_data_date}")
    print(f"Last date in CSV: {last_date}")

    # A bar dated today is still forming until the 16:00 ET close; appending
    # it would bake a mid-session value in as the day's close, and later runs
    # would skip the date ("Nothing to update"), freezing it permanently.
    et_now = datetime.now(ZoneInfo("US/Eastern"))
    if market_data_date == et_now.date().isoformat() and et_now.hour < 16:
        print(
            f"Market data for {market_data_date} is still forming (session open). "
            "Skipping to avoid recording a partial day."
        )
        sys.exit(0)

    # If last_date exists but is different from market_data_date,
    # we need to determine if we should update last_date or append market_data_date
    if last_date and last_date > market_data_date:
        # This shouldn't normally happen, but could occur if market data is delayed
        print(
            f"Warning: Market data ({market_data_date}) is older than last CSV entry ({last_date})."
        )
        print("This may indicate delayed market data. Skipping update.")
        df_display = pd.read_csv(HISTORICAL_CSV)
        print("\nLatest data:")
        print(df_display.tail())
        sys.exit(0)

    # Append only the latest date never recovers days lost to failed runs
    # (the 2026-10-07 hole: validation failures blocked two nightly commits,
    # and the next successful run wrote 10-08 without filling 10-07). Backfill
    # every missing trading day in the recent window, interior or tail.
    existing_dates = {row[0] for row in all_rows}
    values_by_date: Dict[str, Dict[str, Any]] = {}
    if last_date:
        gap_span = (
            datetime.fromisoformat(market_data_date) - datetime.fromisoformat(last_date)
        ).days
        period = "5d" if gap_span <= 5 else "1mo" if gap_span <= 31 else "3mo"
        values_by_date = calculate_daily_values_by_date(
            all_data["holdings"], all_data["forex"], period=period
        )
    # The latest date keeps calculate_daily_values_with_date's resolution —
    # its regularMarketPrice fallback covers a NaN last bar.
    values_by_date[market_data_date] = current_values
    missing_dates = [
        day
        for day in sorted(values_by_date)
        if day <= market_data_date and day not in existing_dates
    ]
    if not missing_dates:
        print(f"Data already exists through {market_data_date}. Nothing to update.")
        df_display = pd.read_csv(HISTORICAL_CSV)
        print("\nLatest data:")
        print(df_display.tail())
        sys.exit(0)

    print(f"Backfilling {len(missing_dates)} missing date(s): {missing_dates}")
    for day in missing_dates:
        all_rows.append([day] + [values_by_date[day].get(col, "") for col in header[1:]])
    all_rows.sort(key=lambda row: row[0])

    lines = [",".join(header)]
    for row in all_rows:
        lines.append(",".join(str(cell) for cell in row))
    with HISTORICAL_CSV.open("w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"Successfully wrote {len(missing_dates)} row(s) to {HISTORICAL_CSV}")
    df_display = pd.read_csv(HISTORICAL_CSV)
    print("\nLatest data:")
    print(df_display.tail())


if __name__ == "__main__":
    main()
