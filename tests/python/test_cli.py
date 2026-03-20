import sys  # noqa: E402
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock

# Ensure project root on sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from scripts import cli  # noqa: E402


class TestCLI(unittest.TestCase):
    def test_help_includes_commands(self):
        parser = cli.create_parser()
        text = parser.format_help()
        self.assertIn("holdings", text)
        self.assertIn("forex", text)
        self.assertIn("fund-data", text)
        self.assertIn("daily-pnl", text)
        self.assertIn("update-all", text)
        self.assertIn("backfill-portfolio", text)

    def test_forex_calls_fetch(self):
        parser = cli.create_parser()
        args = parser.parse_args(["forex"])

        dummy = types.SimpleNamespace(fetch_forex_data=MagicMock())
        with (
            self.subTest("forex"),
            unittest.mock.patch.dict(sys.modules, {"scripts.data.fetch_forex": dummy}),
        ):
            args.func(args)
            self.assertTrue(dummy.fetch_forex_data.called)

    def test_fund_data_calls_main(self):
        parser = cli.create_parser()
        args = parser.parse_args(["fund-data"])

        dummy = types.SimpleNamespace(main=MagicMock())
        with unittest.mock.patch.dict(sys.modules, {"scripts.data.update_fund_data": dummy}):
            args.func(args)
            self.assertTrue(dummy.main.called)

    def test_daily_pnl_calls_main(self):
        parser = cli.create_parser()
        args = parser.parse_args(["daily-pnl"])

        dummy = types.SimpleNamespace(main=MagicMock())
        with unittest.mock.patch.dict(sys.modules, {"scripts.pnl.update_daily_pnl": dummy}):
            args.func(args)
            self.assertTrue(dummy.main.called)

    def test_extract_history_calls_main(self):
        parser = cli.create_parser()
        args = parser.parse_args(["extract-history"])

        dummy = types.SimpleNamespace(main=MagicMock())
        with unittest.mock.patch.dict(sys.modules, {"scripts.pnl.extract_pnl_history": dummy}):
            args.func(args)
            self.assertTrue(dummy.main.called)

    def test_backfill_portfolio_calls_main(self):
        parser = cli.create_parser()
        args = parser.parse_args(["backfill-portfolio", "2025-06-02"])

        with unittest.mock.patch("scripts.data.backfill_portfolio_history.main") as mock_main:
            args.func(args)
            mock_main.assert_called_once()
            call_kwargs = mock_main.call_args.kwargs
            self.assertEqual(call_kwargs["start_date"], "2025-06-02")

    def test_holdings_list_invokes_manage_holdings(self):
        parser = cli.create_parser()
        args = parser.parse_args(["holdings", "list"])  # no extra args

        recorded_argv = {}

        def fake_main():
            recorded_argv["argv"] = list(sys.argv)

        dummy = types.SimpleNamespace(main=fake_main)
        with unittest.mock.patch.dict(sys.modules, {"scripts.portfolio.manage_holdings": dummy}):
            args.func(args)

        self.assertEqual(recorded_argv["argv"][0], "manage_holdings.py")
        self.assertEqual(recorded_argv["argv"][1:], ["list"])

    def test_holdings_buy_invokes_manage_holdings_with_args(self):
        parser = cli.create_parser()
        args = parser.parse_args(["holdings", "buy", "AAPL", "10", "150.5"])

        recorded_argv = {}

        def fake_main():
            recorded_argv["argv"] = list(sys.argv)

        dummy = types.SimpleNamespace(main=fake_main)
        with unittest.mock.patch.dict(sys.modules, {"scripts.portfolio.manage_holdings": dummy}):
            args.func(args)

        self.assertEqual(
            recorded_argv["argv"],
            ["manage_holdings.py", "buy", "AAPL", "10", "150.5"],
        )


# noqa: E402
from unittest.mock import patch  # noqa: E402

# noqa: E402
import pytest  # noqa: E402

# noqa: E402
from scripts.commands import tickers  # noqa: E402


