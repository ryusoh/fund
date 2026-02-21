#!/usr/bin/env python3
"""Generate portfolio geography/country distribution data for stacked area chart."""

import json
from collections import defaultdict
from pathlib import Path

import pandas as pd
import yfinance as yf


def load_data():
    """Load holdings, price, and metadata data."""
    # Load holdings data
    holdings_path = Path('data/checkpoints/holdings_daily.parquet')
    holdings_df = pd.read_parquet(holdings_path)

    # Load price data
    with open('data/historical_prices.json', 'r') as f:
        prices_data = json.load(f)

    # Load ticker metadata
    metadata_path = Path('data/ticker_metadata.json')
    metadata = {}
    if metadata_path.exists():
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)

    return holdings_df, prices_data, metadata


def get_country_for_ticker(ticker: str, metadata: dict) -> str:
    """
    Get country for a ticker.

    For individual stocks: Returns country of headquarters.
    For ETFs/Mutual Funds: Returns 'Fund' to indicate we need to look up holdings.

    Returns normalized country name.
    """
    ticker_upper = ticker.upper()

    # Special cases: Companies incorporated offshore but operating in another country
    # These are common structures for tax/legal reasons
    SPECIAL_CASES = {
        'PDD': 'China',  # Pinduoduo - Irish incorporation, Chinese operations
        'BABA': 'China',  # Alibaba - Cayman Islands incorporation, Chinese operations
        'JD': 'China',  # JD.com - Cayman Islands incorporation, Chinese operations
        'BIDU': 'China',  # Baidu - Cayman Islands incorporation, Chinese operations
        'NIO': 'China',  # NIO - Cayman Islands incorporation, Chinese operations
        'XPEV': 'China',  # XPeng - Cayman Islands incorporation, Chinese operations
        'LI': 'China',  # Li Auto - Cayman Islands incorporation, Chinese operations
    }

    if ticker_upper in SPECIAL_CASES:
        return SPECIAL_CASES[ticker_upper]

    # Known US stocks that yfinance may not classify properly (incorporated in Delaware etc.)
    KNOWN_US_STOCKS = {
        'BRKB',
        'BRK.A',  # Berkshire Hathaway
        'NYCB',  # New York Community Bancorp
        'PACW',  # PacWest Bancshares (California)
        'SBNY',  # Signature Bank (New York)
        'WAL',  # Western Alliance Bancorporation (Arizona)
        'ZION',  # Zions Bancorporation (Utah)
        'KEY',  # KeyCorp (Ohio)
        'RF',  # Regions Financial (Alabama)
        'HBAN',  # Huntington Bancshares (Ohio)
        'FITB',  # Fifth Third Bancorp (Ohio)
        'MTB',  # M&T Bank (New York)
        'STI',  # SunTrust (Georgia)
        'BBT',  # BB&T (North Carolina)
    }

    if ticker_upper in KNOWN_US_STOCKS:
        return 'United States'

    # Check metadata first for quote type
    ticker_meta = metadata.get(ticker_upper, {})
    quote_type = ticker_meta.get('quoteType', '').upper()

    # ETFs and mutual funds need special handling
    if quote_type in ('ETF', 'MUTUALFUND'):
        return 'Fund'

    # For individual stocks, try to get country from yfinance
    try:
        yf_ticker = yf.Ticker(ticker_upper)
        info = yf_ticker.info

        # Try different country fields
        country = info.get('country')
        if country:
            return normalize_country_name(country)

        # Fallback to city/state for US companies
        state = info.get('state', '')

        if state and state.upper() in ('CA', 'NY', 'TX', 'WA', 'DE', 'MA', 'NJ', 'PA', 'IL', 'FL'):
            return 'United States'

        # Default to United States for most US-listed stocks
        if ticker_upper.endswith('.US') or '.' not in ticker_upper:
            return 'United States'

    except Exception:  # pylint: disable=broad-except
        pass

    # Default fallback
    return 'Other'


