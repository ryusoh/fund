"""Tests for derived total-return metrics and GH-7 Kelly sizing."""

from __future__ import annotations

import copy
import json
import math
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from scripts.analysis import sync_configs

ROOT = Path(__file__).resolve().parents[2]


def _config() -> dict:
    return {
        "model": {"preferences": {"horizon": 5, "overrides": {}}},
        "market": {"price": 100.0, "eps": 5.0},
        "risk": {"volatility": 0.2},
        "scenarios": [
            {
                "id": "bull",
                "name": "Bull",
                "prob": 0.5,
                "growth": {"epsCagr": 0.2},
                "valuation": {"exitPe": 30.0},
            },
            {
                "id": "bear",
                "name": "Bear",
                "prob": 0.5,
                "growth": {"epsCagr": 0.0},
                "valuation": {"exitPe": 10.0},
            },
        ],
        "derived": {"fairValueRange": [80.0, 120.0], "kelly": {"fullKelly": 0.1}},
        "belief_state": {"probability": 0.5, "confidence": 0.8},
    }


def _scenario_returns(config: dict) -> list[tuple[float, float]]:
    preferences = config["model"]["preferences"]
    overrides = preferences.get("overrides", {})
    market = config["market"]
    price = overrides.get("price", market["price"])
    eps = overrides.get("eps", market["eps"])
    horizon = preferences["horizon"]
    dividend_rate = market.get("dividendYield", 0.0) / 100.0
    returns = []
    for scenario in config["scenarios"]:
        if str(scenario.get("name", "")).startswith("RETIRED"):
            continue
        multiple = (
            eps
            * (1 + scenario["growth"]["epsCagr"]) ** horizon
            * scenario["valuation"]["exitPe"]
            / price
            * (1 + dividend_rate) ** horizon
        )
        returns.append((scenario["prob"], multiple ** (1 / horizon) - 1))
    return returns


def _reference_kelly(
    states: list[tuple[float, float]], risk_free_rate: float = 0.04, cap: float = 1.0
) -> float:
    hi = cap
    for _, annual_return in states:
        if annual_return < risk_free_rate:
            hi = min(
                hi,
                (1 + risk_free_rate) / (risk_free_rate - annual_return) * (1 - 1e-7),
            )

    def derivative(fraction: float) -> float:
        return sum(
            probability
            * (annual_return - risk_free_rate)
            / (1 + risk_free_rate + fraction * (annual_return - risk_free_rate))
            for probability, annual_return in states
        )

    if derivative(0.0) <= 0:
        return 0.0
    if derivative(hi) >= 0:
        return hi
    lo = 0.0
    for _ in range(80):
        midpoint = (lo + hi) / 2
        if derivative(midpoint) > 0:
            lo = midpoint
        else:
            hi = midpoint
    return (lo + hi) / 2


def _reference_gh_kelly(
    scenario_returns: list[tuple[float, float]],
    sigma: float,
    order: int,
    risk_free_rate: float = 0.04,
) -> float:
    nodes, raw_weights = np.polynomial.hermite_e.hermegauss(order)
    scaled_weights = raw_weights / math.sqrt(2 * math.pi)
    states = [
        (
            probability * float(weight),
            (1 + annual_return) * math.exp(sigma * float(node) - 0.5 * sigma**2) - 1,
        )
        for probability, annual_return in scenario_returns
        for node, weight in zip(nodes, scaled_weights, strict=True)
    ]
    return _reference_kelly(states, risk_free_rate=risk_free_rate)


def test_recompute_matches_engine_formula():
    config = _config()
    assert sync_configs.recompute_derived(config) is True
    bull_multiple = 5.0 * 1.2**5 * 30.0 / 100.0
    bear_multiple = 5.0 * 1.0**5 * 10.0 / 100.0
    expected_multiple = 0.5 * bull_multiple + 0.5 * bear_multiple
    assert config["derived"]["expectedMultiple"] == pytest.approx(expected_multiple, abs=1e-4)
    assert config["derived"]["expectedCagr"] == pytest.approx(
        expected_multiple ** (1 / 5) - 1, abs=1e-4
    )


def test_recompute_is_idempotent():
    config = _config()
    sync_configs.recompute_derived(config)
    assert sync_configs.recompute_derived(config) is False


def test_overrides_take_precedence_over_market():
    config = _config()
    config["model"]["preferences"]["overrides"] = {"price": 200.0, "eps": 10.0}
    sync_configs.recompute_derived(config)
    bull_multiple = 10.0 * 1.2**5 * 30.0 / 200.0
    bear_multiple = 10.0 * 1.0**5 * 10.0 / 200.0
    expected_multiple = 0.5 * bull_multiple + 0.5 * bear_multiple
    assert config["derived"]["expectedMultiple"] == pytest.approx(expected_multiple, abs=1e-4)


