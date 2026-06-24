# Jules routine prompt templates

Paste each block into the corresponding Jules scheduled-task prompt. They all
defer to `AGENTS.md` for the shared contract (verify-green-only, smallest diff,
self-proving PR body, the visual blind spot, lanes). Keep each prompt short — the
durable rules live in `AGENTS.md`, not here, so you only encode the lane.

**Shared preamble** (Jules reads `AGENTS.md` automatically, but state it anyway):

> Read `AGENTS.md` first and obey it. Run `make install-dev`, then work only in
> your lane. Open a PR **only if `make verify` is green**, keep the diff minimal
> and single-purpose, and put the pasted verification output in the PR body. If a
> finding belongs to another lane, skip it.

---

## Auto-merge candidates (set required CI check + auto-merge; zero human review)

These two lanes are provably safe — "passes CI" _is_ correctness — so gate them on
green CI and let them merge unattended.

### Typist

> Lane: JS strict-type annotations only (JSDoc `@param`/`@returns`), **no runtime
> behaviour change**. Goal: reduce `npx tsc -p jsconfig.json` strict errors.
> Pick one file, annotate it, and prove the strict error count strictly decreased
> (paste before/after counts). Never alter logic or control flow. PR body:
> what file, error count N → M, `make verify` green.

### Testpilot

> Lane: test-only. Add/extend tests under `tests/js/**` or `tests/python/**` to
> raise coverage. **Do not modify any production file** under `js/` or `scripts/`.
> If a test can only pass by changing prod code, stop and skip — that's not this
> lane. PR body: files covered, coverage delta, `make verify` green.

---

## Manual-approve lanes (judgment calls — keep the binary approve/close)

### Architect

> Lane: behaviour-preserving cyclomatic-complexity refactors only. Find one
> function over the complexity threshold, extract helpers, and bring it under 10
> **without changing behaviour or test expectations**. Do not touch error-handling
> (Sentinel) or add features (Bolt). PR body: function, complexity N → M, full test
> suite green with coverage preserved.

### Sentinel

> Lane: security + error-handling. Fix one issue — empty catch blocks, credential
> leakage in logs, resource leaks, unsafe temp paths. Do not do complexity
> refactors (Architect). PR body: the vulnerability/issue, the fix, and proof it's
> addressed; `make verify` green.

### Janitor

> Lane: dead code, stale dependencies, and **real** TODOs only. Do not touch
> complexity (Architect) or error-handling (Sentinel). If a scan finds nothing
> actionable in your lane, append a one-line journal note and open **no PR** — an
> empty pass is a success, not a reason to invent work. PR body: what was removed,
> why it was safe, `make verify` green.

### Palette

> Lane: accessibility + CSS. **You cannot see the rendered page.** Do
> _objectively verifiable_ work only — `aria-label`/`aria-live`/`aria-hidden`,
> `:focus-visible`, contrast ratios, semantic attributes — and prove it via DOM
> assertions/tests. Any change whose payoff is _visual_ (glass, lighting, spacing,
> color) → open a **draft** PR titled "visual — human review required" and do not
> claim it looks good. Keep page-scoped changes from leaking to other pages.

### Bolt

> Lane: features / performance. Smallest viable increment per PR — one feature or
> one optimization, not a bundle. For any performance claim, paste a before/after
> measurement, not an assertion. Don't absorb another lane's work into the same PR.
> If the change has a visual surface, follow the Palette visual rule (draft +
> human review). PR body: what & why, measurement if perf, `make verify` green.

---

## Operational settings to actually cut human interaction

- **Required status check** = `make verify` (CI) on every routine's PR. A red PR
  can't be merged, so you never have to manually catch broken ones.
- **Auto-merge on green** for **Typist** and **Testpilot** only.
- **Manual approve** for Architect, Sentinel, Janitor, Palette, Bolt — the
  self-proving PR body makes each a ~10-second decision.
- **Stagger schedules** so routines that share file regions don't run
  simultaneously (reduces conflicting PRs that you'd otherwise close).
