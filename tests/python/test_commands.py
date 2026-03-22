import sys
from pathlib import Path
import unittest
from unittest.mock import patch, MagicMock

project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts.cli import create_parser, main as cli_main
from scripts.commands import doctor, complete_debug, tickers, extract_history, forex, fund_data, daily_pnl, backfill_portfolio, update_all, holdings

class TestCommands(unittest.TestCase):
    def test_cli_parser(self):
        parser = create_parser()
        self.assertIsNotNone(parser)

    @patch('scripts.cli.sys.exit')
    @patch('scripts.cli.create_parser')
    def test_cli_main_no_args(self, mock_create, mock_exit):
        parser = MagicMock()
        mock_create.return_value = parser
        args = MagicMock()
        args.command = None
        parser.parse_args.return_value = args
        cli_main()
        self.assertTrue(mock_exit.called)

    @patch('scripts.commands.doctor._check_executable')
    @patch('scripts.commands.doctor._ok')
    @patch('scripts.commands.doctor._warn')
    @patch('scripts.commands.doctor._info')
    def test_doctor_run(self, mock_info, mock_warn, mock_ok, mock_check_exec):
        args = MagicMock()
        doctor._run(args)
        self.assertTrue(mock_check_exec.called)

    @patch('scripts.commands.tickers._run')
    def test_tickers_add_parser(self, mock_run):
        parser = create_parser()
        args = parser.parse_args(['tickers'])
        self.assertEqual(args.func, tickers._run)

    @patch('scripts.data.fetch_forex.fetch_forex_data')
    def test_forex_run(self, mock_fetch):
        args = MagicMock()
        forex._run(args)
        self.assertTrue(mock_fetch.called)

    @patch('scripts.pnl.extract_pnl_history.main')
    def test_extract_history_run(self, mock_main):
        args = MagicMock()
        extract_history._run(args)
        self.assertTrue(mock_main.called)

    @patch('scripts.data.update_fund_data.main')
    def test_fund_data_run(self, mock_main):
        args = MagicMock()
        fund_data._run(args)
        self.assertTrue(mock_main.called)

    @patch('scripts.pnl.update_daily_pnl.main')
    def test_daily_pnl_run(self, mock_main):
        args = MagicMock()
        daily_pnl._run(args)
        self.assertTrue(mock_main.called)

    @patch('scripts.data.backfill_portfolio_history.main')
    def test_backfill_portfolio_run(self, mock_main):
        args = MagicMock()
        args.start_date = "2023-01-01"
        args.output = "output.csv"
        args.holdings = "holdings.json"
        backfill_portfolio._run(args)
        self.assertTrue(mock_main.called)

    @patch('scripts.commands.update_all.sys')
    @patch('scripts.data.fetch_forex.fetch_forex_data')
    @patch('scripts.data.update_fund_data.main')
    @patch('scripts.pnl.update_daily_pnl.main')
    def test_update_all_run(self, mock_pnl, mock_fund, mock_forex, mock_sys):
        mock_sys.argv = ['update_all.py']
        args = MagicMock()
        update_all._run(args)
        self.assertTrue(mock_forex.called)
        self.assertTrue(mock_fund.called)
        self.assertTrue(mock_pnl.called)

    @patch('scripts.commands.update_all.sys')
    @patch('scripts.data.fetch_forex.fetch_forex_data', side_effect=Exception('test'))
    @patch('scripts.data.update_fund_data.main', side_effect=Exception('test'))
    @patch('scripts.pnl.update_daily_pnl.main', side_effect=Exception('test'))
    def test_update_all_run_error(self, mock_pnl, mock_fund, mock_forex, mock_sys):
        mock_sys.argv = ['update_all.py']
        args = MagicMock()
        update_all._run(args)

    @patch('scripts.portfolio.manage_holdings.main')
    @patch('scripts.commands.holdings.sys')
    def test_holdings_run(self, mock_sys, mock_main):
        args = MagicMock()
        args.action = 'list'
        args.unknown = []
        holdings._run(args)
        self.assertTrue(mock_main.called)

    @patch('scripts.commands.tickers.Path')
    def test_tickers_run(self, mock_path):
        args = MagicMock()
        args.file = 'test.json'

        mock_file = MagicMock()
        mock_file.open.return_value.__enter__.return_value.read.return_value = '{"AAPL": {}, "GOOG": {}}'
        mock_path.return_value = mock_file

        with patch('scripts.commands.tickers.json.load', return_value={"AAPL": {}, "GOOG": {}}):
            tickers._run(args)

    @patch('scripts.commands.tickers.Path')
    def test_tickers_run_not_found(self, mock_path):
        args = MagicMock()
        args.file = 'test.json'
        mock_file = MagicMock()
        mock_file.open.side_effect = FileNotFoundError()
        mock_path.return_value = mock_file
        tickers._run(args)

    @patch('scripts.commands.tickers.Path')
    def test_tickers_run_exception(self, mock_path):
        args = MagicMock()
        args.file = 'test.json'
        mock_file = MagicMock()
        mock_file.open.side_effect = Exception("test")
        mock_path.return_value = mock_file
        tickers._run(args)

    @patch('scripts.commands.tickers.argparse._SubParsersAction')
    def test_tickers_add_parser_exception(self, mock_subparsers):
        mock_parser = MagicMock()
        mock_subparsers.add_parser.return_value = mock_parser
        # Mock argcomplete so it raises an exception
        with patch.dict(sys.modules, {'argcomplete.completers': None}):
            tickers.add_parser(mock_subparsers)

    @patch('scripts.commands.tickers.argparse._SubParsersAction')
    def test_tickers_add_parser_success(self, mock_subparsers):
        mock_parser = MagicMock()
        mock_subparsers.add_parser.return_value = mock_parser
        mock_action = MagicMock()
        mock_action.option_strings = ['--file']
        mock_parser._actions = [mock_action]
        tickers.add_parser(mock_subparsers)

    @patch('scripts.portfolio.manage_holdings.main', side_effect=SystemExit(0))
    @patch('scripts.commands.holdings.sys')
    def test_holdings_run_sys_exit(self, mock_sys, mock_main):
        args = MagicMock()
        args.action = 'list'
        args.unknown = []
        try:
            holdings._run(args)
        except SystemExit:
            pass

    @patch('scripts.portfolio.manage_holdings.main', side_effect=Exception("test"))
    @patch('scripts.commands.holdings.sys')
    def test_holdings_run_exception(self, mock_sys, mock_main):
        args = MagicMock()
        args.action = 'list'
        args.unknown = []
        try:
            holdings._run(args)
        except Exception:
            pass

    @patch('scripts.commands.holdings.argparse._SubParsersAction')
    def test_holdings_add_parser(self, mock_subparsers):
        mock_parser = MagicMock()
        mock_subparsers.add_parser.return_value = mock_parser
        holdings.add_parser(mock_subparsers)

    def test_holdings_ticker_completer(self):
        # get the completer from the parser
        parser = create_parser()
        args = parser.parse_args(['holdings', 'list'])

        # Test completion
        mock_parsed_args = MagicMock()
        mock_parsed_args.file = None

        with patch('scripts.commands.holdings.Path') as mock_path:
            mock_file = MagicMock()
            mock_file.exists.return_value = True
            mock_file.open.return_value.__enter__.return_value.read.return_value = '{"AAPL": {}, "GOOG": {}}'
            mock_path.return_value = mock_file

            with patch('scripts.commands.holdings.json.load', return_value={"AAPL": {}, "GOOG": {}}):
                for act in parser._subparsers._group_actions[0].choices['holdings']._actions:
                    if getattr(act, "dest", "") == "ticker":
                        res = act.completer("a", mock_parsed_args)
                        self.assertEqual(res, ["AAPL"])

    def test_holdings_ticker_completer_exception(self):
        parser = create_parser()
        mock_parsed_args = MagicMock()
        mock_parsed_args.file = None

        with patch('scripts.commands.holdings.Path') as mock_path:
            mock_file = MagicMock()
            mock_file.exists.return_value = True
            mock_file.open.side_effect = Exception("test")
            mock_path.return_value = mock_file

            for act in parser._subparsers._group_actions[0].choices['holdings']._actions:
                if getattr(act, "dest", "") == "ticker":
                    res = act.completer("a", mock_parsed_args)
                    self.assertEqual(res, [])

    def test_holdings_ticker_completer_no_exists(self):
        parser = create_parser()
        mock_parsed_args = MagicMock()
        mock_parsed_args.file = None

        with patch('scripts.commands.holdings.Path') as mock_path:
            mock_file = MagicMock()
            mock_file.exists.return_value = False
            mock_path.return_value = mock_file

            for act in parser._subparsers._group_actions[0].choices['holdings']._actions:
                if getattr(act, "dest", "") == "ticker":
                    res = act.completer("a", mock_parsed_args)
                    self.assertEqual(res, [])

    @patch('scripts.commands.holdings.argparse._SubParsersAction')
    def test_holdings_add_parser_import_error(self, mock_subparsers):
        mock_parser = MagicMock()
        mock_subparsers.add_parser.return_value = mock_parser
        with patch.dict(sys.modules, {'argcomplete.completers': None}):
            holdings.add_parser(mock_subparsers)

    @patch('scripts.commands.holdings.argparse._SubParsersAction')
    def test_holdings_add_parser_exception(self, mock_subparsers):
        mock_parser = MagicMock()
        mock_subparsers.add_parser.return_value = mock_parser
        mock_parser._actions = MagicMock()
        mock_parser._actions.__iter__.side_effect = Exception("test")
        holdings.add_parser(mock_subparsers)

    @patch('scripts.portfolio.manage_holdings.main')
    @patch('scripts.commands.holdings.sys')
    def test_holdings_buy(self, mock_sys, mock_main):
        args = MagicMock()
        args.action = 'buy'
        args.ticker = 'AAPL'
        args.shares = '10'
        args.price = '150'
        holdings._run(args)

    @patch('scripts.commands.holdings.sys')
    def test_holdings_buy_missing_args(self, mock_sys):
        args = MagicMock()
        args.action = 'buy'
        args.ticker = 'AAPL'
        args.shares = '10'
        args.price = None
        with self.assertRaises(SystemExit):
            holdings._run(args)

    @patch('scripts.portfolio.manage_holdings.main')
    @patch('scripts.commands.holdings.sys')
    def test_holdings_args_passed(self, mock_sys, mock_main):
        args = MagicMock()
        args.action = 'buy'
        args.ticker = 'AAPL'
        args.shares = '10'
        args.price = '150'
        args.file = 'test.json'
        args.transactions = 'test.csv'
        holdings._run(args)


