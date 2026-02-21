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


def get_etf_country_allocation(ticker: str) -> dict:
    """
    Get country allocation for an ETF or mutual fund from yfinance API.

    Returns a dictionary of {country: percentage}.

    Note: For major international ETFs, we use researched allocations from:
    - Vanguard official factsheets (vanguard.com)
    - ETF Database (etfdb.com)
    - Morningstar
    - iShares official factsheets
    """
    ticker_upper = ticker.upper().replace('-', '')

    # Pre-researched country allocations from official sources
    # These are based on latest available data (2024-2025)
    RESEARCHED_ALLOCATIONS = {
        # Total World Stock ETF - Source: vanguard.com (Jan 2026)
        'VT': {
            'United States': 61.48,
            'Japan': 5.79,
            'United Kingdom': 3.44,
            'China': 3.30,
            'Canada': 3.00,
            'Taiwan': 2.47,
            'France': 2.40,
            'Switzerland': 2.35,
            'Germany': 2.10,
            'Australia': 1.90,
            'South Korea': 1.50,
            'India': 1.40,
            'Netherlands': 1.10,
            'Other': 17.77,
        },
        # Emerging Markets ETF - Source: etfdb.com / morningstar (2025)
        'VWO': {
            'China': 27.93,
            'Taiwan': 24.20,
            'India': 15.10,
            'Brazil': 4.20,
            'South Africa': 3.30,
            'South Korea': 3.00,
            'Saudi Arabia': 2.80,
            'Mexico': 2.50,
            'Indonesia': 2.20,
            'Thailand': 2.00,
            'Poland': 1.50,
            'Other': 11.27,
        },
        # iShares Core MSCI Emerging Markets - Source: iShares (2025)
        'IEMG': {
            'China': 28.00,
            'Taiwan': 23.50,
            'India': 18.00,
            'South Korea': 5.50,
            'Brazil': 4.50,
            'Saudi Arabia': 3.80,
            'South Africa': 3.20,
            'Mexico': 2.80,
            'Indonesia': 2.50,
            'Thailand': 2.20,
            'Other': 6.00,
        },
        # Vanguard Emerging Markets Index - Source: vanguard.com (2025)
        'VEMRX': {
            'China': 31.90,
            'Taiwan': 22.80,
            'India': 19.50,
            'South Korea': 4.50,
            'Brazil': 4.00,
            'Saudi Arabia': 3.50,
            'South Africa': 3.20,
            'Mexico': 2.50,
            'Indonesia': 2.20,
            'Thailand': 2.00,
            'Other': 3.90,
        },
        # iShares Global Clean Energy - Source: ishares.com factsheet (2025)
        'ICLN': {
            'United States': 42.56,
            'China': 17.53,
            'Brazil': 8.05,
            'Spain': 7.99,
            'Denmark': 4.26,
            'India': 3.55,
            'South Korea': 2.48,
            'Japan': 2.24,
            'Canada': 2.00,
            'United Kingdom': 1.80,
            'Other': 7.54,
        },
        # iShares Semiconductor ETF - Source: etfdb.com (2025)
        'SOXX': {
            'United States': 82.11,
            'Taiwan': 5.66,
            'Netherlands': 4.50,
            'South Korea': 3.00,
            'Japan': 2.00,
            'Switzerland': 0.60,
            'Other': 2.13,
        },
        # China A-Shares ETF - Source: issuer factsheet
        'ASHR': {
            'China': 95.00,
            'Other': 5.00,
        },
    }

    # Check researched allocations first
    if ticker_upper in RESEARCHED_ALLOCATIONS:
        return RESEARCHED_ALLOCATIONS[ticker_upper]

    # Try to fetch from yfinance
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
        normalized = {}
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
                    )

                    # International developed markets funds
                    developed_markets_etfs = {
                        'VTMGX': {
                            'Japan': 17.0,
                            'United Kingdom': 11.0,
                            'Canada': 7.5,
                            'France': 7.0,
                            'Switzerland': 6.5,
                            'Germany': 6.0,
                            'Australia': 5.5,
                            'Taiwan': 4.5,
                            'South Korea': 4.0,
                            'Netherlands': 3.0,
                            'Other': 28.0,
                        },
                        'FSGGX': {
                            'Japan': 17.0,
                            'United Kingdom': 11.0,
                            'Canada': 7.5,
                            'France': 7.0,
                            'Switzerland': 6.5,
                            'Germany': 6.0,
                            'Australia': 5.5,
                            'Taiwan': 4.5,
                            'South Korea': 4.0,
                            'Netherlands': 3.0,
                            'Other': 28.0,
                        },
                        'VIEIX': {
                            'Japan': 17.0,
                            'United Kingdom': 11.0,
                            'Canada': 7.5,
                            'France': 7.0,
                            'Switzerland': 6.5,
                            'Germany': 6.0,
                            'Australia': 5.5,
                            'Taiwan': 4.5,
                            'South Korea': 4.0,
                            'Netherlands': 3.0,
                            'Other': 28.0,
                        },
                        'VTPSX': {
                            'Japan': 17.0,
                            'United Kingdom': 11.0,
                            'Canada': 7.5,
                            'France': 7.0,
                            'Switzerland': 6.5,
                            'Germany': 6.0,
                            'Australia': 5.5,
                            'Taiwan': 4.5,
                            'South Korea': 4.0,
                            'Netherlands': 3.0,
                            'Other': 28.0,
                        },
                        'VFFSX': {
                            'Japan': 17.0,
                            'United Kingdom': 11.0,
                            'Canada': 7.5,
                            'France': 7.0,
                            'Switzerland': 6.5,
                            'Germany': 6.0,
                            'Australia': 5.5,
                            'Taiwan': 4.5,
                            'South Korea': 4.0,
                            'Netherlands': 3.0,
                            'Other': 28.0,
                        },
                        'FBCGX': {
                            'Japan': 17.0,
                            'United Kingdom': 11.0,
                            'Canada': 7.5,
                            'France': 7.0,
                            'Switzerland': 6.5,
                            'Germany': 6.0,
                            'Australia': 5.5,
                            'Taiwan': 4.5,
                            'South Korea': 4.0,
                            'Netherlands': 3.0,
                            'Other': 28.0,
                        },
                    }

                    # Emerging markets funds
                    emerging_markets_etfs = {
                        'VWO': {
                            'China': 32.0,
                            'India': 18.0,
                            'Taiwan': 17.0,
                            'Brazil': 6.0,
                            'South Korea': 5.0,
                            'Saudi Arabia': 4.0,
                            'South Africa': 3.5,
                            'Mexico': 3.0,
                            'Indonesia': 2.5,
                            'Thailand': 2.5,
                            'Other': 6.5,
                        },
                        'IEMG': {
                            'China': 32.0,
                            'India': 18.0,
                            'Taiwan': 17.0,
                            'Brazil': 6.0,
                            'South Korea': 5.0,
                            'Saudi Arabia': 4.0,
                            'South Africa': 3.5,
                            'Mexico': 3.0,
                            'Indonesia': 2.5,
                            'Thailand': 2.5,
                            'Other': 6.5,
                        },
                        'VEMRX': {
                            'China': 32.0,
                            'India': 18.0,
                            'Taiwan': 17.0,
                            'Brazil': 6.0,
                            'South Korea': 5.0,
                            'Saudi Arabia': 4.0,
                            'South Africa': 3.5,
                            'Mexico': 3.0,
                            'Indonesia': 2.5,
                            'Thailand': 2.5,
                            'Other': 6.5,
                        },
                    }

                    # Global/World funds
                    global_etfs = {
                        'VT': {
                            'United States': 62.0,
                            'Japan': 6.0,
                            'United Kingdom': 4.0,
                            'China': 4.0,
                            'Canada': 3.0,
                            'France': 3.0,
                            'Switzerland': 2.5,
                            'Germany': 2.5,
                            'Australia': 2.0,
                            'Taiwan': 2.0,
                            'South Korea': 1.5,
                            'India': 1.5,
                            'Other': 6.0,
                        },
                    }

                    # Sector/thematic ETFs with some international exposure
                    sector_etfs = {
                        'ICLN': {
                            'United States': 40.0,
                            'China': 10.0,
                            'Spain': 8.0,
                            'Denmark': 7.0,
                            'Canada': 6.0,
                            'United Kingdom': 5.0,
                            'Germany': 4.0,
                            'Japan': 4.0,
                            'Other': 16.0,
                        },
                        'SOXX': {
                            'United States': 80.0,
                            'Taiwan': 10.0,
                            'Netherlands': 5.0,
                            'South Korea': 3.0,
                            'Other': 2.0,
                        },
                        'IGV': {'United States': 95.0, 'Other': 5.0},
                        'IHF': {'United States': 92.0, 'Other': 8.0},
                        'ASHR': {'China': 95.0, 'Other': 5.0},  # China A-Shares
                    }

                    # Check against known fund lists
                    if ticker_upper in us_etfs:
                        country_values['United States'] += value
                    elif ticker_upper in developed_markets_etfs:
                        alloc = developed_markets_etfs[ticker_upper]
                        for c, pct in alloc.items():
                            country_values[c] += value * (pct / 100.0)
                    elif ticker_upper in emerging_markets_etfs:
                        alloc = emerging_markets_etfs[ticker_upper]
                        for c, pct in alloc.items():
                            country_values[c] += value * (pct / 100.0)
                    elif ticker_upper in global_etfs:
                        alloc = global_etfs[ticker_upper]
                        for c, pct in alloc.items():
                            country_values[c] += value * (pct / 100.0)
                    elif ticker_upper in sector_etfs:
                        alloc = sector_etfs[ticker_upper]
                        for c, pct in alloc.items():
                            country_values[c] += value * (pct / 100.0)
                    else:
                        # Unknown fund - use 'Other'
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


if __name__ == '__main__':
    main()
