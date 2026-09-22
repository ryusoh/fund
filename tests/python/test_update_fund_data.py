from datetime import datetime
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest
import pytz

from scripts.data.update_fund_data import (
    _last_completed_close,
    _select_alpaca_close,
    _select_polygon_close,
    get_prices,
    get_tickers_from_holdings,
)

ET = pytz.timezone("US/Eastern")


@pytest.fixture
def mock_holdings_file(tmp_path):
    import json

    file_path = tmp_path / "holdings_details.json"
    data = {"AAPL": {}, "TSLA": {}}
    file_path.write_text(json.dumps(data))
    return file_path


@patch("scripts.data.update_fund_data.yf.set_tz_cache_location")
@patch("scripts.data.update_fund_data.tempfile.mkdtemp")
def test_set_tz_cache_location(mock_mkdtemp, mock_set_tz):
    # This basically asserts the module-level execution didn't crash
    # and we can potentially reload the module to track the exact call if needed.
    mock_mkdtemp.return_value = "/mock/temp/dir/yf-cache-123"

    import importlib

    import scripts.data.update_fund_data as module

    # Reloading to trigger the top-level script code
    importlib.reload(module)

    mock_set_tz.assert_called_with("/mock/temp/dir/yf-cache-123")


def test_get_tickers_from_holdings(mock_holdings_file):
    tickers = get_tickers_from_holdings(mock_holdings_file)
    assert set(tickers) == {"AAPL", "TSLA"}


# --- Session-aware baseline selection ---
# The baseline must always be the last *completed* regular-session close,
# regardless of when the run lands (Actions congestion delayed the nightly run
# past the 20:00 ET overnight open on 2026-09-21 and wrote forming-bar prices).


def test_alpaca_overnight_uses_prev_daily_bar():
    # 20:07 ET Monday: dailyBar has rolled to Tuesday's forming overnight bar
    now = datetime(2026, 9, 21, 20, 7, tzinfo=ET)
    snapshot = {
        "dailyBar": {"c": 159.31, "t": "2026-09-22T04:00:00Z"},
        "prevDailyBar": {"c": 160.89, "t": "2026-09-21T04:00:00Z"},
        "latestTrade": {"p": 159.40},
    }
    assert _select_alpaca_close(snapshot, now) == 160.89


def test_alpaca_overnight_after_midnight_uses_prev_daily_bar():
    # 02:00 ET Tuesday: dailyBar is Tuesday's forming overnight bar
    now = datetime(2026, 9, 22, 2, 0, tzinfo=ET)
    snapshot = {
        "dailyBar": {"c": 160.10, "t": "2026-09-22T04:00:00Z"},
        "prevDailyBar": {"c": 160.89, "t": "2026-09-21T04:00:00Z"},
    }
    assert _select_alpaca_close(snapshot, now) == 160.89


def test_alpaca_post_close_window_uses_daily_bar():
    # 17:15 ET (the scheduled run): dailyBar holds the just-completed session
    now = datetime(2026, 9, 21, 17, 15, tzinfo=ET)
    snapshot = {
        "dailyBar": {"c": 160.89, "t": "2026-09-21T04:00:00Z"},
        "prevDailyBar": {"c": 158.55, "t": "2026-09-18T04:00:00Z"},
    }
    assert _select_alpaca_close(snapshot, now) == 160.89


def test_alpaca_mid_session_uses_prev_daily_bar():
    # 10:00 ET Tuesday: dailyBar is today's forming bar
    now = datetime(2026, 9, 22, 10, 0, tzinfo=ET)
    snapshot = {
        "dailyBar": {"c": 161.20, "t": "2026-09-22T04:00:00Z"},
        "prevDailyBar": {"c": 160.89, "t": "2026-09-21T04:00:00Z"},
    }
    assert _select_alpaca_close(snapshot, now) == 160.89


def test_alpaca_weekend_run_uses_last_completed_daily_bar():
    # Saturday: dailyBar is Friday's completed bar, dated before today
    now = datetime(2026, 9, 19, 12, 0, tzinfo=ET)
    snapshot = {
        "dailyBar": {"c": 158.55, "t": "2026-09-18T04:00:00Z"},
        "prevDailyBar": {"c": 159.22, "t": "2026-09-17T04:00:00Z"},
    }
    assert _select_alpaca_close(snapshot, now) == 158.55