def test_missing_market_data_yields_none():
    config = _config()
    config["market"] = {}
    sync_configs.recompute_derived(config)
    assert config["derived"]["expectedCagr"] is None
    assert config["derived"]["expectedMultiple"] is None
    assert config["derived"]["kelly"] == {"fullKelly": None, "scaledKelly": None}


def test_stale_values_are_corrected_and_judgment_fields_preserved():
    config = _config()
    config["derived"]["expectedCagr"] = 0.0728
    config["derived"]["expectedMultiple"] = 28.85
    belief_state = dict(config["belief_state"])
    assert sync_configs.recompute_derived(config) is True
    assert config["derived"]["expectedCagr"] != 0.0728
    assert config["derived"]["expectedMultiple"] != 28.85
    assert config["derived"]["kelly"]["fullKelly"] != 0.1
    assert config["derived"]["fairValueRange"] == [80.0, 120.0]
    assert config["belief_state"] == belief_state


@pytest.mark.parametrize("intact_prob", [None, 0.0, 0.85])
def test_ensure_structure_preserves_optional_thesis_intact_probability(intact_prob):
    config = _config()
    config["belief_state"]["custom_judgment_note"] = "keep-me"
    if intact_prob is not None:
        config["belief_state"]["thesis_intact_probability"] = intact_prob
    normalized = sync_configs.ensure_structure("TEST", config)
    assert normalized["belief_state"]["custom_judgment_note"] == "keep-me"
    if intact_prob is None:
        assert "thesis_intact_probability" not in normalized["belief_state"]
    else:
        assert normalized["belief_state"]["thesis_intact_probability"] == pytest.approx(intact_prob)


def test_live_configs_round_trip_through_ensure_structure_without_key_loss():
    analysis_dir = ROOT / "data" / "analysis"
    live_paths = [
        p for p in sorted(analysis_dir.glob("[A-Z]*.json")) if not p.name.endswith(".history.json")
    ]
    assert len(live_paths) >= 6
    for path in live_paths:
        raw = json.loads(path.read_text(encoding="utf-8"))
        symbol = str(raw["symbol"])
        normalized = sync_configs.ensure_structure(symbol, copy.deepcopy(raw))
        assert set(raw.keys()).issubset(
            set(normalized.keys())
        ), f"top-level key dropped in {symbol}"
        for section in ("belief_state", "derived", "position", "model"):
            if isinstance(raw.get(section), dict):
                assert set(raw[section].keys()).issubset(
                    set(normalized[section].keys())
                ), f"{section} key dropped in {symbol}"
        for idx, scenario in enumerate(raw.get("scenarios", [])):
            assert set(scenario.keys()).issubset(
                set(normalized["scenarios"][idx].keys())
            ), f"scenario[{idx}] key dropped in {symbol}"


def test_etf_eps_is_derived_when_fresh_metadata_omits_it():
    market = {"price": 144.96, "pe": 18.0755, "eps": 6.22}
    assert sync_configs.derive_market_eps(market, {}) is True
    assert market["eps"] == pytest.approx(8.0197, abs=1e-4)


def test_etf_eps_derivation_preserves_fresh_eps_and_rejects_invalid_pe():
    market = {"price": 100.0, "pe": 20.0, "eps": 5.0}
    assert sync_configs.derive_market_eps(market, {"eps": 5.0}) is False
    assert market["eps"] == 5.0
    market["pe"] = 0.0
    assert sync_configs.derive_market_eps(market, {}) is False
    assert market["eps"] == 5.0


@pytest.mark.parametrize(
    ("source_unit", "source_value"),
    [("percentage-points", 1.56), ("fraction", 0.0156)],
)
def test_dividend_yield_is_normalized_at_ingestion(monkeypatch, source_unit, source_value):
    ticker = SimpleNamespace(
        info={"regularMarketPrice": 144.96, "trailingPE": 18.0755, "dividendYield": source_value},
        fast_info={"last_price": 144.96},
    )
    monkeypatch.setattr(sync_configs, "yf", SimpleNamespace(Ticker=lambda _symbol: ticker))
    metadata = sync_configs.fetch_market_metadata("VT", dividend_yield_unit=source_unit)
    assert metadata["dividendYield"] == pytest.approx(1.56)


def test_percentage_point_dividends_compound_into_total_return():
    config = _config()
    config["market"]["dividendYield"] = 1.56
    sync_configs.recompute_derived(config)
    price_only_multiple = 0.5 * (5.0 * 1.2**5 * 30.0 / 100.0) + 0.5 * (5.0 * 10.0 / 100.0)
    expected_multiple = price_only_multiple * 1.0156**5
    assert config["derived"]["expectedMultiple"] == pytest.approx(expected_multiple, abs=1e-4)
    assert config["derived"]["expectedCagr"] == pytest.approx(
        expected_multiple ** (1 / 5) - 1, abs=1e-4
    )


