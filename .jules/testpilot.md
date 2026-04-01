2024-05-18
What: Added 100% code coverage to `js/utils/formatting.js`, `scripts/commands/holdings.py`, and `scripts/commands/tickers.py`.
Coverage: +3 previously missing coverage points addressed and covered in edge cases and unhandled exception branches.
Result: `pnpm run verify:all` passes successfully, pushing overall coverage closer to 100%. No production logic was modified.