class TestDoctorHelpers(unittest.TestCase):
    def test_doctor_print_helpers(self):
        with patch('builtins.print') as mock_print:
            doctor._print('Test', 'Val')
            mock_print.assert_called_with('- Test: Val')

            doctor._ok('Msg')
            mock_print.assert_called_with('OK: Msg')

            doctor._warn('Msg')
            mock_print.assert_called_with('WARN: Msg')

            doctor._info('Msg')
            mock_print.assert_called_with('INFO: Msg')

    @patch('scripts.commands.doctor.stat')
    def test_doctor_check_executable(self, mock_stat):
        mock_path = MagicMock()
        mock_path.exists.return_value = False
        with patch('builtins.print') as mock_print:
            doctor._check_executable(mock_path, 'test')
            mock_print.assert_called_with('WARN: test not found at ' + str(mock_path))

        mock_path.exists.return_value = True
        mock_path.stat.return_value.st_mode = 0o644
        mock_stat.S_IXUSR = 0o100
        with patch('builtins.print') as mock_print:
            doctor._check_executable(mock_path, 'test')
            mock_print.assert_called_with('WARN: test exists but is not executable: chmod +x ' + str(mock_path))

        mock_path.stat.return_value.st_mode = 0o755
        with patch('builtins.print') as mock_print:
            doctor._check_executable(mock_path, 'test')
            mock_print.assert_called_with('OK: test is executable')

    @patch('scripts.commands.doctor.os')
    @patch('scripts.commands.doctor.Path')
    def test_doctor_detect_rc_bash(self, mock_path, mock_os):
        mock_os.environ.get.return_value = 'bash'
        mock_os.path.basename.return_value = 'bash'
        doctor._detect_rc()

    @patch('scripts.commands.doctor.os')
    @patch('scripts.commands.doctor.Path')
    def test_doctor_detect_rc_zsh_with_zdot(self, mock_path, mock_os):
        def get_env(key, default=None):
            if key == 'SHELL': return 'zsh'
            if key == 'ZDOTDIR': return '/custom/zdot'
            return default
        mock_os.environ.get.side_effect = get_env
        mock_os.path.basename.return_value = 'zsh'
        doctor._detect_rc()

    @patch('scripts.commands.doctor.os')
    @patch('scripts.commands.doctor.Path')
    def test_doctor_detect_rc_zsh_no_zdot(self, mock_path, mock_os):
        def get_env(key, default=None):
            if key == 'SHELL': return 'zsh'
            if key == 'ZDOTDIR': return None
            return default
        mock_os.environ.get.side_effect = get_env
        mock_os.path.basename.return_value = 'zsh'
        doctor._detect_rc()

    @patch('scripts.commands.doctor.Path')
    def test_doctor_has_marker_block(self, mock_path):
        mock_file = MagicMock()
        mock_file.exists.return_value = True
        mock_file.read_text.return_value = "# >>> fund aliases >>>\n# <<< fund aliases <<<"
        self.assertTrue(doctor._has_marker_block(mock_file))

        mock_file.read_text.return_value = ""
        self.assertFalse(doctor._has_marker_block(mock_file))

        mock_file.exists.return_value = False
        self.assertFalse(doctor._has_marker_block(mock_file))

        mock_file.exists.return_value = True
        mock_file.read_text.side_effect = Exception("test")
        self.assertFalse(doctor._has_marker_block(mock_file))

    @patch('scripts.commands.doctor.Path')
    def test_doctor_has_completion_line(self, mock_path):
        mock_file = MagicMock()
        mock_file.exists.return_value = True
        mock_file.read_text.return_value = "register-python-argcomplete fund"
        self.assertTrue(doctor._has_completion_line(mock_file))

        mock_file.read_text.return_value = "compdef _fund_complete fund"
        self.assertTrue(doctor._has_completion_line(mock_file))

        mock_file.read_text.return_value = ""
        self.assertFalse(doctor._has_completion_line(mock_file))

        mock_file.exists.return_value = False
        self.assertFalse(doctor._has_completion_line(mock_file))

        mock_file.exists.return_value = True
        mock_file.read_text.side_effect = Exception("test")
        self.assertFalse(doctor._has_completion_line(mock_file))

    @patch('scripts.commands.doctor._check_executable')
    @patch('scripts.commands.doctor._ok')
    @patch('scripts.commands.doctor._warn')
    @patch('scripts.commands.doctor._info')
    @patch('scripts.commands.doctor.shutil')
    @patch('scripts.commands.doctor._has_marker_block', return_value=True)
    @patch('scripts.commands.doctor._has_completion_line', return_value=True)
    def test_doctor_run_full(self, mock_completion, mock_marker, mock_shutil, mock_info, mock_warn, mock_ok, mock_check):
        mock_shutil.which.return_value = '/usr/bin/register-python-argcomplete'
        args = MagicMock()
        doctor._run(args)

    @patch('scripts.commands.doctor._check_executable')
    @patch('scripts.commands.doctor._ok')
    @patch('scripts.commands.doctor._warn')
    @patch('scripts.commands.doctor._info')
    @patch('scripts.commands.doctor.shutil')
    @patch('scripts.commands.doctor._has_marker_block', return_value=False)
    @patch('scripts.commands.doctor._has_completion_line', return_value=False)
    def test_doctor_run_full_warnings(self, mock_completion, mock_marker, mock_shutil, mock_info, mock_warn, mock_ok, mock_check):
        mock_shutil.which.return_value = None
        args = MagicMock()
        with patch.dict(sys.modules, {'importlib.metadata': None}):
            doctor._run(args)

    def test_doctor_argcomplete_version_error(self):
        # mock importlib.metadata to raise exception
        def mock_metadata(*args):
            raise Exception("test")
        with patch('importlib.metadata.version', side_effect=mock_metadata):
            args = MagicMock()
            with patch('scripts.commands.doctor._ok') as mock_ok:
                with patch('scripts.commands.doctor._check_executable'):
                    with patch('scripts.commands.doctor._info'):
                        doctor._run(args)
                        mock_ok.assert_any_call("argcomplete importable (version unknown)")

    def test_doctor_argcomplete_import_error(self):
        args = MagicMock()
        with patch.dict(sys.modules, {'argcomplete': None}):
            with patch('scripts.commands.doctor._warn') as mock_warn:
                with patch('scripts.commands.doctor._check_executable'):
                    with patch('scripts.commands.doctor._info'):
                        doctor._run(args)

    @patch('scripts.commands.doctor._detect_rc')
    def test_doctor_has_completion_fallback(self, mock_detect):
        mock_file = MagicMock()
        mock_file.exists.return_value = True
        mock_file.read_text.return_value = "register-python-argcomplete fund"
        mock_detect.return_value = mock_file

        args = MagicMock()
        with patch('scripts.commands.doctor._check_executable'):
            with patch('scripts.commands.doctor._info'):
                doctor._run(args)

    def test_doctor_add_parser(self):
        mock_subparsers = MagicMock()
        doctor.add_parser(mock_subparsers)
        mock_subparsers.add_parser.assert_called_once_with("doctor", help="Diagnose CLI setup and completions")

    @patch('scripts.commands.doctor._check_executable')
    @patch('scripts.commands.doctor._ok')
    @patch('scripts.commands.doctor._warn')
    @patch('scripts.commands.doctor._info')
    @patch('scripts.commands.doctor.shutil')
    def test_doctor_import_cli_error(self, mock_shutil, mock_info, mock_warn, mock_ok, mock_check):
        args = MagicMock()
        with patch.dict(sys.modules, {'scripts.cli': None}):
            try:
                # The code attempts to import scripts.cli, which we set to None.
                # Since the failure is caught, we don't need to patch importlib directly
                doctor._run(args)
            except Exception:
                pass


