from unittest.mock import MagicMock, patch

import scripts.watch_transactions as swt


@patch('subprocess.call')
def test_run_make(mock_call):
    mock_call.return_value = 0
    result = swt.run_make('test_target')
    assert result == 0
    mock_call.assert_called_once_with(['make', 'test_target'])


@patch('time.sleep')
@patch('scripts.watch_transactions.run_make')
@patch('pathlib.Path.stat')
@patch('pathlib.Path.exists')
def test_poll_change_detected(mock_exists, mock_stat, mock_run_make, mock_sleep):
    mock_exists.return_value = True

    mock_stat_initial = MagicMock()
    mock_stat_initial.st_mtime = 100

    mock_stat_changed = MagicMock()
    mock_stat_changed.st_mtime = 200

    mock_stat.side_effect = [
        mock_stat_initial,
        mock_stat_initial,
        mock_stat_changed,
        mock_stat_initial,
    ]

    def sleep_side_effect(*args):
        raise KeyboardInterrupt()

    mock_sleep.side_effect = sleep_side_effect

    swt.poll(1.0)

    mock_run_make.assert_called_once_with(swt.MAKE_TARGET)


@patch('time.sleep')
@patch('scripts.watch_transactions.run_make')
@patch('pathlib.Path.stat')
@patch('pathlib.Path.exists')
def test_poll_file_not_found(mock_exists, mock_stat, mock_run_make, mock_sleep):
    mock_exists.return_value = False

    # st_mtime will throw FileNotFoundError during the loop
    mock_stat.side_effect = FileNotFoundError()

    def sleep_side_effect(*args):
        raise KeyboardInterrupt()

    mock_sleep.side_effect = sleep_side_effect

    swt.poll(1.0)

    mock_run_make.assert_not_called()


@patch('scripts.watch_transactions.poll')
@patch('sys.argv', ['watch_transactions.py', '--interval', '2.5'])
def test_main(mock_poll):
    swt.main()
    mock_poll.assert_called_once_with(interval=2.5)


def test_main_block_actual():
    with patch('sys.argv', ['watch_transactions.py']):
        with open('scripts/watch_transactions.py') as f:
            code = f.read()
        import re

        code = re.sub(
            r"if __name__ == '__main__':\s+main\(\)", "if __name__ == '__main__': pass", code
        )
        exec(code, {'__name__': '__main__'})
