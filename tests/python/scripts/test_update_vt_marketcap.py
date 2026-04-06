import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from scripts.update_vt_marketcap import main, update_vt_marketcap, load_fund_breakdowns, save_fund_breakdowns, VT_MARKETCAP_BREAKDOWN

def test_load_fund_breakdowns_exists():
    with patch("scripts.update_vt_marketcap.Path.exists", return_value=True):
        with patch("scripts.update_vt_marketcap.open", create=True) as mock_open:
            mock_open.return_value.__enter__.return_value.read.return_value = '{"TEST": {}}'
            with patch("scripts.update_vt_marketcap.json.load", return_value={"TEST": {}}):
                data = load_fund_breakdowns()
                assert data == {"TEST": {}}

def test_load_fund_breakdowns_not_exists():
    with patch("scripts.update_vt_marketcap.Path.exists", return_value=False):
        data = load_fund_breakdowns()
        assert data == {}

def test_save_fund_breakdowns():
    with patch("scripts.update_vt_marketcap.open", create=True) as mock_open:
        with patch("scripts.update_vt_marketcap.json.dump") as mock_json_dump:
            save_fund_breakdowns({"TEST": {}})
            mock_json_dump.assert_called_once()

def test_update_vt_marketcap():
    with patch("scripts.update_vt_marketcap.load_fund_breakdowns", return_value={}):
        with patch("scripts.update_vt_marketcap.save_fund_breakdowns") as mock_save:
            res = update_vt_marketcap()
            assert res is True
            mock_save.assert_called_once_with({"VT": VT_MARKETCAP_BREAKDOWN})

def test_main_success():
    with patch("scripts.update_vt_marketcap.update_vt_marketcap", return_value=True):
        with patch("sys.exit") as mock_exit:
            main()
            mock_exit.assert_called_once_with(0)

def test_main_failure():
    with patch("scripts.update_vt_marketcap.update_vt_marketcap", return_value=False):
        with patch("sys.exit") as mock_exit:
            main()
            mock_exit.assert_called_once_with(1)

def test_main_exception():
    with patch("scripts.update_vt_marketcap.update_vt_marketcap", side_effect=Exception("Test Error")):
        with patch("sys.exit") as mock_exit:
            main()
            mock_exit.assert_called_once_with(0)
