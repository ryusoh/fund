from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, cast

try:
    import yfinance as yf
except Exception:  # pragma: no cover
    yf = None

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
ANALYSIS_DIR = DATA_DIR / "analysis"
INDEX_FILE = ANALYSIS_DIR / "index.json"
FUND_FILE = DATA_DIR / "fund_data.json"
HOLDINGS_FILE = DATA_DIR / "holdings_details.json"

MARKET_FIELD_MAP = {
    "price": "regularMarketPrice",
    "eps": "trailingEps",
    "forwardEps": "forwardEps",
    "pe": "trailingPE",
    "forwardPe": "forwardPE",
    "pegRatio": "pegRatio",
    "beta": "beta",
    "marketCap": "marketCap",
    "enterpriseValue": "enterpriseValue",
    "ebitda": "ebitda",
    "dividendYield": "dividendYield",
    "currency": "currency",
}

MARKET_EXTRA_KEYS = ["fiftyTwoWeekHigh", "fiftyTwoWeekLow", "marketDataUpdatedAt", "evToEbitda"]

SCHEMA_VERSION = "1.1.0"
MODEL_VERSION = "1.0.0"
ENGINE_DEFAULT = {
    "type": "fermat-pascal-kelly",
    "useMonteCarlo": False,
    "paths": 10000,
    "useBayesianUpdate": False,
}
PREFERENCE_DEFAULTS = {
    "horizon": 5,
    "benchmark": {"type": "annualReturn", "value": 0.065, "name": "SP500_expected"},
    "kellyScale": 0.5,
    "targetCagr": 0.12,
}
CONSTRAINT_DEFAULTS = {"minWeight": 0.0, "maxWeight": 0.3}

DEFAULT_SCENARIOS = [
    {
        "id": "bull",
        "name": "Bull",
        "prob": 0.35,
        "growth": {"epsCagr": 0.18, "epsCagrSigma": None},
        "valuation": {"exitPe": 30, "exitPeSigma": None},
        "notes": None,
    },
    {
        "id": "base",
        "name": "Base",
        "prob": 0.45,
        "growth": {"epsCagr": 0.12, "epsCagrSigma": None},
        "valuation": {"exitPe": 22, "exitPeSigma": None},
        "notes": None,
    },
    {
        "id": "bear",
        "name": "Bear",
        "prob": 0.20,
        "growth": {"epsCagr": 0.03, "epsCagrSigma": None},
        "valuation": {"exitPe": 16, "exitPeSigma": None},
        "notes": None,
    },
]


def load_json(path: Path) -> Dict[str, Any]:
    with path.open('r', encoding='utf-8') as fh:
        return cast(Dict[str, Any], json.load(fh))


def save_json(path: Path, payload: dict) -> None:
    with path.open('w', encoding='utf-8') as fh:
        json.dump(payload, fh, indent=4, ensure_ascii=False)
        fh.write('\n')


def maybe_round(value: Any) -> Any:
    if isinstance(value, (int, float)):
        if abs(value) >= 1_000_000:
            return float(f"{value:.2f}")
        return float(f"{value:.4f}")
    return value


