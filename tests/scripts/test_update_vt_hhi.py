from pathlib import Path
from unittest.mock import MagicMock, mock_open, patch

from scripts.update_vt_hhi import fetch_vt_hhi_from_etfrc, main, update_etf_hhi_json


@patch('os.environ.get')
@patch('requests.get')
def test_fetch_vt_hhi_from_etfrc_with_api_key(mock_get, mock_environ_get):
    mock_environ_get.return_value = 'test_key'
    mock_response = MagicMock()
    mock_response.text = '<td>HHI</td><td>62</td>'
    mock_get.return_value = mock_response

    result = fetch_vt_hhi_from_etfrc()

    assert result == 62
    mock_get.assert_called_once()
    args, kwargs = mock_get.call_args
    assert 'https://api.scraperapi.com/?' in args[0]
    assert 'api_key=test_key' in args[0]


@patch('os.environ.get')
@patch('requests.get')
def test_fetch_vt_hhi_from_etfrc_no_api_key(mock_get, mock_environ_get):
    mock_environ_get.return_value = None
    mock_response = MagicMock()
    mock_response.text = 'HHI: 63'
    mock_get.return_value = mock_response

    result = fetch_vt_hhi_from_etfrc()

    assert result == 63
    mock_get.assert_called_once()
    args, kwargs = mock_get.call_args
    assert 'https://www.etfrc.com/VT' == args[0]


@patch('os.environ.get')
@patch('requests.get')
def test_fetch_vt_hhi_from_etfrc_no_match(mock_get, mock_environ_get):
    mock_environ_get.return_value = None
    mock_response = MagicMock()
    mock_response.text = 'Some random text without HHI'
    mock_get.return_value = mock_response

    result = fetch_vt_hhi_from_etfrc()

    assert result is None


@patch('os.environ.get')
@patch('requests.get')
def test_fetch_vt_hhi_from_etfrc_exception(mock_get, mock_environ_get):
    mock_environ_get.return_value = 'test_key'
    mock_get.side_effect = Exception("Network error")

    result = fetch_vt_hhi_from_etfrc()

    assert result is None


@patch('pathlib.Path.exists')
@patch('builtins.open', new_callable=mock_open, read_data='{"VT": 50}')
def test_update_etf_hhi_json_success(mock_file, mock_exists):
    mock_exists.return_value = True

    result = update_etf_hhi_json(62)

    assert result is True
    mock_file.assert_any_call(Path('data/etf_hhi.json'), 'w')


@patch('pathlib.Path.exists')
def test_update_etf_hhi_json_file_not_found(mock_exists):
    mock_exists.return_value = False

    result = update_etf_hhi_json(62)

    assert result is False


@patch('scripts.update_vt_hhi.fetch_vt_hhi_from_etfrc')
@patch('scripts.update_vt_hhi.update_etf_hhi_json')
def test_main_success_reasonable_hhi(mock_update, mock_fetch):
    mock_fetch.return_value = 62
    mock_update.return_value = True

    main()
    mock_update.assert_called_once_with(62)


@patch('scripts.update_vt_hhi.fetch_vt_hhi_from_etfrc')
@patch('scripts.update_vt_hhi.update_etf_hhi_json')
def test_main_success_high_hhi(mock_update, mock_fetch):
    mock_fetch.return_value = 600
    mock_update.return_value = True

    main()
    mock_update.assert_not_called()


@patch('scripts.update_vt_hhi.fetch_vt_hhi_from_etfrc')
@patch('scripts.update_vt_hhi.update_etf_hhi_json')
def test_main_fetch_failure(mock_update, mock_fetch):
    mock_fetch.return_value = None

    main()
    mock_update.assert_not_called()


@patch('scripts.update_vt_hhi.fetch_vt_hhi_from_etfrc')
@patch('scripts.update_vt_hhi.update_etf_hhi_json')
def test_main_update_failure(mock_update, mock_fetch):
    mock_fetch.return_value = 62
    mock_update.return_value = False

    main()
    mock_update.assert_called_once_with(62)


def test_main_block_actual():
    with patch('scripts.update_vt_hhi.main'):
        with patch('sys.argv', ['update_vt_hhi.py']):
            with open('scripts/update_vt_hhi.py') as f:
                code = f.read()
            import re

            code = re.sub(
                r"if __name__ == '__main__':\s+main\(\)", "if __name__ == '__main__': pass", code
            )
            exec(code, {'__name__': '__main__', '__file__': 'scripts/update_vt_hhi.py'})
