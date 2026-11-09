import json
from decimal import Decimal

from scripts.portfolio.manage_holdings import (
    _convert_list_format,
    _process_dict_format,
    load_holdings,
)


def test_convert_list_format_skips_incomplete_and_saves(tmp_path):
    path = tmp_path / "h.json"
    data = [
        {"ticker": "aapl", "shares": 2, "cost": "1.5"},
        {"ticker": "x", "shares": None, "cost": 1},
        {"shares": 1, "cost": 1},
    ]
    result = _convert_list_format(data, path)
    assert result == {"AAPL": {"shares": Decimal("2"), "average_price": Decimal("1.5")}}
    assert path.exists()


def test_process_dict_format_converts_to_decimal():
    data = {"A": {"shares": 3, "average_price": "2.5"}, "B": {}}
    result = _process_dict_format(data)
    assert result["A"] == {"shares": Decimal("3"), "average_price": Decimal("2.5")}
    assert result["B"] == {}


def test_load_holdings_dispatches_list_and_dict(tmp_path):
    lst = tmp_path / "l.json"
    lst.write_text(json.dumps([{"ticker": "a", "shares": 1, "cost": 2}]))
    assert load_holdings(lst)["A"]["shares"] == Decimal("1")
    dct = tmp_path / "d.json"
    dct.write_text(json.dumps({"A": {"shares": 1, "average_price": 2}}))
    assert load_holdings(dct)["A"]["average_price"] == Decimal("2")
