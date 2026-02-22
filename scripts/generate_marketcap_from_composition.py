#!/usr/bin/env python3
"""
Generate market cap composition from composition percentages.
Uses composition.json data and fund_marketcap_breakdown.json to calculate market cap distribution.
"""

import json
import sys
from pathlib import Path


def main():
    """Generate market cap data from composition percentages."""
    print("Generating market cap composition from composition data...")

    # Load composition data
    composition_path = Path('data/output/figures/composition.json')
    if not composition_path.exists():
        print(f"⚠ {composition_path} not found, skipping market cap generation")
        return True

    with open(composition_path, 'r') as f:
        composition_data = json.load(f)

    # Load fund breakdowns
    fund_mc_path = Path('data/fund_marketcap_breakdown.json')
    if not fund_mc_path.exists():
        print(f"⚠ {fund_mc_path} not found, skipping market cap generation")
        return True

    with open(fund_mc_path, 'r') as f:
        fund_market_caps = json.load(f)

    # Load market caps for individual stocks
    market_cap_path = Path('data/market_caps.json')
    market_caps = {}
    if market_cap_path.exists():
        with open(market_cap_path, 'r') as f:
            market_caps = json.load(f)

    dates = composition_data['dates']
    num_dates = len(dates)
    composition = composition_data.get('series', {})
    total_values = composition_data.get('total_values', [0] * num_dates)

    # Categories
    categories = [
        'Mega Cap',
        'Large Cap',
        'Mid Cap',
        'Small Cap',
        'Bond',
        'Commodity',
        'Real Estate',
        'Cash/Other',
    ]
    mc_percent_series = {cat: [0.0] * num_dates for cat in categories}

    for ticker, pct_values in composition.items():
        ticker_upper = ticker.upper()

        if ticker_upper in ('OTHERS', 'CASH', 'NET_OTHER_ASSETS'):
            for i, pct in enumerate(pct_values):
                if pct > 0:
                    mc_percent_series['Cash/Other'][i] += pct
            continue

        if ticker_upper in fund_market_caps:
            mc_breakdown = {
                k: v for k, v in fund_market_caps[ticker_upper].items() if not k.startswith('_')
            }
        elif ticker_upper in market_caps:
            mc = market_caps[ticker_upper] / 1e9
            if mc >= 200:
                mc_breakdown = {'Mega Cap': 100}
            elif mc >= 10:
                mc_breakdown = {'Large Cap': 100}
            elif mc >= 2:
                mc_breakdown = {'Mid Cap': 100}
            elif mc >= 0.3:
                mc_breakdown = {'Small Cap': 100}
            else:
                mc_breakdown = {'Cash/Other': 100}
        else:
            mc_breakdown = {'Large Cap': 100}

        for i, pct in enumerate(pct_values):
            if pct > 0:
                for cat, cat_pct in mc_breakdown.items():
                    if cat in mc_percent_series:
                        mc_percent_series[cat][i] += pct * (cat_pct / 100.0)

    output = {'dates': dates, 'series': mc_percent_series, 'total_values': total_values}

    output_path = Path('data/output/figures/marketcap.json')
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"✓ Market cap data saved to {output_path}")

    # Print summary
    latest_idx = -1
    print("\nLatest market cap breakdown:")
    for cat in categories:
        pct = mc_percent_series[cat][latest_idx]
        bar = '█' * int(pct / 2)
        print(f"  {cat:15s} {pct:6.2f}%  {bar}")

    total = sum(mc_percent_series[cat][latest_idx] for cat in categories)
    print(f"  {'TOTAL':15s} {total:6.2f}%")

    return True


if __name__ == '__main__':
    try:
        success = main()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"⚠ Market cap generation failed: {e}")
        print("  Keeping existing data (fail-open mechanism)")
        sys.exit(0)  # Exit with success to keep workflow going
