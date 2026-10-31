"""Propose dated EPS-checkpoint predictions from scenario configs.

Reads data/analysis/<TICKER>.json and prints proposed prediction entries as
JSON to stdout. Never writes anything — a human/agent appends accepted entries
to the config's predictions array (the nightly sync passes predictions through
untouched). Design: docs/research/kelly-tier-b-design.md, Design 4.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Any

ANALYSIS_DIR = Path(__file__).resolve().parents[2] / "data" / "analysis"


def load_config(ticker: str, analysis_dir: Path | None = None) -> dict[str, Any]:
    directory = analysis_dir or ANALYSIS_DIR
    with open(directory / f"{ticker.upper()}.json") as f:
        config: dict[str, Any] = json.load(f)
    return config


def _extract_valid_scenarios(config: dict[str, Any]) -> list[dict[str, Any]]:
    scenarios = [
        s
        for s in (config.get("scenarios") or [])
        if isinstance(s.get("growth"), dict)
        and isinstance(s["growth"].get("epsCagr"), (int, float))
    ]
    scenarios.sort(key=lambda s: float(s["growth"]["epsCagr"]))
    return scenarios


def _get_existing_prediction_ids(config: dict[str, Any]) -> set[str]:
    return {str(p.get("id")) for p in (config.get("predictions") or []) if isinstance(p, dict) and p.get("id") is not None}


def _build_scenario_proposals(
    scenario: dict[str, Any],
    idx: int,
    scenarios: list[dict[str, Any]],
    total_prob: float,
    eps: float,
    symbol: str,
    horizon: int,
    as_of: date,
    existing_ids: set[str]
) -> list[dict[str, Any]]:
    proposals = []
    g = float(scenario["growth"]["epsCagr"])
    prob = sum(float(s.get("prob") or 0) for s in scenarios[idx:]) / total_prob
    sid = scenario.get("id") or scenario.get("name") or f"s{idx}"
    for t in range(1, horizon + 1):
        year = as_of.year + t
        checkpoint = round(eps * (1 + g) ** t, 2)
        pred_id = f"checkpoint:{symbol}:fy{year}:{sid}"
        if pred_id in existing_ids:
            continue
        proposals.append(
            {
                "id": pred_id,
                "claim": f"FY{year} EPS >= {checkpoint} ({sid}-path checkpoint)",
                "target_date": f"{year}-12-31",
                "probability": round(prob, 4),
                "resolved": False,
                "outcome": None,
                "notes": f"auto-proposed {as_of.isoformat()} from scenario '{sid}'",
            }
        )
    return proposals

def _extract_config_params(config: dict[str, Any]) -> tuple[str, float, int]:
    symbol = str(config.get("symbol", "?")).upper()
    market = config.get("market") or {}
    eps = float(market.get("eps") or 0)
    preferences = (config.get("model") or {}).get("preferences") or {}
    horizon = int(preferences.get("horizon") or 5)
    return symbol, eps, horizon


def build_checkpoints(config: dict[str, Any], as_of: date) -> list[dict[str, Any]]:
    symbol, eps, horizon = _extract_config_params(config)

    scenarios = _extract_valid_scenarios(config)
    if eps <= 0 or not scenarios:
        return []

    total_prob = sum(float(s.get("prob") or 0) for s in scenarios)
    if total_prob <= 0:
        return []

    existing_ids = _get_existing_prediction_ids(config)
    proposals = []
    # The worst scenario's checkpoint is almost surely cleared; skip it.
    for idx, scenario in enumerate(scenarios[1:], start=1):
        proposals.extend(
            _build_scenario_proposals(
                scenario, idx, scenarios, total_prob, eps, symbol, horizon, as_of, existing_ids
            )
        )
    return proposals


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ticker", required=True)
    parser.add_argument("--as-of", default=date.today().isoformat())
    args = parser.parse_args(argv)
    as_of = date.fromisoformat(args.as_of)
    proposals = build_checkpoints(load_config(args.ticker), as_of)
    json.dump(proposals, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
