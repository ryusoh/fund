---
name: tdd
description: Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests.
---

# Test-Driven Development

Goal: a red → green loop that leaves behind tests worth keeping — tests that
read like a specification and survive refactors. Read the subsystem doc first
so test names use the repo's domain vocabulary.

## Where TDD pays off here

Strongest on the Python pipeline (`scripts/`) and portfolio math
(`docs/fermat-pascal-kelly-system.md`): deterministic input → output with clean
seams. For visual work (glass, layout, colour) a green test is necessary but
not sufficient — follow AGENTS.md "Visual changes". For date logic, remember
the suite runs `TZ=UTC` while the browser is UTC+8 (`docs/testing-notes.md`).

Loop with `npx jest <path>` / `venv/bin/pytest <path>`; finish with
`make test`.

## Good tests

- Assert observable output through public interfaces — the generated
  `data/*.json` shape, a rendered value, a returned figure.
- Take expected values from an independent source of truth (a worked example,
  a known-good literal, the spec), so the test can disagree with the code.
- Mock at the system boundary; prefer real fixtures (captured payloads, small
  sample datasets) for collaborators the repo owns.

## Seams

A seam is the public boundary you test at. Before writing tests, propose the
seams under test and agree them with the user ("What's the public interface,
and which seams matter?") so effort lands on critical paths.

## The loop

Work in vertical slices: one seam → one failing test → the minimal code that
passes it → repeat. Each slice is a tracer bullet; writing all tests up front
verifies imagined behaviour. Refactoring happens in review after the loop.

Smells to correct: tests that break on a refactor with unchanged behaviour
(coupled to internals), and assertions that recompute the expected value the
way the code does (tautological).

## Resume protocol

After an interruption or compaction: `git status --short`,
`git log -n 3 --oneline`, and the scoped test run show the real state. State
the current slice, its failing assertion, and the minimal implementation
target before editing.
