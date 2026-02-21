#!/usr/bin/env python3.11
"""Step 03: Fetch historical adjusted prices with fallbacks and overrides."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence

import pandas as pd

sys.path.append(str(Path(__file__).parent))
from utils import append_changelog_entry

try:
    import yfinance as yf
except ImportError as exc:  # pragma: no cover - dependency check
    raise RuntimeError('yfinance is required for price fetching. Install it and rerun.') from exc

try:
    from pandas_datareader import data as pdr  # type: ignore
except ImportError:  # pragma: no cover - optional fallback
    pdr = None

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / 'data'
CHECKPOINT_DIR = DATA_DIR / 'checkpoints'
TRANSACTIONS_PATH = CHECKPOINT_DIR / 'transactions_with_splits.parquet'
HISTORICAL_PRICES_PATH = DATA_DIR / 'historical_prices.parquet'
OVERRIDE_PATH = DATA_DIR / 'historical_prices_overrides.parquet'
HISTORICAL_PRICES_JSON = DATA_DIR / 'historical_prices.json'

BENCHMARK_TICKERS = ['^GSPC', '^IXIC', '^DJI', '^N225', '^HSI', '^SSEC']

STEP_NAME = 'step-03_prices'
TOOL_NAME = 'codex'

YFINANCE_MAX_BATCH = 25

# Map normalized tickers (post-cleaning) to vendor-specific symbols
YFINANCE_ALIASES: Dict[str, str] = {
    'BRKB': 'BRK-B',
    'BF.B': 'BF-B',
    'BF_B': 'BF-B',
    '^SSEC': '000001.SS',
}

# Delisted or acquired stocks that cause yfinance lookups to fail and waste time
DELISTED_TICKERS = frozenset(
    {
        'BKI',
        'CHX',
        'DICE',
        'GD',
        'LLAP',
        'NATI',
        'NYCB',
        'PACW',
        'SBSW',
        'VTLE',
    }
)


def ensure_directories() -> None:
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)


def read_transactions() -> pd.DataFrame:
    if not TRANSACTIONS_PATH.exists():
        raise FileNotFoundError(
            f"Missing checkpoint: {TRANSACTIONS_PATH}. Run step-02 before fetching prices."
        )
    try:
        df = pd.read_parquet(TRANSACTIONS_PATH)
    except ImportError as exc:
        raise RuntimeError(
            'Reading parquet requires pyarrow or fastparquet. Install one of them and rerun.'
        ) from exc
    return df


def determine_date_range(transactions: pd.DataFrame) -> pd.DatetimeIndex:
    start_date = transactions['trade_date'].min().date()
    today_utc = datetime.now(timezone.utc).date()
    # yfinance end is exclusive; we add one day later during request
    full_range = pd.date_range(start=start_date, end=today_utc, freq='D')
    return full_range


def chunked(iterable: Sequence[str], size: int) -> Iterable[List[str]]:
    for i in range(0, len(iterable), size):
        yield list(iterable[i : i + size])


def fetch_yfinance_prices(tickers: List[str], date_index: pd.DatetimeIndex):
    if not tickers:
        empty = pd.DataFrame(index=date_index)
        return empty, [], []

    normalized = [ticker.upper() for ticker in tickers]
    request_map = {ticker: YFINANCE_ALIASES.get(ticker, ticker) for ticker in normalized}

    start = date_index[0]
    end = date_index[-1] + pd.Timedelta(days=1)  # yfinance exclusive end
    frames: List[pd.DataFrame] = []
    successes: List[str] = []
    failures: List[str] = []

    for batch in chunked(normalized, YFINANCE_MAX_BATCH):
        batch_fetch = [request_map[ticker] for ticker in batch]
        try:
            data = yf.download(
                batch_fetch,
                start=start.strftime('%Y-%m-%d'),
                end=end.strftime('%Y-%m-%d'),
                interval='1d',
                group_by='column',
                auto_adjust=False,
                progress=False,
                threads=True,
                actions=False,
            )
        except Exception as exc:  # pragma: no cover - network failures
            print(f'yfinance batch failed for {batch}: {exc}')
            failures.extend(batch)
            continue

        if data.empty:
            failures.extend(batch)
            continue

        selected = pd.DataFrame(index=data.index)

        def pick_series(symbol: str, use_close: bool, data=data) -> Optional[pd.Series]:
            if isinstance(data.columns, pd.MultiIndex):
                field = 'Close' if use_close else 'Adj Close'
                if field in data.columns.get_level_values(0):
                    try:
                        series = data[field][symbol]
                        return pd.Series(series)  # type: ignore
                    except KeyError:
                        return None
            else:
                cols = {col.upper(): col for col in data.columns}
                key = 'CLOSE' if use_close else 'ADJ CLOSE'
                if key in cols:
                    return pd.Series(data[cols[key]])  # type: ignore
            return None

        for norm in batch:
            fetch_symbol = request_map[norm]
            use_close = norm.endswith('X')
            series = pick_series(fetch_symbol, use_close)

            if series is None or series.empty:
                failures.append(norm)
                continue

            series.name = norm
            selected[norm] = series
            successes.append(norm)

        if selected.empty:
            continue

        selected = selected.reindex(date_index)
        frames.append(selected)

    combined = pd.concat(frames, axis=1) if frames else pd.DataFrame(index=date_index)
    combined = combined.loc[:, ~combined.columns.duplicated()]
    combined.columns = [col.upper() for col in combined.columns]

    return combined, sorted(set(successes)), sorted(set(failures))


def fetch_stooq_price(ticker: str, start: pd.Timestamp, end: pd.Timestamp) -> Optional[pd.Series]:
    if pdr is None:
        return None
    try:
        df = pdr.DataReader(ticker, 'stooq', start=start, end=end)
        if df.empty or 'Close' not in df.columns:
            return None
        series = df['Close'].sort_index()
        series.index = pd.DatetimeIndex(series.index.date)
        series.name = ticker
        return pd.Series(series)  # type: ignore
    except Exception:
        return None


def attempt_fallbacks(
    missing_tickers: List[str],
    date_index: pd.DatetimeIndex,
    start: pd.Timestamp,
    end: pd.Timestamp,
) -> Dict[str, pd.Series]:
    retrieved: Dict[str, pd.Series] = {}
    for ticker in missing_tickers:
        fetch_symbol = YFINANCE_ALIASES.get(ticker, ticker)
        # Try yfinance single-ticker history first (sometimes succeeds when batch fails)
        try:
            hist = yf.Ticker(fetch_symbol).history(
                start=start.strftime('%Y-%m-%d'),
                end=(end + pd.Timedelta(days=1)).strftime('%Y-%m-%d'),
                interval='1d',
                auto_adjust=True,
                actions=False,
            )
            if not hist.empty and 'Close' in hist.columns:
                series = hist['Close']
            elif not hist.empty and 'Adj Close' in hist.columns:
                series = hist['Adj Close']
            else:
                series = None
            if series is not None:
                series.index = pd.DatetimeIndex(series.index.date)
                series.name = ticker
                retrieved[ticker] = series
                continue
        except Exception:
            pass

        stooq_series = fetch_stooq_price(fetch_symbol, start=start, end=end)
        if stooq_series is not None:
            retrieved[ticker] = stooq_series.rename(ticker)

    for ticker in list(retrieved):
        retrieved[ticker] = retrieved[ticker].reindex(date_index)
    return retrieved


def load_overrides(date_index: pd.DatetimeIndex) -> pd.DataFrame:
    if not OVERRIDE_PATH.exists():
        return pd.DataFrame(index=date_index)
    try:
        override_df = pd.read_parquet(OVERRIDE_PATH)
    except ImportError as exc:
        raise RuntimeError(
            'Reading overrides requires pyarrow or fastparquet. Install one of them and rerun.'
        ) from exc

    expected_cols = {'date', 'ticker', 'adj_close'}
    missing_cols = expected_cols - set(map(str.lower, override_df.columns))
    if missing_cols:
        raise ValueError(
            f'Override parquet missing required columns: {sorted(missing_cols)}. Expected {sorted(expected_cols)}.'
        )

    rename_map = {col: col.lower() for col in override_df.columns}
    override_df = override_df.rename(columns=rename_map)
    override_df['date'] = pd.to_datetime(override_df['date'])
    override_df['ticker'] = override_df['ticker'].str.upper()

    pivot = override_df.pivot_table(
        index='date', columns='ticker', values='adj_close', aggfunc='last'
    ).reindex(date_index)
    pivot.index = date_index
    return pivot


def combine_prices(
    base_prices: pd.DataFrame,
    fallback_prices: Dict[str, pd.Series],
    overrides: pd.DataFrame,
    date_index: pd.DatetimeIndex,
) -> pd.DataFrame:
    price_df = base_prices.copy()

    for ticker, series in fallback_prices.items():
        if ticker not in price_df.columns:
            price_df[ticker] = series
        else:
            price_df[ticker] = price_df[ticker].combine_first(series)

    if not overrides.empty:
        override_tickers = overrides.columns.intersection(price_df.columns)
        for ticker in override_tickers:
            price_df[ticker] = price_df[ticker].combine_first(overrides[ticker])
        missing = overrides.columns.difference(price_df.columns)
        if not missing.empty:
            price_df = pd.concat([price_df, overrides[missing]], axis=1)

    price_df = price_df.reindex(date_index).sort_index()
    price_df = price_df.loc[:, sorted(price_df.columns)]
    return price_df


def forward_fill_prices(price_df: pd.DataFrame) -> pd.DataFrame:
    return price_df.ffill().bfill()


def write_prices(price_df: pd.DataFrame) -> None:
    try:
        price_df.to_parquet(HISTORICAL_PRICES_PATH)
    except ImportError as exc:
        raise RuntimeError(
            'Writing parquet requires pyarrow or fastparquet. Install one of them and rerun step-03.'
        ) from exc
    print(f'Historical prices written to {HISTORICAL_PRICES_PATH}')


def write_raw_json_prices(raw_df: pd.DataFrame) -> None:
    payload: dict = {}
    if not raw_df.empty:
        for column in raw_df.columns:
            series = raw_df[column].dropna()
            if series.empty:
                continue
            payload[column] = {}
            for idx, value in series.items():
                if pd.notna(value):
                    date_str = pd.to_datetime(idx).strftime('%Y-%m-%d')  # type: ignore
                    payload[column][date_str] = float(value)

    HISTORICAL_PRICES_JSON.write_text(json.dumps(payload, separators=(',', ':')) + "\n")
    print(f'Raw historical prices written to {HISTORICAL_PRICES_JSON}')


def update_status(artifacts: List[str], notes: str) -> None:
    timestamp = datetime.now(tz=timezone.utc).isoformat()
    print(f'[STATUS] {STEP_NAME} ({TOOL_NAME}) @ {timestamp}: {notes} -> {artifacts}')


def summarize(price_df: pd.DataFrame, overrides_applied: List[str]) -> None:
    missing_counts = price_df.isna().sum()
    top_missing = missing_counts.sort_values(ascending=False).head(5)

    print('\nTop tickers by missing price days (after forward fill attempt):')
    if top_missing.empty or top_missing.max() == 0:
        print('  No missing values remaining.')
    else:
        for ticker, count in top_missing.items():
            print(f'  {ticker}: {int(count)} missing days')

    if overrides_applied:
        print('\nTickers with override data applied:')
        print('  ' + ', '.join(sorted(set(overrides_applied))))
    else:
        print('\nNo overrides applied.')

    print('\nPrice DataFrame head:')
    print(price_df.head())


def main() -> None:
    ensure_directories()
    transactions = read_transactions()
    date_index = determine_date_range(transactions)
    transaction_tickers = (
        transactions['security'].dropna().astype(str).str.upper().unique().tolist()
    )
    unique_tickers = sorted(set(transaction_tickers + BENCHMARK_TICKERS))
    active_tickers = [t for t in unique_tickers if t not in DELISTED_TICKERS]
    delisted_in_portfolio = [t for t in unique_tickers if t in DELISTED_TICKERS]

    print(
        f'Fetching prices for {len(active_tickers)} active tickers from {date_index[0].date()} to {date_index[-1].date()}'
    )
    if delisted_in_portfolio:
        print(f'Skipping network fetch for {len(delisted_in_portfolio)} known delisted tickers.')

    base_prices, successes, failures = fetch_yfinance_prices(active_tickers, date_index)
    print(f'yfinance success: {len(successes)} tickers, failures: {len(failures)} tickers')

    start = date_index[0]
    end = date_index[-1]
    fallback_data = attempt_fallbacks(failures, date_index, start, end)
    fallback_tickers = list(fallback_data.keys())
    unresolved = sorted(set(failures) - set(fallback_tickers))
    if fallback_tickers:
        print(f'Fallback sources retrieved {len(fallback_tickers)} tickers: {fallback_tickers}')

    # Delisted tickers count as failures for the purpose of unresolved reporting, UNLESS they have overrides.
    unresolved = sorted(set(failures + delisted_in_portfolio) - set(fallback_tickers))

    overrides = load_overrides(date_index)
    override_tickers = list(overrides.columns) if not overrides.empty else []

    # Remove tickers that have overrides from the unresolved list
    unresolved = sorted(set(unresolved) - set(override_tickers))

    if unresolved:
        print(f'WARNING: Unable to retrieve any prices for tickers: {unresolved}')

    if override_tickers:
        print(f'Overrides available for tickers: {override_tickers}')

    combined_raw = combine_prices(base_prices, fallback_data, overrides, date_index)
    write_raw_json_prices(combined_raw)

    combined = forward_fill_prices(combined_raw)
    write_prices(combined)

    artifacts = [f"./{HISTORICAL_PRICES_PATH.relative_to(PROJECT_ROOT)}"]
    update_status(artifacts, 'Fetched historical adjusted prices with fallbacks and overrides.')
    changelog_note = ''
    if override_tickers:
        changelog_note = f"Overrides applied for: {', '.join(sorted(set(override_tickers)))}"
    elif unresolved:
        changelog_note = f"Unresolved tickers: {', '.join(unresolved)}"

    append_changelog_entry(
        STEP_NAME, artifacts, f"Fetched/merged historical prices. {changelog_note}"
    )
    summarize(combined, override_tickers)


if __name__ == '__main__':
    main()
