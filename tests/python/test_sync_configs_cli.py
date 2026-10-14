"""Tests for sync_configs CLI argument handling.

`main()` previously ignored argv, so `--help` silently ran the full sync
(including orphan-config deletion and a market-data refresh). argparse now
gates entry: --help prints usage (exit 0) before any file is touched. Unknown
args are tolerated (parse_known_args) so direct main() callers under pytest's
argv keep working.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "scripts" / "analysis"))

from sync_configs import main


class TestCliArgs:
    def test_help_exits_zero_without_running_sync(self, monkeypatch):
        monkeypatch.setattr(sys, "argv", ["sync_configs", "--help"])
        with pytest.raises(SystemExit) as exc:
            main()
        assert exc.value.code == 0

    def test_unknown_args_tolerated(self, monkeypatch, tmp_path):
        monkeypatch.setattr(sys, "argv", ["pytest", "-q", "tests/python/"])
        monkeypatch.setattr("sync_configs.FUND_FILE", tmp_path / "missing.json")
        with pytest.raises(SystemExit) as exc:
            main()
        assert exc.value.code != 2
