import argparse
from unittest.mock import MagicMock, patch

from scripts.commands.forex import _run, add_parser


def test_run():
    args = argparse.Namespace()
    with patch("scripts.data.fetch_forex.fetch_forex_data") as mock_fetch:
        with patch("builtins.print") as mock_print:
            _run(args)
            mock_fetch.assert_called_once()
            mock_print.assert_called_once_with("Forex data updated successfully")

def test_add_parser():
    subparsers = MagicMock()
    mock_parser = MagicMock()
    subparsers.add_parser.return_value = mock_parser

    add_parser(subparsers)

    subparsers.add_parser.assert_called_once_with("forex", help="Update forex exchange rates")
    mock_parser.set_defaults.assert_called_once_with(func=_run)