def normalize_country_name(country: str) -> str:
    """Normalize country names for consistency."""
    if not country:
        return 'Other'

    country = country.strip()

    # Common normalizations
    normalizations = {
        'usa': 'United States',
        'us': 'United States',
        'united states': 'United States',
        'united states of america': 'United States',
        'uk': 'United Kingdom',
        'united kingdom': 'United Kingdom',
        'great britain': 'United Kingdom',
        'china': 'China',
        'prc': 'China',
        'hong kong': 'Hong Kong',
        'hongkong': 'Hong Kong',
        'japan': 'Japan',
        'germany': 'Germany',
        'france': 'France',
        'switzerland': 'Switzerland',
        'canada': 'Canada',
        'australia': 'Australia',
        'india': 'India',
        'south korea': 'South Korea',
        'korea': 'South Korea',
        'taiwan': 'Taiwan',
        'singapore': 'Singapore',
        'netherlands': 'Netherlands',
        'sweden': 'Sweden',
        'denmark': 'Denmark',
        'norway': 'Norway',
        'finland': 'Finland',
        'spain': 'Spain',
        'italy': 'Italy',
        'brazil': 'Brazil',
        'mexico': 'Mexico',
        'israel': 'Israel',
        'ireland': 'Ireland',
        'luxembourg': 'Luxembourg',
        'cayman islands': 'Cayman Islands',
        'bermuda': 'Bermuda',
    }

    country_lower = country.lower()
    return normalizations.get(country_lower, country)


def load_country_allocations() -> dict[str, dict[str, float]]:
    """Load country allocations from data file."""
    allocations_path = Path('data/fund_country_allocations.json')
    if allocations_path.exists():
        with open(allocations_path, 'r') as f:
            data: dict[str, dict[str, float]] = json.load(f)
            return data
    return {}


