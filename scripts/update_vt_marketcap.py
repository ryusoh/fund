#!/usr/bin/env python3
"""
Update VT (Vanguard Total World Stock ETF) market cap breakdown from ETFRC.com.

ETFRC publishes VT's cap-band weights on the same fund page used for HHI:
    Large cap (>$10bn) / Mid cap ($2-10bn) / Small cap (<$2bn)

The dashboard taxonomy splits Large into Mega (>= $200B) and Large ($10-200B),
which no public source exposes for VT; the Mega:Large ratio from the previous
file is reapplied to the freshly fetched Large total. The file is only
rewritten when a value actually changed, so unchanged weeks produce no commit.
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent))
from update_vt_hhi import ETFRC_URL, _fetch

BREAKDOWN_PATH = Path('data/fund_marketcap_breakdown.json')

# Row shape: <tr><td>Large cap (&gt;$10bn)</td><td align="right">86.9%</td></tr>
CAP_ROW_PATTERN = r'<td>\s*(Large|Mid|Small) cap\b.*?</td>\s*<td[^>]*>\s*([\d.]+)%'

CATEGORIES = [
    'Mega Cap',
    'Large Cap',
    'Mid Cap',
    'Small Cap',
    'Bond',
    'Commodity',
    'Real Estate',
    'Cash/Other',
]

# Plausibility bounds for VT (a total-world equity fund)
SANITY_BOUNDS = {
    'large': (70.0, 95.0),
    'mid': (2.0, 20.0),
    'small': (0.0, 10.0),
}


def fetch_vt_cap_bands() -> dict[str, float] | None:
    """Fetch VT's Large/Mid/Small cap weights from ETFRC. Returns percents."""
    content = _fetch(ETFRC_URL, timeout=30)
    if content is None:
        return None

    bands = {}
    for label, pct in re.findall(CAP_ROW_PATTERN, content, re.IGNORECASE | re.DOTALL):
        bands[label.lower()] = float(pct)

    if not all(k in bands for k in ('large', 'mid', 'small')):
        print(f"Error: could not parse all cap bands from ETFRC (got {sorted(bands)})")
        return None

    for name, (lo, hi) in SANITY_BOUNDS.items():
        if not lo <= bands[name] <= hi:
            print(f"Error: {name} cap {bands[name]}% outside sanity bounds {lo}-{hi}")
            return None

    return bands


def mega_ratio(existing: dict) -> float:
    """Mega share of the Mega+Large total in the previous breakdown."""
    try:
        vt = existing.get('VT', {})
        mega, large = float(vt.get('Mega Cap', 0)), float(vt.get('Large Cap', 0))
        if mega + large > 0:
            return mega / (mega + large)
    except (TypeError, ValueError):
        pass
    return 0.62  # default split when no usable previous breakdown exists


def build_breakdown(bands: dict[str, float], ratio: float) -> dict:
    """Map ETFRC's 3 bands onto the dashboard's 8 categories (int percents)."""
    large_total = round(bands['large'])
    mega = round(large_total * ratio)
    large = large_total - mega
    mid = round(bands['mid'])
    small = round(bands['small'])
    cash = max(0, 100 - mega - large - mid - small)
    return {
        '_comment': 'VT (Vanguard Total World Stock ETF) - FTSE Global All Cap Index',
        '_source': 'ETFRC.com cap bands; Mega split from Large via previous ratio',
        '_last_updated': datetime.now().strftime('%Y-%m-%d'),
        '_methodology': 'Market cap weighted global index covering large, mid, and small cap stocks across developed and emerging markets',
        'Mega Cap': mega,
        'Large Cap': large,
        'Mid Cap': mid,
        'Small Cap': small,
        'Bond': 0,
        'Commodity': 0,
        'Real Estate': 0,
        'Cash/Other': cash,
    }


def breakdown_changed(existing: dict, new: dict) -> bool:
    """Compare only the category values, not the metadata stamps."""
    vt = existing.get('VT', {})
    return any(vt.get(cat) != new[cat] for cat in CATEGORIES)


def main() -> int:
    print("Fetching VT market cap breakdown from ETFRC.com...")

    bands = fetch_vt_cap_bands()
    if bands is None:
        print("✗ Failed to fetch VT cap bands; keeping existing data")
        return 1

    existing = {}
    if BREAKDOWN_PATH.exists():
        with open(BREAKDOWN_PATH, 'r') as f:
            existing = json.load(f)

    new_vt = build_breakdown(bands, mega_ratio(existing))

    if not breakdown_changed(existing, new_vt):
        print(
            f"✓ VT market cap breakdown unchanged (Large {bands['large']}%, "
            f"Mid {bands['mid']}%, Small {bands['small']}%)"
        )
        return 0

    existing['VT'] = new_vt
    with open(BREAKDOWN_PATH, 'w') as f:
        json.dump(existing, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print(f"✓ Updated {BREAKDOWN_PATH}")
    for cat in CATEGORIES:
        print(f"  {cat}: {new_vt[cat]}%")
    return 0


if __name__ == '__main__':
    sys.exit(main())
