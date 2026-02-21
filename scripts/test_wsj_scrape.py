import re
import traceback
import urllib.request


def scrape_wsj_forward_pe():
    try:
        url = "https://www.wsj.com/market-data/stocks/peyields"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            },
        )
        content = urllib.request.urlopen(req, timeout=10).read().decode("utf-8")

        print(f"Content length: {len(content)}")

        # Original regex attempt
        match = re.search(
            r"P 500 Index.*?priceEarningsRatioEstimate\"?\s*:\s*\"?([0-9.]+)\"?",
            content,
            re.IGNORECASE | re.DOTALL,
        )
        if match:
            if len(match.group(0)) < 1000:
                print("Found via direct regex!")
                return float(match.group(1))
            else:
                print("Regex matched but distance is too large:", len(match.group(0)))

        print("S&P 500 block search...")
        block_starts = [m.start() for m in re.finditer(r"P 500 Index", content)]
        print(f"P 500 Index found {len(block_starts)} times.")

        for i, start in enumerate(block_starts):
            # Grab a chunk of text after the occurrence
            chunk = content[start : start + 500]
            pe_match = re.search(
                r"priceEarningsRatioEstimate\"?\s*:\s*\"?([0-9.]+)\"?", chunk, re.IGNORECASE
            )
            if pe_match:
                print(f"Found match in occurrence {i+1}!")
                return float(pe_match.group(1))

        print("NO MATCH FOUND")
    except Exception as e:
        print(f"WSJ scrape failed: {e}")
        traceback.print_exc()
    return None


if __name__ == "__main__":
    result = scrape_wsj_forward_pe()
    print(f"S&P 500 Forward PE: {result}")