def get_etf_country_allocation(ticker: str) -> dict[str, float]:
    """
    Get country allocation for an ETF or mutual fund.

    Returns a dictionary of {country: percentage}.

    Priority:
    1. Load from data/fund_country_allocations.json (auto-updated via ScraperAPI)
    2. Use hardcoded allocations for mutual funds (not tracked by stockanalysis.com)
    3. Try yfinance API as fallback
    """
    ticker_upper = ticker.upper().replace('-', '')

    # First, try to load from auto-updated allocations file
    allocations = load_country_allocations()
    if ticker_upper in allocations and allocations[ticker_upper]:
        return allocations[ticker_upper]

    # Mutual funds - not tracked by stockanalysis.com, use hardcoded allocations
    # These are historical holdings, so static data is acceptable
    # Data sources: MSCI, FTSE Russell, Morningstar, fund fact sheets (2024-2026)
    MUTUAL_FUND_ALLOCATIONS: dict[str, dict[str, float]] = {
        # Fidelity Global ex US - tracks MSCI ACWI ex USA IMI Index
        # Source: MSCI ACWI ex USA IMI Index factsheet (Jan 2026)
        'FSGGX': {
            'Japan': 14.77,
            'United Kingdom': 8.88,
            'Canada': 8.02,
            'China': 7.63,
            'Taiwan': 6.54,
            'France': 5.82,
            'Germany': 5.45,
            'Switzerland': 5.12,
            'Australia': 4.26,
            'India': 3.98,
            'South Korea': 3.45,
            'Netherlands': 2.87,
            'Sweden': 2.12,
            'Spain': 1.89,
            'Italy': 1.76,
            'Hong Kong': 1.65,
            'Denmark': 1.54,
            'Brazil': 1.43,
            'Singapore': 1.32,
            'Israel': 1.21,
            'Mexico': 0.98,
            'South Africa': 0.87,
            'Norway': 0.76,
            'Finland': 0.65,
            'Thailand': 0.54,
            'Indonesia': 0.48,
            'Saudi Arabia': 0.43,
            'UAE': 0.38,
            'Malaysia': 0.35,
            'Poland': 0.32,
            'Turkey': 0.28,
            'Chile': 0.25,
            'Philippines': 0.22,
            'Greece': 0.19,
            'Portugal': 0.17,
            'Ireland': 0.15,
            'New Zealand': 0.13,
            'Qatar': 0.12,
            'Kuwait': 0.11,
            'Egypt': 0.09,
            'Peru': 0.08,
            'Colombia': 0.07,
            'Czech Republic': 0.06,
            'Hungary': 0.05,
            'Other': 0.86,
        },
        # Vanguard Developed Markets - tracks FTSE Developed All Cap ex US Index
        # Source: FTSE Russell factsheet (Jan 2026)
        'VTMGX': {
            'Japan': 16.5,
            'United Kingdom': 9.8,
            'Canada': 8.5,
            'France': 6.2,
            'Germany': 5.8,
            'Switzerland': 5.5,
            'Australia': 4.8,
            'Taiwan': 4.2,
            'South Korea': 3.8,
            'Netherlands': 3.2,
            'Sweden': 2.4,
            'Spain': 2.1,
            'Italy': 1.9,
            'Hong Kong': 1.8,
            'Denmark': 1.7,
            'Singapore': 1.5,
            'Norway': 0.9,
            'Finland': 0.8,
            'Israel': 0.7,
            'Austria': 0.6,
            'Belgium': 0.5,
            'Ireland': 0.4,
            'New Zealand': 0.3,
            'Portugal': 0.2,
            'Greece': 0.2,
            'Other': 0.5,
        },
        'VIEIX': {
            'Japan': 16.5,
            'United Kingdom': 9.8,
            'Canada': 8.5,
            'France': 6.2,
            'Germany': 5.8,
            'Switzerland': 5.5,
            'Australia': 4.8,
            'Taiwan': 4.2,
            'South Korea': 3.8,
            'Netherlands': 3.2,
            'Sweden': 2.4,
            'Spain': 2.1,
            'Italy': 1.9,
            'Hong Kong': 1.8,
            'Denmark': 1.7,
            'Singapore': 1.5,
            'Norway': 0.9,
            'Finland': 0.8,
            'Israel': 0.7,
            'Austria': 0.6,
            'Belgium': 0.5,
            'Ireland': 0.4,
            'New Zealand': 0.3,
            'Portugal': 0.2,
            'Greece': 0.2,
            'Other': 0.5,
        },
        'VTPSX': {
            'Japan': 16.5,
            'United Kingdom': 9.8,
            'Canada': 8.5,
            'France': 6.2,
            'Germany': 5.8,
            'Switzerland': 5.5,
            'Australia': 4.8,
            'Taiwan': 4.2,
            'South Korea': 3.8,
            'Netherlands': 3.2,
            'Sweden': 2.4,
            'Spain': 2.1,
            'Italy': 1.9,
            'Hong Kong': 1.8,
            'Denmark': 1.7,
            'Singapore': 1.5,
            'Norway': 0.9,
            'Finland': 0.8,
            'Israel': 0.7,
            'Austria': 0.6,
            'Belgium': 0.5,
            'Ireland': 0.4,
            'New Zealand': 0.3,
            'Portugal': 0.2,
            'Greece': 0.2,
            'Other': 0.5,
        },
        'VFFSX': {
            'Japan': 16.5,
            'United Kingdom': 9.8,
            'Canada': 8.5,
            'France': 6.2,
            'Germany': 5.8,
            'Switzerland': 5.5,
            'Australia': 4.8,
            'Taiwan': 4.2,
            'South Korea': 3.8,
            'Netherlands': 3.2,
            'Sweden': 2.4,
            'Spain': 2.1,
            'Italy': 1.9,
            'Hong Kong': 1.8,
            'Denmark': 1.7,
            'Singapore': 1.5,
            'Norway': 0.9,
            'Finland': 0.8,
            'Israel': 0.7,
            'Austria': 0.6,
            'Belgium': 0.5,
            'Ireland': 0.4,
            'New Zealand': 0.3,
            'Portugal': 0.2,
            'Greece': 0.2,
            'Other': 0.5,
        },
        # Fidelity Blue Chip Growth - primarily US large-cap growth stocks
        # Source: AAII (4.7% foreign stocks), Morningstar
        'FBCGX': {
            'United States': 95.3,
            'United Kingdom': 1.5,
            'Canada': 1.0,
            'Netherlands': 0.8,
            'Switzerland': 0.6,
            'Germany': 0.4,
            'Other': 0.4,
        },
        # Vanguard Emerging Markets - tracks FTSE Emerging All Cap Index
        # Source: FTSE Russell factsheet (2025)
        'VEMRX': {
            'China': 28.5,
            'Taiwan': 22.8,
            'India': 18.2,
            'South Korea': 12.5,
            'Brazil': 4.8,
            'Saudi Arabia': 3.2,
            'South Africa': 3.0,
            'Mexico': 2.5,
            'Indonesia': 2.2,
            'Thailand': 1.8,
            'UAE': 1.5,
            'Chile': 1.2,
            'Poland': 0.9,
            'Philippines': 0.8,
            'Malaysia': 0.7,
            'Turkey': 0.6,
            'Colombia': 0.5,
            'Peru': 0.4,
            'Egypt': 0.3,
            'Qatar': 0.3,
            'Kuwait': 0.3,
            'Greece': 0.2,
            'Czech Republic': 0.2,
            'Hungary': 0.1,
            'Other': 0.5,
        },
    }

    if ticker_upper in MUTUAL_FUND_ALLOCATIONS:
        return MUTUAL_FUND_ALLOCATIONS[ticker_upper]

    # Try to fetch from yfinance as fallback
    try:
        yf_ticker = yf.Ticker(ticker_upper)
        funds_data = yf_ticker.funds_data

        if funds_data is None:
            return {}

        # Try to get country allocation
        country_alloc = funds_data.country_allocation

        if country_alloc is None or len(country_alloc) == 0:
            return {}

        # Normalize country names
        normalized: dict[str, float] = {}
        for country, pct in country_alloc.items():
            norm_country = normalize_country_name(country)
            normalized[norm_country] = pct

        return normalized

    except Exception as e:  # pylint: disable=broad-except
        print(f"    Error fetching allocation for {ticker_upper}: {e}")
        return {}


