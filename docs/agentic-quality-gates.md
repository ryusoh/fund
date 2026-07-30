# Agentic quality gates — "measure, don't read" (research findings)

Robert C. Martin (Uncle Bob) has been arguing publicly in 2026 that humans should
stop reviewing AI-generated code line by line and instead enforce discipline
through layered, machine-checked gates: unit tests, acceptance tests, mutation
testing, coverage, complexity and dependency metrics. This doc asks: **given this
repo's current structure and agentic workflow, what concrete improvements can we
adopt from (or inspired by) that gates-instead-of-review approach?** Read before
adding any new check to `make verify` or a new CI workflow.

## TL;DR

- The repo is **already most of the way there**. The two-audience model in
  `AGENTS.md` (unattended Jules routines judged only by green gates + a binary
  human approve/close) _is_ the gates-instead-of-review philosophy, and the
  90% diff-coverage gate (`.github/workflows/diff-coverage.yml`) is exactly the
  kind of metric Uncle Bob's list starts with.
- **Biggest real gap: no automated complexity gate.** The Architect persona
  (`.jules/architect.md`) hunts functions with cyclomatic complexity > 10 _by
  hand_. ESLint's `complexity` rule is not configured (`eslint.config.cjs`), and
  nothing checks Python complexity. Cheap to add; makes the gate, not the agent,
  do the finding.
- **Second gap: no mutation testing anywhere** (no Stryker/mutmut/cosmic-ray in
  `package.json` or `requirements-dev.txt`). This is the one Uncle Bob considers
  the test-quality truth detector, and the one the diff-coverage gate cannot
  substitute for: coverage proves lines _ran_, not that tests _assert_. Adopt it
  diff-scoped/incremental, non-blocking at first — full runs are too slow for
  `make verify`.
- **Third gap: no dependency-structure checks** (no dependency-cruiser /
  import-linter). Moderate value here; the repo's import-map alias layering
  (`@js/`, `@pages/`, `@services/`, …) is enforceable mechanically.
- **No BDD/Gherkin layer exists** and none is urgently needed; the cheapest
  Bob-inspired equivalent is acceptance-level tests for the Python TWRR pipeline
  written in domain language (see the `tdd` skill, which already scopes TDD to
  `scripts/` and portfolio math).

## Recommendations, prioritized

Ordered by value-per-effort. Each is compatible with the existing
`make verify` / `make precommit-fix` gate; none requires reading AI code.

### 1. Automate the complexity gate (cheap, do first) — ✅ implemented

**Status (2026-07-25):** landed. JS: `complexity: ['error', { max: 20 }]` in
`eslint.config.cjs` with the 64 legacy violations baselined in
`eslint-suppressions.json` (ESLint bulk suppressions — error-severity only,
which is why the rule is `error`, not `warn`). Only NEW or worsened violations
fail; fix one, then `npx eslint --prune-suppressions` to ratchet the baseline
down. Python: `radon`/`xenon` in `requirements-dev.txt`, wired into `make lint`
and the pre-commit config (so it also runs in the CI gate `make precommit-fix`)
as `xenon --max-average C --max-modules F --max-absolute F scripts tests`
(current average is C 18.59, worst block F 77 — ceilings freeze today). Next
ratchet steps: prune the suppressions file toward empty, lower the ESLint
`max` toward 10, and tighten xenon ranks.

**Gotchas learned during implementation** (cost a full redesign to discover):

- Check `.pre-commit-config.yaml` before designing any warn-based ratchet — the
  eslint hook there runs `--max-warnings=0`, which silently kills any approach
  based on warning budgets. Bulk suppressions sidestep this because they are
  error-severity only (hence the rule must be `error`, not `warn`).
- When a file's violations exceed its suppressed count, ESLint reports **all**
  of that rule's violations in the file, not just the excess — touching a
  baselined file surfaces its whole backlog in the error output.
