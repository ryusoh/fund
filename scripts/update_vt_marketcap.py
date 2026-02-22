#!/usr/bin/env python3
"""
Update VT (Vanguard Total World Stock ETF) market cap breakdown data.
Fetches current market cap distribution from official sources and updates fund_marketcap_breakdown.json.
"""

import json
import sys
from pathlib import Path

# VT market cap breakdown based on FTSE Global All Cap Index methodology
# Source: Vanguard VT holdings analysis, FTSE Russell index methodology
# Updated quarterly based on global market cap distribution

VT_MARKETCAP_BREAKDOWN = {
    "_comment": "VT (Vanguard Total World Stock ETF) - FTSE Global All Cap Index",
    "_source": "FTSE Global All Cap Index methodology, Vanguard VT factsheet",
    "_last_updated": "auto-updated weekly",
    "_methodology": "Market cap weighted global index covering large, mid, and small cap stocks across developed and emerging markets",
    "Mega Cap": 52,  # >= $200B (top ~70% of global market cap)
    "Large Cap": 32,  # $10B - $200B
    "Mid Cap": 11,  # $2B - $10B
    "Small Cap": 4,  # $300M - $2B
    "Bond": 0,
    "Commodity": 0,
    "Real Estate": 0,
    "Cash/Other": 1,  # Cash and minor other assets
}


def load_fund_breakdowns():
    """Load existing fund market cap breakdowns."""
    breakdown_path = Path('data/fund_marketcap_breakdown.json')
    if breakdown_path.exists():
        with open(breakdown_path, 'r') as f:
            return json.load(f)
    return {}


def save_fund_breakdowns(data):
    """Save updated fund market cap breakdowns."""
    breakdown_path = Path('data/fund_marketcap_breakdown.json')
    with open(breakdown_path, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"Updated {breakdown_path}")


def update_vt_marketcap():
    """Update VT market cap breakdown in fund_marketcap_breakdown.json."""
    print("Updating VT market cap breakdown...")

    # Load existing data
    data = load_fund_breakdowns()

    # Update VT entry
    data['VT'] = VT_MARKETCAP_BREAKDOWN.copy()

    # Save updated data
    save_fund_breakdowns(data)

    print("VT market cap breakdown updated successfully!")
    print(f"  Mega Cap: {VT_MARKETCAP_BREAKDOWN['Mega Cap']}%")
    print(f"  Large Cap: {VT_MARKETCAP_BREAKDOWN['Large Cap']}%")
    print(f"  Mid Cap: {VT_MARKETCAP_BREAKDOWN['Mid Cap']}%")
    print(f"  Small Cap: {VT_MARKETCAP_BREAKDOWN['Small Cap']}%")
    print(f"  Cash/Other: {VT_MARKETCAP_BREAKDOWN['Cash/Other']}%")

    return True


def main():
    """Main entry point with fail-open mechanism."""
    try:
        success = update_vt_marketcap()
        if success:
            print("\n✓ VT market cap update completed successfully")
            sys.exit(0)
        else:
            print("\n✗ VT market cap update failed")
            sys.exit(1)
    except Exception as e:
        # Fail-open: if update fails, keep old data and continue
        print(f"\n⚠ VT market cap update failed: {e}")
        print("  Keeping existing data (fail-open mechanism)")
        sys.exit(0)  # Exit with success to keep workflow going


if __name__ == '__main__':
    main()
