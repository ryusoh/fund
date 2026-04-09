2024-05-18
What: Added 100% code coverage to `js/utils/formatting.js`, `scripts/commands/holdings.py`, and `scripts/commands/tickers.py`.
Coverage: +3 previously missing coverage points addressed and covered in edge cases and unhandled exception branches.
Result: `pnpm run verify:all` passes successfully, pushing overall coverage closer to 100%. No production logic was modified.
2024-05-18 (Additional)
What: Added 100% code coverage to `js/config.js` and `js/ui/nav_current_page.js`.
Coverage: Covered difficult branches regarding URL/host interactions by leveraging JS DOM API manipulation and carefully isolating/spying module configurations before re-`require()`-ing target files via \`jest.isolateModules()\`. Specifically, \`document.querySelectorAll\` was overwritten safely to hit isolated structural conditional branches (e.g., if a matching element is returned but artificially has a null \`parentElement\`).
Result: \`pnpm run verify:all\` passes successfully and 2 more targets hit 100% lines, functions, and branches coverage.
