import json
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from scripts.data.fetch_market_caps import fetch_market_caps, is_fresh, main


def test_is_fresh_no_meta():
    assert is_fresh({}) is False
    assert is_fresh({"_meta": {}}) is False
    assert is_fresh({"_meta": {"updated": "not-a-date"}}) is False


def test_is_fresh_recent():
    today = datetime.now()
    stamp = (today - timedelta(days=3)).strftime("%Y-%m-%d")
    assert is_fresh({"_meta": {"updated": stamp}}, today=today) is True


def test_is_fresh_stale():
    today = datetime.now()
    stamp = (today - timedelta(days=30)).strftime("%Y-%m-%d")
    assert is_fresh({"_meta": {"updated": stamp}}, today=today) is False


@patch("scripts.data.fetch_market_caps.yf.Ticker")
def test_fetch_market_caps(mock_ticker_cls):
    def make_ticker(symbol):
        t = MagicMock()
        t.info = {"marketCap": 100_000_000_000 if symbol == "AAPL" else None}
        return t

    mock_ticker_cls.side_effect = make_ticker

    result = fetch_market_caps(["AAPL", "BROKEN"])

    assert result == {"AAPL": 100_000_000_000}


@patch("scripts.data.fetch_market_caps.yf.Ticker")
def test_fetch_market_caps_exception(mock_ticker_cls):
    mock_ticker_cls.side_effect = Exception("network down")

    assert fetch_market_caps(["AAPL"]) == {}


@patch("scripts.data.fetch_market_caps.fetch_market_caps")
@patch("scripts.data.fetch_market_caps.load_delisted_tickers")
@patch("scripts.data.fetch_market_caps.load_current_tickers")
def test_main_skips_when_fresh(mock_tickers, mock_delisted, mock_fetch, tmp_path):
    mock_tickers.return_value = ["AAPL"]
    mock_delisted.return_value = frozenset()
    out = tmp_path / "market_caps.json"
    out.write_text(
        json.dumps({"AAPL": 1, "_meta": {"updated": datetime.now().strftime("%Y-%m-%d")}})
    )
    with patch("scripts.data.fetch_market_caps.MARKET_CAPS_FILE", out):
        assert main() == 0
    mock_fetch.assert_not_called()


@patch("scripts.data.fetch_market_caps.fetch_market_caps")
@patch("scripts.data.fetch_market_caps.load_delisted_tickers")
@patch("scripts.data.fetch_market_caps.load_current_tickers")
def test_main_updates_stale(mock_tickers, mock_delisted, mock_fetch, tmp_path):
    mock_tickers.return_value = ["AAPL", "OLD"]
    mock_delisted.return_value = frozenset()
    mock_fetch.return_value = {"AAPL": 200_000_000_000}
    out = tmp_path / "market_caps.json"
    out.write_text(json.dumps({"AAPL": 1, "OLD": 5}))
    with patch("scripts.data.fetch_market_caps.MARKET_CAPS_FILE", out):
        assert main() == 0

    written = json.loads(out.read_text())
    assert written["AAPL"] == 200_000_000_000
    assert written["OLD"] == 5  # untouched tickers keep their values
    assert "_meta" in written


@patch("scripts.data.fetch_market_caps.fetch_market_caps")
@patch("scripts.data.fetch_market_caps.load_delisted_tickers")
@patch("scripts.data.fetch_market_caps.load_current_tickers")
def test_main_fail_open_on_total_fetch_failure(mock_tickers, mock_delisted, mock_fetch, tmp_path):
    mock_tickers.return_value = ["AAPL"]
    mock_delisted.return_value = frozenset()
    mock_fetch.return_value = {}
    out = tmp_path / "market_caps.json"
    out.write_text(json.dumps({"AAPL": 1}))
    with patch("scripts.data.fetch_market_caps.MARKET_CAPS_FILE", out):
        assert main() == 0

    assert json.loads(out.read_text()) == {"AAPL": 1}
