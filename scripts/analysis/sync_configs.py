from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

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

DEFAULT_SCENARIOS = [
    {"name": "Bull", "prob": 0.35, "epsCagr": 0.18, "exitPe": 30},
    {"name": "Base", "prob": 0.45, "epsCagr": 0.12, "exitPe": 22},
    {"name": "Bear", "prob": 0.20, "epsCagr": 0.03, "exitPe": 16},
]

MANUAL_DEFAULTS = {
    "horizon": 5,
    "benchmark": 0.065,
    "kellyScale": 0.5,
    "targetCagr": 0.12,
}


def load_json(path: Path) -> dict:
    with path.open('r', encoding='utf-8') as fh:
        return json.load(fh)


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


def fetch_market_metadata(symbol: str) -> Dict[str, Any]:
    if yf is None:
        return {}
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info or {}
        fast = getattr(ticker, 'fast_info', {}) or {}
    except Exception:
        return {}

    metadata: Dict[str, Any] = {}
    for target, source in MARKET_FIELD_MAP.items():
        if target == 'price':
            value = fast.get('last_price') or info.get(source)
        else:
            value = info.get(source)
        if value not in (None, 'None'):
            metadata[target] = value

    metadata['fiftyTwoWeekHigh'] = fast.get('year_high') or info.get('fiftyTwoWeekHigh')
    metadata['fiftyTwoWeekLow'] = fast.get('year_low') or info.get('fiftyTwoWeekLow')
    metadata['marketDataUpdatedAt'] = datetime.now(timezone.utc).isoformat()
    if hasattr(ticker, "history"):
        try:
            history = ticker.history(period='1y', interval='1d')
            closes = history['Close'].pct_change().dropna()
            if not closes.empty:
                metadata['volatility'] = float(closes.std() * (252**0.5))
        except Exception:
            pass
    return metadata


def ensure_structure(symbol: str, config: dict) -> dict:
    manual = config.get('manual')
    if not isinstance(manual, dict):
        manual = {}
    for key, default in MANUAL_DEFAULTS.items():
        if key in config and key not in manual:
            manual[key] = config.pop(key)
        manual.setdefault(key, default)
    config['manual'] = manual

    market = config.get('market')
    if not isinstance(market, dict):
        market = {}
    for key in list(MARKET_FIELD_MAP.keys()) + MARKET_EXTRA_KEYS:
        if key in config and key not in market:
            market[key] = config.pop(key)
    for transient in ("price", "eps", "volatility"):
        value = manual.pop(transient, None)
        if value not in (None, 0):
            market.setdefault(transient, value)
    config['market'] = market

    config['symbol'] = symbol
    config.setdefault('name', symbol)
    config.setdefault('scenarios', DEFAULT_SCENARIOS)
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
                'manual': {**MANUAL_DEFAULTS},
                'market': {},
                'scenarios': DEFAULT_SCENARIOS,
            }
            save_json(config_path, default_config)

        config = ensure_structure(symbol, load_json(config_path))
        manual = config['manual']
        market = config['market']
        changed = False

        price_override = manual.get('price')
        price = fund_prices.get(symbol)
        market_metadata = fetch_market_metadata(symbol)

        if price_override not in (None, 0):
            manual_price = maybe_round(float(price_override))
            if manual.get('price') != manual_price:
                manual['price'] = manual_price
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
                if config.get('shares') != shares:
                    config['shares'] = shares
                    changed = True
            except ValueError:
                pass

        if changed:
            config['metricsUpdatedAt'] = datetime.now(timezone.utc).isoformat()
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