def test_tickers_success():
    import argparse
    import json
    import tempfile

    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers()
    tickers.add_parser(subparsers)

    with tempfile.NamedTemporaryFile("w", delete=True, suffix=".json") as f:
        json.dump({"AAPL": {}, "MSFT": {}}, f)
        temp_path = f.name

    args = parser.parse_args(["tickers", "--file", temp_path])

    with patch("builtins.print") as mock_print:
        args.func(args)

    mock_print.assert_any_call("AAPL")
    mock_print.assert_any_call("MSFT")


def test_tickers_file_not_found():
    import argparse

    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers()
    tickers.add_parser(subparsers)

    args = parser.parse_args(["tickers", "--file", "does_not_exist_file.json"])

    with patch("builtins.print") as mock_print:
        args.func(args)

    mock_print.assert_called_with("No holdings file found at does_not_exist_file.json")


def test_tickers_read_error():
    import argparse
    import tempfile

    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers()
    tickers.add_parser(subparsers)

    with tempfile.NamedTemporaryFile("w", delete=True, suffix=".json") as f:
        f.write("invalid json")
        temp_path = f.name

    args = parser.parse_args(["tickers", "--file", temp_path])

    with patch("builtins.print") as mock_print:
        args.func(args)

    mock_print.assert_called_once()
    assert "Failed to read" in mock_print.call_args[0][0]


def test_tickers_default_path():
    import argparse
    from pathlib import Path

    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers()
    tickers.add_parser(subparsers)

    args = parser.parse_args(["tickers"])  # no file arg
    with patch("builtins.print"):
        with patch.object(Path, "open", side_effect=FileNotFoundError):
            args.func(args)


def test_tickers_argcomplete_exception():
    import argparse

    from scripts.commands import tickers

    parser = argparse.ArgumentParser()
    parser.add_subparsers()

    class BrokenSubparsers:
        def add_parser(self, *args, **kwargs):
            class BrokenParser:
                def add_argument(self, *args, **kwargs):
                    pass

                def set_defaults(self, *args, **kwargs):
                    pass

                @property
                def _actions(self):
                    raise ValueError("Simulated Exception")

            return BrokenParser()

    tickers.add_parser(BrokenSubparsers())


import argparse  # noqa: E402
import sys  # noqa: E402

from scripts.commands import update_all  # noqa: E402


def test_update_all_success():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers()
    update_all.add_parser(subparsers)
    args = parser.parse_args(["update-all"])

    with patch("scripts.data.fetch_forex.fetch_forex_data") as mock_forex:
        with patch("scripts.data.update_fund_data.main") as mock_fund:
            with patch("scripts.pnl.update_daily_pnl.main") as mock_pnl:
                with patch("builtins.print") as mock_print:
                    args.func(args)
                    mock_forex.assert_called_once()
                    mock_fund.assert_called_once()
                    mock_pnl.assert_called_once()

                    mock_print.assert_any_call("Updating all data...")
                    mock_print.assert_any_call("Forex data updated")
                    mock_print.assert_any_call("Fund data updated")
                    mock_print.assert_any_call("Daily P&L updated")
                    mock_print.assert_any_call("All updates completed.")


def test_update_all_failures():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers()
    update_all.add_parser(subparsers)
    args = parser.parse_args(["update-all"])

    with patch("scripts.data.fetch_forex.fetch_forex_data", side_effect=Exception("forex err")):
        with patch("scripts.data.update_fund_data.main", side_effect=Exception("fund err")):
            with patch("scripts.pnl.update_daily_pnl.main", side_effect=Exception("pnl err")):
                with patch("builtins.print") as mock_print:
                    args.func(args)
                    mock_print.assert_any_call("Forex update failed: forex err")
                    mock_print.assert_any_call("Fund data update failed: fund err")
                    mock_print.assert_any_call("Daily P&L update failed: pnl err")


import sys  # noqa: E402

from scripts.commands import holdings  # noqa: E402


def test_holdings_buy_missing_all_args():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers()
    holdings.add_parser(subparsers)

    args = parser.parse_args(["holdings", "buy"])
    with pytest.raises(SystemExit):
        args.func(args)


