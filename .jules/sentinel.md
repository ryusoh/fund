2026-03-09 - [DOM XSS in Transaction Data Table Rendering], Vulnerability, Learning, Prevention.
Vulnerability: Assigned unsanitized transaction data to `innerHTML` when rendering the transaction data table, opening up a potential DOM XSS vulnerability if transaction records are maliciously crafted.
Learning: Unsanitized input from seemingly "trusted" sources (like an internal data table or fetched transaction data) can be exploited if rendered using `innerHTML` without proper escaping.
Prevention: Never use `innerHTML` for dynamically generated content based on data fields. Instead, use standard DOM manipulation techniques such as creating elements manually with `document.createElement`, setting values using `textContent`, and using `replaceChildren()` to clear containers.
2024-05-24 - [Terminal DOM XSS Fix], Vulnerability: DOM Cross-Site Scripting (XSS), Learning: Direct concatenation of user input into \`innerHTML\` allows arbitrary JavaScript execution within the client's session., Prevention: Always use \`document.createElement()\` and assign user-controlled data via \`textContent\` or \`document.createTextNode()\` rather than \`innerHTML\` to ensure the browser treats it as literal text.
2024-03-08 - [Insecure API Keys Transmission], Insecure HTTP API Transmission, Transmitting secret API keys via HTTP allows MITM attacks. Always utilize HTTPS endpoints for external APIs. Mocks using `urllib.request.Request` were successfully employed to verify scheme usage (e.g. `mock_request.call_args[0][0].startswith("https://")`).

## 2024-05-24 - Cross-Site Scripting (XSS) via Error Messages

**Vulnerability:** The application catches errors during data initialization/rendering and displays the `error.message` directly using `innerHTML` without sanitization. E.g., `document.querySelector(CALENDAR_SELECTORS.container).innerHTML = "<p>" + error.message + "</p>";` in `js/pages/calendar/index.js` and similar occurrences in `js/pages/analysis/lab.js`.

**Learning:** If an error message originates from an external source or user input and is unexpectedly an object or contains script tags, it can be executed by the browser leading to XSS. This is a common pattern when logging or presenting failure states to users.

**Prevention:** Avoid using `innerHTML` for dynamic content display whenever possible. Instead, use `textContent` to ensure the content is treated as text and safely encoded by the browser. For inserting HTML structures, create elements programmatically using `document.createElement()` and `appendChild()` or `replaceChildren()`.

## 2026-03-09 - DOM XSS via External Markdown Headers

**Vulnerability:** The application parsed external Markdown files (`../docs/thesis/${symbol}.md`), extracted header text (like `outcome.name`), and injected it directly into the DOM using `innerHTML` string interpolation without sanitization in `js/pages/analysis/lab.js` (`renderScenarioCards` and `renderSummary`).

**Learning:** Data from external files (even documentation files like Markdown) must be treated as untrusted user input, as they can be edited to include malicious HTML tags (e.g. `<script>alert(1)</script>`). Injecting such strings directly via `innerHTML` can lead to DOM XSS.

**Prevention:** Never use `innerHTML` to display dynamic data extracted from external sources. Instead, utilize safe DOM manipulation techniques like `document.createElement` and assign untrusted strings using `textContent`.

## 2026-03-10 - DOM XSS via Error Messages & Dynamic Data Rendering
**Vulnerability:** Found uses of `.innerHTML` to insert dynamic data (e.g., error messages and dynamic status indicators) directly into the DOM in `js/pages/analysis/lab.js` and `js/pages/calendar/index.js`, creating a potential Cross-Site Scripting (XSS) vulnerability.
**Learning:** Using `.innerHTML` to clear content or insert dynamic text is insecure and can introduce DOM XSS, especially when handling arbitrary errors or dynamically fetched data. Furthermore, refactoring older code to modern safe DOM APIs (like `replaceChildren`) requires careful consideration of legacy test environments (like partial JSDOM mocks) that might not support these new APIs, necessitating a safe fallback (like `innerHTML = ''` when `typeof replaceChildren !== 'function'`).
**Prevention:** Avoid `.innerHTML` entirely for dynamically generated content. Instead, create elements safely using `document.createElement()`, assign values via `textContent`, and manipulate the DOM using `.appendChild()` or `.replaceChildren()`. Always preserve fallback logic for environments lacking modern DOM API support to prevent breaking test suites.
