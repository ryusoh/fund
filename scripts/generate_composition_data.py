#!/usr/bin/env python3
"""Generate portfolio composition data for stacked area chart."""

import json
from pathlib import Path

import pandas as pd


def load_data():
    """Load holdings, price, and metadata data."""
    # Load holdings data
    holdings_path = Path('data/checkpoints/holdings_daily.parquet')
    holdings_df = pd.read_parquet(holdings_path)

    # Load price data
    with open('data/historical_prices.json', 'r') as f:
        prices_data = json.load(f)

    # Load ticker metadata for sectors
    metadata_path = Path('data/ticker_metadata.json')
    metadata = {}
    if metadata_path.exists():
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)

    return holdings_df, prices_data, metadata


def calculate_daily_composition(holdings_df, prices_data, metadata):
    """Calculate daily portfolio composition and sector allocation."""
    composition_data = []
    sector_data = []

    # Helper to align portfolio tickers with price symbols (remove punctuation etc.)
    def map_ticker(ticker: str) -> str:
        if not isinstance(ticker, str):
            return ticker
        return ticker.replace('-', '').upper()

    # Get all dates from holdings
    dates = holdings_df.index.tolist()

    for i, date in enumerate(dates):
        date_str = date.strftime('%Y-%m-%d')
        daily_composition = {'date': date_str, 'total_value': 0}
        daily_sectors = {'date': date_str, 'total_value': 0}

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
                        daily_composition['total_value'] += market_value
                        daily_sectors['total_value'] += market_value

        # Calculate percentages for tickers
        total_percentage = 0
        for ticker, value in ticker_values.items():
            if daily_composition['total_value'] > 0:
                percentage = (value / daily_composition['total_value']) * 100
                if percentage < 1e-6:
                    continue
                daily_composition[ticker] = percentage
                total_percentage += percentage

        # Add "Others" category for any remaining percentage
        if total_percentage < 100 and total_percentage > 0:
            daily_composition['Others'] = 100 - total_percentage

        composition_data.append(daily_composition)

        # Calculate sector allocation
        sector_values = {}
        for ticker, value in ticker_values.items():
            ticker_meta = metadata.get(ticker, {})
            sector = ticker_meta.get('sector') or ticker_meta.get('quoteType') or 'Unknown'

            # Combine Mutual Funds and ETFs
            if sector in ['ETF', 'MUTUALFUND']:
                sector = 'ETF'

            if sector == 'EQUITY':
                sector = 'Other Stocks'

            sector_values[sector] = sector_values.get(sector, 0) + value

        total_sector_percentage = 0
        for sector, value in sector_values.items():
            if daily_sectors['total_value'] > 0:
                percentage = (value / daily_sectors['total_value']) * 100
                if percentage < 1e-6:
                    continue
                daily_sectors[sector] = percentage
                total_sector_percentage += percentage

        if total_sector_percentage < 100 and total_sector_percentage > 0:
            daily_sectors['Others'] = 100 - total_sector_percentage

        sector_data.append(daily_sectors)

    return pd.DataFrame(composition_data), pd.DataFrame(sector_data)


def save_json_data(df, output_path, label='composition'):
    """Save data to JSON file in stacked area chart format."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Convert to format suitable for frontend
    data = {
        'dates': df['date'].tolist(),
        'total_values': df['total_value'].tolist(),
        'series': {},
    }

    # Get all keys (excluding date and total_value)
    keys = [col for col in df.columns if col not in ['date', 'total_value']]

    for key in keys:
        data['series'][key] = df[key].fillna(0).tolist()

    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"{label.capitalize()} data saved to {output_path}")
    print(f"Date range: {df['date'].min()} to {df['date'].max()}")
    print(f"Categories: {len(keys)}")


def main():
    """Main function."""
    print("Loading data...")
    holdings_df, prices_data, metadata = load_data()

    print("Calculating daily composition and sectors...")
    composition_df, sector_df = calculate_daily_composition(holdings_df, prices_data, metadata)

    print("Saving composition data...")
    save_json_data(composition_df, Path('data/output/figures/composition.json'), 'composition')

    print("Saving sector data...")
    save_json_data(sector_df, Path('data/output/figures/sectors.json'), 'sectors')

    print("Done!")


if __name__ == '__main__':
    main()
