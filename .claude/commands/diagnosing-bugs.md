---
description: Diagnosis loop for hard bugs and performance regressions. Use when the user says "diagnose"/"debug this", or reports something broken/throwing/failing/slow.
---

# Diagnosing Bugs

The goal is a confirmed root cause with a regression test, reached through a
feedback loop rather than code-staring. Start by reading the subsystem doc for
the area (AGENTS.md "Subsystem landmines" maps doc → area) — many of this
repo's worst bugs are silent wrong output, not errors.

## Suspect the silent-failure classes first

AGENTS.md lists the per-subsystem ones (TZ off-by-one, crosshair 0%, terminal
"(no data)", null forward P/E, TWRR $0 history, glass). Three more:

- **Generated `data/` history that rewrites itself.** The pipeline regenerates
  whole time series each run, so a past date's value can change today. The
  loop is git forensics on the committed data: `git log --oneline -- <file>`,
  then `git show <rev>:<file>` and diff the same logical record (one date, one
  ticker) across revisions. When it changed points to the mechanism; which
  tickers changed points to the cause.
- **`blob:` assets killed by CSP.** `img-src 'self' data:` (in each
  `index.html` meta and in `_headers`) blocks blob URLs, so moving an asset
  from `data:` to `blob:` removes the effect with only a console CSP warning.
  Grep console output for "Content Security Policy" early
  (`docs/pages-deploy.md`).
- **"Caustics" is ambiguous** — the lens's `causticGain`, the glass3dPlugin
  shadow ring, or the former `WebGLCaustics`. Confirm which one the user means
  (`docs/liquid-glass.md`).

## Phase 1 — Build a red-capable loop (most of the effort goes here)

Done when you have run one command that drives the real bug path, asserts the
user's exact symptom, and is deterministic and fast. Candidates, roughly in
order:

1. Scoped failing test at the seam — `npx jest <path>` / `venv/bin/pytest <path>`.
2. Pipeline invocation on a fixture, diffed against a known-good snapshot.
3. Replay of a captured payload or committed `data/*.json`.
4. `make serve` + browser, or `make screenshot URL=/<page>/` for rendered bugs.
5. Throwaway harness, property/fuzz loop, or old-vs-new differential run.

Pin time and TZ (tests run `TZ=UTC`; for timezone-shaped bugs also run at
`TZ=Asia/Shanghai`), seed RNG, isolate the filesystem. If no loop is possible
— often true for visual/glass bugs — say so, list what you tried, and ask the
user to view the live page.

## Phase 2 — Reproduce and minimise

Confirm the loop shows the user's symptom, then cut inputs, config, and data
until every remaining element is load-bearing. The minimal repro becomes the
regression test.

## Phase 3 — Hypothesise

Write 3–5 ranked, falsifiable hypotheses ("if X, changing Y removes the bug")
and show them to the user before probing — they often re-rank instantly.
Continue without waiting if they're away.

## Phase 4 — Instrument

One probe per prediction, one variable at a time. Tag debug logs with a unique
prefix (`[DEBUG-a4f2]`) so cleanup is one grep. For perf, measure first
(`performance.now()`, profiler).

## Phase 5 — Fix with a regression test

At a seam that exercises the real bug pattern: failing test → fix → passing
test → re-run the Phase 1 loop. If the only seam is too shallow or the bug is
visual, record that as a finding. Visual fixes end with a screenshot plus the
user viewing the live page.

## Phase 6 — Clean up and close

Original repro gone; regression test green (or the missing seam documented);
`[DEBUG-` prefix grep empty; harnesses deleted; the confirmed hypothesis in
the commit/PR message; `make precommit-fix` green. If a durable repo change
(doc, Makefile target, gate) would have prevented the bug, hand it to `/retro`
after the fix lands.

## Resume protocol

After an interruption or compaction: `git status --short` and `git diff` to
find live probes, re-run the Phase 1 command to see current red/green, then
state the active phase, hypothesis under test, and next check before editing.
