# Testing notes (Jest gotchas that cost a debugging round-trip)

Small, hard-won facts about this repo's Jest setup. Read before debugging a
flaky/odd JS test so you don't re-derive them.

## Jest runs **silent** — `console.log` won't print

`package.json` → `jest` config sets **`"silent": true`** and
**`testEnvironmentOptions.console: "off"`**. So `console.log` / `console.error`
inside a test or the code under test produce **no output**. Debug prints look
like they "did nothing."

To surface a value while debugging, fail an assertion with it (the matcher diff
is always printed):

```js
expect({ onCalls: mock.mock.calls.map((c) => c[0]) }).toBe('DBG'); // dump via failure
// or, for an exception inside code-under-test, capture and assert its stack:
const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
await thing();
expect(errSpy.mock.calls.map((c) => String(c[1]?.stack))).toBe('DBG');
```

(Don't try to "turn on" console for one test — just dump via a failing matcher,
then remove it.)

## `jest.spyOn(<a jest.mock factory fn>, m).mockRestore()` leaves it returning `undefined`

When a module is replaced with `jest.mock('mod', () => ({ fn: jest.fn(() => X) }))`,
the exported `fn` is a mock with a default implementation. If a test then does
`jest.spyOn(mod, 'fn').mockReturnValue(...)` and later `mockRestore()`,
**`mockRestore()` does not restore the factory's implementation** — it leaves a
bare mock that returns `undefined` for every _subsequent_ test that relied on the
default.

Symptom seen in the calendar suite: tests passed in isolation but the _later_
date tests failed in a full-file run because `getNyDate()` had silently become
`undefined` (→ `initCalendar()` threw at `todayNy.getFullYear()` before doing
anything). It was masked for a long time because the old tests read a property
that _persisted across tests_ (`clearAllMocks` doesn't delete custom props).

**Fix pattern:** re-establish the default in `beforeEach` after `clearAllMocks()`:

```js
beforeEach(() => {
    jest.clearAllMocks();
    dateUtils.getNyDate.mockImplementation(() => new Date('2025-01-15T12:00:00Z'));
});
```

Corollary: a guarded `if (handler) { ...assertions... }` that silently skips when
setup half-failed is a **vacuous pass** — prefer asserting the precondition
(`expect(handler).toBeDefined()`) so a broken setup fails loudly.

## Why `js/ui/cal-heatmap-src/**` is NOT in jest coverage (decided, don't re-add)

It's a maintained fork of the cal-heatmap library, but it's **build source**:
`scripts/build-calendar.js` esbuild-bundles it to `js/vendor/cal-heatmap.js`, which
the page loads via `<script>`. Jest **mocks** `global.CalHeatmap` and never imports
the `.ts` source or the bundle, and there's no TS transform configured. So adding
`cal-heatmap-src/**/*.ts` to `collectCoverageFrom` would report ~0% across the whole
library — noise that buries real gaps, not signal. Coverage only means something
where tests execute the code.

**What protects it instead (added because autonomous agents — bolt/architect —
edit `cal-heatmap-src/*.ts`, so CI is the only gate):**

- `make verify-calendar-build` — esbuild-compiles the `.ts` to a **temp file**
  (catches syntax/resolve breakage before anyone rebuilds). Runs in `precommit-fix`.
- `tests/js/pages/calendar/calHeatmapSmoke.test.js` — loads the **committed**
  bundle + UMD d3 (like the page) and paints, asserting day cells render. Catches
  runtime breakage the `CalHeatmap` mock hides. Verified non-vacuous: it fails when
  the bundle renders nothing.

**Rejected: byte-`diff`ing the bundle against a fresh build.** The minified output
isn't reproducible across esbuild versions — a rebuild changes only esbuild's
internal variable names (pure noise), so a diff gate would false-positive. It would
also forbid an intentionally useful hand-tweak to the bundle. So the gate tests the
**committed** artifact (what ships) and builds the compile-check to a throwaway temp
— source↔bundle drift, stale **or** useful, is tolerated as long as what ships works.

## Prettier won't converge on over-indented Markdown list paragraphs

`make fmt-check` runs Prettier. A continuation paragraph under a list item must be
indented to **the same column as the marker's text** — 6 spaces for a `- [x]`
task item, 2 for a plain dash bullet. Indent it deeper (8+) and Prettier reads it as an indented **code
block**, can't reformat it cleanly, and `--write`/`--check` flip back and forth
(non-idempotent) — the failure looks mysterious. This has bitten the calendar
migration doc 3×. Fix: dedent the stray paragraph to the marker's text column
(don't add blank-line-separated deep-indented prose inside a bullet).

## Visual changes aren't testable here — observe the page (it rendered ≠ it looks good)

Unit tests can't see colour/layout/glass. Use `make screenshot URL=/<page>/` and
read the PNG. `scripts/screenshot.mjs` prints page console errors/exceptions to
stderr; pages with an entrance fade-in (e.g. `/calendar/`) need `--wait 2500` or
they shoot blank. (`timeout` is not on macOS — don't wrap commands in it.)