class TestCompleteDebug(unittest.TestCase):
    @patch('scripts.commands.complete_debug._get_top_commands')
    @patch('scripts.cli.create_parser')
    @patch('builtins.print')
    def test_complete_debug_run_1(self, mock_print, mock_create, mock_top):
        mock_top.return_value = ["holdings", "fund-data"]
        args = MagicMock()

        args.cmdline = ""
        complete_debug._run(args)

        args.cmdline = "h"
        complete_debug._run(args)

        args.cmdline = "holdings "
        complete_debug._run(args)

        args.cmdline = "fund-data "
        complete_debug._run(args)

        args.cmdline = "other "
        complete_debug._run(args)

        args.cmdline = "holdings l"
        complete_debug._run(args)

        args.cmdline = "holdings list "
        complete_debug._run(args)

    @patch('scripts.commands.complete_debug._get_top_commands')
    @patch('scripts.cli.create_parser')
    @patch('builtins.print')
    @patch('scripts.commands.complete_debug._read_tickers')
    def test_complete_debug_run_2(self, mock_read, mock_print, mock_create, mock_top):
        mock_top.return_value = ["holdings", "fund-data"]
        mock_read.return_value = ["AAPL", "GOOG"]
        args = MagicMock()

        args.cmdline = "holdings buy "
        complete_debug._run(args)

        args.cmdline = "holdings buy A"
        complete_debug._run(args)

        args.cmdline = "holdings buy AAPL 10 "
        complete_debug._run(args)

    def test_complete_debug_get_subparser(self):
        parser = create_parser()
        res = complete_debug._get_subparser(parser, "holdings")
        self.assertIsNotNone(res)

        # Test default when not found
        mock_parser = MagicMock()
        mock_parser._actions = []
        res = complete_debug._get_subparser(mock_parser, "not_found")
        self.assertIsNone(res)

    def test_complete_debug_get_top_commands_default(self):
        mock_parser = MagicMock()
        mock_parser._actions = []
        res = complete_debug._get_top_commands(mock_parser)
        self.assertEqual(res, [])

    @patch('scripts.commands.complete_debug.Path')
    def test_complete_debug_read_tickers(self, mock_path):
        mock_file = MagicMock()
        mock_file.open.return_value.__enter__.return_value.read.return_value = '{"AAPL": {}, "GOOG": {}}'
        mock_path.return_value = mock_file
        with patch('scripts.commands.complete_debug.json.load', return_value={"AAPL": {}, "GOOG": {}}):
            res = complete_debug._read_tickers(None)
            self.assertEqual(res, ["AAPL", "GOOG"])

    @patch('scripts.commands.complete_debug.Path')
    def test_complete_debug_read_tickers_exception(self, mock_path):
        mock_file = MagicMock()
        mock_file.open.side_effect = Exception("test")
        mock_path.return_value = mock_file
        res = complete_debug._read_tickers(None)
        self.assertEqual(res, [])

    def test_complete_debug_add_parser(self):
        mock_subparsers = MagicMock()
        complete_debug.add_parser(mock_subparsers)
        mock_subparsers.add_parser.assert_called_once()

if __name__ == '__main__':
    unittest.main()
