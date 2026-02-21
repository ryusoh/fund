#!/usr/bin/env python3
"""
Fetch country allocations for ETFs from stockanalysis.com using ScraperAPI.
Similar to update_vt_sectors.py but for country breakdowns.
"""

import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path


def fetch_etf_country_allocation(etf_ticker: str) -> dict:
    """
    Fetch country allocation for an ETF from stockanalysis.com.

    Args:
        etf_ticker: ETF ticker symbol (e.g., 'VT', 'VWO', 'VEA')

    Returns:
        Dictionary of {country: percentage}
    """
    target_url = f"https://stockanalysis.com/etf/{etf_ticker.lower()}/holdings/"
    scraper_api_key = os.environ.get("SCRAPER_API_KEY")

    if scraper_api_key:
        print(f"  Using ScraperAPI for {etf_ticker}...")
        payload = {
            'api_key': scraper_api_key,
            'url': target_url,
            'country_code': 'us',
        }
        url = 'http://api.scraperapi.com/?' + urllib.parse.urlencode(payload)
    else:
        print(f"  ScraperAPI key not found, fetching directly for {etf_ticker}...")
        url = target_url

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            content = response.read().decode("utf-8")
    except Exception as e:
        print(f"  Error fetching {etf_ticker}: {e}")
        return {}

    # StockAnalysis embeds country data in JavaScript
    # Look for patterns like: countries:[{name:"United States",y:62.5}, ...]
    # Or: allocationByCountry:[{name:"United States",value:62.5}, ...]

    country_data = {}

    # Try different patterns
    patterns = [
        r'countries:\s*\[(.*?)\]',
        r'allocationByCountry:\s*\[(.*?)\]',
        r'countryAllocation:\s*\[(.*?)\]',
        r'geographicAllocation:\s*\[(.*?)\]',
    ]

    for pattern in patterns:
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            try:
                js_data = '[' + match.group(1) + ']'
                # Convert JS-like object to valid JSON
                js_data = re.sub(r'(\w+):', r'"\1":', js_data)
                js_data = re.sub(r"'([^']*)'", r'"\1"', js_data)
                countries_list = json.loads(js_data)

                for item in countries_list:
                    name = item.get('name')
                    value = item.get('y') or item.get('value')
                    if name and value is not None:
                        country_data[name] = float(value)

                if country_data:
                    print(f"  Found {len(country_data)} countries for {etf_ticker}")
                    break
            except Exception as e:
                print(f"  Error parsing JSON for {etf_ticker}: {e}")
                continue

    if not country_data:
        print(f"  No country data found for {etf_ticker}")
        return {}

    return country_data


def normalize_country_name(country: str) -> str:
    """Normalize country names for consistency."""
    if not country:
        return 'Other'

    country = country.strip()

    normalizations = {
        'USA': 'United States',
        'US': 'United States',
        'United States': 'United States',
        'United States of America': 'United States',
        'UK': 'United Kingdom',
        'United Kingdom': 'United Kingdom',
        'Great Britain': 'United Kingdom',
        'China': 'China',
        'PRC': 'China',
        'Hong Kong': 'Hong Kong',
        'Hongkong': 'Hong Kong',
        'Japan': 'Japan',
        'Germany': 'Germany',
        'France': 'France',
        'Switzerland': 'Switzerland',
        'Canada': 'Canada',
        'Australia': 'Australia',
        'India': 'India',
        'South Korea': 'South Korea',
        'Korea': 'South Korea',
        'Taiwan': 'Taiwan',
        'Singapore': 'Singapore',
        'Netherlands': 'Netherlands',
        'Sweden': 'Sweden',
        'Denmark': 'Denmark',
        'Norway': 'Norway',
        'Finland': 'Finland',
        'Spain': 'Spain',
        'Italy': 'Italy',
        'Brazil': 'Brazil',
        'Mexico': 'Mexico',
        'Israel': 'Israel',
        'Ireland': 'Ireland',
        'Luxembourg': 'Luxembourg',
        'Cayman Islands': 'Cayman Islands',
        'Bermuda': 'Bermuda',
    }

    country_lower = country.lower()
    return normalizations.get(country_lower, country)


def main():
    """Main function to fetch country allocations for ETFs."""
    # ETFs to fetch country data for
    etfs_to_fetch = [
        'VT',  # Total World
        'VWO',  # Emerging Markets
        'IEMG',  # Emerging Markets
        'VEA',  # Developed Markets
        'VTMGX',  # Developed Markets
        'ICLN',  # Clean Energy
        'SOXX',  # Semiconductors
        'ASHR',  # China A-Shares
    ]

    # Load existing allocations
    allocations_path = Path('data/fund_country_allocations.json')
    if allocations_path.exists():
        with open(allocations_path, 'r') as f:
            allocations = json.load(f)
    else:
        allocations = {}

    print(f"Fetching country allocations for {len(etfs_to_fetch)} ETFs...")
    print()

    for etf in etfs_to_fetch:
        country_data = fetch_etf_country_allocation(etf)

        if country_data:
            # Normalize country names
            normalized = {}
            for country, pct in country_data.items():
                norm_country = normalize_country_name(country)
                normalized[norm_country] = pct

            allocations[etf] = normalized
            print(f"  {etf}: {len(normalized)} countries")
        else:
            print(f"  {etf}: Failed to fetch")

        print()

    # Save to file
    allocations_path.parent.mkdir(parents=True, exist_ok=True)
    with open(allocations_path, 'w') as f:
        json.dump(allocations, f, indent=2)

    print(f"Saved country allocations to {allocations_path}")
    print()
    print("Sample allocations:")
    for etf, countries in list(allocations.items())[:3]:
        print(f"  {etf}:")
        for country, pct in sorted(countries.items(), key=lambda x: -x[1])[:5]:
            print(f"    {country}: {pct}%")


if __name__ == '__main__':
    main()
