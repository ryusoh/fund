# Automation Notes

- Run `make twrr-refresh` to rebuild all checkpoints and figures. The command skips work if inputs are unchanged.
- Input hash stored at `data/checkpoints/input_hash.txt`.
- Optional watcher: `python scripts/watch_transactions.py --interval 5`
  triggers the refresh whenever `data/transactions.csv` or `data/split_history.csv` changes.
