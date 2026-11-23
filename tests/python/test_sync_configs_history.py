"""Tests for compact per-ticker history generation and orphan cleanup in sync_configs.py."""

from __future__ import annotations

import json
import sys
from types import SimpleNamespace

import pandas as pd

from scripts.analysis import sync_configs


class _FakeTicker:
    def __init__(self, history_df=None, error: Exception | None = None) -> None:
        self.calls: list[dict] = []
        self._history_df = history_df
        self._error = error
        self.info = {"regularMarketPrice": 100.0}
        self.fast_info = {"last_price": 100.0}

    def history(self, **kwargs):
        self.calls.append(kwargs)
        if self._error is not None:
            raise self._error
        return self._history_df


def test_build_ticker_history_schema_and_auto_adjust_false(tmp_path, monkeypatch):
    eps_file = tmp_path / "fetched_eps_cache.json"
    eps_file.write_text(
        json.dumps(
            {
                "PDD": {
                    "points": {
                        "2026-06-30": 9.8151,
                        "2020-03-11": -0.58,
                        "2024-03-31": 0.0,
                        "2025-12-31": float("nan") if False else None,
                        "2025-09-30": 8.25,
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(sync_configs, "EPS_CACHE_FILE", eps_file)
    monkeypatch.setattr(sync_configs, "HISTORICAL_PRICES_FILE", tmp_path / "missing.json")

    df = pd.DataFrame(
        {"Close": [80.12345, float("nan"), -5.0, 85.5]},
        index=pd.to_datetime(["2026-11-16", "2026-11-09", "2026-11-02", "2026-11-23"]),
    )
    fake_ticker = _FakeTicker(history_df=df)

    payload = sync_configs.build_ticker_history("pdd", ticker=fake_ticker)

    assert fake_ticker.calls == [{"period": "2y", "interval": "1wk", "auto_adjust": False}]
    assert payload["symbol"] == "PDD"
    assert isinstance(payload["asOf"], str) and payload["asOf"]
    assert payload["priceBasis"] == "rawClose"
    assert payload["priceBasisVerified"] is True
    assert payload["epsPointInTimeCertified"] is False
    assert payload["prices"] == [
        {"d": "2026-11-16", "c": 80.1235},
        {"d": "2026-11-23", "c": 85.5},
    ]
    assert payload["eps"] == [
        {"d": "2025-09-30", "v": 8.25},
        {"d": "2026-06-30", "v": 9.8151},
    ]


def test_fetch_market_metadata_uses_explicit_auto_adjust_true(monkeypatch):
    df = pd.DataFrame(
        {"Close": [100.0, 102.0, 101.0, 104.0]},
        index=pd.to_datetime(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]),
    )
    fake_ticker = _FakeTicker(history_df=df)
    monkeypatch.setattr(sync_configs, "yf", SimpleNamespace(Ticker=lambda _sym: fake_ticker))

    metadata = sync_configs.fetch_market_metadata("GOOG")

    assert fake_ticker.calls == [{"period": "1y", "interval": "1d", "auto_adjust": True}]
    assert metadata["volatility"] > 0


def test_build_ticker_history_legacy_fallback_disclosure(tmp_path, monkeypatch):
    legacy_file = tmp_path / "historical_prices.json"
    legacy_file.write_text(
        json.dumps(
            {
                "VT": {
                    "2023-01-03": 85.0,  # older than 2y from latest
                    "2025-11-10": 140.1,
                    "2025-11-14": 141.2,  # same ISO week -> keep latest
                    "2026-11-20": 144.96,
                }
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(sync_configs, "HISTORICAL_PRICES_FILE", legacy_file)
    monkeypatch.setattr(sync_configs, "EPS_CACHE_FILE", tmp_path / "missing_eps.json")

    failing_ticker = _FakeTicker(error=RuntimeError("offline"))
    payload = sync_configs.build_ticker_history("VT", ticker=failing_ticker)

    assert payload["priceBasis"] == "legacyClose"
    assert payload["priceBasisVerified"] is False
    assert payload["epsPointInTimeCertified"] is False
    assert payload["eps"] == []
    assert payload["prices"] == [
        {"d": "2025-11-14", "c": 141.2},
        {"d": "2026-11-20", "c": 144.96},
    ]


def test_orphan_cleanup_preserves_history_and_theme_timeline(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    analysis_dir = data_dir / "analysis"
    analysis_dir.mkdir(parents=True)
    (data_dir / "fund_data.json").write_text(
        json.dumps({"VT": 145.0, "AEHR": 40.9}), encoding="utf-8"
    )
    (data_dir / "holdings_details.json").write_text(
        json.dumps({"VT": {"shares": "100.0"}}), encoding="utf-8"
    )
    (analysis_dir / "watchlist.json").write_text(
        json.dumps({"tickers": ["AEHR"]}), encoding="utf-8"
    )
    (analysis_dir / "theme_timeline.json").write_text(json.dumps({"themes": []}), encoding="utf-8")
    (analysis_dir / "ORPHAN.json").write_text("{}", encoding="utf-8")
    (analysis_dir / "ORPHAN.history.json").write_text("{}", encoding="utf-8")
    vt_history_sentinel = {"symbol": "VT", "sentinel": "keep-in-scoped"}
    (analysis_dir / "VT.history.json").write_text(json.dumps(vt_history_sentinel), encoding="utf-8")

    monkeypatch.setattr(sync_configs, "FUND_FILE", data_dir / "fund_data.json")
    monkeypatch.setattr(sync_configs, "HOLDINGS_FILE", data_dir / "holdings_details.json")
    monkeypatch.setattr(sync_configs, "ANALYSIS_DIR", analysis_dir)
    monkeypatch.setattr(sync_configs, "INDEX_FILE", analysis_dir / "index.json")
    monkeypatch.setattr(sync_configs, "WATCHLIST_FILE", analysis_dir / "watchlist.json")
    monkeypatch.setattr(sync_configs, "HISTORICAL_PRICES_FILE", tmp_path / "missing.json")
    monkeypatch.setattr(sync_configs, "EPS_CACHE_FILE", tmp_path / "missing_eps.json")
    monkeypatch.setattr(sync_configs, "fetch_market_metadata", lambda _sym: {})
    monkeypatch.setattr(
        sync_configs,
        "yf",
        SimpleNamespace(
            Ticker=lambda _sym: _FakeTicker(
                pd.DataFrame({"Close": [41.0]}, index=pd.to_datetime(["2026-11-20"]))
            )
        ),
    )

    # Scoped run for AEHR keeps VT.history.json untouched and preserves theme_timeline.json
    monkeypatch.setattr(sys, "argv", ["sync_configs", "--ticker", "AEHR"])
    sync_configs.main()

    assert not (analysis_dir / "ORPHAN.json").exists()
    assert not (analysis_dir / "ORPHAN.history.json").exists()
    assert (analysis_dir / "theme_timeline.json").exists()
    assert json.loads((analysis_dir / "VT.history.json").read_text(encoding="utf-8")) == (
        vt_history_sentinel
    )
    aehr_hist = json.loads((analysis_dir / "AEHR.history.json").read_text(encoding="utf-8"))
    assert aehr_hist["symbol"] == "AEHR"
    assert aehr_hist["priceBasis"] == "rawClose"

    # Full run writes VT.history.json and AEHR.history.json and updates index historyPath
    monkeypatch.setattr(sys, "argv", ["sync_configs"])
    sync_configs.main()

    vt_hist = json.loads((analysis_dir / "VT.history.json").read_text(encoding="utf-8"))
    assert vt_hist["priceBasis"] == "rawClose"
    assert vt_hist["prices"] == [{"d": "2026-11-20", "c": 41.0}]
    index = json.loads((analysis_dir / "index.json").read_text(encoding="utf-8"))
    assert index["tickers"] == [
        {
            "symbol": "AEHR",
            "name": "AEHR",
            "path": "../data/analysis/AEHR.json",
            "historyPath": "../data/analysis/AEHR.history.json",
        },
        {
            "symbol": "VT",
            "name": "VT",
            "path": "../data/analysis/VT.json",
            "historyPath": "../data/analysis/VT.history.json",
        },
    ]
