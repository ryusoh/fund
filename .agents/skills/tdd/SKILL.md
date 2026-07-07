---
name: tdd
description: Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests.
---

# Test-Driven Development

TDD is the red → green loop. This skill is the reference that makes that loop
produce tests worth keeping: what a good test is, where tests go, the
anti-patterns, and the rules of the loop. Consult it before and during the loop.

Before exploring, read the relevant subsystem doc under `docs/` so test names and
interface vocabulary match this repo's domain language (CLAUDE.md maps doc →
area).

## Where this fits in `fund` — and where it does NOT

TDD earns its keep on the **Python data pipeline** (`scripts/`) and **portfolio
math** (`docs/fermat-pascal-kelly-system.md`) — deterministic input→output code
with clean seams.

It is **weak on this repo's highest-value bugs, which are visual.** Glass /
refraction / lighting are Chromium-only; unit tests cannot see a transparent edge
or misaligned rim (`docs/liquid-glass.md`). Don't write a green test and claim a
visual change works — verify in Chrome (`make serve`, open the page) or
`make screenshot URL=/<page>/`, and for fidelity-sensitive effects have the user
view the live page. A passing test is necessary, not sufficient, here.

Watch the **TZ blind spot**: the suite runs `TZ=UTC`, your browser is UTC+8, so a
`toISOString()` day-key test passes while the browser is wrong. Read
`docs/testing-notes.md` before trusting a green date test.

## Test runners

- Scoped JS, tight edit→verify loop: `npx jest <path/to/test>` (silent, no coverage).
- Scoped Python: `venv/bin/pytest <path>` (also `ruff`/`black`/`mypy` in `venv/bin/`).
- Full suite before declaring done: `make test` (matches CI); `make verify` for the
  stricter local superset.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code
can change entirely; tests shouldn't. A good test reads like a specification —
"user can checkout with valid cart" — and survives refactors. In practice here:

- **Assert on observable output**, not internal structure: the generated
  `data/*.json` shape, a rendered value, a returned figure — not a private helper.
- **Expected values come from an independent source of truth** — a worked example,
  a known-good literal, the spec — never recomputed the way the code computes them.
- **Mock at the boundary, not the internals.** Prefer real fixtures (a captured
  payload, a small sample dataset) over mocking a collaborator you own.

## Seams — where tests go

A **seam** is the public boundary you test at: where you observe behavior without
reaching inside. **Test only at pre-agreed seams.** Before writing any test, write
down the seams under test and confirm them with the user — you can't test
everything, and agreeing seams up front is how effort lands on critical paths and
complex logic. Ask: "What's the public interface, and which seams should we test?"

## Anti-patterns

- **Implementation-coupled** — mocks internal collaborators, tests private methods,
  or verifies through a side channel. Tell: breaks on refactor though behavior is
  unchanged.
- **Tautological** — the assertion recomputes the expected value the way the code
  does (`expect(add(a,b)).toBe(a+b)`, a hand-derived snapshot), so it can never
  disagree with the code.
- **Horizontal slicing** — all tests first, then all implementation. Bulk tests
  verify _imagined_ behavior and go insensitive to real changes. Work in **vertical
  slices**: one test → one implementation → repeat, each a tracer bullet.

## Rules of the loop

- **Red before green.** Failing test first, then only enough code to pass it. No
  speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactoring is not part of the loop.** It belongs to review — run `/code-review`
  after the red → green cycle, not during it.
