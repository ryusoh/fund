# TWRR Pipeline Checklist

1. `make twrr-refresh`
    - Recomputes checkpoints and charts if `data/transactions.csv` or `data/split_history.csv` changed.
2. Optional: `scripts/watch_transactions.py`
    - Polling watcher that runs `make twrr-refresh` when either CSV updates.
