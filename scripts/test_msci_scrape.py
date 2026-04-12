import re

import requests


def scrape_msci_pe_data():
    url = "https://www.msci.com/indexes/index/990100"
    headers = {
        "User-Agent": "Mozilla/5.0 AppleWebKit/537.36",
        "Accept": "text/html",
    }
    response = requests.get(url, headers=headers, timeout=10)
    response.raise_for_status()
    content = response.text

    result = {}

    # Extract forward PE (labeled "P/E Fwd")
    fwd_match = re.search(r"P/E Fwd.{0,200}?([0-9]+\.[0-9]+)", content, re.IGNORECASE | re.DOTALL)
    if fwd_match:
        result["forward_pe"] = float(fwd_match.group(1))
        print(f"Forward PE matched: {result['forward_pe']}")

    # Extract trailing PE (labeled "P/E" but NOT "P/E Fwd")
    trailing_match = re.search(
        r"P/E(?!\s*Fwd).{0,200}?([0-9]+\.[0-9]+)", content, re.IGNORECASE | re.DOTALL
    )
    if trailing_match:
        result["trailing_pe"] = float(trailing_match.group(1))
        print(f"Trailing PE matched: {result['trailing_pe']}")

    if "trailing_pe" in result and "forward_pe" in result and result["forward_pe"] > 0:
        result["ratio"] = round(result["trailing_pe"] / result["forward_pe"], 4)
        print(f"Ratio (trailing/fwd): {result['ratio']}")

    return result if result else None


if __name__ == "__main__":
    result = scrape_msci_pe_data()
    if result:
        print(f"\nMSCI PE Data: {result}")
    else:
        print("\nFailed to scrape MSCI PE data")
