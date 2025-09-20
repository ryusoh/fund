"""Backfill missing historical portfolio values using market closes.

The script reads existing portfolio history data and fills missing
trading days between a requested start date and the earliest entry in
``historical_portfolio_values.csv``. Market close prices for each
holding are fetched via ``yfinance`` and combined with foreign exchange
rates to compute the portfolio value across currencies.
"""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal, getcontext
from pathlib import Path
from typing import Callable, Dict, List, Mapping, Sequence, cast

import pandas as pd
import yfinance as yf
from pandas.tseries.holiday import (
    AbstractHolidayCalendar,
    GoodFriday,
    Holiday,
    USLaborDay,
    USMartinLutherKingJr,
    USMemorialDay,
    USPresidentsDay,
    USThanksgivingDay,
)
from pandas.tseries.holiday import nearest_workday
from pandas.tseries.offsets import CustomBusinessDay

# Increase decimal precision for monetary calculations
getcontext().prec = 28


class NYSEHolidayCalendar(AbstractHolidayCalendar):
    """Subset of NYSE holidays required for trading-day calculations."""

    rules = [
        Holiday("New Year's Day", month=1, day=1, observance=nearest_workday),
        USMartinLutherKingJr,
        USPresidentsDay,
        GoodFriday,
        USMemorialDay,
        Holiday(
            "Juneteenth National Independence Day",
            month=6,
            day=19,
            observance=nearest_workday,
            start_date="2021-06-19",
        ),
        Holiday("Independence Day", month=7, day=4, observance=nearest_workday),
        USLaborDay,
        USThanksgivingDay,
        Holiday("Christmas Day", month=12, day=25, observance=nearest_workday),
    ]


NY_BUSINESS_DAY = CustomBusinessDay(calendar=NYSEHolidayCalendar())


TradingDates = Sequence[date]
PriceFetcher = Callable[[Sequence[str], TradingDates], Mapping[str, Mapping[date, Decimal]]]
FxFetcher = Callable[[Sequence[str], TradingDates], Mapping[date, Mapping[str, Decimal]]]


@dataclass(frozen=True)
class BackfillResult:
    added_rows: List[Dict[str, str]]
    trading_dates: List[date]


def _read_holdings(holdings_path: Path) -> Dict[str, Decimal]:
    if not holdings_path.exists():
        raise FileNotFoundError(f"Holdings file not found: {holdings_path}")

    with holdings_path.open("r", encoding="utf-8") as fp:
        data = json.load(fp)

    if not isinstance(data, dict) or not data:
        raise ValueError("Holdings data must be a non-empty JSON object")

    holdings: Dict[str, Decimal] = {}
    for ticker, meta in data.items():
        try:
            shares = meta["shares"] if isinstance(meta, dict) else meta
            holdings[ticker] = Decimal(str(shares))
        except Exception as exc:  # pragma: no cover - defensive branch
            raise ValueError(f"Invalid shares value for {ticker}: {meta}") from exc

    if not holdings:
        raise ValueError("No holdings found in holdings file")

    return holdings


@dataclass(frozen=True)
class HistoryData:
    rows: List[Dict[str, str]]
    fieldnames: List[str]
    earliest_date: date


def _read_history(csv_path: Path) -> HistoryData:
    if not csv_path.exists():
        raise FileNotFoundError(f"History CSV not found: {csv_path}")

    with csv_path.open("r", encoding="utf-8", newline="") as fp:
        reader = csv.DictReader(fp)
        rows = [dict(row) for row in reader]
        fieldnames = list(reader.fieldnames or [])

    if not rows:
        raise ValueError("History CSV contains no data rows")
    if "date" not in fieldnames:
        raise ValueError("History CSV is missing 'date' column")

    earliest = min(datetime.strptime(row["date"], "%Y-%m-%d").date() for row in rows)
    return HistoryData(rows=rows, fieldnames=fieldnames, earliest_date=earliest)


def _infer_currencies(fieldnames: Sequence[str]) -> List[str]:
    currencies: List[str] = []
    for name in fieldnames:
        if name.startswith("value_") and name != "value_usd":
            currencies.append(name.split("_", 1)[1].upper())
    return currencies


