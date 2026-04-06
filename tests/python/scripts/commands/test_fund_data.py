import argparse
from unittest.mock import MagicMock, patch

from scripts.commands.fund_data import _run, add_parser


def test_run():
    args = argparse.Namespace()
    with patch("scripts.data.update_fund_data.main") as mock_main:
        _run(args)
        mock_main.assert_called_once()

def test_add_parser():
    subparsers = MagicMock()
    mock_parser = MagicMock()
    subparsers.add_parser.return_value = mock_parser

    add_parser(subparsers)

    subparsers.add_parser.assert_called_once_with("fund-data", help="Fetch fund data")
    mock_parser.set_defaults.assert_called_once_with(func=_run)
