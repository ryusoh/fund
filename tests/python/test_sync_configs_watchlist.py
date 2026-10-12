"""Tests for watchlist support in sync_configs.py.

Watchlist symbols (data/analysis/watchlist.json) are tracked in the analysis
lab without a current position: their configs are normalized and indexed like
holdings but exempt from orphan-config deletion.
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "scripts" / "analysis"))

import sync_configs
from sync_configs import load_watchlist, main


class TestLoadWatchlist:
    def test_missing_file_returns_empty(self, tmp_path):
        assert load_watchlist(tmp_path / "watchlist.json") == []

    def test_parses_and_normalizes_symbols(self, tmp_path):
        path = tmp_path / "watchlist.json"
        path.write_text(json.dumps({"tickers": ["aehr", " ANET ", ""]}), encoding="utf-8")
        assert load_watchlist(path) == ["AEHR", "ANET"]

    def test_missing_tickers_key_returns_empty(self, tmp_path):
        path = tmp_path / "watchlist.json"
        path.write_text("{}", encoding="utf-8")
        assert load_watchlist(path) == []


class TestMainWatchlistIntegration:
    @pytest.fixture()
    def sandbox(self, tmp_path, monkeypatch):
        data_dir = tmp_path / "data"
        analysis_dir = data_dir / "analysis"
        analysis_dir.mkdir(parents=True)
        (data_dir / "fund_data.json").write_text("{}", encoding="utf-8")
        (data_dir / "holdings_details.json").write_text(
            json.dumps({"VT": {"shares": "100.0", "average_price": "50.0"}}),
            encoding="utf-8",
        )
        monkeypatch.setattr(sync_configs, "FUND_FILE", data_dir / "fund_data.json")
        monkeypatch.setattr(sync_configs, "HOLDINGS_FILE", data_dir / "holdings_details.json")
        monkeypatch.setattr(sync_configs, "ANALYSIS_DIR", analysis_dir)
        monkeypatch.setattr(sync_configs, "INDEX_FILE", analysis_dir / "index.json")
        monkeypatch.setattr(sync_configs, "WATCHLIST_FILE", analysis_dir / "watchlist.json")
        monkeypatch.setattr(sync_configs, "fetch_market_metadata", lambda symbol: {})
        return analysis_dir

    def test_watchlist_config_survives_and_is_indexed(self, sandbox):
        (sandbox / "watchlist.json").write_text(json.dumps({"tickers": ["AEHR"]}), encoding="utf-8")
        main()
        config = json.loads((sandbox / "AEHR.json").read_text(encoding="utf-8"))
        assert config["symbol"] == "AEHR"
        index = json.loads((sandbox / "index.json").read_text(encoding="utf-8"))
        assert [t["symbol"] for t in index["tickers"]] == ["AEHR", "VT"]

    def test_orphan_config_deleted_but_watchlist_kept(self, sandbox):
        (sandbox / "watchlist.json").write_text(json.dumps({"tickers": ["AEHR"]}), encoding="utf-8")
        (sandbox / "AEHR.json").write_text(json.dumps({"symbol": "AEHR"}), encoding="utf-8")
        (sandbox / "ORPHAN.json").write_text(json.dumps({"symbol": "ORPHAN"}), encoding="utf-8")
        main()
        assert (sandbox / "AEHR.json").exists()
        assert not (sandbox / "ORPHAN.json").exists()

    def test_no_watchlist_file_behaves_as_before(self, sandbox):
        (sandbox / "ORPHAN.json").write_text(json.dumps({"symbol": "ORPHAN"}), encoding="utf-8")
        main()
        assert not (sandbox / "ORPHAN.json").exists()
        index = json.loads((sandbox / "index.json").read_text(encoding="utf-8"))
        assert [t["symbol"] for t in index["tickers"]] == ["VT"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
