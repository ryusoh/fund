#!/usr/bin/env python3.11
"""Step 03: Fetch historical adjusted prices with fallbacks and overrides."""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from datetime import time as dtime
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple
from zoneinfo import ZoneInfo

import pandas as pd
import requests

sys.path.append(str(Path(__file__).parent))
from utils import append_changelog_entry, load_delisted_tickers

sys.path.append(str(Path(__file__).resolve().parents[2]))
from scripts.utils.security_utils import scrub_secrets

try:
    import atexit
    import shutil
    import tempfile

    import yfinance as yf

    # Configure yfinance to use a temporary directory for timezone cache
    _yf_cache_dir = tempfile.mkdtemp(prefix="yf-cache-")
    yf.set_tz_cache_location(_yf_cache_dir)
    atexit.register(shutil.rmtree, _yf_cache_dir, ignore_errors=True)

    # Suppress yfinance logging about delisted tickers
    logging.getLogger('yfinance').setLevel(logging.ERROR)
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

ET_TZ = ZoneInfo('US/Eastern')
# The regular session closes at 16:00 ET; before that, today's daily bar is
# still forming and is not an official close.
MARKET_CLOSE_ET = dtime(16, 0)
# A price tail this recent that still lags the benchmark tail is a fetch lag
# worth refetching; a series stopped for longer is a halted/acquired ticker.
STALE_TAIL_WINDOW_DAYS = 14

# Yahoo's equity daily bars go through a rollover at the 20:00 ET overnight
# open: the just-completed session's bar goes missing until roughly 22:00 ET
# (indices have no overnight session, so they stay current). A run delayed
# into this window sees the whole equity fleet one session stale (2026-10-07/08:
# 165 of 165 at 20:58/21:12 ET; a 21:57 ET run was clean). Poll through the
# window rather than flat-lining the night or failing the validation gate.
ROLLOVER_WINDOW_START = dtime(20, 0)
ROLLOVER_WINDOW_END = dtime(23, 30)
# Fifteen 15-minute attempts cover the full 20:00-23:30 window. Four attempts
# exhausted run #340 at 21:22 ET, before Yahoo's bars settled around 22:00.
ROLLOVER_MAX_ATTEMPTS = 15
ROLLOVER_RETRY_SLEEP_SECONDS = 900


def _in_rollover_window(now_et: datetime) -> bool:
    return ROLLOVER_WINDOW_START <= now_et.time() <= ROLLOVER_WINDOW_END


def _fleet_stale(stale: List[str], tickers: List[str]) -> bool:
    """Fleet-majority staleness is the rollover signature; a few laggards are
    ordinary per-ticker gaps that the fallbacks handle."""
    return len(stale) >= 2 and len(stale) * 2 > len(tickers)


# Map normalized tickers (post-cleaning) to vendor-specific symbols
YFINANCE_ALIASES: Dict[str, str] = {
    'BRKB': 'BRK-B',
    'BF.B': 'BF-B',
    'BF_B': 'BF-B',
    '^SSEC': '000001.SS',
}

# Delisted or acquired stocks that cause yfinance lookups to fail and waste time
DELISTED_TICKERS = load_delisted_tickers()


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
    now_et = datetime.now(ET_TZ)
    end_date = now_et.date()
    if now_et.time() < MARKET_CLOSE_ET:
        # Today's session is still forming — its daily bar is not an official
        # close, so the series ends at the last completed session.
        end_date -= timedelta(days=1)
    # yfinance end is exclusive; we add one day later during request
    full_range = pd.date_range(start=start_date, end=end_date, freq='D')
    return full_range


def chunked(iterable: Sequence[str], size: int) -> Iterable[List[str]]:
    for i in range(0, len(iterable), size):
        yield list(iterable[i : i + size])


