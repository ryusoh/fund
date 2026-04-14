from pathlib import Path
from unittest.mock import MagicMock, mock_open, patch

import scripts.fetch_etf_country_allocations as fec


@patch('os.environ.get')
@patch('requests.get')
def test_fetch_etf_country_allocation_success_api_key(mock_get, mock_environ_get):
    mock_environ_get.return_value = 'test_key'
    mock_response = MagicMock()
    mock_response.text = (
        '{code:"US",weight:60.5,country:"United States"} {code:"JP",weight:10.2,country:"Japan"}'
    )
    mock_get.return_value = mock_response

    result = fec.fetch_etf_country_allocation('VT')

    assert result == {"United States": 60.5, "Japan": 10.2}
    args, kwargs = mock_get.call_args
    assert 'api.scraperapi.com' in args[0]
    assert 'api_key=test_key' in args[0]


@patch('os.environ.get')
@patch('requests.get')
def test_fetch_etf_country_allocation_success_no_api_key(mock_get, mock_environ_get):
    mock_environ_get.return_value = None
    mock_response = MagicMock()
    mock_response.text = (
        '{code:"US",weight:60.5,country:"United States"} {code:"JP",weight:bad,country:"Japan"}'
    )
    mock_get.return_value = mock_response

    result = fec.fetch_etf_country_allocation('VT')

    assert result == {"United States": 60.5}
    args, kwargs = mock_get.call_args
    assert 'stockanalysis.com' in args[0]


@patch('os.environ.get')
@patch('requests.get')
def test_fetch_etf_country_allocation_fallback_pattern(mock_get, mock_environ_get):
    mock_environ_get.return_value = None
    mock_response = MagicMock()
    mock_response.text = (
        "countries: [{name: 'United States', y: 60.5}, {name: 'Japan', value: 10.2}]"
    )
    mock_get.return_value = mock_response

    result = fec.fetch_etf_country_allocation('VT')

    assert result == {"United States": 60.5, "Japan": 10.2}


@patch('os.environ.get')
@patch('requests.get')
def test_fetch_etf_country_allocation_fallback_pattern_invalid_json(mock_get, mock_environ_get):
    mock_environ_get.return_value = None
    mock_response = MagicMock()
    mock_response.text = "countries: [{name: 'United States', y: bad}]"
    mock_get.return_value = mock_response

    result = fec.fetch_etf_country_allocation('VT')

    assert result == {}


@patch('os.environ.get')
@patch('requests.get')
def test_fetch_etf_country_allocation_no_matches(mock_get, mock_environ_get):
    mock_environ_get.return_value = None
    mock_response = MagicMock()
    mock_response.text = "random text"
    mock_get.return_value = mock_response

    result = fec.fetch_etf_country_allocation('VT')

    assert result == {}


@patch('os.environ.get')
@patch('requests.get')
def test_fetch_etf_country_allocation_exception(mock_get, mock_environ_get):
    mock_environ_get.return_value = 'test_key'
    mock_get.side_effect = Exception("Network error")

    result = fec.fetch_etf_country_allocation('VT')

    assert result == {}


def test_normalize_country_name():
    assert fec.normalize_country_name("United States") == "United States"
    assert fec.normalize_country_name("Other Country") == "Other Country"
    assert fec.normalize_country_name("") == "Other"


@patch('scripts.fetch_etf_country_allocations.fetch_etf_country_allocation')
def test_main(mock_fetch):
    mock_fetch.return_value = {"United States": 60.5, "USA": 10.2}

    with patch('builtins.open', new_callable=mock_open, read_data='{"VT": {}}') as mock_file:
        with patch('pathlib.Path.exists', return_value=True):
            fec.main()
            mock_file.assert_called_with(Path('data/fund_country_allocations.json'), 'w')


@patch('scripts.fetch_etf_country_allocations.fetch_etf_country_allocation')
def test_main_no_data(mock_fetch):
    mock_fetch.return_value = {}

    with patch('builtins.open', new_callable=mock_open, read_data='{"VT": {}}') as mock_file:
        with patch('pathlib.Path.exists', return_value=False):
            fec.main()
            mock_file.assert_called_with(Path('data/fund_country_allocations.json'), 'w')


def test_main_block_actual():
    with patch('sys.argv', ['fetch_etf_country_allocations.py']):
        with open('scripts/fetch_etf_country_allocations.py') as f:
            code = f.read()
        import re

        code = re.sub(
            r"if __name__ == '__main__':\s+main\(\)", "if __name__ == '__main__': pass", code
        )
        exec(code, {'__name__': '__main__', '__file__': 'scripts/fetch_etf_country_allocations.py'})