def test_zero_volatility_uses_discrete_kelly_and_configured_scale():
    config = _config()
    config["risk"]["volatility"] = 0.0
    preferences = config["model"]["preferences"]
    preferences["riskFreeRate"] = 0.03
    preferences["kellyScale"] = 0.25
    sync_configs.recompute_derived(config)
    expected = _reference_kelly(_scenario_returns(config), risk_free_rate=0.03)
    assert config["derived"]["kelly"]["fullKelly"] == pytest.approx(expected, abs=0.000051)
    assert config["derived"]["kelly"]["scaledKelly"] == pytest.approx(expected * 0.25, abs=0.000101)


@pytest.mark.parametrize("sigma", [None, -0.1, math.nan, math.inf, "0.2"])
def test_invalid_volatility_returns_no_kelly(sigma):
    assert sync_configs.solve_gh7_kelly([(1.0, 0.1)], sigma) is None


def test_missing_volatility_clears_kelly_but_preserves_expected_metrics():
    config = _config()
    config["risk"] = {}
    sync_configs.recompute_derived(config)
    assert config["derived"]["expectedMultiple"] is not None
    assert config["derived"]["kelly"] == {"fullKelly": None, "scaledKelly": None}


def test_all_winning_states_saturate_at_cap_without_losing_state_bound():
    assert sync_configs.solve_gh7_kelly([(1.0, 0.1)], 0.0) == pytest.approx(1.0)


def test_positive_edge_with_losing_states_can_saturate_at_cap():
    scenario_returns = [(0.99, 1.0), (0.01, -0.5)]
    assert sync_configs.solve_gh7_kelly(scenario_returns, 0.2, cap=0.4) == pytest.approx(0.4)


@pytest.mark.parametrize(
    "scenario_returns",
    [[(0.5, 0.1), (0.4, 0.2)], [(-0.1, 0.1), (1.1, 0.2)], [(1.0, -1.0)]],
)
def test_invalid_scenario_returns_return_no_kelly(scenario_returns):
    assert sync_configs.solve_gh7_kelly(scenario_returns, 0.2) is None


def test_invalid_preferences_yield_none_instead_of_crashing():
    config = _config()
    config["model"]["preferences"] = None
    sync_configs.recompute_derived(config)
    assert config["derived"]["expectedCagr"] is None
    assert config["derived"]["expectedMultiple"] is None
    assert config["derived"]["kelly"] == {"fullKelly": None, "scaledKelly": None}


def test_all_retired_scenarios_return_no_derived_metrics():
    config = _config()
    for scenario in config["scenarios"]:
        scenario["name"] = f"RETIRED – {scenario['name']}"
    sync_configs.recompute_derived(config)
    assert config["derived"]["expectedCagr"] is None
    assert config["derived"]["expectedMultiple"] is None
    assert config["derived"]["kelly"] == {"fullKelly": None, "scaledKelly": None}


@pytest.mark.parametrize("symbol", ["GOOG", "ANET", "PDD", "VT", "AEHR"])
def test_gh7_matches_gh80_on_live_active_profiles(symbol):
    config = json.loads((ROOT / "data" / "analysis" / f"{symbol}.json").read_text())
    scenario_returns = _scenario_returns(config)
    sigma = (
        config["model"]["preferences"]
        .get("overrides", {})
        .get("volatility", config["risk"]["volatility"])
    )
    risk_free_rate = config["model"]["preferences"].get("riskFreeRate", 0.04)
    expected = _reference_gh_kelly(scenario_returns, sigma, 80, risk_free_rate=risk_free_rate)
    actual = sync_configs.solve_gh7_kelly(scenario_returns, sigma, risk_free_rate=risk_free_rate)
    assert actual == pytest.approx(expected, abs=0.0001)


def test_unknown_dividend_unit_is_rejected_and_missing_value_passes_through():
    with pytest.raises(ValueError, match="Unsupported dividend yield unit"):
        sync_configs.normalize_dividend_yield(1.56, source_unit="unknown")
    assert sync_configs.normalize_dividend_yield(None) is None
    assert sync_configs.normalize_dividend_yield("not-reported") == "not-reported"


def test_eps_derivation_is_idempotent():
    market = {"price": 100.0, "pe": 20.0, "eps": 5.0}
    original = dict(market)
    assert sync_configs.derive_market_eps(market, {}) is False
    assert market == original


