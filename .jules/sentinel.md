2026-03-09 - [DOM XSS in Transaction Data Table Rendering], Vulnerability, Learning, Prevention.
Vulnerability: Assigned unsanitized transaction data to `innerHTML` when rendering the transaction data table, opening up a potential DOM XSS vulnerability if transaction records are maliciously crafted.
Learning: Unsanitized input from seemingly "trusted" sources (like an internal data table or fetched transaction data) can be exploited if rendered using `innerHTML` without proper escaping.
Prevention: Never use `innerHTML` for dynamically generated content based on data fields. Instead, use standard DOM manipulation techniques such as creating elements manually with `document.createElement`, setting values using `textContent`, and using `replaceChildren()` to clear containers.
