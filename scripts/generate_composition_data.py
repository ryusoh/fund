#!/usr/bin/env python3
"""Generate portfolio composition data for stacked area chart."""

import json
import pandas as pd
from pathlib import Path
from datetime import datetime


def load_data():
    """Load holdings and price data."""
    # Load holdings data
    holdings_path = Path('data/checkpoints/holdings_daily.parquet')
    holdings_df = pd.read_parquet(holdings_path)

    # Load price data
    with open('data/historical_prices.json', 'r') as f:
        prices_data = json.load(f)

    return holdings_df, prices_data


def calculate_daily_composition(holdings_df, prices_data):
    """Calculate daily portfolio composition."""
    composition_data = []

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

        # Calculate market value for each ticker
        ticker_values = {}
        for ticker in holdings_df.columns:
            shares = holdings_df.loc[date, ticker]

            # If shares is essentially zero (floating point error), use previous day's holdings
            if abs(shares) < 0.01 and i > 0:
                prev_date = dates[i - 1]
                shares = holdings_df.loc[prev_date, ticker]

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

        # Calculate percentages
        total_percentage = 0
        for ticker, value in ticker_values.items():
            if daily_composition['total_value'] > 0:
                percentage = (value / daily_composition['total_value']) * 100
                daily_composition[ticker] = percentage
                total_percentage += percentage

        # Add "Others" category for any remaining percentage
        if total_percentage < 100:
            daily_composition['Others'] = 100 - total_percentage

        composition_data.append(daily_composition)

    return pd.DataFrame(composition_data)


def save_composition_data(df):
    """Save composition data to JSON file."""
    output_path = Path('data/output/figures/composition.json')
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Convert to format suitable for frontend
    data = {
        'dates': df['date'].tolist(),
        'total_values': df['total_value'].tolist(),
        'composition': {},
    }

    # Get all ticker columns (excluding date and total_value)
    ticker_columns = [col for col in df.columns if col not in ['date', 'total_value']]

    for ticker in ticker_columns:
        data['composition'][ticker] = df[ticker].fillna(0).tolist()

    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"Composition data saved to {output_path}")
    print(f"Date range: {df['date'].min()} to {df['date'].max()}")
    print(f"Tickers: {len(ticker_columns)}")


def main():
    """Main function."""
    print("Loading data...")
    holdings_df, prices_data = load_data()

    print("Calculating daily composition...")
    composition_df = calculate_daily_composition(holdings_df, prices_data)

    print("Saving composition data...")
    save_composition_data(composition_df)

    print("Done!")


if __name__ == '__main__':
    main()