def fetch_yfinance_prices(tickers: List[str], date_index: pd.DatetimeIndex):
    import contextlib
    import io

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
            # Suppress yfinance's direct print statements about failed downloads
            f = io.StringIO()
            with contextlib.redirect_stderr(f):
                with contextlib.redirect_stdout(f):
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

            if series is None or series.empty or not series.notna().any():
                # An all-NaN column is a failed fetch in disguise: yfinance
                # sometimes returns the ticker column with no values at all
                # (rate limit, transient upstream gap). Count it as a failure
                # so fallbacks run — otherwise one flaky batch wipes that
                # ticker's entire price history.
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
    except Exception as e:
        # security: remediate silent catch block hiding failures
        logging.error(f"Failed to fetch stooq price for {ticker}: {e}")
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
            logging.warning(f'yfinance history returned no usable rows for {ticker}')
        except Exception as e:
            logging.warning(f"Failed to fetch {ticker} from primary source: {e}")

        stooq_series = fetch_stooq_price(fetch_symbol, start=start, end=end)
        if stooq_series is not None:
            retrieved[ticker] = stooq_series.rename(ticker)
        else:
            logging.warning(f'No fallback prices available for {ticker}')

    for ticker in list(retrieved):
        retrieved[ticker] = retrieved[ticker].reindex(date_index)
    return retrieved


def _last_valid_date(series: pd.Series) -> Optional[pd.Timestamp]:
    valid = series.dropna()
    if valid.empty:
        return None
    return pd.Timestamp(valid.index.max())


def _merge_fresher(price_df: pd.DataFrame, retrieved: Dict[str, pd.Series]) -> List[str]:
    """Merge retrieved series that extend a ticker's tail; return merged tickers."""
    merged = []
    for ticker, series in retrieved.items():
        new_last = _last_valid_date(series)
        current_last = _last_valid_date(price_df[ticker]) if ticker in price_df.columns else None
        if new_last is not None and (current_last is None or new_last > current_last):
            if ticker in price_df.columns:
                price_df[ticker] = price_df[ticker].combine_first(series)
            else:
                price_df[ticker] = series
            merged.append(ticker)
    return merged


def _fleet_flatlined_tail(
    price_df: pd.DataFrame, tickers: List[str], bench_last: pd.Timestamp
) -> List[str]:
    """Find a fleet whose benchmark-date closes repeat the prior close.

    Yahoo can stamp the current session date while carrying forward the prior
    equity close. Date-based staleness cannot see that shape (2026-11-03 run
    #335), but a moving benchmark proves the tail was a real trading session.
    """
    bench_moved = False
    for bench in BENCHMARK_TICKERS:
        if bench not in price_df.columns:
            continue
        valid = price_df[bench].dropna()
        if len(valid) >= 2 and valid.index.max() == bench_last and valid.iloc[-1] != valid.iloc[-2]:
            bench_moved = True
            break
    if not bench_moved:
        return []

    flatlined = []
    for ticker in tickers:
        if ticker in BENCHMARK_TICKERS or ticker not in price_df.columns:
            continue
        valid = price_df[ticker].dropna()
        if len(valid) >= 2 and valid.index.max() == bench_last and valid.iloc[-1] == valid.iloc[-2]:
            flatlined.append(ticker)
    return sorted(flatlined) if _fleet_stale(flatlined, tickers) else []


def _replace_tail_values(
    price_df: pd.DataFrame,
    retrieved: Dict[str, pd.Series],
    tail_date: pd.Timestamp,
) -> List[str]:
    """Replace suspected forward-filled values with same-date official closes."""
    corrected = []
    for ticker, series in retrieved.items():
        if ticker not in price_df.columns or tail_date not in series.index:
            continue
        value = series.loc[tail_date]
        if pd.isna(value):
            continue
        current = price_df.loc[tail_date, ticker]
        if pd.isna(current) or current != value:
            price_df.loc[tail_date, ticker] = value
            corrected.append(ticker)
    return corrected


POLYGON_GROUPED_DAILY_URL = 'https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks'
POLYGON_API_PREFIXES = ('https://api.polygon.io/', 'https://api.massive.com/')


def _closes_to_series(
    closes: Dict[str, Dict[pd.Timestamp, float]], date_index: pd.DatetimeIndex
) -> Dict[str, pd.Series]:
    retrieved = {}
    for ticker, points in closes.items():
        series = pd.Series(points).sort_index()
        series.name = ticker
        retrieved[ticker] = series.reindex(date_index)
    return retrieved


