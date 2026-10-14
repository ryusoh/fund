"""Tests for sync_configs CLI argument handling.

`main()` previously ignored argv, so `--help` silently ran the full sync
(including orphan-config deletion and a market-data refresh). argparse now
gates entry: --help prints usage (exit 0) before any file is touched. Unknown
args are tolerated (parse_known_args) so direct main() callers under pytest's
argv keep working.
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "scripts" / "analysis"))

import sync_configs
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


class TestTickerScope:
    @pytest.fixture()
    def sandbox(self, tmp_path, monkeypatch):
        data_dir = tmp_path / "data"
        analysis_dir = data_dir / "analysis"
        analysis_dir.mkdir(parents=True)
        (data_dir / "fund_data.json").write_text(
            json.dumps({"VT": 51.0, "AEHR": 80.0}), encoding="utf-8"
        )
        (data_dir / "holdings_details.json").write_text(
            json.dumps({"VT": {"shares": "100.0", "average_price": "50.0"}}),
            encoding="utf-8",
        )
        monkeypatch.setattr(sync_configs, "FUND_FILE", data_dir / "fund_data.json")
        monkeypatch.setattr(sync_configs, "HOLDINGS_FILE", data_dir / "holdings_details.json")
        monkeypatch.setattr(sync_configs, "ANALYSIS_DIR", analysis_dir)
        monkeypatch.setattr(sync_configs, "INDEX_FILE", analysis_dir / "index.json")
        monkeypatch.setattr(sync_configs, "WATCHLIST_FILE", analysis_dir / "watchlist.json")
        monkeypatch.setattr(
            sync_configs, "fetch_market_metadata", lambda symbol: {"fiftyTwoWeekHigh": 999.0}
        )
        (analysis_dir / "watchlist.json").write_text(
            json.dumps({"tickers": ["AEHR"]}), encoding="utf-8"
        )
        return analysis_dir

    def test_scoped_refresh_leaves_other_configs_untouched(self, sandbox, monkeypatch):
        vt_path = sandbox / "VT.json"
        aehr_path = sandbox / "AEHR.json"
        vt_path.write_text(json.dumps({"symbol": "VT"}), encoding="utf-8")
        aehr_path.write_text(json.dumps({"symbol": "AEHR"}), encoding="utf-8")
        vt_before = vt_path.read_text(encoding="utf-8")

        monkeypatch.setattr(sys, "argv", ["sync_configs", "--ticker", "aehr"])
        main()

        assert vt_path.read_text(encoding="utf-8") == vt_before
        aehr = json.loads(aehr_path.read_text(encoding="utf-8"))
        assert aehr["market"]["fiftyTwoWeekHigh"] == 999.0
        assert aehr["market"]["price"] == 80.0

    def test_unknown_ticker_rejected(self, sandbox, monkeypatch):
        monkeypatch.setattr(sys, "argv", ["sync_configs", "--ticker", "NOPE"])
        with pytest.raises(SystemExit):
            main()