- Probe-test protocol: append the probe to a **tracked** file, verify the gate
  fails, then `git restore` and verify it passes — never create a new file for
  a probe (an untracked probe file pollutes parallel gate runs), and never
  mask the backup/restore step's errors (`|| true` hid exactly that failure
  once). Two corollaries learned when this trap fired a second time:
    - **After any probe-restore cycle, confirm your intended changes survived**
      before committing: `git restore` on an uncommitted-but-legitimate edit
      wipes it along with the probe (a coverage floor was silently lost this
      way; the commit's `--stat` file count was the only tell). Sanity-check
      the commit stat against what you expect to be in it.
    - **Pipes mask exit codes** — `cmd 2>&1 | tail` reports tail's status, not
      cmd's. Probe exit codes via `${PIPESTATUS[0]}` or an unpiped redirect.

**Gap closed:** Uncle Bob's "cyclomatic complexity" and "module size" metrics.
Today complexity is policed by a persona's manual labour, not by the gate.

- **JS:** add `'complexity': ['warn', { max: 20 }]` to `eslint.config.cjs`
  (20 is the ESLint default; tighten toward the Architect persona's 10 as the
  backlog burns down). Optionally `max-lines-per-function` as a warn-level
  module-size proxy. Source: [ESLint complexity rule](https://eslint.org/docs/latest/rules/complexity).
- **Python:** add `radon cc scripts -na -nb` (fail above grade B) or `xenon`
  to `make lint`; both are single-purpose CLI tools that fit the existing
  `venv/bin/` tooling pattern.
- **Wiring:** `make lint` (so it lands in both `make verify` and the CI gate
  `make precommit-fix` via `.github/workflows/ci.yml`). Start at `warn` and
  ratchet, per the threshold-philosophy lesson in
  [the Rails playbook](https://blog.codeminer42.com/stop-reading-ai-code-start-measuring-it-a-rails-playbook/):
  "if the threshold forces you to refactor working idioms just to pass, the
  threshold is wrong."
- **Effect on workflow:** Architect's mandate shifts from "find a function over
  10" to "fix what the gate flags" — the metric becomes the detector, the agent
  becomes the fixer. That is precisely the division of labour the approach
  prescribes.

### 2. Diff-scoped mutation testing, non-blocking then ratcheted (high value, real cost)

**Status (2026-07-25):** landed, manual/scheduled-only. JS: StrykerJS
(`@stryker-mutator/core` + `jest-runner` 9.6.1, `stryker.config.mjs`,
incremental mode). Python: mutmut 3.6.0 (`[tool.mutmut]` in `pyproject.toml`).
Wired as `make mutate-js MUTATE=js/utils/host.js` /
`make mutate-py SCOPE='scripts.utils.security_utils.*'` — **not** in
`make verify` / `make precommit-fix` — plus a weekly scheduled workflow
(`.github/workflows/mutation-testing.yml`, Sunday 04:42 UTC, diff-scoped to
files changed in the last 7 days, uploads reports as artifacts, never gates
PRs). Ratchet: `mutation-ratchet.json` floors + `scripts/check_mutation_ratchet.py`
(covered by `tests/python/test_check_mutation_ratchet.py`); floors are `null`
(report-only) until seeded from real scheduled runs via
`make mutate-ratchet-update`.

**Verified smoke runs (2026-07-25, this machine):**

- `TZ=UTC npx stryker run --mutate js/utils/host.js` → 62 mutants, **91.94%**
  (43 killed, 14 timeout, 5 survived), 3m05s cold, 44s incremental re-run,
  exit 0.
- `venv/bin/mutmut run 'scripts.utils.security_utils.*'` → 20 mutants,
  **19 killed / 1 survived (95%)**, 2.5s (after a one-time ~60s stats
  collection), exit 0. The survivor (`x_scrub_secrets__mutmut_20`) replaces
  the `"***"` literal in the `quote_plus` line — effectively equivalent for
  secrets without spaces (where `quote == quote_plus`), i.e. a real assertion
  gap the tests don't pin down.

**Gotchas learned during implementation** (each cost a failed run):

- npm `overrides.minimatch: ^3.1.2` broke Stryker's ESM `import { minimatch }`
  (v3 has no named export) — scoped exception added:
  `overrides["@stryker-mutator/core"].minimatch: ~10.2.4`.
- Stryker `coverageAnalysis: 'perTest'` is **not usable here**: six test files
  pin `@jest-environment jsdom` via docblock, overriding the config-level
  environment, and plain jsdom can't report coverage to Stryker (dry run dies
  with "Missing coverage results"). Shipped `'off'` (full suite per mutant,
  ~3s each) — fine for diff-scoped weekly runs.
- Stryker's sandbox dry run used to flake on
  `tests/js/transactions/terminal_core.test.js:400` (a
  `requestAnimationFrame`-vs-`setTimeout(0)` race that resolved differently
  under sandbox load). Fixed 2026-07-26: the test now awaits its own
  `requestAnimationFrame`, which is deterministic (rAF callbacks run FIFO
  within a frame). The single retry in `make mutate-js` and the workflow is
  kept as belt-and-braces for any future sandbox flake.
- mutmut 3.6 needs explicit config: `source_paths = ["scripts"]`, and
  `also_copy` must include `pytest.ini` — otherwise pytest inside `mutants/`
  loses `testpaths`/`pythonpath`, collects `scripts/test_*.py`, and the
  trampoline's sys.path side effects break collection
  (`test_twrr_acceptance.py` import chain). `also_copy` also lists the repo
  meta-files conformance tests read (`.jules/`, `AGENTS.md`, `Makefile`,
  `package.json`, `.github/`, `data/`).
- Four test files patch `os.environ.get` globally; mutmut's trampoline reads
  `MUTANT_UNDER_TEST` through `os.environ.get` at call time and crashes under
  the patch. They are `--ignore`d in `[tool.mutmut]` (tests can't be edited
  for a tooling change); mutants in the modules they cover report as untested.
- mutmut run filters are dotted mutant-name globs
  (`scripts.utils.security_utils.*`), not file paths.
- Scratch dirs (`mutants/`, `reports/`, `.stryker-tmp/`) are gitignored and
  excluded from eslint/markdownlint/black so a local mutation run can't dirty
  the gates.

**Deferred (next steps, in plan order):** seed the ratchet floors from the
first 2–3 weekly runs (floors are per-tool, "don't get worse" on whatever the
run covered — interpret regressions against scope changes before acting);
only then consider stage 3, a PR-blocking diff-scoped check via `--mutate` on
changed files.

**Gap closed:** the diff-coverage gate proves changed lines are _executed_; it
cannot prove tests would _catch a bug_ in them. Mutation testing is the only
metric on Uncle Bob's list that measures assertion strength — the
[Rails playbook](https://blog.codeminer42.com/stop-reading-ai-code-start-measuring-it-a-rails-playbook/)
calls it "the truth detector" and notes AI-written tests can hit 100% line
coverage while asserting nothing important.

- **JS:** StrykerJS. Jest is fully supported, including `--incremental` mode,
  which re-runs mutation only on changed code/tests and caches the rest in
  `reports/stryker-incremental.json`; you can also scope with
  `--mutate <file>:<lines>` ([StrykerJS incremental docs](https://stryker-mutator.io/docs/stryker-js/incremental/)).
- **Python:** mutmut — "remembers work that has been done, so you can work
  incrementally" and re-tests only functions modified since the last run
  ([mutmut docs](https://mutmut.readthedocs.io/en/latest/)).
- **Cost honesty:** a full mutation run multiplies the test-suite runtime by
  the number of mutants (thousands). Do **not** put a full run in `make verify`.
  Suggested staging:
    1. A nightly/weekly scheduled workflow (model on the existing
       `.github/workflows/daily-forex-update.yml` pattern) that runs
       incrementally and posts the kill ratio as a report artifact.
    2. A ratchet file (like the Rails playbook's `quality_thresholds.yml`):
       first run sets the floor; the gate's rule is "don't get worse."
    3. Only consider a PR-blocking check later, diff-scoped via `--mutate` on
       changed files.
- **Where it wires in:** new `make mutate-js` / `make mutate-py` targets +
  one scheduled workflow; a one-line mention in `AGENTS.md`'s command table.

### 3. Dependency-structure checks (moderate value, cheap) — ✅ JS landed; Python skipped with evidence

**Status (2026-07-25):** JS side landed: `.dependency-cruiser.cjs` with three
rules — `no-circular`, `no-cross-page-imports` (AGENTS.md non-negotiable #6),
`not-to-vendor` — all measured **zero violations** on day one (124 modules,
371 dependencies), so no baseline was needed; the gate is purely preventive.
Wired as `make depcheck` (a `make lint` dependency, so it lands in
`make verify`) and as an `always_run` pre-commit hook (so it also runs in the
CI gate `make precommit-fix`). Alias resolution (`@js/` etc.) goes through a
webpack-config stub, `.dependency-cruiser.webpack.cjs` — deliberately not
`options.tsConfig`, which makes dependency-cruiser look for a typescript <7
compiler (the repo has v7) and print a spurious "missing-typescript-transpiler"
warning every run; keep the stub's aliases in sync with `jsconfig.json` paths.
Probe-tested: a circular import and a cross-page import each fail the gate;
`git restore` returns green.
Python side **deliberately skipped after measuring**: `scripts/` is mostly
namespace packages (no `__init__.py` in `data/`, `twrr/`, `pnl/`, `portfolio/`,
`ratios/`), and grimp (import-linter's graph builder) has no namespace-package
support — the interesting edges (`commands → data`, `twrr → twrr.utils`) are
invisible to it, while among the four real packages there are **zero**
cross-imports, so a contract would gate an empty relation. Unblock condition:
add `__init__.py` to those dirs (a packaging change, not done here), then a
`layers` contract becomes meaningful. `import-linter` was uninstalled again;
nothing was wired in.

**Gap closed:** "dependency structure" is on Uncle Bob's metric list and is the
one with zero coverage in this repo today.

- **JS:** dependency-cruiser. Enforce rules the repo already believes in:
  no circular dependencies, `js/pages/**` must not import across pages
  (mirrors `AGENTS.md` non-negotiable #6, "page-scoped changes must not leak"),
  first-party code must not import `js/vendor/**` except through the import map.
  Source: [sverweij/dependency-cruiser](https://github.com/sverweij/dependency-cruiser).
- **Python:** import-linter `layers` contract over `scripts/` (e.g. `twrr` steps
  may not import from `commands/`). Source:
  [import-linter docs](https://import-linter.readthedocs.io/).
- **Wiring:** a `make depcheck` target added to `make verify`. Start with the
  no-cycles rule only — the Rails playbook author deliberately _skipped_ this
  metric on a small app and documented the skip rather than inventing a number;
  the same honesty applies here. Cycles + page isolation are the two rules that
  map to real pain in this repo.

### 4. Whole-suite coverage floor (trivial, optional) — ✅ implemented

**Status (2026-07-25):** landed. `package.json` `coverageThreshold.global` is
now `{ statements: 85, branches: 70, functions: 85, lines: 85 }` — measured on
landing day at 88.5 / 74.05 / 88.97 / 88.43, so the floor sits ~3-4 points
below reality (headroom for harmless fluctuation; branches has the most slack
because it's the noisiest metric). Verified: suite passes at the floor, and
raising `branches` to 75 makes jest fail with "does not meet global threshold".
The floor only ratchets UP — Testpilot raises it as coverage improves.

`package.json` has `"coverageThreshold": {}` — the only coverage enforcement is
the 90% **diff** gate. A low global floor (e.g. lines/branches at the current
measured value, ratcheted upward by Testpilot) would stop silent whole-suite
erosion that a diff gate can't see. One config stanza; zero runtime cost.

### 5. Acceptance-layer tests in domain language (defer; smallest concrete step only) — ✅ smallest step landed

**Status (2026-07-25):** the cheapest honest step landed as
`tests/python/test_twrr_acceptance.py` — five behaviour-level pytest cases
that chain the real pipeline functions (`step02.apply_split_adjustments` →
`step04.build_holdings` → `step05.compute_cashflows` →
`step06.compute_twrr`) over tiny hand-computable fixtures, with domain-name
tests, Given/When/Then comments, and expected values computed by hand in the
comments (e.g. a deposit of $100 at a flat price contributes a daily factor
of exactly 1.0, so the period TWRR equals the pure price return). Behaviours
pinned: buy-and-hold equals the price return; a deposit is not a return; a
2:1 split doubles the share count without changing the return; a withdrawal
distorts nothing; a zero-price (spin-off/gift) transaction is not an external
cashflow. This is the honest smallest step because the pre-existing step02
tests mock pandas/numpy and assert _calls_, not values — they execute lines
without pinning any number, so these five cases are the first tests that
would fail if the TWRR math actually broke. Coverage delta on
`scripts/twrr/`: `step02_apply_splits.py` 52% → 54% (the mock test already
_executed_ the split loop, so the line delta is only the empty-splits branch
— the value these tests add is assertion, not lines), and
`step04_compute_holdings.py` / `step05_cashflows.py` /
`step06_compute_twrr.py` go from unmeasured (never imported by any test) to
38% / 53% / 48% — the first real coverage of the pipeline core; `utils.py`
stays at 100%. What a fuller ATDD layer would still add later: more
behaviours from §5's list (delisted tickers keeping their last price,
multi-security portfolios, same-day flow conventions), fixtures driven
through the parquet checkpoints instead of in-memory chaining, and — only if
these prove their worth — a Gherkin runner.

Uncle Bob's ATDD-for-agents approach uses two test streams — acceptance and
unit — so the agent "can't just willy-nilly plop code around"
([quoted in the DAE repo](https://github.com/swingerman/disciplined-agentic-engineering)).
This repo has a strong unit stream (~44.5k LOC of tests, per
`docs/js-typing-strategy.md`) but no acceptance stream.

- **Do not** adopt a Gherkin runner wholesale (jest-cucumber / pytest-bdd) —
  the DAE methodology itself generates a project-specific pipeline instead of
  using stock Cucumber, and this repo's surface (static dashboards + a data
  pipeline) has thin acceptance-test seams.
- **Cheapest honest step:** for the Python TWRR pipeline (`scripts/twrr/`,
  already the `tdd` skill's home turf), write a handful of end-to-end
  pytest cases phrased as behaviours ("a split mid-holding does not change
  TWRR", "delisted tickers keep their last price"), independent of the unit
  tests' structure. That gives the two-stream constraint where the math is.
  Revisit Gherkin only if these prove their worth.

### 6. What _not_ to adopt

- **Do not add a full mutation run or a hard complexity ceiling to
  `make precommit-fix` on day one.** CI parity (`Makefile:84-86`) means every
  new check must run in GitHub Actions; slow or noisy gates there will get
  routed around, not obeyed.
- **Do not drop the existing AI PR-review workflows**
  (`.github/workflows/claude-pr-review.yml`, `claude-code-review.yml`).
  "Don't read the code" addresses _human_ line-by-line review economics; an
  automated reviewer that posts comments is itself a gate, and the human's
  decision here is already binary (approve/close) per `AGENTS.md`.

## What this repo already has (the gate inventory)

Mapped against Uncle Bob's metric list from his 2026-04-14 post
([x.com/unclebobmartin/status/2044114698451476492](https://x.com/unclebobmartin/status/2044114698451476492),
as reported by [Codeminer42](https://blog.codeminer42.com/stop-reading-ai-code-start-measuring-it-a-rails-playbook/)):
coverage, dependency structure, cyclomatic complexity, module sizes, mutation
testing.

| Gate (Uncle Bob's list) | This repo today                                                                                                                              | Status           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Unit tests              | Jest (`package.json` → `npm test`, TZ=UTC) + pytest with coverage; `make test-tz` runs the JS suite under UTC± zones                         | ✅ strong        |
| Coverage                | 90% **diff**-coverage gate on both JS and Python + whole-suite floor (stmts/funcs/lines 85, branches 70 — `coverageThreshold`, §4)           | ✅ diff + floor  |
| Acceptance tests (BDD)  | Gherkin still deferred; smallest step landed: `tests/python/test_twrr_acceptance.py` behaviour-level cases (§5)                              | ⚠️ partial       |
| Mutation testing        | Stryker + mutmut, diff-scoped, weekly scheduled non-blocking workflow + ratchet floors (`make mutate-js`/`mutate-py`; §2)                    | ✅ scheduled     |
| Cyclomatic complexity   | ESLint `complexity` error > 20 with `eslint-suppressions.json` baseline + xenon ranks, in `make lint` and pre-commit (§1)                    | ✅ gated         |
| …as a process           | Architect works the suppressions backlog / `radon` list — the metric finds, the agent fixes (`.jules/architect.md`)                          | ✅ metric-driven |
| Module size             | No limits (no `max-lines`)                                                                                                                   | ❌ missing       |
| Dependency structure    | dependency-cruiser: no-circular + no-cross-page-imports + not-to-vendor, via `make depcheck` + pre-commit (§3); Python skipped with evidence | ✅ JS gated      |
| Security/QA             | `bandit` (`make sec`), `npm-audit.yml`, Sentinel persona for error-handling                                                                  | ✅               |
| Spec stage              | `AGENTS.md` + per-subsystem `docs/` + subsystem landmines section; personas must read them before touching an area                           | ✅ partial       |

The workflow-level machinery also already matches the philosophy:

- `AGENTS.md` — PRs must be "self-evidently correct and approvable at a glance";
  the PR body must paste verification output; the human does a binary
  approve/close and never iterates.
- `Makefile` — `verify` (lint type sec test sync-check thinking-check),
  `precommit-fix` (the CI gate, called from `.github/workflows/ci.yml`),
  `sync-check` (generated-file drift detection — a gate the agent cannot talk
  its way past), `thinking-check` (deterministic stream-of-consciousness scan:
  thinking-out-loud comments + abandoned test bodies over all tracked
  py/js/ts/css — `scripts/check_thinking_comments.py`; AGENTS.md
  non-negotiable #9).
- `.jules/` personas — Typist (strict JSDoc), Testpilot (coverage → 100%),
  Architect (complexity), Sentinel (security/error-handling), Janitor (dead
  code), Bolt (perf). These are, in effect, Uncle Bob's "refactor agent" and
  "architecture-review agent" instantiated as scheduled lanes.
- CI — `web-ci` (runs `make precommit-fix`, rejects empty PRs), `diff-coverage`,
  `commit-lint`, plus two Claude AI-review workflows.

## Evidence, claim by claim

**Repo facts** (verified by direct inspection on 2026-07-25, the research day,
**pre-implementation** — several lines below are now historical; the inventory
table above and the per-recommendation status blocks are the living version):

- `AGENTS.md` — two audiences, lanes table, non-negotiables, 90% diff-coverage
  description, PR-proof rules.
- `Makefile:192` — `verify: lint type sec test sync-check`; `Makefile:87-103` —
  `precommit-fix` phases (format → lint-fix → test incl. `test-tz` → precommit).
- `.github/workflows/ci.yml` — web-ci job runs `make precommit-fix`; hard-fails
  on empty PR diffs.
- `.github/workflows/diff-coverage.yml` — `diff-cover --fail-under 90` on both
  `coverage/lcov.info` (JS) and `coverage.xml` (Python); `coverage-exempt` label
  skips it.
- `package.json:88` — `"coverageThreshold": {}` (empty).
- `eslint.config.cjs` — no `complexity`, no `max-lines` rules.
- `pyproject.toml:14-19` — ruff selects `E,F,I,B` only.
- `requirements-dev.txt` — pytest/pytest-cov/diff-cover/ruff/black/mypy/bandit;
  no mutation or complexity tools.
- Repo-wide grep for `stryker|mutmut|cosmic-ray|jest-cucumber|pytest-bdd|
dependency-cruiser|import-linter|radon|xenon` — no tooling hits.
- `.jules/architect.md` — mandate is one function from complexity > 10 to ≤ 10
  per run; `.jules/testpilot.md` — targets 100% coverage, least-covered first.

**External claims:**

- Uncle Bob's metric list (coverage, dependency structure, cyclomatic
  complexity, module sizes, mutation testing) comes from his 2026-04-14 X post,
  [x.com/unclebobmartin/status/2044114698451476492](https://x.com/unclebobmartin/status/2044114698451476492).
  I could not fetch x.com directly; the content is taken from a screenshot and
  discussion in
  [Codeminer42's Rails playbook](https://blog.codeminer42.com/stop-reading-ai-code-start-measuring-it-a-rails-playbook/)
  (2026-04-23), which links the post. **Secondhand but well-corroborated.**
- His O'Reilly live course page (primary source) confirms the discipline set:
  "acceptance testing, unit testing, mutation testing, and code quality
  analysis", with schedule segments for Dependency Checking, TDD with agents,
  and building from a static specification —
  [AI Agents for Clean Code](https://www.oreilly.com/live-events/ai-agents-for-clean-code-with-uncle-bob-martin/0642572376765/).
- The video series exists:
  [Clean AI: Agentic Discipline](https://www.oreilly.com/videos/clean-ai-agentic/9780135968819/)
  (O'Reilly lists episodes 1–3+; the page 403'd on full fetch, so episode
  contents are unverified).
- The two-test-streams rationale is quoted from him via the
  [Disciplined Agentic Engineering repo](https://github.com/swingerman/disciplined-agentic-engineering)
  (secondhand, quoting his empire-2025 writings): "The two different streams of
  tests cause Claude to think much more deeply about the structure of the code."
  And on specs: "Specs will be co-authored by the humans and the AI, but with
  final approval, ferociously defended, by the humans."
- The "Agentic Discipline" research framing (four months of research; testing,
  BDD, coverage, mutation, debugging strategy) is corroborated by
  [Ken Corey's write-up](https://kencorey.com/flippin-bits/your-ai-agent-gets-better-feedback-than-your-engineers)
  (2026-07-15).
- Tool docs cited above: [StrykerJS incremental](https://stryker-mutator.io/docs/stryker-js/incremental/),
  [mutmut](https://mutmut.readthedocs.io/en/latest/),
  [ESLint complexity](https://eslint.org/docs/latest/rules/complexity),
  [dependency-cruiser](https://github.com/sverweij/dependency-cruiser),
  [import-linter](https://import-linter.readthedocs.io/) — all fetched/verified
  this session.

## Open questions / what I couldn't verify

- **The exact 4-agent pipeline** (spec-agent → coding-agent → refactor-agent →
  architecture-review agent, "each stage more formal") as described in the
  research prompt: I found **no primary source** for that specific four-agent
  decomposition. The O'Reilly course page lists disciplines, not an agent
  pipeline; the DAE repo describes an 8-checkpoint methodology _inspired_ by
  Uncle Bob but is a third party's synthesis. Treat the 4-agent pipeline as
  **secondhand reporting** until the Clean AI video series (paywalled) or an
  Uncle Bob post confirming it is found. The recommendations above do not depend
  on it — they rest on the verified metric list and course disciplines.
- **The exact wording of the 2026-04-14 X post** — x.com is not fetchable
  without auth; wording here is paraphrased from the Codeminer42 screenshot
  description.
- **Clean AI: Agentic Discipline episode contents** — the O'Reilly page returns
  403 to non-authenticated fetches; only its existence and episode count were
  confirmed.
- **StrykerJS on this repo specifically** — the docs confirm jest support
  (including incremental mode's "Full" test reporting tier), but I did not run
  it; the jsdom + babel-jest + import-map setup may need config work (the
  `moduleNameMapper` vendor mocks in particular). Expect a setup session before
  the first kill ratio is trustworthy.
- **Whether the `claude-pr-review.yml` AI reviewer helps or merely adds noise**
  — out of scope for the repo inspection done here; worth a separate look at
  whether its comments correlate with post-merge fixes.