def fetch_polygon_daily_closes(
    tickers: List[str], dates: List[pd.Timestamp], date_index: pd.DatetimeIndex
) -> Dict[str, pd.Series]:
    """Official daily closes from Polygon grouped aggregates for the given dates.

    One API call per date covers every US-listed ticker. Use the stable REST
    contract directly: run #340 installed an unpinned SDK whose RESTClient no
    longer exposed get_grouped_daily_aggs, disabling this backstop all night.
    Requires POLYGON_KEY; without it, returns {} and leaves the other recovery
    layers to report any unresolved laggards.
    """
    if not dates:
        return {}
    api_key = os.environ.get('POLYGON_KEY')
    if not api_key:
        print('POLYGON_KEY not set; skipping Polygon stale-tail backstop')
        return {}
    # Map every symbol Polygon might report back to our normalized ticker
    # (we store e.g. BRKB; Yahoo uses BRK-B; Polygon uses BRK.B).
    wanted: Dict[str, str] = {}
    for raw in tickers:
        normalized = raw.upper()
        wanted[normalized] = normalized
        wanted[YFINANCE_ALIASES.get(normalized, normalized).replace('-', '.').upper()] = normalized
    headers = {'Authorization': f'Bearer {api_key}', 'Accept': 'application/json'}
    closes: Dict[str, Dict[pd.Timestamp, float]] = {}
    for day in dates:
        date_str = day.strftime('%Y-%m-%d')
        url: Optional[str] = f'{POLYGON_GROUPED_DAILY_URL}/{date_str}'
        params: Optional[Dict[str, str]] = {'adjusted': 'true', 'include_otc': 'false'}
        try:
            while url:
                resp = requests.get(url, params=params, headers=headers, timeout=30)
                resp.raise_for_status()
                payload = resp.json()
                for agg in payload.get('results') or []:
                    symbol = str(agg.get('T', '') or '').upper()
                    ticker = wanted.get(symbol)
                    close = agg.get('c')
                    if ticker is None or not isinstance(close, (int, float)) or close <= 0:
                        continue
                    closes.setdefault(ticker, {})[day] = float(close)
                next_url = payload.get('next_url')
                if next_url and not str(next_url).startswith(POLYGON_API_PREFIXES):
                    logging.warning('Polygon grouped daily returned an untrusted pagination URL')
                    break
                url = str(next_url) if next_url else None
                params = None  # The provider's next_url already contains its query string.
        except Exception as exc:
            error_msg = scrub_secrets(str(exc), [api_key])
            logging.warning(f'Polygon grouped daily failed for {date_str}: {error_msg}')
    retrieved = _closes_to_series(closes, date_index)
    print(
        f'Polygon stale-tail backstop retrieved {len(retrieved)} of {len(tickers)} tickers '
        f'across {len(dates)} date(s)'
    )
    return retrieved


ALPACA_BARS_URL = 'https://data.alpaca.markets/v2/stocks/bars'
ALPACA_SNAPSHOTS_URL = 'https://data.alpaca.markets/v2/stocks/snapshots'
ALPACA_SNAPSHOT_BATCH_SIZE = 25


def _alpaca_request_symbols(tickers: List[str]) -> Dict[str, str]:
    # Alpaca spells class shares with a dot where Yahoo uses a dash (BRK.B vs
    # our BRKB); map every requested symbol back to the normalized ticker.
    request_symbols: Dict[str, str] = {}
    for raw in tickers:
        normalized = raw.upper()
        symbol = YFINANCE_ALIASES.get(normalized, normalized).replace('-', '.').replace('_', '.')
        request_symbols[symbol.upper()] = normalized
    return request_symbols


def _alpaca_headers(api_key: str, api_secret: str) -> Dict[str, str]:
    return {
        'APCA-API-KEY-ID': api_key,
        'APCA-API-SECRET-KEY': api_secret,
        'Accept': 'application/json',
    }


