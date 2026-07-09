# Y-axis tick algorithm — `generateConcreteTicks` + `drawAxes` collision

Knowledge doc for agents editing `js/transactions/chart/core.js`. Read this before
touching the tick generation or label collision logic.

## Overview

Y-axis labels are produced in two phases:

1. **Generate** — `generateConcreteTicks(yMin, yMax, isPercent, currency, options)`
   produces a dense array of mathematically "nice" values spanning the data range.
2. **Collide** — `drawAxes` maps each tick to a pixel coordinate via `yScale`,
   then greedily packs labels so no two overlap.

## Phase 1: tick generation (`generateConcreteTicks`)

- `desiredTicks` defaults to 6; compact panes pass `maxTicks` (e.g. 14 for volume).
- When `maxTicks` is set, `targetSegments` is doubled (`(desiredTicks - 1) * 2`)
  to produce a **denser** grid, giving the collision phase more candidates to
  choose from.
- `tickSpacing = niceNumber(range / targetSegments, round=true)` picks a
  human-friendly interval (1, 2, 5, 10, 20, 50, …).
- A retry loop halves `tickSpacing` up to 6 times if the initial grid is too
  sparse (fewer than `maxTicks * 0.5` ticks).
- **No thinning.** The returned array is the full dense grid. All filtering
  happens in phase 2.

## Phase 2: collision resolution (`drawAxes`)

### Invariant: `minSpacingPixels = fontSize`

Two labels overlap if and only if their pixel distance is less than the font
height. The minimum spacing is set to exactly `Math.floor(fontSize)` (11px on
desktop, 9px on mobile). This is the tightest packing that guarantees zero
physical overlap.

> **Do not reduce `minSpacingPixels` below `fontSize`.** Any value < fontSize
> causes physical overlap. Any value > fontSize wastes vertical space and
> reduces label density.

### Packing order: descending absolute value

Ticks are sorted by `Math.abs(value)` **descending** before the greedy packing
loop. This ensures:

1. The outer extremes (e.g. ±110k) are placed first — they are the most
   informative anchors.
2. Intermediate values (e.g. ±50k, ±10k) fill in whatever space remains.
3. Zero is always kept (priority 0, highest).

### Priority levels

| Priority | Meaning      | Examples                                   |
| -------- | ------------ | ------------------------------------------ |
| 0        | Zero line    | `0`                                        |
| 1        | Outer bounds | `yMin`, `yMax`, `min(ticks)`, `max(ticks)` |
| 2        | Intermediate | Everything else                            |

The greedy loop processes priorities 0 → 1 → 2, placing each tick only if it
doesn't collide with any already-placed tick.

### Physical limits (volume pane)

The volume pane is 80px tall. With 11px font:

- `80 / 11 ≈ 7.27` → at most **7 non-overlapping labels** total.
- Each side (above/below zero) gets ~40px → `40 / 11 ≈ 3.6` → max **3 labels
  per side** plus the zero line.

### Square-root scale compression

The volume pane uses a sign-preserving sqrt scale. This compresses high values:
the pixel distance between 110k and 60k is only ~10.5px on a 40px half-pane,
which is **less than** the 11px minimum spacing. So 60k and 110k cannot both
appear — the algorithm correctly drops 60k and keeps 50k instead.

For the canonical range `[-110k, +110k]` on an 80px pane, the algorithm
produces exactly:

```text
[-110k, -50k, -10k, 0, 10k, 50k, 110k]   (7 labels)
```

## Test coverage

- `tests/js/transactions/drawAxes_labels.test.js` — asserts ≥7 labels for the
  volume pane scenario and that no two labels overlap (pixel distance ≥ fontSize).
- `tests/js/transactions/volumeBarWidth.test.js` — asserts bar geometry and
  diverging baseline position.

## What NOT to do

1. **Don't add a "thinning loop"** that removes every Nth tick from the generated
   array before collision resolution. This was tried and caused the label count
   to drop to 3 (just `±100k, 0`), defeating the whole purpose.
2. **Don't hardcode intermediate label values** (e.g. "put 25k halfway").
   The collision algorithm mathematically selects the optimal set.
3. **Don't use `console.log` for debugging** — Jest runs silent.
   Use `require('fs').writeFileSync()` or a failing assertion instead
   (see `docs/testing-notes.md`).
