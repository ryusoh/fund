# Terminal commands vs. the initial data load (readiness gate)

## The race class

On `/terminal/` the input is interactive immediately, but
`js/pages/terminal/index.js` populates `transactionState` (`allTransactions`,
`portfolioSeries`, `runningAmountSeries`, FX maps…) asynchronously via
`loadTransactions()`. A command that loses this race does **not** error — it
renders a plausible empty state. Example: `p balance` printed
`(no data for selected range)` for both Contribution and Balance while the
chart looked fine (the chart re-renders after load via `filterAndSort('')` →
`chartManager.update()`; the printed text never does). The wrong text stays in
the scrollback forever.

## The gate

`js/transactions/state.js` exposes:

- `trackTransactionDataLoad(promise)` — registered once by page init
  (`trackTransactionDataLoad(loadTransactions())`). Settles even if the load
  fails, so awaiting can never hang a command.
- `isTransactionDataReady()` / `whenTransactionDataReady()` — sync check +
  awaitable. Default is "ready" when no load was registered (keeps tests and
  other pages unaffected).

**Rule:** a terminal command handler whose _output text_ reads
`transactionState` series must gate first, with feedback so the terminal
doesn't look frozen:

```js
if (!isTransactionDataReady()) {
    appendMessage('Loading portfolio data...');
    await whenTransactionDataReady();
}
```

`handlePlotCommand` (`js/transactions/terminal/handlers/plot.js`) is the
reference implementation. Regression test: `"waits for a pending initial data
load"` in `tests/js/transactions/terminal_plot.test.js` — pattern: register a
controlled promise, submit the command, assert the loading notice and the
_absence_ of the empty-state text, then resolve and assert the real summary.

The `stats` command handler is gated the same way (unit-level regression:
`"waits for a pending initial data load"` in
`tests/js/transactions/terminal/handlers/stats.test.js`, which stubs the
readiness helpers in the mocked `state.js`). No known remaining offenders —
apply the gate when adding any new handler whose output reads state series.

## Verifying the race in a live browser

`import('@js/transactions/state.js')` from the console (or preview eval)
resolves through the page's import map and returns the **same module instance**
the app uses. So you can reproduce the race deterministically on a fast local
server:

```js
const state = await import('@js/transactions/state.js');
let finish;
state.trackTransactionDataLoad(new Promise((r) => (finish = r)));
// run the command in the terminal → expect "Loading portfolio data..."
finish(); // → the correct summary appears once
```
