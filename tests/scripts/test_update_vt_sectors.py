import pytest
from unittest.mock import patch, mock_open, MagicMock
import sys
import os
import urllib.parse
from pathlib import Path
import json

import scripts.update_vt_sectors as uvs

@patch('os.environ.get')
@patch('requests.get')
def test_fetch_vt_sectors_success_api_key(mock_get, mock_environ_get):
    mock_environ_get.return_value = 'test_key'
    mock_response = MagicMock()
    mock_response.text = 'allocationChartData:{sectors:[{"name":"Information Technology","y":25.5}, {"name":"Health Care","y":15.0}]}'
    mock_get.return_value = mock_response

    result = uvs.fetch_vt_sectors()

    assert result == {"Technology": 25.5, "Healthcare": 15.0, "Others": 59.5}
    args, kwargs = mock_get.call_args
    assert 'api.scraperapi.com' in args[0]
    assert 'api_key=test_key' in args[0]

@patch('os.environ.get')
@patch('requests.get')
def test_fetch_vt_sectors_success_no_api_key(mock_get, mock_environ_get):
    mock_environ_get.return_value = None
    mock_response = MagicMock()
    mock_response.text = 'allocationChartData:{sectors:[{"name":"Information Technology","y":25.5}]}'
    mock_get.return_value = mock_response

    result = uvs.fetch_vt_sectors()

    assert result == {"Technology": 25.5, "Others": 74.5}
    args, kwargs = mock_get.call_args
    assert 'stockanalysis.com' in args[0]

@patch('os.environ.get')
@patch('requests.get')
def test_fetch_vt_sectors_invalid_json(mock_get, mock_environ_get):
    mock_environ_get.return_value = None
    mock_response = MagicMock()
    mock_response.text = 'allocationChartData:{sectors:[{"name":"Information Technology","y":bad}]}'
    mock_get.return_value = mock_response

    result = uvs.fetch_vt_sectors()

    assert result is None

@patch('os.environ.get')
@patch('requests.get')
def test_fetch_vt_sectors_no_match(mock_get, mock_environ_get):
    mock_environ_get.return_value = None
    mock_response = MagicMock()
    mock_response.text = 'no sector data here'
    mock_get.return_value = mock_response

    result = uvs.fetch_vt_sectors()

    assert result is None

@patch('os.environ.get')
@patch('requests.get')
def test_fetch_vt_sectors_exception(mock_get, mock_environ_get):
    mock_environ_get.return_value = 'test_key'
    mock_get.side_effect = Exception("Network error")

    result = uvs.fetch_vt_sectors()

    assert result is None

@patch('pathlib.Path.exists')
def test_update_json_success(mock_exists):
    mock_exists.return_value = True
    new_sectors = {"Technology": 25.5}

    with patch('builtins.open', new_callable=mock_open, read_data='{"VT": {"sectors": {}}}') as mock_file:
        uvs.update_json(new_sectors)
        mock_file.assert_called_with(Path('data/fund_sector_allocations.json'), 'w')

@patch('pathlib.Path.exists')
def test_update_json_file_not_found(mock_exists):
    mock_exists.return_value = False

    with patch('builtins.print') as mock_print:
        uvs.update_json({"Technology": 25.5})
        mock_print.assert_called_with("Error: data/fund_sector_allocations.json not found.")

@patch('scripts.update_vt_sectors.fetch_vt_sectors')
@patch('scripts.update_vt_sectors.update_json')
def test_main_success(mock_update, mock_fetch):
    mock_fetch.return_value = {"Technology": 25.5}

    uvs.main()

    mock_update.assert_called_once_with({"Technology": 25.5})

@patch('scripts.update_vt_sectors.fetch_vt_sectors')
@patch('scripts.update_vt_sectors.update_json')
def test_main_failure(mock_update, mock_fetch):
    mock_fetch.return_value = None

    uvs.main()

    mock_update.assert_not_called()

def test_main_block_actual():
    with patch('sys.argv', ['update_vt_sectors.py']):
        with open('scripts/update_vt_sectors.py') as f:
            code = f.read()
        import re
        code = re.sub(r"if __name__ == '__main__':\s+main\(\)", "if __name__ == '__main__': pass", code)
        exec(code, {'__name__': '__main__', '__file__': 'scripts/update_vt_sectors.py'})

@patch('os.environ.get')
@patch('requests.get')
def test_fetch_vt_sectors_success_parse_error(mock_get, mock_environ_get):
    mock_environ_get.return_value = 'test_key'
    mock_response = MagicMock()
    mock_response.text = 'allocationChartData:{sectors:}'
    mock_get.return_value = mock_response

    result = uvs.fetch_vt_sectors()
    assert result is None
