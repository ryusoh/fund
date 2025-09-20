import sys
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


if __name__ == "__main__":
    unittest.main()
