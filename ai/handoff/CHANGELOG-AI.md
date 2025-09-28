### step-01_loader

- Prepared cleaned transactions checkpoint (data/checkpoints/transactions_clean.parquet)

### step-02_splits

- Applied split adjustments (data/checkpoints/transactions_with_splits.parquet)

### step-03_prices

- Fetched/merged historical prices (data/historical_prices.parquet)

### step-04_holdings

- Computed daily holdings/market value (data/checkpoints/holdings_daily.parquet)
- Computed daily holdings/market value (data/daily_market_value.parquet)

### step-05_cashflow

- Computed daily cashflows (data/daily_cash_flow.parquet)

### step-06_twrr

- Computed TWRR series (data/twrr_series.parquet)

### step-07_plot

- Generated TWRR chart (data/output/figures/twrr.html)
- Generated TWRR chart (data/output/figures/twrr.png)
