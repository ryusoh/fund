import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path


def fetch_vt_sectors():
    """Fetch VT sector breakdown from StockAnalysis using ScraperAPI if available."""
    target_url = "https://stockanalysis.com/etf/vt/holdings/"
    scraper_api_key = os.environ.get("SCRAPER_API_KEY")

    if scraper_api_key:
        print("Using ScraperAPI for fetching...")
        payload = {
            'api_key': scraper_api_key,
            'url': target_url,
            'country_code': 'us',
        }
        url = 'http://api.scraperapi.com/?' + urllib.parse.urlencode(payload)
    else:
        print("ScraperAPI key not found, fetching directly (may be blocked)...")
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
        print(f"Error fetching VT data: {e}")
        return None

    # StockAnalysis embeds data in a script tag as JSON
    match = re.search(r'allocationChartData:\{sectors:(\[.*?\])', content)
    if not match:
        print("Could not find allocationChartData in the page content.")
        # Debug: print snippet if failed
        print(f"Content snippet: {content[:500]}")
        return None

    try:
        js_data = match.group(1)
        # Convert JS-like object to valid JSON (keys without quotes)
        json_data = re.sub(r'(\w+):', r'"\1":', js_data)
        sectors_list = json.loads(json_data)
    except Exception as e:
        print(f"Error parsing sector JSON: {e}")
        return None

    # Normalization map to match our app's sector names
    name_map = {
        "Information Technology": "Technology",
        "Financials": "Financials",
        "Health Care": "Healthcare",
        "Consumer Discretionary": "Consumer Cyclical",
        "Industrials": "Industrials",
        "Communication Services": "Communication Services",
        "Consumer Staples": "Consumer Defensive",
        "Materials": "Basic Materials",
        "Energy": "Energy",
        "Utilities": "Utilities",
        "Real Estate": "Real Estate",
    }

    sectors = {}
    others_total = 0.0

    for item in sectors_list:
        name = item.get("name")
        value = item.get("y")

        if not name or value is None:
            continue

        normalized_name = name_map.get(name, name)

        if normalized_name == "Other" or normalized_name == "Others":
            others_total += value
        elif normalized_name in name_map.values():
            sectors[normalized_name] = value
        else:
            others_total += value

    if not sectors:
        print("No recognized sectors found.")
        return None

    # Ensure we have an Others category if there's remaining weight
    current_sum = sum(sectors.values())
    if others_total > 0:
        sectors["Others"] = round(others_total, 2)
    elif current_sum < 99.9:
        sectors["Others"] = round(100.0 - current_sum, 2)

    return sectors


def update_json(new_sectors):
    """Update data/fund_sector_allocations.json with new VT data."""
    json_path = Path("data/fund_sector_allocations.json")
    if not json_path.exists():
        print(f"Error: {json_path} not found.")
        return False

    with open(json_path, "r") as f:
        data = json.load(f)

    data["VT"] = new_sectors

    with open(json_path, "w") as f:
        json.dump(data, f, indent=4)

    print("Updated data/fund_sector_allocations.json with latest VT sectors.")
    return True


def main():
    print("Fetching latest VT sector composition from StockAnalysis...")
    sectors = fetch_vt_sectors()

    if sectors:
        print(f"Found sectors: {json.dumps(sectors, indent=2)}")
        if update_json(sectors):
            print("Regenerating composition data...")
            try:
                python_exe = sys.executable
                if "venv" not in python_exe:
                    project_root = Path(__file__).parent.parent
                    venv_python = project_root / "venv" / "bin" / "python3"
                    if venv_python.exists():
                        python_exe = str(venv_python)

                subprocess.run([python_exe, "scripts/generate_composition_data.py"], check=True)
                print("Successfully updated and regenerated all data.")
            except Exception as e:
                print(f"Error regenerating data: {e}")
    else:
        print("Failed to fetch VT sectors.")


if __name__ == "__main__":
    main()
