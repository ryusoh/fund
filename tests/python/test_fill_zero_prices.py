import datetime as dt
from unittest.mock import patch

from scripts.fill_zero_prices import (
    _is_valid_zero_price,
    _parse_trade_date,
    _process_zero_price_row,
    _recalculate_net_amount,
    update_transactions,
)


def test_parse_trade_date_success():
    assert _parse_trade_date("01/02/2023", "AAPL") == dt.date(2023, 1, 2)


def test_parse_trade_date_failure(capsys):
    assert _parse_trade_date("invalid", "AAPL") is None


def test_recalculate_net_amount():
    row = {"Order Type": "Buy"}
    _recalculate_net_amount(row, "10", 15.5, "AAPL")
    assert row["Net Amount"] == "155.0000"

    row = {"Order Type": "Sell"}
    _recalculate_net_amount(row, "10", 15.5, "AAPL")
    assert row["Net Amount"] == "-155.0000"


def test_recalculate_net_amount_error():
    row = {}
    _recalculate_net_amount(row, "invalid", 15.5, "AAPL")
    assert "Net Amount" not in row


def test_is_valid_zero_price():
    assert _is_valid_zero_price({"Price": "0"}) is True
    assert _is_valid_zero_price({"Price": "-1"}) is True
    assert _is_valid_zero_price({"Price": "15"}) is False
    assert _is_valid_zero_price({"Price": "invalid"}) is False
    assert _is_valid_zero_price({}) is False


@patch("scripts.fill_zero_prices.fetch_close_price")
@patch("scripts.fill_zero_prices.compute_split_adjustment")
def test_process_zero_price_row_valid(mock_adj, mock_fetch):
    mock_fetch.return_value = 150.0
    mock_adj.return_value = 1.0
    row = {
        "Security": "AAPL",
        "Trade Date": "01/02/2023",
        "Price": "0",
        "Quantity": "10",
        "Order Type": "Buy",
    }
    splits = {}
    new_row, mod = _process_zero_price_row(row, splits, reset_zero_net=True)
    assert new_row["Executed Price"] == "150.0000"
    assert new_row["Net Amount"] == "1500.0000"
    assert mod is not None
    assert mod["Security"] == "AAPL"


@patch("scripts.fill_zero_prices.fetch_close_price")
def test_process_zero_price_row_fetch_fails(mock_fetch):
    mock_fetch.return_value = None
    row = {"Security": "AAPL", "Trade Date": "01/02/2023", "Price": "0"}
    new_row, mod = _process_zero_price_row(row, {}, False)
    assert new_row == row
    assert mod is None


def test_process_zero_price_row_invalid_date():
    row = {"Security": "AAPL", "Trade Date": "invalid", "Price": "0"}
    new_row, mod = _process_zero_price_row(row, {}, False)
    assert new_row == row
    assert mod is None


def test_process_zero_price_row_not_zero():
    row = {"Security": "AAPL", "Trade Date": "01/02/2023", "Price": "150"}
    new_row, mod = _process_zero_price_row(row, {}, False)
    assert new_row == row
    assert mod is None


@patch("scripts.fill_zero_prices._process_zero_price_row")
def test_update_transactions(mock_process):
    mock_process.return_value = ({"Price": "150.0000"}, {"Security": "AAPL"})
    rows = [{"Price": "0"}]
    updated, mods = update_transactions(rows, {}, False)
    assert len(updated) == 1
    assert len(mods) == 1


@patch("scripts.fill_zero_prices._process_zero_price_row")
def test_update_transactions_no_mod(mock_process):
    mock_process.return_value = ({"Price": "150"}, None)
    rows = [{"Price": "150"}]
    updated, mods = update_transactions(rows, {}, False)
    assert len(updated) == 1
    assert len(mods) == 0
