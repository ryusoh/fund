#!/usr/bin/env python3
"""
Fetch VT's HHI (Herfindahl-Hirschman Index) from ETFRC.com.
This is the most reliable source for VT's concentration data.
"""

import json
import os
import re
import sys
import urllib.parse
from datetime import datetime
from pathlib import Path

import requests

sys.path.append(str(Path(__file__).resolve().parent))
from utils.security_utils import scrub_secrets

ETFRC_URL = "https://www.etfrc.com/VT"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
}

# ETFRC labels the metric "Herfindahl-Hirschman Index" (the old "HHI" label is
# gone from the page). The value sits in the following <td> of the same row.
HHI_PATTERNS = [
    r'Herfindahl-Hirschman Index.*?</td>\s*<td[^>]*>\s*(\d+)',
    r'<td[^>]*>HHI</td>\s*<td[^>]*>(\d+)</td>',
]


def _extract_hhi(content: str) -> int | None:
    for pattern in HHI_PATTERNS:
        match = re.search(pattern, content, re.IGNORECASE | re.DOTALL)
        if match:
            return int(match.group(1))
    return None


def _fetch(url: str, timeout: int, secrets_to_scrub: list[str] | None = None) -> str | None:
    try:
        response = requests.get(url, headers=HEADERS, timeout=timeout)
        response.raise_for_status()
        return response.text
    except Exception as e:
        error_msg = str(e)
        if secrets_to_scrub:
            error_msg = scrub_secrets(error_msg, secrets_to_scrub)
        print(f"Error fetching {ETFRC_URL}: {error_msg}")
        return None


def fetch_vt_hhi_from_etfrc() -> int | None:
    """
    Fetch VT HHI value from ETFRC.com.
    Returns HHI on 0-10000 scale.

    The page is static HTML, so a direct fetch is tried first; ScraperAPI
    (without JS rendering) is the fallback for datacenter-IP blocks. The
    previous ScraperAPI-first strategy with render=true timed out every
    weekly run while the plain page served fine.
    """
    content = _fetch(ETFRC_URL, timeout=30)

    if content is None:
        scraper_api_key = os.environ.get("SCRAPER_API_KEY")
        if not scraper_api_key:
            return None
        payload = {
            'api_key': scraper_api_key,
            'url': ETFRC_URL,
            'country_code': 'us',
        }
        # Security fix: use HTTPS to prevent insecure transmission of API keys
        fetch_url = 'https://api.scraperapi.com/?' + urllib.parse.urlencode(payload)
        content = _fetch(fetch_url, timeout=60, secrets_to_scrub=[scraper_api_key])

    if content is None:
        return None

    return _extract_hhi(content)


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
        json.dump(data, f, indent=2, ensure_ascii=False)

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
                return
            print("✗ Failed to update JSON file")
            sys.exit(1)
        else:
            print(f"⚠ Warning: HHI={hhi} seems high for VT (expected < 100)")
            print("  This may indicate a parsing error or fund composition change")
            sys.exit(1)
    else:
        print("✗ Failed to fetch VT HHI from ETFRC.com")
        # Fail loud: this fetch stayed silently broken for 8 months because the
        # workflow step is continue-on-error and the script used to exit 0.
        sys.exit(1)


if __name__ == '__main__':
    main()
