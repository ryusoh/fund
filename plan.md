1. Modify `js/transactions/chart/helpers.js` to ensure the logic that tests `computed && computed !== baseColor` inside `_applyAlphaToCanvasColor` can be reliably covered by the Jest JSDOM tests.
2. Update tests in `tests/js/transactions/chart/helpers.test.js` to mock `COLOR_PARSER_CONTEXT` appropriately to exercise the `if (computed && computed !== baseColor)` condition in `_applyAlphaToCanvasColor`.
3. Verify test coverage using `npm test -- js/transactions/chart/helpers.test.js --coverage`.
4. Execute `make verify` and commit the change using `submit`.
