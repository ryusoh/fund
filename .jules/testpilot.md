2024-05-18
What: Added 100% code coverage to `js/utils/formatting.js`, `scripts/commands/holdings.py`, and `scripts/commands/tickers.py`.
Coverage: +3 previously missing coverage points addressed and covered in edge cases and unhandled exception branches.
Result: `pnpm run verify:all` passes successfully, pushing overall coverage closer to 100%. No production logic was modified.

## $(date +%Y-%m-%d)
- **Target Files**: `js/ui/nav_current_page.js`, `js/ui/service_worker_register.js`, `js/ui/video_warmup.js`
- **Focus**: Improving coverage for missing edge cases related to UI interactions, service worker environments, and offline capabilities.
- **Techniques Used**:
  - DOM manipulation edge cases for navigation.
  - Complex object property spying and redefining `navigator.serviceWorker` and `window.location` for specific paths in the SW.
  - Overriding globals and testing asynchronous promises cleanly without race conditions.

## 2024-05-19
What: Improved test coverage for `js/ui/nav_current_page.js`, `js/ui/service_worker_register.js`, and `js/ui/video_warmup.js`.
Coverage: Brought all three files to 100% test coverage using JSDOM environment overrides.
Result: Expanded coverage metrics safely. Added tests correctly intercepting mocked variables (`navigator.serviceWorker`, `window.location`, and `document.querySelectorAll`).

## 2024-05-19
What: Improved test coverage for `js/ui/nav_current_page.js`, `js/ui/service_worker_register.js`, and `js/ui/video_warmup.js`.
Coverage: Brought all three files to 100% test coverage using JSDOM environment overrides.
Result: Expanded coverage metrics safely. Added tests correctly intercepting mocked variables (`navigator.serviceWorker`, `window.location`, and `document.querySelectorAll`).
