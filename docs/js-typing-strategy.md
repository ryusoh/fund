# JS typing strategy — TS migration? (analysis & decision)

Why this repo does **not** do a full TypeScript migration, and what the cheap,
architecture-preserving alternative is. Read before re-opening the "should we
move to TS" question — the answer was derived from the repo's actual shape, not
from generic best-practice essays.

## TL;DR

- **No full `.js`→`.ts` migration.** It would force a frontend build step, which
  destroys the repo's deliberate "no build step / import map" architecture
  (see `CLAUDE.md`). Net loss for a single-maintainer ~40k-LOC project.
- **The one real gap:** Python is type-checked in CI (`mypy`), JS is not checked
  at all. The two halves have inconsistent type discipline.
- **The cheap fix (DONE for the first whitelist):** `jsconfig.json` + `checkJs`
    - JSDoc on a small whitelist of core files, with `tsc` wired into `make verify`
      (the `type` target) **non-blocking**, alongside `mypy`. No `.ts`, no build
      step, no runtime change. See "Outcome" below.

## Outcome — phase 1 landed (2026-06)

Implemented the loose whitelist tier on `js/config.js`, `js/config/**`,
`js/utils/**`:

- **Errors: 12 → 0** under `strict:false`. The fixes were all JSDoc/contract
  corrections except one deletion — and crucially, **no `any`/`@ts-ignore`/
  `@ts-nocheck`** (the verifier-driven rule: never silence, only fix).
- **A real latent defect surfaced that ESLint here does _not_ flag:** a duplicate
  `VTSAX` key in `js/config/assetClasses.js` (benign — same value — but dead).
  This alone is the day-one payoff of `checkJs`.
- Other fixes: stale JSDoc `@param` names + wrong `@returns` on `getConvertedNum`
  in `formatting.js`; `number|string` widening on `formatCurrency`'s input;
  precise `(value:any)=>string` typing for the `formatValue` option objects.
- `process` (used by `logger.js`'s `isDevelopment()`) is satisfied by a tiny
  type-only ambient at `js/types/globals.d.ts` — **not** `@types/node`, which
  drags Node's builtin-shadow packages (`punycode`, `string_decoder`) into the
  program and re-introduces ~29 errors.
- Wiring: `npm run typecheck:js` (= `tsc -p jsconfig.json`) and `make verify` →
  `type` runs it after `mypy`, non-blocking (`|| echo …`). Promote to blocking
  once it's been green for a while.
- Verified: `tsc` 0 errors; touched-module jest suites green (formatting/
  assetClasses/logger/config, 197 tests); `eslint .` + `prettier --check` clean.

**Cost:** well under an hour of agent time, most of it spent on the `@types/node`
detour. The wiring itself is minutes.

**Still open (optional, incremental):** `strict:true` is **105 errors**, 59 of
which are just "annotate this param" (TS7006). That's the do-it-properly tier —
tackle a file's annotations only when you're already editing it. Expand the
`include` whitelist the same way.

## The real numbers (re-derive any time)

The "200k-line legacy monolith" framing does **not** apply here. Measured shape:

| Metric                               | Value            | How to re-check                                                                                  |
| ------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------ |
| Tracked `.js` LOC                    | ~146k            | `git ls-files '*.js' \| xargs wc -l \| tail -1`                                                  |
| …of which vendored/min/`cal-heatmap` | ~63k             | `git ls-files '*.js' \| grep -iE 'vendor\|min\.js\|dist\|cal-heatmap' \| xargs wc -l \| tail -1` |
| …of which tests                      | ~44.5k           | `git ls-files 'tests/*.js' \| xargs wc -l \| tail -1`                                            |
| **First-party app source**           | **~40k**         | remainder                                                                                        |
| Human contributors                   | **1** (`ryusoh`) | `git shortlog -sne --all` — the rest are bots                                                    |
| `@ts-check` / JSDoc type usage       | **0 files**      | `git grep -l '@ts-check' -- '*.js'`                                                              |
| `tsconfig`/`jsconfig`                | none             | `git ls-files \| grep -iE 'tsconfig\|jsconfig'`                                                  |
| `typescript` dependency              | none             | `package.json` devDeps                                                                           |

So the decision-matrix node is "single dev, ~40k LOC, strong tests, deliberately
no build" — the **least** urgent case for migration.

## Why pure JS is defensible here (not just inertia)

- **JS is the runtime; TS is erased at compile time.** TS guarantees hold at
  edit time, not run time. The frontend ships JS either way.
- **Zero build step is an architecture value, not laziness.** Pages are plain
  HTML loading ES modules via an import map. `.ts` files would require
  transpile/bundle — `esbuild` here only serves `scripts/build-calendar.js`, not
  the frontend.
- **Tests already absorb much of what types would catch.** ~44.5k LOC of tests +
  a 7-stage `verify:all` gate. The `undefined`/interface-drift class of bug is
  already heavily fenced.
- **The "JS vs TS" framing is a false binary.** The real spectrum is
  **bare JS → JS + JSDoc (with `checkJs`) → TS**. The middle keeps the no-build
  property while gaining type checking. Precedent: Svelte's own source moved
  TS→JS+JSDoc; DHH removed TS from Turbo 8. "Big teams keeping JS" almost always
  means JS+JSDoc-with-checking, not untyped JS.

## If we ever act: the staged, scoped plan

1. **`jsconfig.json` + `checkJs`, whitelist start.** No suffix changes, no build
   step. Start with the highest-value cores:
    - `js/config.js` (~757 lines, central tunables — the hidden contract every
      page depends on).
    - `js/utils/` (~1.5k lines, high call frequency).
      Add `// @ts-check` + JSDoc `@typedef` to those file heads.
2. **Wire `tsc --noEmit --checkJs` into `verify:all`, beside `mypy`.** Run it
   **non-blocking** first to gauge red-line density, then promote to a blocking
   gate so JS and Python type discipline match.
3. **Expand by need only.** Add JSDoc to a module _when you're already changing
   it_. Edge/stable pages stay plain JS forever.

## What NOT to do

- **No full `.js`→`.ts` rename.** Forces a frontend build step; kills the import
  map architecture. Net loss for this repo.
- **No `any`-spam to silence errors.** That's the "AnyScript" anti-pattern — pure
  cost, no safety.
- **Don't conflate this with the calendar migration.** The 36 in-tree `.ts` files
  are vendored cal-heatmap source under the DOM-renderer migration
  (`docs/calendar-renderer-migration.md`); `esbuild`/`build-calendar.js` serve
  only that. It is **not** evidence the main frontend is "going TS."

## Bottom line

Typing this repo is optional polish, not a rescue. The single highest-value,
lowest-risk move is JSDoc + `checkJs` on `js/config.js` and `js/utils/`, gated by
`tsc --noEmit` next to the existing `mypy` step — closing the JS/Python type
asymmetry without touching the no-build architecture.
