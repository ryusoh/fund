import pandas as pd
from datetime import datetime
from pathlib import Path

# Path relative to the script's new location (scripts/twrr/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
OVERRIDE_PATH = PROJECT_ROOT / "data" / "historical_prices_overrides.parquet"

# Load existing
try:
    df = pd.read_parquet(OVERRIDE_PATH)
except FileNotFoundError:
    df = pd.DataFrame(columns=["date", "ticker", "adj_close"])

new_rows = [
    {"date": pd.to_datetime("2020-01-01"), "ticker": "CHX", "adj_close": 35.40},
    {"date": pd.to_datetime("2026-12-31"), "ticker": "CHX", "adj_close": 35.40},
    {"date": pd.to_datetime("2020-01-01"), "ticker": "GD", "adj_close": 280.0},
    {"date": pd.to_datetime("2026-12-31"), "ticker": "GD", "adj_close": 280.0},
    {"date": pd.to_datetime("2020-01-01"), "ticker": "SBSW", "adj_close": 4.5},
    {"date": pd.to_datetime("2026-12-31"), "ticker": "SBSW", "adj_close": 4.5},
    {"date": pd.to_datetime("2020-01-01"), "ticker": "VTLE", "adj_close": 35.0},
    {"date": pd.to_datetime("2026-12-31"), "ticker": "VTLE", "adj_close": 35.0},
]

new_df = pd.DataFrame(new_rows)
combined = pd.concat([df, new_df]).drop_duplicates(subset=["date", "ticker"], keep="last")

combined.to_parquet(OVERRIDE_PATH)
print("Updated overrides with:", combined['ticker'].unique())
