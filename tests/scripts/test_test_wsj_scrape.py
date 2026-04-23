import runpy
from unittest.mock import MagicMock, patch

import scripts.test_wsj_scrape as tws


@patch('requests.get')
def test_scrape_wsj_forward_pe_success(mock_get):
    mock_response = MagicMock()
    mock_response.text = 'P 500 Index some other text "priceEarningsRatioEstimate": "18.5"'
    mock_get.return_value = mock_response

    result = tws.scrape_wsj_forward_pe()

    assert result == 18.5


@patch('requests.get')
def test_scrape_wsj_forward_pe_failure(mock_get):
    mock_response = MagicMock()
    mock_response.text = 'P 500 Index without the actual data'
    mock_get.return_value = mock_response

    result = tws.scrape_wsj_forward_pe()

    assert result is None


@patch('requests.get')
def test_scrape_wsj_forward_pe_exception(mock_get):
    mock_get.side_effect = Exception("Network error")

    result = tws.scrape_wsj_forward_pe()

    assert result is None


@patch('requests.get')
def test_scrape_wsj_forward_pe_long_match(mock_get):
    mock_response = MagicMock()
    mock_response.text = (
        'P 500 Index ' + 'a' * 1500 + ' P 500 Index ' + ' "priceEarningsRatioEstimate": "18.5"'
    )
    mock_get.return_value = mock_response

    result = tws.scrape_wsj_forward_pe()

    assert result == 18.5


@patch('scripts.test_wsj_scrape.scrape_wsj_forward_pe')
@patch('builtins.print')
def test_main_block_success(mock_print, mock_scrape):
    mock_scrape.return_value = 18.5
    runpy.run_path('scripts/test_wsj_scrape.py', run_name='__main__')


@patch('scripts.test_wsj_scrape.scrape_wsj_forward_pe')
@patch('builtins.print')
def test_main_block_failure(mock_print, mock_scrape):
    mock_scrape.return_value = None
    runpy.run_path('scripts/test_wsj_scrape.py', run_name='__main__')
