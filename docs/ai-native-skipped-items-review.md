# Review of the 7 `[skip]` items in `docs/ai_native_repo_structure.md` §18

## The question

§18 of `docs/ai_native_repo_structure.md` lists 7 action items (numbers 4–10)
tagged `[skip]` as needing design judgment. This review investigates each one
against the repo's actual workflow — one human maintainer, interactive coding
agents, and six unattended Jules routines opening small PRs — and decides per
item: implement now, implement later (with a concrete trigger), or reject.

Evidence below is from the repo itself (files, Makefile targets, workflows),
gathered 2026-08-27. No repo files were modified except this document.

## Summary table

| #   | Proposal                                   | Verdict         | One-line reason                                                                                                                               |
| :-- | :----------------------------------------- | :-------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| 4   | Root `REPO_MAP.md`                         | Reject          | `AGENTS.md` §Layout is an 18-line auto-loaded bullet list; a separate map duplicates it and is not auto-loaded                                |
| 5   | First-class agent evals suite              | Reject          | Real failure modes are already caught by cheap deterministic gates; LLM-in-CI evals don't pay for one human + small PRs                       |
| 6   | Hermetic sandboxing (`.devcontainer/`/Nix) | Reject          | Three environments (local macOS, CI ubuntu, Jules VM) already converge via the Makefile contract; Jules can't use an in-repo container anyway |
| 7   | AST auditing / Semgrep lockdown            | Implement later | bandit + `npm audit` + dependabot + pre-commit key detection exist; only real gap is unenforced `pip-audit` (cheap fix, see action items)     |
| 8   | Shared `/schemas` typed contracts          | Implement later | No validation exists, but CI's page smoke test loads every page against real `data/*.json`, catching the catastrophic case                    |
| 9   | Subagent team under `.claude/agents/`      | Implement later | Jules lanes + `test_jules_personas.py` already cover the unattended side; interactive subagent use is only just emerging                      |
| 10  | Semantic layer + agent telemetry           | Reject          | Nothing exists and nothing needs it yet; repo is small enough that Grep + `docs/` landmine index keep search cost low                         |

## Item 4 — Root `REPO_MAP.md` (§4.3, §6 Strategy 1)

**Evidence:**

- `AGENTS.md:206` starts the `## Layout` section; it runs 18 lines and maps
  `js/`, `css/`, `<page>/index.html`, `scripts/`, `bin/`, `data/`, `tests/`,
  `docs/` — every top-level functional area — as a short bullet list
  (`wc -l AGENTS.md` = 340 lines total).
- `AGENTS.md` is auto-loaded into every agent session by every harness this
  repo supports; the research doc itself concedes a standalone map is only
  useful "if the auto-loaded file points to it" (§3, principle 1).
- No `REPO_MAP.md` exists (`ls REPO_MAP.md` → no such file).
- Doc freshness is already CI-enforced elsewhere:
  `tests/python/test_doc_tool_references.py` verifies scripts referenced in
  agent docs/skills exist, so a second map would be another doc to keep true.

**Verdict: reject.** The original skip rationale holds: §Layout is still a
short bullet list, and duplicating it into a file no harness auto-loads adds
sync burden with zero discovery benefit. Revisit only if §Layout outgrows
roughly a screen (~40 lines); at that point split detail into `REPO_MAP.md`
and link it from `AGENTS.md`, exactly as the doc's own §4.3 prescribes.

## Item 5 — First-class agent evals suite (§10)

**Evidence:**

- Nothing like it exists: no `evals/`, no `scripts/evals/`, no
  `agent-evals.yml` workflow (all confirmed absent).