def test_alpaca_falls_back_when_preferred_bar_missing():
    # No prevDailyBar at all: fall back to dailyBar, then the latest trade
    now = datetime(2026, 9, 21, 23, 0, tzinfo=ET)
    snapshot = {"dailyBar": {"c": 154.0}, "latestTrade": {"p": 155.0}}
    assert _select_alpaca_close(snapshot, now) == 154.0
    assert _select_alpaca_close({"latestTrade": {"p": 155.0}}, now) == 155.0


def _yf_series(pairs):
    dates = [pd.Timestamp(d) for d, _ in pairs]
    return pd.Series([v for _, v in pairs], index=pd.DatetimeIndex(dates))


def test_yfinance_mid_session_drops_forming_bar():
    # 10:00 ET Tuesday: today's bar is still forming — baseline is Monday
    now = datetime(2026, 9, 22, 10, 0, tzinfo=ET)
    col = _yf_series([("2026-09-21", 160.89), ("2026-09-22", 161.20)])
    assert _last_completed_close(col, now) == 160.89


def test_yfinance_post_close_keeps_today_bar():
    # 17:15 ET: today's session is complete — its close is the baseline
    now = datetime(2026, 9, 22, 17, 15, tzinfo=ET)
    col = _yf_series([("2026-09-21", 160.89), ("2026-09-22", 162.00)])
    assert _last_completed_close(col, now) == 162.00


def test_yfinance_overnight_keeps_completed_bar():
    # 20:07 ET: today's bar completed at 16:00 and stays the baseline
    now = datetime(2026, 9, 21, 20, 7, tzinfo=ET)
    col = _yf_series([("2026-09-18", 158.55), ("2026-09-21", 160.89)])
    assert _last_completed_close(col, now) == 160.89


def test_yfinance_weekend_keeps_friday_bar():
    now = datetime(2026, 9, 19, 12, 0, tzinfo=ET)  # Saturday
    col = _yf_series([("2026-09-17", 159.22), ("2026-09-18", 158.55)])
    assert _last_completed_close(col, now) == 158.55


def test_yfinance_single_forming_bar_returns_none():
    now = datetime(2026, 9, 22, 10, 0, tzinfo=ET)
    col = _yf_series([("2026-09-22", 161.20)])
    assert _last_completed_close(col, now) is None
    assert _last_completed_close(pd.Series(dtype=float), now) is None


def test_polygon_mid_session_uses_prev_day():
    # 10:00 ET Tuesday: day is the forming bar — prev_day is the baseline
    now = datetime(2026, 9, 22, 10, 0, tzinfo=ET)
    snapshot = MagicMock()
    snapshot.day.close = 165.0
    snapshot.day.timestamp = None
    snapshot.prev_day.close = 160.0
    snapshot.last_trade.price = 164.5
    assert _select_polygon_close(snapshot, now) == 160.0


def test_polygon_post_close_uses_day():
    now = datetime(2026, 9, 22, 17, 15, tzinfo=ET)
    snapshot = MagicMock()
    snapshot.day.close = 165.0
    snapshot.day.timestamp = None
    snapshot.prev_day.close = 160.0
    assert _select_polygon_close(snapshot, now) == 165.0


def test_polygon_bar_dated_before_today_is_completed():
    # Saturday run: day agg is Friday's completed bar (timestamp = session
    # midnight ET = 04:00 UTC during EDT)
    now = datetime(2026, 9, 19, 12, 0, tzinfo=ET)  # Saturday
    friday_04utc_ms = 1_789_704_000_000  # 2026-09-18T04:00:00Z
    snapshot = MagicMock()
    snapshot.day.close = 158.55
    snapshot.day.timestamp = friday_04utc_ms
    snapshot.prev_day.close = 159.22
    assert _select_polygon_close(snapshot, now) == 158.55


