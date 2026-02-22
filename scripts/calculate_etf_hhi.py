#!/usr/bin/env python3
"""
Calculate HHI (Herfindahl-Hirschman Index) for ETFs from their holdings data.

Sources:
- Sector allocations: data/fund_sector_allocations.json
- Country allocations: data/fund_country_allocations.json
- Market cap breakdown: data/fund_marketcap_breakdown.json

Methodology:
HHI = Σ(wᵢ²) where wᵢ are the normalized weights (sum to 1.0)
Scale: 0-10000 (multiply by 10000 for traditional US DOJ scale)

For each ETF, we calculate HHI from multiple dimensions and use the maximum
as the most conservative estimate of concentration.
"""

import json
from pathlib import Path


def calculate_hhi(weights_dict):
    """
    Calculate HHI from a dictionary of weights.

    Args:
        weights_dict: dict of {category: weight_percentage}

    Returns:
        float: HHI on 0-10000 scale
    """
    if not weights_dict:
        return None

    # Filter out zero/negative weights and metadata keys
    weights = [
        v
        for k, v in weights_dict.items()
        if not k.startswith('_') and isinstance(v, (int, float)) and v > 0
    ]

    if not weights:
        return None

    # Normalize to sum to 1.0
    total = sum(weights)
    if total <= 0:
        return None

    normalized = [w / total for w in weights]

    # HHI = Σ(wᵢ²)
    hhi = sum(w * w for w in normalized)

    # Scale to 0-10000
    return round(hhi * 10000, 0)


def load_json_file(filepath):
    """Load JSON file if it exists."""
    path = Path(filepath)
    if path.exists():
        with open(path, 'r') as f:
            return json.load(f)
    return None


def calculate_etf_hhi(etf_ticker, sector_data, country_data, marketcap_data):
    """
    Calculate HHI for an ETF from available data sources.

    Returns:
        dict: HHI values from different dimensions with sources
    """
    results = {}

    # Sector HHI
    if etf_ticker in sector_data:
        sector_hhi = calculate_hhi(sector_data[etf_ticker])
        if sector_hhi:
            results['sector'] = {
                'hhi': int(sector_hhi),
                'source': 'data/fund_sector_allocations.json',
                'note': 'Calculated from sector allocation weights',
            }

    # Country HHI
    if etf_ticker in country_data:
        country_hhi = calculate_hhi(country_data[etf_ticker])
        if country_hhi:
            results['country'] = {
                'hhi': int(country_hhi),
                'source': 'data/fund_country_allocations.json',
                'note': 'Calculated from country allocation weights',
            }

    # Market cap HHI
    if etf_ticker in marketcap_data:
        mc_data = marketcap_data[etf_ticker]
        # Filter to just the market cap categories
        mc_weights = {
            k: v
            for k, v in mc_data.items()
            if k
            in [
                'Mega Cap',
                'Large Cap',
                'Mid Cap',
                'Small Cap',
                'Bond',
                'Commodity',
                'Real Estate',
                'Cash/Other',
            ]
        }
        if mc_weights:
            mc_hhi = calculate_hhi(mc_weights)
            if mc_hhi:
                results['marketcap'] = {
                    'hhi': int(mc_hhi),
                    'source': 'data/fund_marketcap_breakdown.json',
                    'note': 'Calculated from market cap distribution',
                }

    return results


def get_conservative_hhi(dimensions):
    """
    Get the most conservative (highest) HHI from available dimensions.

    For diversification adjustment, we want to be conservative and not
    overstate the diversification benefit. Using the maximum HHI across
    dimensions ensures this.
    """
    if not dimensions:
        return None, None

    max_hhi = 0
    max_source = None

    for _, data in dimensions.items():
        hhi = data.get('hhi', 0)
        if hhi > max_hhi:
            max_hhi = hhi
            max_source = data.get('source', 'unknown')

    return max_hhi, max_source


def main():
    print("Calculating ETF HHI from holdings data...")
    print("=" * 70)

    # Load data sources
    sector_data = load_json_file('data/fund_sector_allocations.json') or {}
    country_data = load_json_file('data/fund_country_allocations.json') or {}
    marketcap_data = load_json_file('data/fund_marketcap_breakdown.json') or {}

    # Get all ETF tickers
    all_tickers = set(sector_data.keys()) | set(country_data.keys()) | set(marketcap_data.keys())

    # Remove metadata keys
    all_tickers = {t for t in all_tickers if not t.startswith('_')}

    print(f"Processing {len(all_tickers)} ETFs...")
    print()

    results = {}

    for ticker in sorted(all_tickers):
        dimensions = calculate_etf_hhi(ticker, sector_data, country_data, marketcap_data)

        if dimensions:
            conservative_hhi, source = get_conservative_hhi(dimensions)

            results[ticker] = {
                'hhi': conservative_hhi,
                'source': source,
                'dimensions': dimensions,
                'note': f'Max HHI across {len(dimensions)} dimensions',
            }

            dim_summary = ', '.join([f"{k}: {v['hhi']}" for k, v in dimensions.items()])
            print(f"{ticker}: HHI = {conservative_hhi} ({dim_summary})")
        else:
            print(f"{ticker}: No data available")

    print()
    print("=" * 70)

    # Save results
    output_path = Path('data/etf_hhi_data.json')

    data = {
        '_comment': 'ETF HHI values calculated from holdings data',
        '_scale': '0-10000 (traditional US DOJ scale)',
        '_methodology': 'HHI = Σ(wᵢ²) × 10000, using maximum across sector/country/marketcap dimensions',
        '_sources': {
            'sector': 'data/fund_sector_allocations.json',
            'country': 'data/fund_country_allocations.json',
            'marketcap': 'data/fund_marketcap_breakdown.json',
        },
        '_usage': 'For portfolio HHI: weight² × (ETF_HHI / 10000)',
        'etf_hhi': results,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"\nSaved to {output_path}")
    print(f"Processed: {len(results)} ETFs with HHI data")


if __name__ == '__main__':
    main()