def normalize_benchmark(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return {
            "type": value.get("type", "annualReturn"),
            "value": float(value.get("value", 0) or 0),
            "name": value.get("name", "Benchmark"),
        }
    if isinstance(value, (int, float)):
        return {"type": "annualReturn", "value": float(value), "name": "custom"}
    benchmark = PREFERENCE_DEFAULTS["benchmark"]
    if isinstance(benchmark, dict):
        return {
            "type": benchmark.get("type", "annualReturn"),
            "value": float(benchmark.get("value", 0) or 0),
            "name": benchmark.get("name", "Benchmark"),
        }
    return {"type": "annualReturn", "value": 0.065, "name": "SP500_expected"}


def slugify(name: Any) -> str:
    name_str = str(name) if name is not None else "scenario"
    return "".join(ch.lower() if ch.isalnum() else "-" for ch in name_str).strip("-") or "scenario"


def fetch_market_metadata(symbol: str) -> Dict[str, Any]:  # type: ignore[no-any-return]
    if yf is None:
        return {}
    try:
        ticker = yf.Ticker(symbol)
        # Explicitly cast to Dict[str, Any] to help mypy
        info = cast(Dict[str, Any], ticker.info or {})
        fast = cast(Dict[str, Any], getattr(ticker, 'fast_info', {}) or {})
    except Exception:
        return {}

    result_metadata: Dict[str, Any] = {}  # Changed variable name
    for target, source in MARKET_FIELD_MAP.items():
        current_value: Any
        if target == 'price':
            current_value = fast.get('last_price')
            if current_value is None:
                current_value = info.get(source)
        else:
            current_value = info.get(source)

        if current_value not in (None, 'None'):
            result_metadata[target] = current_value  # Assigned to new variable

    # Handle fiftyTwoWeekHigh
    fifty_two_week_high = fast.get('year_high')
    if fifty_two_week_high is None:
        fifty_two_week_high = info.get('fiftyTwoWeekHigh')
    if fifty_two_week_high not in (None, 'None'):
        result_metadata['fiftyTwoWeekHigh'] = fifty_two_week_high  # Assigned to new variable

    # Handle fiftyTwoWeekLow
    fifty_two_week_low = fast.get('year_low')
    if fifty_two_week_low is None:
        fifty_two_week_low = info.get('fiftyTwoWeekLow')
    if fifty_two_week_low not in (None, 'None'):
        result_metadata['fiftyTwoWeekLow'] = fifty_two_week_low  # Assigned to new variable

    result_metadata['marketDataUpdatedAt'] = datetime.now(
        timezone.utc
    ).isoformat()  # Assigned to new variable
    if hasattr(ticker, "history"):
        try:
            history = ticker.history(period='1y', interval='1d')
            closes = history['Close'].pct_change().dropna()
            if not closes.empty:
                result_metadata['volatility'] = float(
                    closes.std() * (252**0.5)
                )  # Assigned to new variable
        except Exception:
            pass
    return result_metadata  # Returned new variable


def ensure_structure(symbol: str, config: dict) -> dict:
    config = dict(config)
    config['symbol'] = symbol
    config.setdefault('name', symbol)

    meta = config.get('meta')
    if not isinstance(meta, dict):
        meta = {}
    metrics_time = config.pop('metricsUpdatedAt', None)
    meta.setdefault('schemaVersion', SCHEMA_VERSION)
    meta.setdefault('asOf', metrics_time or datetime.now(timezone.utc).isoformat())
    meta.setdefault('timezone', meta.get('timezone', 'UTC'))
    meta.setdefault('source', meta.get('source', 'analysis-sync'))
    config['meta'] = meta

    model = config.get('model')
    if not isinstance(model, dict):
        model = {}
    engine = model.get('engine')
    if not isinstance(engine, dict):
        engine = {}
    for key, value in ENGINE_DEFAULT.items():
        engine.setdefault(key, value)
    preferences = model.get('preferences')
    if not isinstance(preferences, dict):
        preferences = {}
    legacy_manual = config.pop('manual', {}) or {}
    preferences['horizon'] = preferences.get(
        'horizon', legacy_manual.get('horizon', PREFERENCE_DEFAULTS['horizon'])
    )
    preferences['kellyScale'] = preferences.get(
        'kellyScale', legacy_manual.get('kellyScale', PREFERENCE_DEFAULTS['kellyScale'])
    )
    preferences['targetCagr'] = preferences.get(
        'targetCagr', legacy_manual.get('targetCagr', PREFERENCE_DEFAULTS['targetCagr'])
    )
    preferences['benchmark'] = normalize_benchmark(
        preferences.get('benchmark', legacy_manual.get('benchmark'))
    )
    overrides = preferences.get('overrides')
    if not isinstance(overrides, dict):
        overrides = {}
    for field in ('price', 'eps', 'volatility'):
        if field in legacy_manual and legacy_manual[field] not in (None, ''):
            overrides.setdefault(field, legacy_manual[field])
    overrides = {
        key: float(value) for key, value in overrides.items() if isinstance(value, (int, float))
    }
    preferences['overrides'] = overrides
    model['preferences'] = preferences
    model['engine'] = engine
    model.setdefault('version', MODEL_VERSION)
    config['model'] = model

    market = config.get('market')
    if not isinstance(market, dict):
        market = {}
    for key in list(MARKET_FIELD_MAP.keys()) + MARKET_EXTRA_KEYS:
        if key in config and key not in market:
            market[key] = config.pop(key)
    config['market'] = market

    risk = config.get('risk')
    if not isinstance(risk, dict):
        risk = {}
    if 'volatility' not in risk and 'volatility' in market:
        risk['volatility'] = market.get('volatility')
        market.pop('volatility', None)
    if 'volatility' in risk:
        try:
            risk['volatility'] = float(risk['volatility'])
        except (TypeError, ValueError):
            risk['volatility'] = None
    risk.setdefault('estimateSource', 'historical')
    risk.setdefault('correlations', None)
    config['risk'] = risk

    position = config.get('position')
    if not isinstance(position, dict):
        position = {}
    shares_value = config.pop('shares', None)
    if shares_value is None:
        shares_value = legacy_manual.get('shares')
    if shares_value is not None:
        try:
            position['shares'] = float(shares_value)
        except (TypeError, ValueError):
            pass
    position.setdefault('currentWeight', None)
    position.setdefault('targetWeight', None)
    position.setdefault('maxKellyWeight', None)
    position.setdefault('portfolioId', None)
    position.setdefault('constraints', dict(CONSTRAINT_DEFAULTS))
    config['position'] = position

    scenarios = config.get('scenarios')
    if not isinstance(scenarios, list) or not scenarios:
        scenarios = DEFAULT_SCENARIOS
    normalized = []
    for scenario in scenarios:
        if not isinstance(scenario, dict):
            continue
        name_raw = scenario.get('name', scenario.get('id', 'Scenario'))
        name = str(name_raw) if name_raw is not None else 'Scenario'
        id_raw = scenario.get('id')
        scenario_id = slugify(name) if id_raw is None else str(id_raw)
        prob_raw = scenario.get('prob', 0)
        prob = 0.0
        if prob_raw is not None and prob_raw != "":
            if isinstance(prob_raw, (int, float, str)):
                try:
                    prob = float(prob_raw)
                except (TypeError, ValueError):
                    prob = 0.0

        growth_raw = scenario.get('growth', {})
        eps_cagr_raw = (
            growth_raw.get('epsCagr')
            if isinstance(growth_raw, dict)
            else scenario.get('epsCagr', 0)
        )
        eps_cagr = 0.0
        if eps_cagr_raw is not None and eps_cagr_raw != "":
            if isinstance(eps_cagr_raw, (int, float, str)):
                try:
                    eps_cagr = float(eps_cagr_raw)
                except (TypeError, ValueError):
                    eps_cagr = 0.0

        eps_cagr_sigma_raw = (
            growth_raw.get('epsCagrSigma')
            if isinstance(growth_raw, dict)
            else scenario.get('epsCagrSigma')
        )
        eps_cagr_sigma = None
        if eps_cagr_sigma_raw is not None and eps_cagr_sigma_raw != "":
            if isinstance(eps_cagr_sigma_raw, (int, float, str)):
                try:
                    eps_cagr_sigma = float(eps_cagr_sigma_raw)
                except (TypeError, ValueError):
                    eps_cagr_sigma = None

        valuation_raw = scenario.get('valuation', {})
        exit_pe_raw = (
            valuation_raw.get('exitPe')
            if isinstance(valuation_raw, dict)
            else scenario.get('exitPe', 1)
        )
        exit_pe = 1.0
        if exit_pe_raw is not None and exit_pe_raw != "":
            if isinstance(exit_pe_raw, (int, float, str)):
                try:
                    exit_pe = float(exit_pe_raw)
                except (TypeError, ValueError):
                    exit_pe = 1.0

        exit_pe_sigma_raw = (
            valuation_raw.get('exitPeSigma')
            if isinstance(valuation_raw, dict)
            else scenario.get('exitPeSigma')
        )
        exit_pe_sigma = None
        if exit_pe_sigma_raw is not None and exit_pe_sigma_raw != "":
            if isinstance(exit_pe_sigma_raw, (int, float, str)):
                try:
                    exit_pe_sigma = float(exit_pe_sigma_raw)
                except (TypeError, ValueError):
                    exit_pe_sigma = None

        notes = scenario.get('notes')

        normalized.append(
            {
                'id': scenario_id,
                'name': name,
                'prob': prob,
                'growth': {
                    'epsCagr': eps_cagr,
                    'epsCagrSigma': eps_cagr_sigma,
                },
                'valuation': {
                    'exitPe': exit_pe,
                    'exitPeSigma': exit_pe_sigma,
                },
                'notes': notes,
            }
        )
    config['scenarios'] = normalized

    derived = config.get('derived')
    if not isinstance(derived, dict):
        derived = {}
    kelly = derived.get('kelly')
    if not isinstance(kelly, dict):
        kelly = {'fullKelly': None, 'scaledKelly': None}
    else:
        kelly = {'fullKelly': kelly.get('fullKelly'), 'scaledKelly': kelly.get('scaledKelly')}
    config['derived'] = {
        'expectedCagr': derived.get('expectedCagr'),
        'expectedMultiple': derived.get('expectedMultiple'),
        'fairValueRange': derived.get('fairValueRange'),
        'kelly': kelly,
    }
    return config


def main() -> None:
    if not FUND_FILE.exists():
        raise SystemExit(f"Missing fund data file: {FUND_FILE}")
    if not HOLDINGS_FILE.exists():
        raise SystemExit(f"Missing holdings file: {HOLDINGS_FILE}")

    fund_prices = load_json(FUND_FILE)
    holdings = load_json(HOLDINGS_FILE)
    holding_symbols = sorted(holdings.keys())

    for path in ANALYSIS_DIR.glob('*.json'):
        if path.name == 'index.json':
            continue
        if path.stem not in holding_symbols:
            path.unlink()

    updated = 0
    configs_cache: Dict[str, dict] = {}

    for symbol in holding_symbols:
        config_path = ANALYSIS_DIR / f"{symbol}.json"
        if not config_path.exists():
            default_config = {
                'symbol': symbol,
                'name': symbol,
                'meta': {
                    'schemaVersion': SCHEMA_VERSION,
                    'asOf': datetime.now(timezone.utc).isoformat(),
                    'timezone': 'UTC',
                    'source': 'analysis-sync',
                },
                'model': {
                    'version': MODEL_VERSION,
                    'engine': dict(ENGINE_DEFAULT),
                    'preferences': dict(PREFERENCE_DEFAULTS),
                },
                'market': {},
                'risk': {'estimateSource': 'historical', 'correlations': None},
                'position': {
                    'currentWeight': None,
                    'targetWeight': None,
                    'maxKellyWeight': None,
                    'portfolioId': None,
                    'constraints': dict(CONSTRAINT_DEFAULTS),
                },
                'scenarios': DEFAULT_SCENARIOS,
                'derived': {
                    'expectedCagr': None,
                    'expectedMultiple': None,
                    'fairValueRange': None,
                    'kelly': {'fullKelly': None, 'scaledKelly': None},
                },
            }
            save_json(config_path, default_config)

        config = ensure_structure(symbol, load_json(config_path))
        preferences = config['model']['preferences']
        overrides = preferences.get('overrides', {})
        market = config['market']
        changed = False

        price_override = overrides.get('price')
        price = fund_prices.get(symbol)
        market_metadata = fetch_market_metadata(symbol)

        if price_override not in (None, 0):
            manual_price = maybe_round(float(price_override))
            if overrides.get('price') != manual_price:
                overrides['price'] = manual_price
                changed = True
        elif price is not None:
            market_price = maybe_round(float(price))
            if market.get('price') != market_price:
                market['price'] = market_price
                changed = True

        for key, value in market_metadata.items():
            if value in (None, 'None'):
                continue
            normalized = maybe_round(value)
            if key == 'volatility':
                risk = config['risk']
                if risk.get('volatility') != normalized:
                    risk['volatility'] = normalized
                    changed = True
            else:
                if market.get(key) != normalized:
                    market[key] = normalized
                    changed = True

        ev = market.get('enterpriseValue')
        ebitda = market.get('ebitda')
        if isinstance(ev, (int, float)) and isinstance(ebitda, (int, float)) and abs(ebitda) > 1e-6:
            ratio = maybe_round(ev / ebitda)
            if market.get('evToEbitda') != ratio:
                market['evToEbitda'] = ratio
                changed = True

        shares_value = holdings.get(symbol, {}).get('shares')
        if shares_value is not None:
            try:
                shares = float(shares_value)
                position = config['position']
                if position.get('shares') != shares:
                    position['shares'] = shares
                    changed = True
            except ValueError:
                pass

        if changed:
            config['meta']['asOf'] = datetime.now(timezone.utc).isoformat()
            save_json(config_path, config)
            updated += 1
        configs_cache[symbol] = config

    print(f"Updated {updated} analysis config(s)")

    index_payload = {
        'tickers': [
            {
                'symbol': symbol,
                'name': configs_cache.get(symbol, {}).get('name', symbol),
                'path': f"../data/analysis/{symbol}.json",
            }
            for symbol in holding_symbols
        ]
    }
    save_json(INDEX_FILE, index_payload)


if __name__ == "__main__":
    main()