@patch("scripts.data.update_fund_data.datetime")
@patch("scripts.data.update_fund_data.yf.download")
@patch("scripts.data.update_fund_data.RESTClient")
@patch("scripts.data.update_fund_data.requests.get")
@patch.dict(
    "os.environ",
    {
        "ALPACA_API_KEY": "test_alpaca_key",
        "ALPACA_API_SECRET": "test_alpaca_secret",
    },
    clear=True,
)
def test_get_prices_overnight_priority(
    mock_requests_get, mock_rest_client, mock_yf_download, mock_datetime
):
    # Mock time to be 11 PM ET (Overnight)
    mock_now = datetime(2026, 3, 10, 23, 0, tzinfo=pytz.timezone("US/Eastern"))
    mock_datetime.now.return_value = mock_now

    # Mock Alpaca success: dailyBar close is preferred over the latest trade
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"AAPL": {"dailyBar": {"c": 154.0}, "latestTrade": {"p": 155.0}}}
    mock_resp.status_code = 200
    mock_requests_get.return_value = mock_resp

    tickers = ["AAPL"]
    prices = get_prices(tickers)

    assert prices == {"AAPL": 154.0}
    # Alpaca SHOULD be called
    assert mock_requests_get.called
    # yfinance SHOULD NOT be called initially
    mock_yf_download.assert_not_called()


@patch("scripts.data.update_fund_data.datetime")
@patch("scripts.data.update_fund_data.yf.download")
@patch("scripts.data.update_fund_data.RESTClient")
@patch("scripts.data.update_fund_data.requests.get")
@patch.dict(
    "os.environ",
    {
        "ALPACA_API_KEY": "test_alpaca_key",
        "ALPACA_API_SECRET": "test_alpaca_secret",
    },
    clear=True,
)
def test_get_prices_overnight_fallback(
    mock_requests_get, mock_rest_client, mock_yf_download, mock_datetime
):
    # Mock time to be 11 PM ET
    mock_now = datetime(2026, 3, 10, 23, 0, tzinfo=pytz.timezone("US/Eastern"))
    mock_datetime.now.return_value = mock_now

    # Mock Alpaca failure
    mock_resp = MagicMock()
    mock_resp.json.return_value = {}
    mock_resp.status_code = 200
    mock_requests_get.return_value = mock_resp

    # Mock yf success
    df = pd.DataFrame({"AAPL": [150.0]}, index=pd.DatetimeIndex(["2023-01-01"]))
    mock_yf_download.return_value = {"Close": df}

    tickers = ["AAPL"]
    prices = get_prices(tickers)

    assert prices == {"AAPL": 150.0}
    # Both should have been called
    assert mock_requests_get.called
    assert mock_yf_download.called


@patch("scripts.data.update_fund_data.datetime")
@patch("scripts.data.update_fund_data.yf.download")
@patch("scripts.data.update_fund_data.RESTClient")
@patch("scripts.data.update_fund_data.requests.get")
def test_get_prices_standard_priority(
    mock_requests_get, mock_rest_client, mock_yf_download, mock_datetime
):
    # Mock time to be 10 AM ET (Regular hours)
    mock_now = datetime(2026, 3, 10, 10, 0, tzinfo=pytz.timezone("US/Eastern"))
    mock_datetime.now.return_value = mock_now

    # Mock yf success
    df = pd.DataFrame({"AAPL": [150.0]}, index=pd.DatetimeIndex(["2023-01-01"]))
    mock_yf_download.return_value = {"Close": df}

    tickers = ["AAPL"]
    prices = get_prices(tickers)

    assert prices == {"AAPL": 150.0}
    # yfinance SHOULD be called, fetching daily bars (official close)
    mock_yf_download.assert_called_with(
        ["AAPL"], period="5d", interval="1d", auto_adjust=False, progress=False
    )
    # Alpaca SHOULD NOT be called
    mock_requests_get.assert_not_called()


