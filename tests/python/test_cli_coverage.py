import sys
from unittest.mock import MagicMock, patch

import pytest

from scripts.cli import _load_command_modules, main


def test_load_command_modules_import_error():
    """Test that modules raising an exception during import are gracefully skipped."""
    with patch("pkgutil.iter_modules") as mock_iter:
        mock_mod = MagicMock()
        mock_mod.name = "scripts.commands.broken_module"
        mock_iter.return_value = [mock_mod]

        with patch("importlib.import_module", side_effect=Exception("Import failed")):
            names = _load_command_modules()
            assert names == []


def test_main_no_command(capsys):
    """Test main exits with 1 and prints help if no command is provided."""
    with patch.object(sys, "argv", ["fund"]):
        with pytest.raises(SystemExit) as exc_info:
            main()
        assert exc_info.value.code == 1

        captured = capsys.readouterr()
        assert "usage: fund" in captured.out


def test_main_executes_command():
    """Test main executes the specified command."""
    with patch("scripts.cli.create_parser") as mock_create_parser:
        mock_parser = MagicMock()
        mock_create_parser.return_value = mock_parser

        mock_args = MagicMock()
        mock_args.command = "test-cmd"
        mock_parser.parse_args.return_value = mock_args

        main()
        mock_args.func.assert_called_once_with(mock_args)


def test_main_keyboard_interrupt(capsys):
    """Test main handles KeyboardInterrupt gracefully."""
    with patch("scripts.cli.create_parser") as mock_create_parser:
        mock_parser = MagicMock()
        mock_create_parser.return_value = mock_parser

        mock_args = MagicMock()
        mock_args.command = "test-cmd"
        mock_args.func.side_effect = KeyboardInterrupt()
        mock_parser.parse_args.return_value = mock_args

        with pytest.raises(SystemExit) as exc_info:
            main()
        assert exc_info.value.code == 1

        captured = capsys.readouterr()
        assert "\nOperation cancelled by user\n" in captured.out


def test_main_unexpected_error(capsys):
    """Test main handles generic Exceptions gracefully."""
    with patch("scripts.cli.create_parser") as mock_create_parser:
        mock_parser = MagicMock()
        mock_create_parser.return_value = mock_parser

        mock_args = MagicMock()
        mock_args.command = "test-cmd"
        mock_args.func.side_effect = Exception("Some weird error")
        mock_parser.parse_args.return_value = mock_args

        with pytest.raises(SystemExit) as exc_info:
            main()
        assert exc_info.value.code == 1

        captured = capsys.readouterr()
        assert "Unexpected error: Some weird error\n" in captured.out


def test_cli_main_block():
    """Test the __main__ block execution using runpy."""
    import runpy

    with patch("sys.argv", ["fund"]):
        with patch("sys.exit") as mock_exit:
            runpy.run_module("scripts.cli", run_name="__main__")
            mock_exit.assert_called_with(1)


def test_main_argcomplete_exception():
    """Test main handles exception in argcomplete block gracefully."""
    with patch("scripts.cli.create_parser") as mock_create_parser:
        mock_parser = MagicMock()
        mock_create_parser.return_value = mock_parser

        mock_args = MagicMock()
        mock_args.command = "test-cmd"
        mock_parser.parse_args.return_value = mock_args

        with patch.dict("sys.modules", {"argcomplete": None}):
            main()
            mock_args.func.assert_called_once_with(mock_args)
