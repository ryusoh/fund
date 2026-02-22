#!/usr/bin/env python3
"""
Fetch VT's HHI (Herfindahl-Hirschman Index) from ETFRC.com.
This is the most reliable source for VT's concentration data.
"""

import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path


def fetch_vt_hhi_from_etfrc() -> int | None:
    """
    Fetch VT HHI value from ETFRC.com.
    Returns HHI on 0-10000 scale.
    """
    url = "https://www.etfrc.com/fund/holdings.php?ticker=VT"
    scraper_api_key = os.environ.get("SCRAPER_API_KEY")

    if scraper_api_key:
        payload = {
            'api_key': scraper_api_key,
            'url': url,
            'country_code': 'us',
        }
        fetch_url = 'http://api.scraperapi.com/?' + urllib.parse.urlencode(payload)
    else:
        print("Warning: SCRAPER_API_KEY not set, fetching directly (may be blocked)")
        fetch_url = url

    req = urllib.request.Request(
        fetch_url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            content = response.read().decode("utf-8")
    except Exception as e:
        print(f"Error fetching from ETFRC: {e}")
        return None

    # ETFRC shows HHI in the fund overview section
    # Pattern: <td>HHI</td><td>62</td>
    pattern = r'<td[^>]*>HHI</td>\s*<td[^>]*>(\d+)</td>'
    match = re.search(pattern, content, re.IGNORECASE)

    if match:
        return int(match.group(1))

    # Alternative pattern
    pattern2 = r'HHI[^0-9]*(\d+)'
    match2 = re.search(pattern2, content, re.IGNORECASE)
    if match2:
        return int(match2.group(1))

    return None


def update_etf_hhi_json(hhi_value: int):
    """Update data/etf_hhi.json with the new VT HHI value."""
    json_path = Path('data/etf_hhi.json')

    if not json_path.exists():
        print(f"Error: {json_path} not found")
        return False

    with open(json_path, 'r') as f:
        data = json.load(f)

    # Update VT HHI
    old_hhi = data.get('VT')
    data['VT'] = hhi_value

    # Update metadata
    data['_last_verified'] = datetime.now().strftime('%Y-%m-%d')
    data['_VT_source'] = f'ETFRC.com - fetched weekly, HHI={hhi_value}'

    # Save updated data
    with open(json_path, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"Updated VT HHI: {old_hhi} → {hhi_value}")
    return True


def main():
    print("Fetching VT HHI from ETFRC.com...")

    hhi = fetch_vt_hhi_from_etfrc()

    if hhi:
        print(f"VT HHI = {hhi}")

        # Sanity check: VT HHI should be low (highly diversified)
        if hhi < 500:
            print("✓ HHI value looks reasonable for a diversified global fund")

            if update_etf_hhi_json(hhi):
                print("✓ Successfully updated data/etf_hhi.json")
            else:
                print("✗ Failed to update JSON file")
        else:
            print(f"⚠ Warning: HHI={hhi} seems high for VT (expected < 100)")
            print("  This may indicate a parsing error or fund composition change")
    else:
        print("✗ Failed to fetch VT HHI from ETFRC.com")
        print("  Keeping existing value in data/etf_hhi.json")


if __name__ == '__main__':
    main()