- The repo's actual agent-failure history was fixed with cheap deterministic
  gates, not evals: the empty-PR guard in `.github/workflows/ci.yml` ("Reject
  empty pull request" step), `make sync-check` for stale generated commands
  (Makefile:213), `make thinking-check` (Makefile:229), and
  `tests/python/test_jules_personas.py` for persona drift. That is the §17
  compounding loop already working.
- Adjacent machinery exists where it pays: mutation testing (mutmut +
  stryker) runs weekly via `.github/workflows/mutation-testing.yml`
  (cron `42 4 * * 0`, workflow_dispatch-scoped), and `diff-coverage.yml`
  gates changed lines.
- An eval suite per §10 requires an LLM in CI: API keys, token budgets,
  seeded-bug fixtures, and flaky non-deterministic pass/fail — for a workflow
  of one human doing binary approve/close on small lane-scoped PRs.

**Verdict: reject.** The failure modes this repo actually produces are
deterministic and already gated deterministically; the marginal signal from
"did the agent fix a seeded bug in under N tokens" does not justify a
non-deterministic, paid, flaky CI stage at this scale. Trigger to revisit:
Jules PR reject/close rate becomes a measurable problem, or multiple
unattended harnesses run concurrently and regressions stop being caught by
the existing gates.

## Item 6 — Hermetic sandboxing: `.devcontainer/` or `flake.nix` (§8)

**Evidence:**

- Neither `.devcontainer/` nor `flake.nix` exists.
- Three environments already exist and converge on the same contract:
  CI pins `NODE_VERSION: '24'` and `PYTHON_VERSION: '3.12'`
  (`.github/workflows/ci.yml:16-18`), installs via `npm ci` +
  `requirements-dev.txt`, then runs `make precommit-fix` as the
  "Single source of truth" (ci.yml comment at line 69). Jules routines run in
  Google's hosted VM and are instructed to "Run `make install-dev` first"
  (`docs/jules-routine-prompts.md`). Interactive agents run on the
  maintainer's macOS machine.
- The Makefile already handles the trickiest local environment case —
  linked git worktrees resolving the main checkout's venv (Makefile:1-17).
- A devcontainer would not be used by Jules (its VM is not repo-controlled),
  and forcing interactive agents into a container would break the documented
  local flow (`make serve`, `make screenshot` with a host Chromium, the
  worktree venv trick).

**Verdict: reject.** Environment drift is already controlled by pinned CI
versions + lockfiles + the Makefile as the single command interface; the main
beneficiaries named in §8 (subagents, CI) either already behave identically
or cannot consume an in-repo container. A fourth environment spec would be
maintained by no one and used by no one. Trigger to revisit: onboarding a
second regular human contributor, or a concrete local-vs-CI "works on my
machine" incident.

## Item 7 — AST auditing / Semgrep dependency lockdown (§9)

**Evidence — what already exists:**

- `make sec` runs `bandit -r scripts -lll` (Makefile:173-174) and is part of
  `make verify`.
- `.github/workflows/npm-audit.yml` runs `npm audit --omit=dev
--audit-level=high` on push, PR, and a weekly cron.
- `.github/dependabot.yml` exists, with
  `.github/workflows/auto-merge-dependabot.yml` for low-risk updates.
- The pre-commit config includes `detect-private-key`
  (`.pre-commit-config.yaml`), and there are targeted security tests:
  `tests/python/test_scraperapi_https.py`, `tests/python/test_csp_consistency.py`,
  `tests/python/test_security_utils.py`.
- No Semgrep config anywhere (`ls .semgrep*` → nothing; no mention in
  `.github/`, Makefile, or `pyproject.toml`).

**Evidence — the real gap:**

- Makefile:175 only echoes a note: pip-audit is suggested but not installed
  (absent from `requirements-dev.txt`) and not enforced anywhere in CI. So
  Python dependency vulnerabilities are currently unscanned while the JS side
  is gated.

**Verdict: implement later.** A curated Semgrep ruleset is poor value here:
the JS surface has no `dangerouslySetInnerHTML`-style sink pattern to police
(vanilla JS, no framework), and false-positive curation is exactly the kind of
ongoing cost a one-maintainer repo should avoid. But the `pip-audit` gap is
real, cheap, and mechanical — close it now (see Action items). Trigger for
revisiting Semgrep: the repo starts accepting third-party data renders
(richer HTML injection surface) or a dependency-confusion incident occurs.

## Item 8 — Shared `/schemas` typed contracts (§4.5)

**Evidence:**

- The claim "no schema validation today" is accurate. The frontend loads
  `data/*.json` through `fetchJSON` (`js/services/dataService.js:50-58`),
  which checks only HTTP status; `grep -n "validate\|schema"` over
  `dataService.js` (1126 lines) returns nothing.
- No `jsonschema`/`pydantic` schema generation in the Python pipeline
  (grep over `scripts/` and `tests/python/` finds no JSON-Schema usage;
  `requirements-dev.txt` has no validator).
- Python generator tests validate _logic_ with mocks (e.g.
  `tests/python/test_update_vt_hhi.py` mocks `requests.get`), not the shape
  of the committed artifact.
- However, the catastrophic case is already covered: `.github/workflows/ci.yml`
  runs `make smoke` (page_smoke.mjs), which loads every page in Chromium —
  and pages fetch the real `data/*.json` — failing on pageerrors and console
  errors. Malformed/unparseable JSON breaks a page and fails CI.
- The residual risk is _parseable but wrong-shaped_ data, which the repo
  currently handles by documented fail-open convention (e.g.
  `docs/pe-forward-pe-pipeline.md`: a null ratio renders trailing-only, not
  an error).

**Verdict: implement later.** Full JSON-Schema generation + a JS-side
validator duplicates what the smoke test already catches and adds a design
surface (generator choice, where validation runs) disproportionate to a
static dashboard with one data producer and one consumer. The uncovered
residual (wrong shape that parses and throws nowhere) has never been reported
as an incident. Trigger: the first incident where malformed-but-parseable
`data/*.json` silently corrupts a page — then the cheap version is a pytest
asserting minimal shapes of the committed files (in the style of
`test_csp_consistency.py`), not a `/schemas` directory.

## Item 9 — Subagent team definitions under `.claude/agents/` (§16)

**Evidence:**

- `.claude/agents/` does not exist; `.claude/` contains `commands/`
  (generated, per `make sync-check`), `skills` (symlink to `.agents/skills`),
  `settings.json`, `settings.local.json`, `launch.json`, `worktrees/`.
- The unattended multi-agent story already exists and is tested: six Jules
  personas (`.jules/architect.md` … `typist.md`) with lane boundaries in
  `AGENTS.md`, conformance enforced by `tests/python/test_jules_personas.py`
  (lanes table must list exactly the live routines).
- Interactive-side conventions exist too: 10 skills under `.agents/skills/`
  (including `jules-persona`, which encodes the house persona contract), and
  `.claude/settings.json` already commits a curated allow-list plus a
  prettier hook.
- AGENTS.md's "Concurrent agents sharing one worktree" section shows parallel
  interactive subagents are only just becoming a real workflow (one worktree
  exists under `.claude/worktrees/`).

**Verdict: implement later.** The unattended choreography the repo depends on
is already defined, lane-disjoint, and CI-enforced; `.claude/agents/*.md`
subagents would only serve interactive sessions, where delegation is
occasional. Authoring personas before there is repeated delegation to
stabilize their scopes means guessing. Trigger: interactive sessions
routinely run 2+ parallel subagents on this repo (the worktree rules suggest
this is starting); then author 1–2 scoped read-only subagents (e.g. a
security reviewer mirroring Sentinel) using the `jules-persona` skill's
conventions.

## Item 10 — Semantic layer + agent telemetry (§12, §14)

**Evidence:**

- Nothing exists: no `symbols.json`, no `.agent/traces/`, no vector/LSP
  tooling (grep for `qdrant|chroma|langsmith|traces|symbols.json` across
  Python sources → only an unrelated hit for `traces` in plot/test files).
- The repo is small and self-indexing: 340-line `AGENTS.md` with a Layout
  map, a curated `docs/` landmine index ("Subsystem landmines" section
  pointing at per-subsystem docs), distinctive module paths
  (`js/transactions/terminal/...`, `scripts/twrr/stepNN_...`), and fast
  ripgrep over a modest tree.
- No evidence search cost is the bottleneck; the documented agent failures in
  this repo are about _verification honesty_ and _generated-file drift_, both
  already gated (`make precommit-fix`, `make sync-check`).

**Verdict: reject.** This is frontier-lab infrastructure for codebases where
grep returns hundreds of hits per symbol; here the first hit is usually the
right one, and §18's own skip rationale ("evaluate only after search cost
proves to be the bottleneck") is the correct standing rule. Trigger: agents
demonstrably burning sessions on discovery (measurable via repeated
wrong-file edits or long search chains in session logs) — at that point a
generated `symbols.json` on a git hook is the cheapest first step, not an LSP
bridge.

## Action items

Only one item clears the bar for "implement now": the `pip-audit` gap found
under item 7. Smallest-first:

1. **[done] Add pip-audit to the audit workflow** (mirrors the existing JS
   side): implemented in `.github/workflows/npm-audit.yml` — after the "Run
   npm audit" step, the job sets up Python 3.12 (`actions/setup-python@v7`),
   runs `pip install pip-audit`, then
   `pip-audit -r requirements.txt -r requirements-dev.txt`. Baseline verified
   clean locally (pip-audit 2.9.0, both files, exit 0); workflow file passes
   prettier and YAML parse. The workflow rename to `dependency-audit` was
   skipped (cosmetic churn for no behavioural gain).
2. **(Optional, only if the new CI step proves useful) add `pip-audit` to
   `requirements-dev.txt`** and replace the echo-only note at `Makefile:175`
   with a real `$(PY) -m pip_audit` call inside `make sec`. Deferred — `make
sec` is part of `make verify`, the required status check, so a
   network-dependent audit there can flake routine PRs.

No action items for items 4, 5, 6, 8, 9, 10 — each has a concrete revisit
trigger stated in its section above.

## Open questions / what I couldn't verify

- **Jules VM environment (item 6):** I inferred from
  `docs/jules-routine-prompts.md` that Jules runs `make install-dev` in its
  own hosted VM and therefore cannot consume an in-repo devcontainer; I could
  not inspect the actual Jules runner configuration from this repo.
- **Whether `make smoke` would catch every malformed-JSON case (item 8):**
  the smoke test fails on pageerrors and allowlisted console errors
  (Makefile:288-293 comment). A data file that parses but is subtly
  wrong-shaped and handled fail-open would pass smoke — this residual is
  asserted from code reading, not from an injected-fault experiment.
- **Jules PR approve/reject rate (items 5, 9):** no in-repo metrics exist on
  how often routine PRs are closed; the "cheap gates suffice" conclusion
  assumes the current low-friction state described in AGENTS.md.
- **Interactive subagent frequency (item 9):** the presence of one worktree
  under `.claude/worktrees/` and the AGENTS.md concurrency rules suggest
  emerging use, but there is no telemetry (item 10's absence) to quantify it.