def fetch_alpaca_snapshot_closes(
    tickers: List[str], dates: List[pd.Timestamp], date_index: pd.DatetimeIndex
) -> Dict[str, pd.Series]:
    """Recover exact-session closes from Alpaca's snapshot endpoint.

    Run #340's bulk-bars request returned 403, while this independent endpoint
    remained available to the real-time fetcher. dailyBar can be the forming
    overnight session, so inspect both daily bars and accept a close only when
    its own timestamp matches a requested session. Never substitute a latest
    trade or a differently dated bar. Requests are chunked for plan limits and
    one failed chunk does not discard successful recoveries from the others.
    """
    if not dates:
        return {}
    api_key = os.environ.get('ALPACA_API_KEY')
    api_secret = os.environ.get('ALPACA_API_SECRET')
    if not api_key or not api_secret:
        print('ALPACA_API_KEY/ALPACA_API_SECRET not set; skipping Alpaca snapshot backstop')
        return {}
    request_symbols = _alpaca_request_symbols(tickers)
    headers = _alpaca_headers(api_key, api_secret)
    wanted_dates = {day.strftime('%Y-%m-%d') for day in dates}
    closes: Dict[str, Dict[pd.Timestamp, float]] = {}
    for batch in chunked(sorted(request_symbols), ALPACA_SNAPSHOT_BATCH_SIZE):
        params = {'symbols': ','.join(batch)}
        try:
            resp = requests.get(ALPACA_SNAPSHOTS_URL, params=params, headers=headers, timeout=30)
            resp.raise_for_status()
            snapshots = resp.json()
        except Exception as exc:
            error_msg = scrub_secrets(str(exc), [api_key, api_secret])
            logging.warning(f'Alpaca snapshot backstop unavailable for {batch}: {error_msg}')
            continue
        for symbol, snapshot in (snapshots or {}).items():
            ticker = request_symbols.get(str(symbol).upper())
            if ticker is None or not isinstance(snapshot, dict):
                continue
            for field in ('dailyBar', 'prevDailyBar'):
                bar = snapshot.get(field) or {}
                session = str(bar.get('t', ''))[:10]
                close = bar.get('c')
                if session not in wanted_dates:
                    continue
                if not isinstance(close, (int, float)) or close <= 0:
                    continue
                closes.setdefault(ticker, {})[pd.Timestamp(session)] = float(close)
    retrieved = _closes_to_series(closes, date_index)
    print(
        f'Alpaca snapshot backstop retrieved {len(retrieved)} of {len(tickers)} tickers '
        f'across {len(dates)} date(s)'
    )
    return retrieved


def fetch_alpaca_daily_closes(
    tickers: List[str], dates: List[pd.Timestamp], date_index: pd.DatetimeIndex
) -> Dict[str, pd.Series]:
    """Daily closes from Alpaca's market-data bars endpoint for the given dates.

    Alpaca serves the just-completed session's regular daily bar from the
    16:00 ET close on, so it is immune to both of the other sources' evening
    gaps: Yahoo's 20:00-23:30 ET daily-bar rollover window and the Polygon
    free plan's refusal to serve same-day grouped daily before its end of day.
    Mutual funds and indices are not Alpaca securities and simply come back
    absent, so this only ever rescues US-listed equities/ETFs. The snapshot
    backstop handles accounts for which this bulk endpoint returns 403.
    """
    if not dates:
        return {}
    api_key = os.environ.get('ALPACA_API_KEY')
    api_secret = os.environ.get('ALPACA_API_SECRET')
    if not api_key or not api_secret:
        print('ALPACA_API_KEY/ALPACA_API_SECRET not set; skipping Alpaca stale-tail backstop')
        return {}
    request_symbols = _alpaca_request_symbols(tickers)
    wanted_dates = {day.strftime('%Y-%m-%d') for day in dates}
    headers = _alpaca_headers(api_key, api_secret)
    params: Dict[str, str] = {
        'symbols': ','.join(sorted(request_symbols)),
        'timeframe': '1Day',
        'start': min(dates).strftime('%Y-%m-%d'),
        # A day past the last wanted date covers the end boundary whether it
        # is interpreted as inclusive or exclusive.
        'end': (max(dates) + pd.Timedelta(days=1)).strftime('%Y-%m-%d'),
        'adjustment': 'all',
        'limit': '10000',
    }
    closes: Dict[str, Dict[pd.Timestamp, float]] = {}
    page_token: Optional[str] = None
    try:
        while True:
            if page_token:
                params['page_token'] = page_token
            resp = requests.get(ALPACA_BARS_URL, params=params, headers=headers, timeout=30)
            resp.raise_for_status()
            payload = resp.json()
            for symbol, bars in (payload.get('bars') or {}).items():
                ticker = request_symbols.get(str(symbol).upper())
                if ticker is None:
                    continue
                for bar in bars or []:
                    # Daily bars are stamped at session midnight, so the date
                    # portion of the RFC-3339 timestamp is the session date.
                    session = str(bar.get('t', ''))[:10]
                    close = bar.get('c')
                    if session not in wanted_dates:
                        continue
                    if not isinstance(close, (int, float)) or close <= 0:
                        continue
                    closes.setdefault(ticker, {})[pd.Timestamp(session)] = float(close)
            page_token = payload.get('next_page_token')
            if not page_token:
                break
    except Exception as exc:
        error_msg = scrub_secrets(str(exc), [api_key, api_secret])
        logging.warning(f'Alpaca stale-tail backstop unavailable: {error_msg}')
        return {}
    retrieved = _closes_to_series(closes, date_index)
    print(
        f'Alpaca stale-tail backstop retrieved {len(retrieved)} of {len(tickers)} tickers '
        f'across {len(dates)} date(s)'
    )
    return retrieved


