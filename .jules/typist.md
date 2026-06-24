## 2026-06-23 - js/utils/easing.js

**Issue:** Missing type annotation for parameter `x` in `easeInOutSine` function, causing TS7006 under strict mode.
**Action:** Added JSDoc `@param {number} x` and `@returns {number}` to strongly type the mathematical operation.
**Verification:** `npx tsc -p jsconfig.json --strict` error count decreased by 1. Lint, formatting, and unit tests are green.
