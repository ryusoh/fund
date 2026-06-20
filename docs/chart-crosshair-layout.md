# Transaction chart crosshair: the layout contract

The hover crosshair (line, dots, tip pane) is drawn by **one** consumer —
`drawCrosshairOverlay()` in `js/transactions/chart/interaction.js` — for **every**
chart. Each renderer under `js/transactions/chart/renderers/` is a **producer**: it
builds a `chartLayouts[key]` object and hands it to the consumer. The consumer reads
fields **by name**. A renderer that omits a field doesn't crash — the value silently
degrades. That is the trap this doc exists to prevent.

## The stacked-area family (composition / sectors / geography / marketcap)

These four share the absolute-vs-percent code path in the consumer. Their layout
object **must** carry all of:

| Field                                                   | Consumed for                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| `series[].getValueAtTime(time)`                         | per-series value at hover (abs currency in abs mode, % in % mode) |
| `valueMode`                                             | `'absolute'` vs `'percent'` branch                                |
| `percentSeriesMap`                                      | per-ticker `%` arrays, **parallel to `dates`**                    |
| `dates`                                                 | time axis the `percentSeriesMap` interpolator is built from       |
| `getTotalValueAtTime`                                   | denominator for the abs→% fallback                                |
| `stackMaxValue`                                         | Y-band hit-testing in `findHoveredHolding`                        |
| `chartBounds`, `xScale`, `yScale`, `minTime`, `maxTime` | geometry                                                          |

`sectors.js`, `geography.js`, and `marketcap.js` all include `dates`. `composition.js`
once **didn't** — that was the bug below. When adding a 5th stacked chart, copy the
layout block from a sibling, not from `composition.js`'s git history.

## Gotcha: a missing field reads as a legitimate `0`, not an error

In absolute mode the tip pane shows `$value (percent%)`. The percent is interpolated:

```js
const dates = layout.dates || []; // undefined → []
const timePoints = new Array(dates.length); // length 0
interpolator = createTimeInterpolator(timePoints); // createTimeInterpolator([]) → () => null
percentValue = interpolator(time) ?? 0; // null ?? 0  →  0
```

So **abs values render correctly while every percentage collapses to `0.00%`** — the
symptom looks like a math bug but is really a missing-field bug. `createTimeInterpolator`
returns `() => null` for empty input, and `null ?? 0` swallows it.

The consumer is now defensive: the `percentSeriesMap` branch is guarded by
`Array.isArray(layout.dates) && layout.dates.length > 0`, so a renderer that forgets
`dates` falls back to `holding.value / getTotalValueAtTime * 100` (correct, just not
interpolated between data points) instead of emitting `0`. Keep that guard — it's the
backstop against this whole class of parity drift.

## Unit-testing `drawCrosshairOverlay` without a real canvas

You don't need a chart or jsdom canvas. Capture the snapshot and stub the 2D context:

```js
import {
    drawCrosshairOverlay,
    crosshairState,
    setCrosshairExternalUpdate,
} from '@js/transactions/chart/interaction.js';

let captured;
setCrosshairExternalUpdate((snapshot) => {
    captured = snapshot;
});
crosshairState.active = true;
crosshairState.hoverTime = someTime; // match a `dates` entry for an exact value
crosshairState.hoverY = 100;

drawCrosshairOverlay(ctxStub, layout); // ctxStub = no-op save/restore/arc/fillText/...
// measureText: () => ({ width: 10 })
const aapl = captured.series.find((s) => s.key === 'AAPL');
expect(aapl.percent).toBeCloseTo(55);
```

Worked example: `tests/js/transactions/chart/composition_crosshair_percent.test.js`.
Reset `crosshairState` and call `setCrosshairExternalUpdate(null)` in `afterEach` — the
state and the external-update hook are module-level singletons shared across tests.