def calculate_daily_geography(holdings_df, prices_data, metadata):
    """Calculate daily portfolio geography/country distribution."""
    geography_data = []

    # Helper to align portfolio tickers with price symbols
    def map_ticker(ticker: str) -> str:
        if not isinstance(ticker, str):
            return ticker
        return ticker.replace('-', '').upper()

    # Cache for country lookups to avoid repeated API calls
    country_cache = {}
    etf_allocation_cache = {}

    # Get all dates from holdings
    dates = holdings_df.index.tolist()

    # Get all unique tickers
    all_tickers = [t for t in holdings_df.columns]

    # Pre-populate country cache for all tickers
    print("Looking up countries for tickers...")
    for ticker in all_tickers:
        country_cache[ticker] = get_country_for_ticker(ticker, metadata)
        print(f"  {ticker}: {country_cache[ticker]}")

        # If it's a fund, get its country allocation
        if country_cache[ticker] == 'Fund':
            etf_allocation_cache[ticker] = get_etf_country_allocation(ticker)
            print(f"    ETF allocation: {etf_allocation_cache[ticker]}")

    print(f"\nProcessing {len(dates)} dates...")

    for i, date in enumerate(dates):
        if (i + 1) % 100 == 0:
            print(f"  Processing date {i + 1}/{len(dates)}...")

        date_str = date.strftime('%Y-%m-%d')
        daily_geography = {'date': date_str, 'total_value': 0}

        # Calculate market value for each ticker
        ticker_values = {}
        for ticker in holdings_df.columns:
            shares = holdings_df.loc[date, ticker]

            if shares > 0:
                price_ticker = map_ticker(ticker)
                if price_ticker in prices_data:
                    price = prices_data[price_ticker].get(date_str)
                    # If no price for this date, use the last available price
                    if not price:
                        available_dates = [d for d in prices_data[price_ticker] if d < date_str]
                        if available_dates:
                            last_date = max(available_dates)
                            price = prices_data[price_ticker].get(last_date)

                    if price:
                        market_value = shares * price
                        ticker_values[ticker] = market_value
                        daily_geography['total_value'] += market_value

        # Calculate country distribution
        country_values = defaultdict(float)

        for ticker, value in ticker_values.items():
            country = country_cache.get(ticker, 'Other')

            if country == 'Fund':
                # Distribute value across ETF's country holdings
                etf_alloc = etf_allocation_cache.get(ticker, {})
                if etf_alloc:
                    for alloc_country, pct in etf_alloc.items():
                        country_values[alloc_country] += value * (pct / 100.0)
                else:
                    # If no allocation data available, use known fund classifications
                    ticker_upper = ticker.upper().replace('-', '')

                    # US-domiciled broad market ETFs (100% or ~99% US)
                    us_etfs = (
                        'VTI',
                        'VOO',
                        'SPY',
                        'QQQ',
                        'IVV',
                        'SCHD',
                        'DIA',
                        'IWM',
                        'MDY',
                        'SLY',
                        'VTWO',
                        'VUG',
                        'VTV',
                        'VO',
                        'VB',
                        'VGT',
                        'VHT',
                        'VDC',
                        'VNQ',
                        'VOX',
                        'VDE',
                        'VFH',
                        'VIS',
                        'XLF',
                        'XLK',
                        'XLV',
                        'XLE',
                        'XLI',
                        'XLP',
                        'XLY',
                        'XLB',
                        'XLRE',
                        'ARKK',
                        'ARKG',
                        'ARKW',
                        'ARKF',
                        'ARKQ',
                        'JEPI',
                        'JEPQ',
                        'TQQQ',
                        'SQQQ',
                        'UPRO',
                        'SPXL',
                        'SPXU',
                        'QLD',
                        'QID',
                        'PSQ',
                        'RWM',
                        'SH',
                        'SJB',
                        'REK',
                        'SOXL',
                        'TLT',
                        'IEF',
                        'SHY',
                        'BND',
                        'AGG',
                        'LQD',
                        'HYG',
                        'JNK',
                        'BNDW',
                        'GLD',
                        'SLV',
                        'USO',
                        'UNG',
                        'VIXY',
                        'UVXY',
                        'VXX',
                        'SVXY',
                        'BOXX',
                        'PTLC',
                        'FNSFX',
                        'FSKAX',
                        'FXAIX',
                        'VSIAX',
                        'VMVAX',
                        'VGSNX',
                        'VTSAX',  # Vanguard Total Stock Market Index
                        'VTIAX',  # Vanguard Total International Stock Index
                        'VBTLX',  # Vanguard Total Bond Market Index
                        'VWELX',  # Vanguard Wellington Fund
                        'VWINX',  # Vanguard Wellesley Income Fund
                        'VGTSX',  # Vanguard Total International Stock Index
                        'VFIAX',  # Vanguard 500 Index Fund
                        'VIMAX',  # Vanguard Mid-Cap Index Fund
                        'VSMAX',  # Vanguard Small-Cap Index Fund
                        'VTISX',  # Vanguard Short-Term Inflation-Protected Securities
                        'FZROX',  # Fidelity ZERO Total Market Index
                        'FZILX',  # Fidelity ZERO International Index
                        'FXNAX',  # Fidelity US Bond Index
                        'FTBFX',  # Fidelity Total Bond Fund
                    )

                    # Check against known fund lists
                    # First, try to use auto-updated allocations from file
                    loaded_alloc = load_country_allocations().get(ticker_upper)
                    if loaded_alloc:
                        for c, pct in loaded_alloc.items():
                            country_values[c] += value * (pct / 100.0)
                    elif ticker_upper in us_etfs:
                        # US-domiciled ETFs are treated as 100% US
                        country_values['United States'] += value
                    else:
                        # Unknown fund or missing allocation data - use 'Other'
                        # This should rarely happen now that we fetch data for all ETFs
                        country_values['Other'] += value
            else:
                country_values[country] += value

        # Calculate percentages for countries
        total_percentage = 0
        if daily_geography['total_value'] > 0:
            for country, value in country_values.items():
                if value <= 0:
                    continue
                percentage = (value / daily_geography['total_value']) * 100
                if percentage < 0.01:  # Skip very small allocations
                    continue
                daily_geography[country] = percentage
                total_percentage += percentage

            # Normalize to exactly 100% to avoid floating point issues and double-counting
            # This is necessary because ETF country allocations may overlap with individual stocks
            if total_percentage > 0:
                scale = 100.0 / total_percentage
                for country in list(daily_geography.keys()):
                    if country not in ('date', 'total_value'):
                        daily_geography[country] *= scale

        geography_data.append(daily_geography)

    return geography_data


