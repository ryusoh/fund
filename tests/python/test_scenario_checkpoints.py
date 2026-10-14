"""Tests for scenario_checkpoints (scripts.analysis.scenario_checkpoints)."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from scripts.analysis.scenario_checkpoints import build_checkpoints, main


def _config() -> dict:
    return {
        "symbol": "X",
        "market": {"eps": 10.0},
        "model": {"preferences": {"horizon": 2}},
        "scenarios": [
            {"id": "bear", "prob": 0.2, "growth": {"epsCagr": -0.05}},
            {"id": "base", "prob": 0.5, "growth": {"epsCagr": 0.10}},
            {"id": "bull", "prob": 0.3, "growth": {"epsCagr": 0.25}},
        ],
        "predictions": [],
    }


class TestBuildCheckpoints:
    def test_checkpoint_values_and_probabilities(self):
        proposals = build_checkpoints(_config(), date(2026, 1, 1))
        # worst scenario (bear) skipped; base and bull each get 2 years
        assert len(proposals) == 4
        base_fy27 = next(p for p in proposals if p["id"] == "checkpoint:X:fy2027:base")
        assert base_fy27["claim"] == "FY2027 EPS >= 11.0 (base-path checkpoint)"
        assert base_fy27["probability"] == 0.8  # base + bull probability mass
        bull_fy28 = next(p for p in proposals if p["id"] == "checkpoint:X:fy2028:bull")
        assert bull_fy28["claim"] == "FY2028 EPS >= 15.62 (bull-path checkpoint)"
        assert bull_fy28["probability"] == 0.3

    def test_skips_existing_ids(self):
        config = _config()
        config["predictions"] = [{"id": "checkpoint:X:fy2027:base"}]
        proposals = build_checkpoints(config, date(2026, 1, 1))
        assert all(p["id"] != "checkpoint:X:fy2027:base" for p in proposals)

    def test_empty_when_no_eps_or_scenarios(self):
        config = _config()
        config["market"] = {"eps": 0}
        assert build_checkpoints(config, date(2026, 1, 1)) == []
        config = _config()
        config["scenarios"] = [{"id": "weird", "prob": 1.0}]
        assert build_checkpoints(config, date(2026, 1, 1)) == []


def test_main_prints_json(tmp_path: Path, capsys, monkeypatch):
    analysis_dir = tmp_path / "analysis"
    analysis_dir.mkdir()
    (analysis_dir / "X.json").write_text(json.dumps(_config()))
    monkeypatch.setattr("scripts.analysis.scenario_checkpoints.ANALYSIS_DIR", analysis_dir)
    assert main(["--ticker", "X", "--as-of", "2026-01-01"]) == 0
    out = json.loads(capsys.readouterr().out)
    assert len(out) == 4