@patch("scripts.data.update_fund_data.datetime")
@patch("scripts.data.update_fund_data.yf.download")
@patch("scripts.data.update_fund_data.RESTClient")
@patch("scripts.data.update_fund_data.requests.get")
@patch.dict(
    "os.environ",
    {
        "ALPACA_API_KEY": "test_alpaca_key",
        "ALPACA_API_SECRET": "test_alpaca_secret",
    },
    clear=True,
)
def test_get_prices_standard_fallback(
    mock_requests_get, mock_rest_client, mock_yf_download, mock_datetime
):
    # Mock time to be 10 AM ET
    mock_now = datetime(2026, 3, 10, 10, 0, tzinfo=pytz.timezone("US/Eastern"))
    mock_datetime.now.return_value = mock_now

    # Mock yfinance failure
    mock_yf_download.return_value = {}

    # Mock Alpaca success
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"AAPL": {"latestTrade": {"p": 155.0}}}
    mock_resp.status_code = 200
    mock_requests_get.return_value = mock_resp

    tickers = ["AAPL"]
    prices = get_prices(tickers)

    assert prices == {"AAPL": 155.0}
    # Both should have been called
    assert mock_yf_download.called
    assert mock_requests_get.called


@patch("scripts.data.update_fund_data.datetime")
@patch("scripts.data.update_fund_data.yf.download")
@patch("scripts.data.update_fund_data.RESTClient")
@patch("scripts.data.update_fund_data.requests.get")
@patch.dict(
    "os.environ",
    {
        "POLYGON_KEY": "test_key",
        "ALPACA_API_KEY": "test_alpaca_key",
        "ALPACA_API_SECRET": "test_alpaca_secret",
    },
    clear=True,
)
def test_get_prices_polygon_fallback(
    mock_requests_get, mock_rest_client, mock_yf_download, mock_datetime
):
    # Mock time
    mock_now = datetime(2026, 3, 10, 10, 0, tzinfo=pytz.timezone("US/Eastern"))
    mock_datetime.now.return_value = mock_now
    # Mock yfinance to return empty
    mock_yf_download.return_value = {}

    # Mock Alpaca to return nothing or fail
    def mock_requests_get_side_effect(url, params=None, headers=None, timeout=None):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {}
        mock_resp.status_code = 200
        return mock_resp

    mock_requests_get.side_effect = mock_requests_get_side_effect

    # Mock Polygon to return data: AAPL has a daily aggregate close (preferred),
    # TSLA only a last trade (fallback)
    mock_client_instance = mock_rest_client.return_value.__enter__.return_value
    mock_snapshot1 = MagicMock()
    mock_snapshot1.ticker = "AAPL"
    mock_snapshot1.day.close = 165.0
    mock_snapshot1.last_trade.price = 160.0
    mock_snapshot2 = MagicMock()
    mock_snapshot2.ticker = "TSLA"
    mock_snapshot2.day = None
    mock_snapshot2.last_trade.price = 210.0
    mock_client_instance.get_snapshot_all.return_value = [mock_snapshot1, mock_snapshot2]

    tickers = ["AAPL", "TSLA"]
    prices = get_prices(tickers)

    assert prices == {"AAPL": 165.0, "TSLA": 210.0}
    mock_client_instance.get_snapshot_all.assert_called_once()


@patch("scripts.data.update_fund_data.get_tickers_from_holdings")
@patch("scripts.data.update_fund_data.get_prices")
@patch("scripts.data.update_fund_data.Path.open")
@patch("scripts.data.update_fund_data.Path.mkdir")
@patch("scripts.data.update_fund_data.Path.exists")
def test_main_with_and_without_args(
    mock_exists, mock_mkdir, mock_open, mock_get_prices, mock_get_tickers, tmp_path
):
    from scripts.data.update_fund_data import (
        DEFAULT_HOLDINGS_PATH,
        main,
    )

    mock_get_tickers.return_value = ["AAPL"]
    mock_get_prices.return_value = {"AAPL": 150.0}
    mock_exists.return_value = False

    # Test without args (uses defaults)
    main()
    mock_get_tickers.assert_called_with(DEFAULT_HOLDINGS_PATH)

    # Test with args
    custom_holdings = tmp_path / "custom_holdings.json"
    custom_output = tmp_path / "custom_output.json"
    main(holdings_path=custom_holdings, output_path=custom_output)
    mock_get_tickers.assert_called_with(custom_holdings)
