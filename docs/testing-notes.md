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

## Timezone: Jest runs in UTC — and why `.toISOString()` is a footgun

`package.json` sets **`TZ=UTC`** in the `test` script so all Jest tests run in
UTC regardless of the developer's local timezone. This eliminates a class of
flaky off-by-one failures that surface only in timezones east or west of UTC.

**The flip side: `make test`/CI are blind to timezone bugs.** Production
browsers here run **Asia/Shanghai (UTC+8)**. If a chart/data value is wrong in
the browser but every test is green, suspect the landmine below before
theorizing about the math. Worked example: the filtered-ticker appreciation
line spiked by the buy amount at every buy because `buildFilteredBalanceSeries`
keyed days via `toISOString()` (previous calendar day in UTC+8) while the
contribution series used local parsing — 2,644 UTC tests never saw it.

**You cannot switch timezones inside a Jest test.** Jest sandboxes
`process.env`, so `process.env.TZ = 'Asia/Shanghai'` in a test does **not**
change `Date` behavior (verified empirically — the assignment succeeds and does
nothing). The TZ is fixed when the worker process starts. So:

- To exercise a timezone bug, run the whole process in the target zone:
  `TZ=Asia/Shanghai npx jest <file>` (plain `npx jest` inherits your shell's
  UTC+8; `make test`/CI always run UTC).
- Regression tests for TZ bugs pass trivially under CI's UTC — say so in a
  comment so nobody "simplifies" them away
  (see "date alignment in UTC+ timezones" in `tests/js/transactions/chart_core.test.js`).

**The mirror-image landmine (bites UTC− zones: NYC/California):** constructing
with `Date.UTC(...)`/`new Date('YYYY-MM-DD')` and then reading **local** getters
(`getMonth()`, `setHours(0,0,0,0)`) lands on the previous day/month west of
UTC. The calendar page's month domain and `normalizeDateOnly` both had this.
Rule of thumb: pick ONE domain per value and stay in it — local-construct +
local-read (`parseLocalDate`/`toLocalIsoDate`), or UTC-construct + UTC-read.
For date-handling changes, run the suite under all four zones:
`for tz in UTC Asia/Shanghai America/New_York America/Los_Angeles; do TZ=$tz npx jest <file>; done`

**Related dead ends:** `js/` modules can't be run with `node` directly — the
`@js/` import aliases only resolve via Jest's `moduleNameMapper` or the pages'
import maps, so write a scratch Jest test instead of `node --input-type=module`.
And `npx jest -t <pattern>` is a **regex** — a name containing `+` (e.g.
"UTC+ timezones") silently matches nothing unless escaped.

### The `.toISOString().split('T')[0]` landmine

**Never use `.toISOString().split('T')[0]` on a local `Date` to extract a
YYYY-MM-DD string.** `.toISOString()` outputs in UTC; if the `Date` was
constructed with local getters (e.g. via `parseLocalDate`), a timezone offset
shifts the UTC representation to the previous or next day:

```js
// BAD — drifts in non-UTC timezones:
const d = new Date(2024, 11, 31); // Dec 31 local midnight
d.toISOString().split('T')[0]; // "2024-12-30" in UTC+8!

// GOOD — always correct:
`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Or use toIsoDate() from js/utils/date.js (but note it also uses toISOString internally)
```

### Safe test Date construction

Don't use `new Date(isoStr).toLocaleString('en-US', { timeZone })` to create
"NY-aligned" dates for `isTradingDay` / `isMarketHoliday` tests. The
`toLocaleString` output is locale-dependent and the re-parse uses the system
timezone, producing wrong day-of-week in UTC+8.

Instead, construct dates directly with the local components you want to test:

```js
// BAD — double-parse, locale-dependent:
const july4 = new Date(
    new Date('2024-07-04T12:00:00-04:00').toLocaleString('en-US', {
        timeZone: 'America/New_York',
    })
);

// GOOD — explicit components, no ambiguity:
const july4 = new Date('2024-07-04T12:00:00');
```

### Scratch files go in the artifact dir, not the repo root

When debugging, don't create `scratch.js` / `fix_*.js` in the repo root — ESLint
will flag them and they'll leak into git. Use the session artifact scratch
directory or a temp file outside the repo.
