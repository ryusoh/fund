import os
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from scripts.data.update_fund_data import get_prices, get_tickers_from_holdings


@pytest.fixture
def mock_holdings_file(tmp_path):
    import json

    file_path = tmp_path / "holdings_details.json"
    data = {"AAPL": {}, "TSLA": {}}
    file_path.write_text(json.dumps(data))
    return file_path


@patch("scripts.data.update_fund_data.yf.set_tz_cache_location")
def test_set_tz_cache_location(mock_set_tz):
    # This basically asserts the module-level execution didn't crash
    # and we can potentially reload the module to track the exact call if needed,
    # but since it runs on import, we just check that importing the module doesn't
    # raise any exceptions due to our logic depending on os.getuid().
    import importlib

    import scripts.data.update_fund_data as module

    # Reloading to trigger the top-level script code
    importlib.reload(module)

    # If getuid exists
    if hasattr(os, "getuid"):
        expected_path = f"/tmp/yf-cache-{os.getuid()}"
    else:
        expected_path = "/tmp/yf-cache"

    mock_set_tz.assert_called_with(expected_path)


def test_get_tickers_from_holdings(mock_holdings_file):
    tickers = get_tickers_from_holdings(mock_holdings_file)
    assert set(tickers) == {"AAPL", "TSLA"}


@patch("scripts.data.update_fund_data.yf.download")
@patch("scripts.data.update_fund_data.RESTClient")
@patch("scripts.data.update_fund_data.requests.get")
def test_get_prices_yfinance_success(mock_requests_get, mock_rest_client, mock_yf_download):
    # Mock yfinance to return valid data
    df = pd.DataFrame(
        {"AAPL": [150.0], "TSLA": [200.0]},
        index=pd.DatetimeIndex(["2023-01-01"]),
    )
    mock_yf_download.return_value = {"Close": df}

    tickers = ["AAPL", "TSLA"]
    prices = get_prices(tickers)

    assert prices == {"AAPL": 150.0, "TSLA": 200.0}
    # Pyth and Polygon APIs should not be called
    mock_requests_get.assert_not_called()
    mock_rest_client.assert_not_called()


@patch("scripts.data.update_fund_data.yf.download")
@patch("scripts.data.update_fund_data.RESTClient")
@patch("scripts.data.update_fund_data.requests.get")
@patch.dict("os.environ", {"POLYGON_KEY": "test_key"}, clear=True)
def test_get_prices_pyth_success(mock_requests_get, mock_rest_client, mock_yf_download):
    # Mock yfinance to return empty or fail
    mock_yf_download.return_value = {}

    # Mock Pyth Hermes queries
    # First query for AAPL: returns .ON feed ID
    # Second query for AAPL updates
    def mock_requests_get_side_effect(url, params=None):
        mock_resp = MagicMock()
        if "/price_feeds" in url:
            symbol = params.get("query")
            if symbol == "AAPL":
                mock_resp.json.return_value = [
                    {
                        "id": "aapl_on_id",
                        "attributes": {"symbol": "Equity.US.AAPL/USD.ON"},
                    }
                ]
            elif symbol == "TSLA":
                mock_resp.json.return_value = [
                    {
                        "id": "tsla_on_id",
                        "attributes": {"symbol": "Equity.US.TSLA/USD.ON"},
                    }
                ]
            else:
                mock_resp.json.return_value = []
            mock_resp.status_code = 200
        elif "/updates/price/latest" in url:
            if isinstance(params, list):
                ids = [v for k, v in params if k == "ids[]"]
            else:
                ids = params.get("ids[]", [])
            # For simplicity in mock, let's just return both if requested
            parsed = []
            if "aapl_on_id" in ids or ids == "aapl_on_id":
                parsed.append(
                    {"id": "aapl_on_id", "price": {"price": "15500", "expo": -2}}
                )  # 155.00
            if "tsla_on_id" in ids or ids == "tsla_on_id":
                parsed.append({"id": "tsla_on_id", "price": {"price": "2050", "expo": -1}})  # 205.0
            mock_resp.json.return_value = {"parsed": parsed}
            mock_resp.status_code = 200

        return mock_resp

    mock_requests_get.side_effect = mock_requests_get_side_effect

    tickers = ["AAPL", "TSLA"]
    prices = get_prices(tickers)

    assert prices == {"AAPL": 155.0, "TSLA": 205.0}
    # Polygon API should not be called
    mock_rest_client.assert_not_called()


@patch("scripts.data.update_fund_data.yf.download")
@patch("scripts.data.update_fund_data.RESTClient")
@patch("scripts.data.update_fund_data.requests.get")
@patch.dict("os.environ", {"POLYGON_KEY": "test_key"}, clear=True)
def test_get_prices_polygon_fallback(mock_requests_get, mock_rest_client, mock_yf_download):
    # Mock yfinance to return empty
    mock_yf_download.return_value = {}

    # Mock Pyth to return nothing
    def mock_requests_get_side_effect(url, params=None):
        mock_resp = MagicMock()
        if "/price_feeds" in url:
            mock_resp.json.return_value = []
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
