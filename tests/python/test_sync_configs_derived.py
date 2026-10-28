"""Tests for recompute_derived in sync_configs (ports the lab.js engine formula)."""

from __future__ import annotations

import pytest

from scripts.analysis.sync_configs import recompute_derived


def _config() -> dict:
    return {
        "model": {"preferences": {"horizon": 5, "overrides": {}}},
        "market": {"price": 100.0, "eps": 5.0},
        "scenarios": [
            {
                "id": "bull",
                "prob": 0.5,
                "growth": {"epsCagr": 0.2},
                "valuation": {"exitPe": 30.0},
            },
            {
                "id": "bear",
                "prob": 0.5,
                "growth": {"epsCagr": 0.0},
                "valuation": {"exitPe": 10.0},
            },
        ],
        "derived": {"fairValueRange": [80.0, 120.0], "kelly": {"fullKelly": 0.1}},
    }


def test_recompute_matches_engine_formula():
    config = _config()
    assert recompute_derived(config) is True
    bull_multiple = 5.0 * 1.2**5 * 30.0 / 100.0
    bear_multiple = 5.0 * 1.0**5 * 10.0 / 100.0
    expected_multiple = 0.5 * bull_multiple + 0.5 * bear_multiple
    assert config["derived"]["expectedMultiple"] == pytest.approx(expected_multiple, abs=1e-4)
    assert config["derived"]["expectedCagr"] == pytest.approx(
        expected_multiple ** (1 / 5) - 1, abs=1e-4
    )


def test_recompute_is_idempotent():
    config = _config()
    recompute_derived(config)
    assert recompute_derived(config) is False


def test_overrides_take_precedence_over_market():
    config = _config()
    config["model"]["preferences"]["overrides"] = {"price": 200.0, "eps": 10.0}
    recompute_derived(config)
    bull_multiple = 10.0 * 1.2**5 * 30.0 / 200.0
    bear_multiple = 10.0 * 1.0**5 * 10.0 / 200.0
    expected_multiple = 0.5 * bull_multiple + 0.5 * bear_multiple
    assert config["derived"]["expectedMultiple"] == pytest.approx(expected_multiple, abs=1e-4)


def test_missing_market_data_yields_none():
    config = _config()
    config["market"] = {}
    recompute_derived(config)
    assert config["derived"]["expectedCagr"] is None
    assert config["derived"]["expectedMultiple"] is None


def test_stale_values_are_corrected_and_judgment_fields_preserved():
    config = _config()
    config["derived"]["expectedCagr"] = 0.0728
    config["derived"]["expectedMultiple"] = 28.85
    assert recompute_derived(config) is True
    assert config["derived"]["expectedCagr"] != 0.0728
    assert config["derived"]["fairValueRange"] == [80.0, 120.0]
    assert config["derived"]["kelly"] == {"fullKelly": 0.1}
