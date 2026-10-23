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


def test_drivers_survive_normalization():
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
                    "drivers": {
                        "revenueBuild": [
                            {
                                "id": "ai-backend",
                                "label": "AI back-end Ethernet",
                                "formula": "capex × attach",
                                "inputs": {"capex": 100.0},
                                "valueB": 5.0,
                                "sources": ["10-K"],
                            }
                        ],
                        "derivedRevenueB": 5.0,
                        "netMargin": 0.35,
                        "sharesM": 300.0,
                        "derivedEps": 5.83,
                        "falsifiers": [],
                        "asOf": "2026-10-23",
                    },
                }
            ]
        ),
    )
    assert config["scenarios"][0]["drivers"]["revenueBuild"][0]["id"] == "ai-backend"


def test_drivers_absent_when_not_present():
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
    assert "drivers" not in config["scenarios"][0]