@pytest.mark.parametrize(
    ("solver_kwargs", "expected"),
    [
        ({"risk_free_rate": -1.0}, None),
        ({"cap": -1.0}, None),
        ({"cap": 0.0}, 0.0),
    ],
)
def test_solver_validates_rate_and_cap(solver_kwargs, expected):
    actual = sync_configs.solve_gh7_kelly([(1.0, 0.1)], 0.0, **solver_kwargs)
    assert actual == expected


def test_zero_probability_scenarios_are_skipped():
    scenario_returns = [(0.0, 1.0), (1.0, 0.1)]
    assert sync_configs.solve_gh7_kelly(scenario_returns, 0.0) == pytest.approx(1.0)


@pytest.mark.parametrize("sigma", [1000.0, 1e308])
def test_extreme_volatility_fails_closed(sigma):
    assert sync_configs.solve_gh7_kelly([(1.0, 0.1)], sigma) is None


def _assert_no_derived_metrics(config):
    assert config["derived"]["expectedCagr"] is None
    assert config["derived"]["expectedMultiple"] is None
    assert config["derived"]["kelly"] == {"fullKelly": None, "scaledKelly": None}


@pytest.mark.parametrize(
    ("field_path", "value"),
    [
        (("model", "preferences", "overrides"), None),
        (("model", "preferences", "horizon"), None),
        (("market", "dividendYield"), math.nan),
        (("scenarios", 0), "invalid"),
        (("scenarios", 0, "growth"), None),
        (("scenarios", 0, "growth", "epsCagr"), -1.0),
        (("scenarios", 0, "valuation", "exitPe"), -1.0),
        (("scenarios", 0, "prob"), -0.1),
        (("scenarios", 0, "valuation", "exitPe"), 5e-324),
        (("scenarios", 1, "prob"), 0.4),
    ],
)
def test_malformed_derived_inputs_fail_closed(field_path, value):
    config = _config()
    target = config
    for key in field_path[:-1]:
        target = target[key]
    target[field_path[-1]] = value
    sync_configs.recompute_derived(config)
    _assert_no_derived_metrics(config)


def test_missing_dividend_defaults_to_zero():
    config = _config()
    config["market"]["dividendYield"] = None
    sync_configs.recompute_derived(config)
    expected_multiple = 0.5 * (5.0 * 1.2**5 * 30.0 / 100.0) + 0.5 * (5.0 * 10.0 / 100.0)
    assert config["derived"]["expectedMultiple"] == pytest.approx(expected_multiple, abs=1e-4)


def test_missing_derived_block_is_initialized():
    config = _config()
    config["derived"] = None
    assert sync_configs.recompute_derived(config) is True
    assert config["derived"]["expectedMultiple"] is not None
    assert config["derived"]["expectedCagr"] is not None


def test_malformed_risk_block_preserves_wealth_metrics_but_clears_kelly():
    config = _config()
    config["risk"] = None
    sync_configs.recompute_derived(config)
    assert config["derived"]["expectedMultiple"] is not None
    assert config["derived"]["expectedCagr"] is not None
    assert config["derived"]["kelly"] == {"fullKelly": None, "scaledKelly": None}


def test_main_derives_vt_eps_when_metadata_omits_it(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    analysis_dir = data_dir / "analysis"
    analysis_dir.mkdir(parents=True)
    (data_dir / "fund_data.json").write_text(json.dumps({"VT": 144.96}), encoding="utf-8")
    (data_dir / "holdings_details.json").write_text(
        json.dumps({"VT": {"shares": "1.0"}}), encoding="utf-8"
    )
    config = json.loads((ROOT / "data" / "analysis" / "VT.json").read_text(encoding="utf-8"))
    config["market"].update({"price": 144.96, "pe": 18.0755, "eps": 6.22, "dividendYield": 1.56})
    (analysis_dir / "VT.json").write_text(json.dumps(config), encoding="utf-8")

    monkeypatch.setattr(sync_configs, "FUND_FILE", data_dir / "fund_data.json")
    monkeypatch.setattr(sync_configs, "HOLDINGS_FILE", data_dir / "holdings_details.json")
    monkeypatch.setattr(sync_configs, "ANALYSIS_DIR", analysis_dir)
    monkeypatch.setattr(sync_configs, "INDEX_FILE", analysis_dir / "index.json")
    monkeypatch.setattr(sync_configs, "WATCHLIST_FILE", analysis_dir / "watchlist.json")
    monkeypatch.setattr(sync_configs, "fetch_market_metadata", lambda _symbol: {})

    sync_configs.main()

    regenerated = json.loads((analysis_dir / "VT.json").read_text(encoding="utf-8"))
    assert regenerated["market"]["eps"] == pytest.approx(8.0197, abs=1e-4)
