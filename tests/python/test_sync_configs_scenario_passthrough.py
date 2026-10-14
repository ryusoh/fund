"""Tests for scenario field passthrough in ensure_structure (sync_configs)."""

from __future__ import annotations

from scripts.analysis.sync_configs import ensure_structure


def _config(scenarios: list[dict]) -> dict:
    return {"scenarios": scenarios, "market": {"price": 100.0, "eps": 5.0}}


def test_macro_state_survives_normalization():
    config = ensure_structure(
        "X",
        _config(
            [
                {
                    "id": "bear",
                    "name": "Bear",
                    "prob": 0.2,
                    "macroState": "risk-off",
                    "growth": {"epsCagr": -0.1},
                    "valuation": {"exitPe": 12},
                }
            ]
        ),
    )
    assert config["scenarios"][0]["macroState"] == "risk-off"


def test_macro_state_defaults_to_none():
    config = ensure_structure(
        "X",
        _config(
            [
                {
                    "id": "base",
                    "name": "Base",
                    "prob": 0.6,
                    "growth": {"epsCagr": 0.1},
                    "valuation": {"exitPe": 15},
                }
            ]
        ),
    )
    assert config["scenarios"][0]["macroState"] is None
