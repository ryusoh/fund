"""Cross-language parity tests between sync_configs.py and decision.js."""

from __future__ import annotations

import copy
import json
import subprocess
from pathlib import Path
from typing import Any, cast

from scripts.analysis import sync_configs

ROOT = Path(__file__).resolve().parents[2]
DECISION_JS = ROOT / "js" / "pages" / "analysis" / "decision.js"


def _run_js_metrics(configs: list[dict]) -> list[dict]:
    script = (
        f"import {{ computeMetrics }} from {json.dumps(DECISION_JS.as_uri())};\n"
        "const configs = JSON.parse(process.argv[1]);\n"
        "const out = configs.map((cfg) => {\n"
        "  const m = computeMetrics(cfg);\n"
        "  return {\n"
        "    symbol: cfg.symbol || null,\n"
        "    expectedMultiple: m.expectedMultiple,\n"
        "    expectedCagr: m.expectedCagr,\n"
        "    fullKelly: m.fullKelly,\n"
        "    scaledKelly: m.scaledKelly,\n"
        "  };\n"
        "});\n"
        "process.stdout.write(JSON.stringify(out));\n"
    )
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script, json.dumps(configs)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return cast(list[dict[str, Any]], json.loads(proc.stdout))


def _assert_parity(py_val: float | None, js_val: float | None, label: str) -> None:
    if py_val is None or js_val is None:
        assert py_val is None and js_val is None, f"{label}: py={py_val}, js={js_val}"
        return
    assert abs(py_val - js_val) < 1e-4, f"{label}: py={py_val}, js={js_val}"


def test_python_js_math_parity_on_live_and_edge_configs() -> None:
    live_symbols = ["AEHR", "ANET", "CBRS", "GOOG", "PDD", "VT"]
    configs: list[dict] = [
        json.loads((ROOT / "data" / "analysis" / f"{sym}.json").read_text(encoding="utf-8"))
        for sym in live_symbols
    ]

    # Synthetic edge cases: sigma=0 discrete limit, missing volatility, all-winning cap saturation,
    # non-positive EPS, and reinvested dividend yield.
    configs.extend(
        [
            {
                "symbol": "SIGMA0",
                "model": {"preferences": {"horizon": 5, "kellyScale": 0.5, "riskFreeRate": 0.04}},
                "market": {"price": 100.0, "eps": 5.0, "dividendYield": 2.0},
                "risk": {"volatility": 0.0},
                "scenarios": [
                    {
                        "id": "bull",
                        "name": "Bull",
                        "prob": 0.6,
                        "growth": {"epsCagr": 0.15},
                        "valuation": {"exitPe": 25.0},
                    },
                    {
                        "id": "bear",
                        "name": "Bear",
                        "prob": 0.4,
                        "growth": {"epsCagr": 0.0},
                        "valuation": {"exitPe": 12.0},
                    },
                ],
            },
            {
                "symbol": "NOVOL",
                "model": {"preferences": {"horizon": 5, "kellyScale": 0.5}},
                "market": {"price": 100.0, "eps": 5.0, "dividendYield": 1.5},
                "risk": {},
                "scenarios": [
                    {
                        "id": "base",
                        "name": "Base",
                        "prob": 1.0,
                        "growth": {"epsCagr": 0.1},
                        "valuation": {"exitPe": 20.0},
                    }
                ],
            },
            {
                "symbol": "ALLWIN",
                "model": {"preferences": {"horizon": 3, "kellyScale": 0.5}},
                "market": {"price": 50.0, "eps": 5.0, "dividendYield": 0.0},
                "risk": {"volatility": 0.0},
                "scenarios": [
                    {
                        "id": "bull",
                        "name": "Bull",
                        "prob": 0.5,
                        "growth": {"epsCagr": 0.2},
                        "valuation": {"exitPe": 20.0},
                    },
                    {
                        "id": "base",
                        "name": "Base",
                        "prob": 0.5,
                        "growth": {"epsCagr": 0.15},
                        "valuation": {"exitPe": 18.0},
                    },
                ],
            },
            {
                "symbol": "NEGEPS",
                "model": {"preferences": {"horizon": 5, "kellyScale": 0.5}},
                "market": {"price": 50.0, "eps": -2.0},
                "risk": {"volatility": 0.5},
                "scenarios": [
                    {
                        "id": "base",
                        "name": "Base",
                        "prob": 1.0,
                        "growth": {"epsCagr": 0.1},
                        "valuation": {"exitPe": 20.0},
                    }
                ],
            },
        ]
    )

    js_results = _run_js_metrics(configs)
    assert len(js_results) == len(configs)

    for cfg, js_out in zip(configs, js_results, strict=True):
        py_cfg = copy.deepcopy(cfg)
        sync_configs.recompute_derived(py_cfg)
        py_derived = py_cfg["derived"]
        py_kelly = py_derived["kelly"]
        sym = cfg["symbol"]
        _assert_parity(
            py_derived["expectedMultiple"], js_out["expectedMultiple"], f"{sym}.multiple"
        )
        _assert_parity(py_derived["expectedCagr"], js_out["expectedCagr"], f"{sym}.expectedCagr")
        _assert_parity(py_kelly["fullKelly"], js_out["fullKelly"], f"{sym}.fullKelly")
        _assert_parity(py_kelly["scaledKelly"], js_out["scaledKelly"], f"{sym}.scaledKelly")