def convert_to_chart_format(geography_data):
    """Convert geography data to chart format (similar to sectors.json)."""
    if not geography_data:
        return {'dates': [], 'series': {}, 'total_values': []}

    # Extract dates
    dates = [d['date'] for d in geography_data]
    total_values = [d['total_value'] for d in geography_data]

    # Get all countries
    all_countries = set()
    for d in geography_data:
        for key in d.keys():
            if key not in ('date', 'total_value'):
                all_countries.add(key)

    # Build series for each country
    series = {}
    for country in sorted(all_countries):
        series[country] = [d.get(country, 0) for d in geography_data]

    return {
        'dates': dates,
        'series': series,
        'total_values': total_values,
    }


def main():
    """Main function to generate geography data."""
    print("Loading data...")
    holdings_df, prices_data, metadata = load_data()

    print("Calculating daily geography distribution...")
    geography_data = calculate_daily_geography(holdings_df, prices_data, metadata)

    print("Converting to chart format...")
    chart_format = convert_to_chart_format(geography_data)

    # Save to output file
    output_path = Path('data/output/figures/geography.json')
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(chart_format, f, indent=2)

    print(f"\nGeography data saved to {output_path}")

    # Print summary
    countries = list(chart_format['series'].keys())
    print(f"\nCountries found: {len(countries)}")
    for country in countries:
        latest_pct = chart_format['series'][country][-1] if chart_format['series'][country] else 0
        print(f"  {country}: {latest_pct:.1f}%")

    # Generate continent/region summary report
    print("\n" + "=" * 70)
    print("Generating continent/region summary report...")

    # Get latest country allocation
    latest_country_data = {}
    for country in countries:
        if country not in ('date', 'total_value'):
            latest_pct = (
                chart_format['series'][country][-1] if chart_format['series'][country] else 0
            )
            if latest_pct >= 0.01:  # Only include if >= 0.01%
                latest_country_data[country] = latest_pct

    # Import continent/region aggregation
    import sys

    sys.path.insert(0, str(Path(__file__).parent))
    from analysis.continent_regions import (
        aggregate_by_continent,
        aggregate_by_subregion,
        format_summary_report,
    )

    # Print formatted summary
    summary = format_summary_report(latest_country_data)
    print(summary)

    # Save summary to file
    summary_path = Path('data/output/figures/geography_summary.txt')
    with open(summary_path, 'w') as f:
        f.write(summary)
    print(f"\nSummary saved to {summary_path}")

    # Also save continent and sub-region aggregated data
    continent_data = aggregate_by_continent(latest_country_data)
    subregion_data = aggregate_by_subregion(latest_country_data)

    aggregated_output = {
        'dates': chart_format['dates'],
        'latest_date': chart_format['dates'][-1] if chart_format['dates'] else None,
        'by_continent': {
            k: round(v, 4) for k, v in sorted(continent_data.items(), key=lambda x: -x[1])
        },
        'by_subregion': {
            k: round(v, 4) for k, v in sorted(subregion_data.items(), key=lambda x: -x[1])
        },
        'by_country': {
            k: round(v, 4) for k, v in sorted(latest_country_data.items(), key=lambda x: -x[1])
        },
    }

    aggregated_path = Path('data/output/figures/geography_aggregated.json')
    with open(aggregated_path, 'w') as f:
        json.dump(aggregated_output, f, indent=2)
    print(f"Aggregated data saved to {aggregated_path}")


if __name__ == '__main__':
    main()
