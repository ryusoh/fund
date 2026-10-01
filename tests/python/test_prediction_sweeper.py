"""Tests for prediction_sweeper (scripts.analysis.prediction_sweeper)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.analysis.prediction_sweeper import main, scan_predictions


@pytest.fixture
def sample_analysis_dir(tmp_path: Path) -> Path:
    # 1. Ticker with 1 stale, 1 active, 1 resolved prediction
    ticker_a = {
        "predictions": [
            {
                "id": "pred-1",
                "claim": "Revenue > 1B",
                "target_date": "2026-01-01",
                "resolved": False,
            },
            {
                "id": "pred-2",
                "claim": "EPS > 5.0",
                "target_date": "2026-12-31",
                "resolved": False,
            },
            {
                "id": "pred-3",
                "claim": "Margin > 40%",
                "target_date": "2025-06-01",
                "resolved": True,
            },
        ]
    }
    (tmp_path / "AAPL.json").write_text(json.dumps(ticker_a), encoding="utf-8")

    # 2. Ticker with missing predictions key
    ticker_b = {"ticker": "MSFT"}
    (tmp_path / "MSFT.json").write_text(json.dumps(ticker_b), encoding="utf-8")

    # 3. index.json (should be ignored)
    (tmp_path / "index.json").write_text(
        json.dumps({"tickers": ["AAPL", "MSFT"]}), encoding="utf-8"
    )

    return tmp_path


def test_scan_predictions_finds_stale_and_upcoming(sample_analysis_dir: Path) -> None:
    stale, upcoming = scan_predictions(
        data_dir=sample_analysis_dir,
        as_of=pytest.importorskip("datetime").date(2026, 6, 1),
        warn_days=250,
    )
    assert len(stale) == 1
    assert stale[0]["ticker"] == "AAPL"
    assert stale[0]["id"] == "pred-1"
    assert stale[0]["days_overdue"] == 151

    assert len(upcoming) == 1
    assert upcoming[0]["id"] == "pred-2"
    assert upcoming[0]["days_due"] == 213


def test_scan_predictions_no_stale(sample_analysis_dir: Path) -> None:
    stale, upcoming = scan_predictions(
        data_dir=sample_analysis_dir,
        as_of=pytest.importorskip("datetime").date(2025, 1, 1),
    )
    assert len(stale) == 0


def test_scan_predictions_malformed_target_date(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    bad_data = {
        "predictions": [
            {
                "id": "bad-date-pred",
                "claim": "Some claim",
                "target_date": "not-a-date",
                "resolved": False,
            }
        ]
    }
    (tmp_path / "TEST.json").write_text(json.dumps(bad_data), encoding="utf-8")
    stale, _ = scan_predictions(data_dir=tmp_path)
    assert len(stale) == 0
    captured = capsys.readouterr()
    assert "Warning: malformed target_date in TEST prediction bad-date-pred" in captured.err


def test_main_cli_exit_codes(
    sample_analysis_dir: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    # 1. Fail on stale -> exit 1
    code = main(
        [
            "--data-dir",
            str(sample_analysis_dir),
            "--as-of",
            "2026-06-01",
            "--fail-on-stale",
        ]
    )
    assert code == 1
    out = capsys.readouterr().out
    assert "AAPL pred-1 due 2026-01-01 (151 days overdue): Revenue > 1B" in out
    assert "Summary: 1 stale prediction(s) found across 1 ticker(s)." in out

    # 2. Do not fail on stale -> exit 0
    code = main(
        [
            "--data-dir",
            str(sample_analysis_dir),
            "--as-of",
            "2026-06-01",
        ]
    )
    assert code == 0

    # 3. Clean run with fail-on-stale -> exit 0
    code = main(
        [
            "--data-dir",
            str(sample_analysis_dir),
            "--as-of",
            "2025-01-01",
            "--fail-on-stale",
        ]
    )
    assert code == 0
    out = capsys.readouterr().out
    assert "Summary: 0 stale predictions found." in out