def _correct_flatlined_tail(
    price_df: pd.DataFrame,
    tickers: List[str],
    bench_last: pd.Timestamp,
    date_index: pd.DatetimeIndex,
) -> List[str]:
    """Replace fleet-wide same-date forward-fills with Alpaca official closes."""
    flatlined = _fleet_flatlined_tail(price_df, tickers, bench_last)
    if not flatlined:
        return []
    print(
        f'Refetching {len(flatlined)} tickers that repeat the prior close on the '
        f'benchmark tail ({bench_last.date()}): {flatlined}'
    )
    retrieved = fetch_alpaca_daily_closes(flatlined, [bench_last], date_index)
    corrected = _replace_tail_values(price_df, retrieved, bench_last)
    unresolved = sorted(set(flatlined) - set(corrected))
    if unresolved:
        snapshots = fetch_alpaca_snapshot_closes(unresolved, [bench_last], date_index)
        corrected.extend(_replace_tail_values(price_df, snapshots, bench_last))
        unresolved = sorted(set(flatlined) - set(corrected))
    if corrected:
        print(f'Alpaca same-date flat-line corrections: {sorted(corrected)}')
    if unresolved:
        print(
            f'Same-date flat-line backstop could not correct {len(unresolved)} of '
            f'{len(flatlined)} tickers at {bench_last.date()}: {unresolved}'
        )
    return unresolved


