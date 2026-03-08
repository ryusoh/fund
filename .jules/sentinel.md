2024-03-08 - [Insecure API Keys Transmission], Insecure HTTP API Transmission, Transmitting secret API keys via HTTP allows MITM attacks. Always utilize HTTPS endpoints for external APIs. Mocks using `urllib.request.Request` were successfully employed to verify scheme usage (e.g. `mock_request.call_args[0][0].startswith("https://")`).

## 2024-05-24 - Cross-Site Scripting (XSS) via Error Messages

**Vulnerability:** The application catches errors during data initialization/rendering and displays the `error.message` directly using `innerHTML` without sanitization. E.g., `document.querySelector(CALENDAR_SELECTORS.container).innerHTML = "<p>" + error.message + "</p>";` in `js/pages/calendar/index.js` and similar occurrences in `js/pages/analysis/lab.js`.

**Learning:** If an error message originates from an external source or user input and is unexpectedly an object or contains script tags, it can be executed by the browser leading to XSS. This is a common pattern when logging or presenting failure states to users.

**Prevention:** Avoid using `innerHTML` for dynamic content display whenever possible. Instead, use `textContent` to ensure the content is treated as text and safely encoded by the browser. For inserting HTML structures, create elements programmatically using `document.createElement()` and `appendChild()` or `replaceChildren()`.
