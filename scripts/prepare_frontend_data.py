import pandas as pd
import json
import os
import numpy as np


def prepare_historical_prices():
    """
    Reads historical price data from Parquet files, combines them,
    and saves the result as a JSON file for the frontend.
    """
    base_path = os.path.join(os.path.dirname(__file__), '..')
    prices_path = os.path.join(base_path, 'data', 'historical_prices.parquet')
    overrides_path = os.path.join(base_path, 'data', 'historical_prices_overrides.parquet')
    output_path = os.path.join(base_path, 'data', 'historical_prices.json')

    if not os.path.exists(prices_path):
        print(f"Error: {prices_path} not found.")
        return

    if os.environ.get('FORCE_REBUILD_HISTORICAL_JSON') != '1' and os.path.exists(output_path):
        print(
            f"{output_path} already exists; skipping rebuild. Set FORCE_REBUILD_HISTORICAL_JSON=1 to regenerate."
        )
        return

    # Load data
    prices_df = pd.read_parquet(prices_path)
    prices_df.reset_index(inplace=True)
    prices_df.rename(columns={'index': 'date'}, inplace=True)
    prices_df = prices_df.melt(id_vars=['date'], var_name='symbol', value_name='price')

    if os.path.exists(overrides_path):
        overrides_df = pd.read_parquet(overrides_path)
        overrides_df.rename(columns={'ticker': 'symbol', 'adj_close': 'price'}, inplace=True)
        prices_df = pd.concat([prices_df, overrides_df], ignore_index=True)

    prices_df.drop_duplicates(subset=['date', 'symbol'], keep='last', inplace=True)

    # --- Data Cleaning and Normalization ---

    # 1. Handle dates
    prices_df['date'] = pd.to_datetime(prices_df['date'], errors='coerce')
    prices_df.dropna(subset=['date'], inplace=True)

    # 2. Handle symbols
    prices_df.dropna(subset=['symbol'], inplace=True)
    SYMBOL_ALIASES = {
        'BRKB': 'BRK-B',
    }
    prices_df['symbol'] = prices_df['symbol'].replace(SYMBOL_ALIASES)

    # 3. Handle price NaN/nulls
    prices_df['price'].replace({np.nan: None}, inplace=True)
    prices_df.dropna(
        subset=['price'], inplace=True
    )  # Drop rows where price is None/NaN after conversion

    # --- Dictionary Creation ---

    price_dict = {}
    # Convert to string date *after* all datetime operations
    prices_df['date'] = prices_df['date'].dt.strftime('%Y-%m-%d')

    for symbol in prices_df['symbol'].unique():
        symbol_df = prices_df[prices_df['symbol'] == symbol]
        price_dict[symbol] = pd.Series(symbol_df.price.values, index=symbol_df.date).to_dict()

    # --- JSON Output ---
    with open(output_path, 'w') as f:
        json.dump(price_dict, f)

    print(f"Successfully created {output_path}")


if __name__ == "__main__":
    prepare_historical_prices()