def _compute_trading_dates(start: date, end: date) -> List[date]:
    if start > end:
        return []
    freq = CustomBusinessDay(calendar=NYSEHolidayCalendar())
    return [ts.date() for ts in pd.date_range(start=start, end=end, freq=freq)]


def _previous_trading_day(day: date) -> date:
    timestamp = pd.Timestamp(day) - pd.Timedelta(days=1)
    previous_ts = cast(pd.Timestamp, NY_BUSINESS_DAY.rollback(timestamp))
    previous_dt: datetime = previous_ts.to_pydatetime()
    return previous_dt.date()


def _default_price_fetcher(
    tickers: Sequence[str], dates: TradingDates
) -> Dict[str, Dict[date, Decimal]]:
    prices: Dict[str, Dict[date, Decimal]] = {ticker: {} for ticker in tickers}
    if not tickers or not dates:
        return prices

    start, end = min(dates), max(dates)
    end_plus_one = end + timedelta(days=1)
    date_set = set(dates)

    for ticker in tickers:
        history = yf.Ticker(ticker).history(
            start=start.isoformat(),
            end=end_plus_one.isoformat(),
            auto_adjust=False,
            interval="1d",
        )
        if history.empty:
            raise ValueError(f"No historical price data returned for {ticker}")

        close_series = history.get("Close")
        if close_series is None:
            raise ValueError(f"Missing close prices for {ticker}")

        for timestamp, value in close_series.dropna().items():
            day = timestamp.date()
            if day in date_set:
                prices[ticker][day] = Decimal(str(value))

    return prices


def _default_fx_fetcher(
    currencies: Sequence[str], dates: TradingDates
) -> Dict[date, Dict[str, Decimal]]:
    rates: Dict[date, Dict[str, Decimal]] = {}
    if not currencies or not dates:
        return {day: {"USD": Decimal("1.0")} for day in dates}

    start, end = min(dates), max(dates)
    end_plus_one = end + timedelta(days=1)
    date_set = set(dates)

    for currency in currencies:
        symbol = f"USD{currency}=X"
        history = yf.Ticker(symbol).history(
            start=start.isoformat(),
            end=end_plus_one.isoformat(),
            auto_adjust=False,
            interval="1d",
        )
        if history.empty:
            raise ValueError(f"No FX data returned for USD/{currency}")

        close_series = history.get("Close")
        if close_series is None:
            raise ValueError(f"Missing FX close prices for USD/{currency}")

        for timestamp, value in close_series.dropna().items():
            day = timestamp.date()
            if day not in date_set:
                continue
            day_rates = rates.setdefault(day, {})
            day_rates[currency] = Decimal(str(value))

    for day in dates:
        rates.setdefault(day, {})["USD"] = Decimal("1.0")

    return rates


def _format_decimal(value: Decimal) -> str:
    return f"{value:.10f}"


def _ensure_price_coverage(
    tickers: Sequence[str],
    trading_dates: Sequence[date],
    prices: Mapping[str, Mapping[date, Decimal]],
) -> None:
    for ticker in tickers:
        missing = [day for day in trading_dates if day not in prices.get(ticker, {})]
        if missing:
            formatted = ", ".join(day.isoformat() for day in missing)
            raise ValueError(f"Missing prices for {ticker}: {formatted}")


def _ensure_fx_coverage(
    currencies: Sequence[str],
    trading_dates: Sequence[date],
    fx_rates: Mapping[date, Mapping[str, Decimal]],
) -> None:
    for day in trading_dates:
        day_rates = fx_rates.get(day)
        if day_rates is None:
            raise ValueError(f"Missing FX rates for {day.isoformat()}")
        for currency in currencies:
            if currency not in day_rates:
                raise ValueError(f"Missing FX rate for {currency} on {day.isoformat()}")


