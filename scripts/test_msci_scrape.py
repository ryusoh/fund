import urllib.request
import re
import traceback


def scrape_msci_forward_pe():
    url = "https://www.msci.com/indexes/index/990100"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 AppleWebKit/537.36",
            "Accept": "text/html",
        },
    )
    content = urllib.request.urlopen(req, timeout=10).read().decode("utf-8")

    match = re.search(r"P/E Fwd.{0,200}?([0-9]+\.[0-9]+)", content, re.IGNORECASE | re.DOTALL)
    if match:
        print(f"Matched directly! Value: {match.group(1)}")
        return float(match.group(1))
    else:
        print("Regex failed to match.")

    return None


if __name__ == "__main__":
    result = scrape_msci_forward_pe()
    print(f"MSCI Forward PE: {result}")