def test_holdings_add_parser_exception():
    import argparse

    from scripts.commands import holdings

    parser = argparse.ArgumentParser()
    parser.add_subparsers()

    class BrokenSubparsers:
        def add_parser(self, *args, **kwargs):
            class BrokenParser:
                def add_argument(self, *args, **kwargs):
                    pass

                def set_defaults(self, *args, **kwargs):
                    pass

                @property
                def _actions(self):
                    raise ValueError("Simulated Exception")

            return BrokenParser()

    holdings.add_parser(BrokenSubparsers())


def test_holdings_file_and_transactions_args():
    import argparse
    import sys
    from unittest.mock import patch

    from scripts.commands import holdings

    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers()
    holdings.add_parser(subparsers)
    args = parser.parse_args(
        ["holdings", "--file", "my_file.json", "--transactions", "my_tx.csv", "list"]
    )

    with patch("scripts.portfolio.manage_holdings.main"):
        with patch.object(sys, "argv", ["fake"]):
            args.func(args)
            assert sys.argv == ["fake"]


def test_holdings_buy_all_args():
    import argparse
    import sys
    from unittest.mock import patch

    from scripts.commands import holdings

    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers()
    holdings.add_parser(subparsers)
    args = parser.parse_args(["holdings", "buy", "AAPL", "10", "150"])

    with patch("scripts.portfolio.manage_holdings.main"):
        with patch.object(sys, "argv", ["fake"]):
            args.func(args)
            assert sys.argv == ["fake"]


def test_holdings_argcomplete():
    import argparse

    from scripts.commands import holdings

    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers()
    holdings.add_parser(subparsers)

    # We simulate the argcomplete hook.
    # It's hidden in the action completers.
    subparsers_actions = [
        action for action in parser._actions if isinstance(action, argparse._SubParsersAction)
    ]
    holdings_parser = subparsers_actions[0].choices["holdings"]

    ticker_action = next(a for a in holdings_parser._actions if a.dest == "ticker")

    # Now run the completer.
    # Try finding dummy JSON to complete.
    import json
    import tempfile

    with tempfile.NamedTemporaryFile("w", delete=True, suffix=".json") as f:
        json.dump({"AAPL": {}, "MSFT": {}, "AMZN": {}}, f)
        temp_path = f.name

    class DummyParsedArgs:
        file = temp_path

    completions = ticker_action.completer("A", DummyParsedArgs())
    assert "AAPL" in completions
    assert "AMZN" in completions
    assert "MSFT" not in completions

    # Test exception path for completer
    class ErrorParsedArgs:
        file = "does_not_exist_file.json"

    completions_err = ticker_action.completer("A", ErrorParsedArgs())
    assert completions_err == []


def test_holdings_argcomplete_exception():
    import argparse

    from scripts.commands import holdings

    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers()
    holdings.add_parser(subparsers)

    subparsers_actions = [
        action for action in parser._actions if isinstance(action, argparse._SubParsersAction)
    ]
    holdings_parser = subparsers_actions[0].choices["holdings"]

    ticker_action = next(a for a in holdings_parser._actions if a.dest == "ticker")

    class ErrorParsedArgs:
        @property
        def file(self):
            raise ValueError("Test error")

    completions_err = ticker_action.completer("A", ErrorParsedArgs())
    assert completions_err == []


def test_holdings_buy_missing_shares_and_price():
    import argparse

    from scripts.commands import holdings

    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers()
    holdings.add_parser(subparsers)

    args = parser.parse_args(["holdings", "buy", "AAPL"])

    with pytest.raises(SystemExit) as context:
        args.func(args)
    assert "buy requires ticker, shares, and price" in str(context.value)


def test_holdings_buy_missing_price():
    import argparse

    from scripts.commands import holdings

    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers()
    holdings.add_parser(subparsers)

    args = parser.parse_args(["holdings", "buy", "AAPL", "10"])

    with pytest.raises(SystemExit) as context:
        args.func(args)
    assert "buy requires ticker, shares, and price" in str(context.value)


if __name__ == "__main__":
    unittest.main()