def backfill_portfolio_history(
    start_date: date,
    csv_path: Path,
    holdings_path: Path,
    *,
    price_fetcher: PriceFetcher | None = None,
    fx_fetcher: FxFetcher | None = None,
) -> BackfillResult:
    history = _read_history(csv_path)
    existing_dates = {
        datetime.strptime(row["date"], "%Y-%m-%d").date() for row in history.rows if row.get("date")
    }
    holdings = _read_holdings(holdings_path)

    if not holdings:
        raise ValueError("No holdings to backfill")

    if start_date > history.earliest_date:
        return BackfillResult(added_rows=[], trading_dates=[])

    if start_date == history.earliest_date:
        trading_dates = _compute_trading_dates(start_date, start_date)
    else:
        target_end = history.earliest_date - timedelta(days=1)
        trading_dates = _compute_trading_dates(start_date, target_end)
    if not trading_dates:
        return BackfillResult(added_rows=[], trading_dates=[])

    dates_to_fetch = set(trading_dates)
    baseline_candidate = _previous_trading_day(start_date)
    if baseline_candidate not in existing_dates:
        dates_to_fetch.add(baseline_candidate)

    trading_dates = sorted(dates_to_fetch)

    price_fetch = price_fetcher or _default_price_fetcher
    fx_fetch = fx_fetcher or _default_fx_fetcher

    tickers = sorted(holdings)
    prices = price_fetch(tickers, trading_dates)
    fx_currencies = _infer_currencies(history.fieldnames)
    fx_rates = fx_fetch(fx_currencies, trading_dates)

    _ensure_price_coverage(tickers, trading_dates, prices)
    _ensure_fx_coverage(fx_currencies, trading_dates, fx_rates)

    added_rows: List[Dict[str, str]] = []
    for day in trading_dates:
        total_usd = sum((holdings[t] * prices[t][day] for t in tickers), Decimal("0"))
        row: Dict[str, str] = {"date": day.isoformat(), "value_usd": _format_decimal(total_usd)}

        if fx_currencies:
            day_rates = fx_rates[day]
            for currency in fx_currencies:
                rate = day_rates[currency]
                row[f"value_{currency.lower()}"] = _format_decimal(total_usd * rate)

        # Ensure all columns are present
        for field in history.fieldnames:
            row.setdefault(field, "")

        added_rows.append(row)

    combined_map: Dict[str, Dict[str, str]] = {
        row["date"]: row for row in history.rows if row.get("date")
    }
    for row in added_rows:
        combined_map[row["date"]] = row

    combined_rows = [combined_map[key] for key in sorted(combined_map.keys())]

    with csv_path.open("w", encoding="utf-8", newline="") as fp:
        writer = csv.DictWriter(fp, fieldnames=history.fieldnames)
        writer.writeheader()
        for row in combined_rows:
            writer.writerow(row)

    return BackfillResult(added_rows=added_rows, trading_dates=list(trading_dates))


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    base_dir = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Backfill historical portfolio values")
    parser.add_argument("start_date", help="Earliest date (YYYY-MM-DD) to backfill")
    parser.add_argument(
        "--csv",
        type=Path,
        default=base_dir / "data" / "historical_portfolio_values.csv",
        help="Path to historical CSV",
    )
    parser.add_argument(
        "--holdings",
        type=Path,
        default=base_dir / "data" / "holdings_details.json",
        help="Path to holdings JSON file",
    )
    return parser.parse_args(argv)


def main(
    start_date: str | None = None,
    csv_path: Path | None = None,
    holdings_path: Path | None = None,
) -> BackfillResult:
    csv_path_obj: Path
    holdings_path_obj: Path

    if start_date is None:
        args = parse_args()
        start_date_str = args.start_date
        csv_path_obj = Path(args.csv)
        holdings_path_obj = Path(args.holdings)
    else:
        start_date_str = start_date
        base_dir = Path(__file__).resolve().parents[2]
        csv_path_obj = (
            Path(csv_path)
            if csv_path is not None
            else base_dir / "data" / "historical_portfolio_values.csv"
        )
        holdings_path_obj = (
            Path(holdings_path)
            if holdings_path is not None
            else base_dir / "data" / "holdings_details.json"
        )

    parsed_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
    result = backfill_portfolio_history(parsed_date, csv_path_obj, holdings_path_obj)

    print(
        f"Added {len(result.added_rows)} row(s) spanning {len(result.trading_dates)} trading day(s)."
    )
    return result


if __name__ == "__main__":
    main()
