import runpy
from unittest.mock import MagicMock, patch

import scripts.test_msci_scrape as tms


@patch('requests.get')
def test_scrape_msci_pe_data_success(mock_get):
    mock_response = MagicMock()
    mock_response.text = '<td>P/E Fwd</td><td>15.5</td><td>P/E</td><td>16.5</td>'
    mock_get.return_value = mock_response

    result = tms.scrape_msci_pe_data()

    assert result['forward_pe'] == 15.5
    assert result['trailing_pe'] == 16.5
    assert result['ratio'] == round(16.5 / 15.5, 4)


@patch('requests.get')
def test_scrape_msci_pe_data_failure(mock_get):
    mock_response = MagicMock()
    mock_response.text = 'some content without pe data'
    mock_get.return_value = mock_response

    result = tms.scrape_msci_pe_data()

    assert result is None


@patch('requests.get')
def test_scrape_msci_pe_data_no_fwd(mock_get):
    mock_response = MagicMock()
    mock_response.text = '<td>P/E</td><td>16.5</td>'
    mock_get.return_value = mock_response

    result = tms.scrape_msci_pe_data()

    assert 'forward_pe' not in result
    assert result['trailing_pe'] == 16.5
    assert 'ratio' not in result


@patch('scripts.test_msci_scrape.scrape_msci_pe_data')
@patch('builtins.print')
def test_main_block_success(mock_print, mock_scrape):
    mock_scrape.return_value = {"forward_pe": 15.5}
    runpy.run_path('scripts/test_msci_scrape.py', run_name='__main__')


@patch('scripts.test_msci_scrape.scrape_msci_pe_data')
@patch('builtins.print')
def test_main_block_failure(mock_print, mock_scrape):
    mock_scrape.return_value = None
    runpy.run_path('scripts/test_msci_scrape.py', run_name='__main__')