def refresh_stale_tails(
    price_df: pd.DataFrame,
    tickers: List[str],
    date_index: pd.DatetimeIndex,
    start: pd.Timestamp,
    end: pd.Timestamp,
) -> Tuple[pd.DataFrame, List[str]]:
    """Refetch tickers whose price tail lags the benchmark indices.

    Yahoo occasionally serves equity daily bars that stop before the last
    completed session while the index bars in the same response are current.
    Only recently-active tails are refetched — a series that stopped weeks ago
    is a halted/acquired ticker, not a fetch lag.

    Four refetch layers: yfinance single-ticker + stooq, Polygon grouped daily,
    Alpaca bulk daily bars, then Alpaca snapshots. The snapshot layer accepts
    only exact-date completed bars and covers a bulk-bars 403 (run #340).

    Returns the tickers still stale after every layer, which is what the
    rollover retry decision needs: a fleet rescued by a backstop must not keep
    polling Yahoo through the window.
    """
    bench_last = None
    for bench in BENCHMARK_TICKERS:
        if bench not in price_df.columns:
            continue
        last = _last_valid_date(price_df[bench])
        if last is not None and (bench_last is None or last > bench_last):
            bench_last = last
    if bench_last is None:
        return price_df, []

    staleness_floor = bench_last - pd.Timedelta(days=STALE_TAIL_WINDOW_DAYS)
    stale = []
    for ticker in tickers:
        if ticker in BENCHMARK_TICKERS or ticker not in price_df.columns:
            continue
        last = _last_valid_date(price_df[ticker])
        if last is not None and staleness_floor <= last < bench_last:
            stale.append(ticker)
    if not stale:
        return price_df, _correct_flatlined_tail(price_df, tickers, bench_last, date_index)

    print(
        f'Refetching {len(stale)} tickers whose tail predates the benchmark tail '
        f'({bench_last.date()}): {stale}'
    )
    refreshed = _merge_fresher(price_df, attempt_fallbacks(stale, date_index, start, end))
    if refreshed:
        print(f'Stale-tail refetch updated: {refreshed}')
    still_stale = sorted(set(stale) - set(refreshed))
    if still_stale:
        # Yahoo's equity daily bars are unreliable in the ~20:00-22:00 ET
        # rollover window (the just-completed session's bar vanishes while the
        # forming overnight bar takes over), which is exactly when delayed
        # runs land — the yfinance refetch then no-ops for the whole fleet.
        # Backstop with other providers' completed-session bars.
        earliest_tail = min(
            last for t in still_stale if (last := _last_valid_date(price_df[t])) is not None
        )
        missing_days = [
            day for day in date_index if earliest_tail < day <= bench_last and day.weekday() < 5
        ][-5:]
        polygon_retrieved = fetch_polygon_daily_closes(still_stale, missing_days, date_index)
        polygon_refreshed = _merge_fresher(price_df, polygon_retrieved)
        if polygon_refreshed:
            print(f'Polygon backstop updated: {sorted(polygon_refreshed)}')
            refreshed.extend(polygon_refreshed)
            still_stale = sorted(set(stale) - set(refreshed))
    if still_stale:
        alpaca_retrieved = fetch_alpaca_daily_closes(still_stale, missing_days, date_index)
        alpaca_refreshed = _merge_fresher(price_df, alpaca_retrieved)
        if alpaca_refreshed:
            print(f'Alpaca backstop updated: {sorted(alpaca_refreshed)}')
            refreshed.extend(alpaca_refreshed)
            still_stale = sorted(set(stale) - set(refreshed))
    if still_stale:
        # Snapshots carry only the current and previous daily bars, so request
        # at most the latest two missing sessions and filter by exact date.
        snapshots = fetch_alpaca_snapshot_closes(still_stale, missing_days[-2:], date_index)
        snapshot_refreshed = _merge_fresher(price_df, snapshots)
        if snapshot_refreshed:
            print(f'Alpaca snapshot backstop updated: {sorted(snapshot_refreshed)}')
            refreshed.extend(snapshot_refreshed)
            still_stale = sorted(set(stale) - set(refreshed))
    if still_stale:
        # A no-op refetch must be visible before the downstream validation gate.
        print(
            f'Stale-tail refetch could not refresh {len(still_stale)} of {len(stale)} '
            f'tickers; their tails still predate the benchmark tail '
            f'({bench_last.date()}): {still_stale}'
        )
    still_flatlined = _correct_flatlined_tail(price_df, tickers, bench_last, date_index)
    return price_df, sorted(set(still_stale + still_flatlined))


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

    base_prices = pd.DataFrame(index=date_index)
    failures: List[str] = []
    fallback_data: Dict[str, pd.Series] = {}
    start = date_index[0]
    end = date_index[-1]
    overrides = load_overrides(date_index)
    override_tickers = list(overrides.columns) if not overrides.empty else []

    for attempt in range(1, ROLLOVER_MAX_ATTEMPTS + 1):
        base_prices, successes, failures = fetch_yfinance_prices(active_tickers, date_index)
        print(f'yfinance success: {len(successes)} tickers, failures: {len(failures)} tickers')
        fallback_data = attempt_fallbacks(failures, date_index, start, end)
        combined_raw = combine_prices(base_prices, fallback_data, overrides, date_index)
        combined_raw, stale_tail = refresh_stale_tails(
            combined_raw, active_tickers, date_index, start, end
        )
        # A fleet-wide stale tail inside Yahoo's evening rollover window means
        # the just-completed session's equity bars are temporarily missing;
        # they settle by ~22:00 ET, so wait and refetch rather than failing.
        if not (
            _fleet_stale(stale_tail, active_tickers) and _in_rollover_window(datetime.now(ET_TZ))
        ):
            break
        if attempt < ROLLOVER_MAX_ATTEMPTS:
            print(
                f'Fleet-wide staleness ({len(stale_tail)} of {len(active_tickers)} tickers) '
                f"during Yahoo's daily-bar rollover window; retrying in "
                f'{ROLLOVER_RETRY_SLEEP_SECONDS // 60} min '
                f'(attempt {attempt + 1}/{ROLLOVER_MAX_ATTEMPTS})'
            )
            time.sleep(ROLLOVER_RETRY_SLEEP_SECONDS)

    fallback_tickers = list(fallback_data.keys())
    unresolved = sorted(set(failures) - set(fallback_tickers))
    if fallback_tickers:
        print(f'Fallback sources retrieved {len(fallback_tickers)} tickers: {fallback_tickers}')

    # Delisted tickers count as failures for the purpose of unresolved reporting, UNLESS they have overrides.
    unresolved = sorted(set(failures + delisted_in_portfolio) - set(fallback_tickers))

    # Remove tickers that have overrides from the unresolved list
    unresolved = sorted(set(unresolved) - set(override_tickers))

    if unresolved:
        print(f'WARNING: Unable to retrieve any prices for tickers: {unresolved}')

    if override_tickers:
        print(f'Overrides available for tickers: {override_tickers}')

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
