import os
from datetime import datetime
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest
import pytz

from scripts.data.update_fund_data import get_prices, get_tickers_from_holdings


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

    # Mock Alpaca success
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"AAPL": {"latestTrade": {"p": 155.0}}}
    mock_resp.status_code = 200
    mock_requests_get.return_value = mock_resp

    tickers = ["AAPL"]
    prices = get_prices(tickers)

    assert prices == {"AAPL": 155.0}
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
    # yfinance SHOULD be called
    assert mock_yf_download.called
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
    def mock_requests_get_side_effect(url, params=None, headers=None):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {}
        mock_resp.status_code = 200
        return mock_resp

    mock_requests_get.side_effect = mock_requests_get_side_effect

    # Mock Polygon to return data
    mock_client_instance = mock_rest_client.return_value.__enter__.return_value
    mock_snapshot1 = MagicMock()
    mock_snapshot1.ticker = "AAPL"
    mock_snapshot1.last_trade.price = 160.0
    mock_snapshot2 = MagicMock()
    mock_snapshot2.ticker = "TSLA"
    mock_snapshot2.last_trade.price = 210.0
    mock_client_instance.get_snapshot_all.return_value = [mock_snapshot1, mock_snapshot2]

    tickers = ["AAPL", "TSLA"]
    prices = get_prices(tickers)

    assert prices == {"AAPL": 160.0, "TSLA": 210.0}
    mock_client_instance.get_snapshot_all.assert_called_once()
