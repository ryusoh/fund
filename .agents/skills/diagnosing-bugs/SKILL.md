---
name: diagnosing-bugs
description: Diagnosis loop for hard bugs and performance regressions. Use when the user says "diagnose"/"debug this", or reports something broken/throwing/failing/slow.
---

# Diagnosing Bugs

A discipline for hard bugs. Skip phases only when explicitly justified.

Before exploring, read the relevant subsystem doc under `docs/` so you have a
mental model before touching code — CLAUDE.md lists which doc governs which area
(liquid-glass, chart-crosshair, PE pipeline, terminal-data-readiness, calendar
migration, pages-deploy). Read it first; several of this repo's worst bugs are
**silent wrong output, not an error**.

## This repo's silent-failure trap classes — suspect these first

These render wrong values with **no error**, so a naive loop goes green while the
bug is live. If the symptom smells like one of these, build the loop to catch it:

- **Date off-by-one that's wrong in the browser but green under tests.** Jest runs
  `TZ=UTC`; your browser is UTC+8. A `toISOString()` day-key bug is invisible to
  CI. Read `docs/testing-notes.md` before trusting a green date test.
- **Stacked-chart renderer omits a layout field** (e.g. `dates`) → the crosshair
  consumer renders **0%**, not an error. See `docs/chart-crosshair-layout.md`.
- **Terminal command reads `transactionState` without awaiting
  `whenTransactionDataReady()`** → prints silent **"(no data)"**. See
  `docs/terminal-data-readiness.md`.
- **Null `forward_pe.msci_pe_ratio`** → PER cell renders trailing-only, not an
  error. See `docs/pe-forward-pe-pipeline.md`.
- **Glass / refraction / lighting** are Chromium-only and visual — unit tests
  **cannot** see a transparent edge or misaligned rim. See `docs/liquid-glass.md`.

## Phase 1 — Build a feedback loop

**This is the skill.** Everything else is mechanical. If you have a **tight**
pass/fail signal that goes red on _this_ bug, you will find the cause. If you
don't, no amount of staring at code will save you. Spend disproportionate effort
here. **Be aggressive. Be creative. Refuse to give up.**

### Ways to construct one — roughly in this order

1. **Scoped failing test** at the seam that reaches the bug — `npx jest <path>`
   (fast, no coverage) for JS, `venv/bin/pytest <path>` for Python.
2. **CLI / pipeline invocation** with a fixture input, diffing output against a
   known-good snapshot (the Python data pipeline in `scripts/`).
3. **Dev server + browser** — `make serve` (repo root at :8000), open the page.
4. **Headless screenshot** — `make screenshot URL=/<page>/` and read the PNG.
   This is the loop for anything the browser renders that tests can't see.
5. **Replay a captured artifact** — save a real payload / generated `data/*.json`
   to disk and replay it through the code path in isolation.
6. **Throwaway harness** — minimal subset that exercises the bug path in one call.
7. **Property / fuzz loop** — for "sometimes wrong output", run many random inputs.
8. **Differential loop** — same input through old vs new (or two configs), diff.

Build the right feedback loop, and the bug is 90% fixed.

### Tighten the loop

- **Faster** — scope the test to one file; skip unrelated init.
- **Sharper** — assert the specific symptom, not "didn't crash".
- **Deterministic** — pin time and **TZ** (repo tests run `TZ=UTC`; if the bug is
  timezone-shaped, run the loop at `TZ=Asia/Shanghai` to match the browser — see
  `docs/testing-notes.md`), seed RNG, isolate the filesystem.

Note: **jest runs silent here** — `console.log` prints nothing. Before debugging
an odd/flaky JS test, read `docs/testing-notes.md`.

### When you genuinely cannot build a loop

Stop and say so. List what you tried. For visual/glass bugs the honest loop is
often "the user views the live page" — ask them to look rather than claiming
parity from a screenshot. Do **not** proceed to hypothesise without a loop.

### Completion criterion — a tight loop that goes red

Phase 1 is done when you can name **one command** you have **already run once**
(paste the invocation and output) that is: **red-capable** (drives the real bug
path, asserts the user's exact symptom), **deterministic**, **fast**, and
**agent-runnable**. If you catch yourself building a theory before this command
exists, **stop** — jumping to a hypothesis is the exact failure this prevents.

## Phase 2 — Reproduce + minimise

Run the loop, watch it go red. Confirm it's the **user's** symptom, not a nearby
one. Then shrink to the **smallest scenario that still goes red** — cut inputs,
callers, config, data one at a time, re-running after each cut. Done when every
remaining element is load-bearing. The minimal repro becomes the Phase 5 test.

## Phase 3 — Hypothesise

Generate **3–5 ranked, falsifiable hypotheses** before testing any. Each states a
prediction: "If X is the cause, changing Y makes the bug disappear." Show the list
to the user before testing — they often re-rank instantly. Don't block if AFK.

## Phase 4 — Instrument

Each probe maps to one Phase-3 prediction. **Change one variable at a time.**
Prefer a debugger/REPL over logs. **Tag every debug log** with a unique prefix
(`[DEBUG-a4f2]`) so cleanup is one grep. For perf regressions, **measure first**
(`performance.now()`, profiler) — logs are usually the wrong tool.

## Phase 5 — Fix + regression test

Write the regression test **before the fix**, but only if a **correct seam**
exists — one that exercises the real bug pattern at the call site. If the only
seam is too shallow (or the bug is visual and untestable, per the glass trap
above), **that itself is the finding** — note it. Otherwise: failing test → watch
fail → fix → watch pass → re-run the Phase-1 loop on the original scenario. For
visual fixes, re-verify with `make screenshot` **and** have the user view the
live page — a screenshot proves it rendered, not that it looks right.

## Phase 6 — Cleanup + post-mortem

- [ ] Original repro no longer reproduces
- [ ] Regression test passes (or absence of seam documented)
- [ ] All `[DEBUG-...]` instrumentation removed (`grep` the prefix)
- [ ] Throwaway harnesses deleted
- [ ] The correct hypothesis stated in the commit / PR message
- [ ] `make verify` (or scoped `make precommit-fix`) is green

**Then ask: what would have prevented this bug?** If the answer is a durable repo
improvement — a knowledge doc, a `Makefile` target, a lint/CI gate, a CLAUDE.md
line — hand off to `/retro` with the specifics, **after** the fix is in.
