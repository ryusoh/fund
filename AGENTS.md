# AGENTS.md

Canonical agent guidance for this repo — edit this file; `CLAUDE.md` only
imports it. Subsystem how-tos live in `docs/`. Skills live in `.agents/skills/`
(canonical; `.claude/skills` symlinks to it, `.claude/commands/` is generated
by `scripts/sync_commands.py`, and `make sync-check` catches drift).

## Context

A static vanilla-JS/CSS financial dashboard (no build step; pages load ES
modules via an import map) plus a Python pipeline that generates the JSON/CSV
the frontend reads. You are an interactive agent working with the user in chat;
unattended automation is limited to GitHub Actions workflows (the Jules
routines were retired in November 2026 — `docs/jules-retirement-plan.md`). Edit
build files, configs, and dependencies whenever the task calls for it.

## How the user works

- Work on `main` in the shared checkout. The user reviews diffs in VSCode and
  commits accepted work themselves. If your edits vanish from `git status`
  between turns, run `git log --oneline -3` once — a fresh user commit means
  the work was accepted; continue from HEAD.
- Commit or push only when asked. Then: trivial config/doc changes go straight
  to `main`; substantive changes go on a branch off `main` as a PR. Invoking a
  skill that commits as part of its workflow (`/implement-action-items`,
  `/ship`, `/tdd`, `/gh-action-rescue`) or a `/goal` run is that authorization
  for local commits; pushing needs explicit direction or a skill that includes
  it.
- A bare `ok` / `yes` answering your own offer means do it.
- Do well-understood work inline so the user can follow along; use subagents
  for genuinely parallel investigations or context-flooding dumps.
- On multi-step work (action-item sweeps, TDD loops, diagnosis), the progress
  ledger is `git status`, `git log`, and the skill's state file or findings
  doc. Re-read them at each commit boundary and after resumption/compaction
  (each skill's `## Resume protocol` lists what to check).

## Shared checkout

The user, other agents, and background sessions edit this tree concurrently.

- Stage the files you changed by name (`git add <file>`). Uncommitted changes
  elsewhere belong to someone else — leave them in place.
- Discard only your own edits, after `git diff <file>` confirms every hunk is
  yours. Wider resets (`git reset --hard`, `git clean`, `git stash`,
  `git checkout -- .`) and `--no-verify` need the user's OK.
- Run `git branch --show-current` right before every commit — another session
  can switch the branch under you.
- Keep concurrent agents on disjoint file sets; in a conflict, resolve only
  your own files.
- When `git pull --rebase` cascades into per-commit conflicts after a
  squash-merged PR, the fix is resetting to `origin/main` (with the user's OK) —
  see `docs/git-sync-notes.md`.

## Quality bar for every change

1. **The CI gate is `make precommit-fix`** (format + lint + JS/Python tests +
   `.pre-commit-config.yaml` hooks, whose eslint runs `--max-warnings=0`).
   `make verify` adds mypy, bandit, and sync-check but skips the hooks, so it
   is no substitute. Open a PR only on a green gate, with
   `git status --porcelain` clean afterwards (commit any reformat). A red gate
   on an unchanged tree stays red — change something before rerunning
   (`python3 -m scripts.agents.gate_guard snapshot`, then `check <hash>`).
2. **One concern, smallest diff,** inside the task's files. For self-chosen
   work (not a user-specified task), run `python3 -m scripts.agents.prior_prs`
   first so you pick something no open or closed PR already covers.
3. **`data/` is pipeline output** — regenerate it; never hand-edit it.
4. **Page-scoped changes stay on their page** (terminal glass must leave
   `position/` and `calendar/` untouched).
5. **Write down only what you ran.** Commands and examples in docs or code
   must have been executed this session (terminal command semantics live in
   `js/transactions/terminal/handlers/help.js`). Claims that a pipeline is
   idempotent or safe to rerun need an actual rerun plus an artifact diff.
6. **Code comments state facts about behaviour** — no thinking-out-loud and
   no abandoned attempts (`make thinking-check` enforces this).
7. **Publish a PR as one commit with a real diff.** Commit once, gate that
   tree, push; on revision, amend and `git push --force-with-lease`. A goal
   the repo already satisfies is a no-op, not a PR. Format only the files you
   touched: repo-wide formatter runs rewrite unrelated files, including
   `eslint-suppressions.json` (the complexity ratchet — suppressions only
   shrink, via `npx eslint --prune-suppressions`).
8. **Behaviour changes ship a test** that fails before and passes after: CI's
   diff-coverage gate requires 90% of added executable lines covered.
   Refactors, typing, CSS, and docs need none. Only a human can apply the
   `coverage-exempt` label.

## Visual changes

You can't judge rendering, and unit tests can't see colour, layout, or the
Chromium-only liquid-glass lens. For a visual change: green tests, then one
`make screenshot URL=/<page>/` (read the PNG) to confirm it rendered and is
placed, then hand off. Report objectively checkable facts (DOM attribute,
contrast ratio, passing test) and leave aesthetic or "matches the reference"
judgments to the user. For fidelity-sensitive effects (glass, lighting), have
the user view the live page before you change a default. A PR whose payoff is
visual is a draft marked "visual review required".

## Commits and PRs

- **Conventional Commits**, enforced by `scripts/agents/check_commit_message.py`
  and the `pr-title` check (the squash merge uses the PR title as the commit
  subject): `type(scope): summary` with type ∈ `feat`, `fix`, `refactor`,
  `perf`, `test`, `docs`, `chore`, `build`, `ci`; scope lower-case
  `[a-z0-9._/-]`; imperative lower-case summary ≤ 72 chars, no emoji. The body
  explains what and why at ~72 columns. Check a subject with
  `printf '%s\n' "<subject>" | python3 -m scripts.agents.check_commit_message --stdin`.
  Examples: `fix(worker): enforce https and exact-hostname CORS validation` ·
  `refactor(data-service): extract helpers to cut computeMonthlyPnl complexity`.
- **PR body:** what & why (1–2 sentences); verification — the exact commands
  and their pasted results; visual — "no visual surface" or "visual — human
  review required (draft)".
- **Workflow-authored commits** use
  `github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>`
  as author and committer (`--author=...`, or `commit_author:` in
  `stefanzweifel/git-auto-commit-action`).

## Commands — prefer `make` (matches CI)

| Need                                    | Command                                                 |
| --------------------------------------- | ------------------------------------------------------- |
| CI gate (fix, then check)               | `make precommit-fix`                                    |
| All checks (lint + types + sec + tests) | `make verify`                                           |
| Lint (JS + CSS + Python + Markdown)     | `make lint`                                             |
| Auto-fix lint + format                  | `make fix`                                              |
| Full test suite (JS + Python, coverage) | `make test`                                             |
| Scoped JS test (fast, no coverage)      | `npx jest <path/to/test>`                               |
| Scoped Python check (fast)              | `venv/bin/ruff check <path>` (also `black`, `mypy`)     |
| JS strict type check                    | `npx tsc -p jsconfig.json`                              |
| One CSS file lint                       | `npx stylelint <path.css>`                              |
| Generated-commands freshness check      | `make sync-check`                                       |
| Dependency-structure gate (JS)          | `make depcheck`                                         |
| JS mutation test (scoped, manual only)  | `make mutate-js MUTATE=js/utils/host.js`                |
| Py mutation test (scoped, manual only)  | `make mutate-py SCOPE='scripts.utils.security_utils.*'` |
| Dev server (serves repo root at :8000)  | `make serve`                                            |
| Headless screenshot (visual verify)     | `make screenshot URL=/terminal/`                        |
| Page smoke (console/CSP errors)         | `make smoke`                                            |
| Run TWRR data pipeline locally          | `make twrr-refresh`                                     |
| Validate regenerated TWRR data (gate)   | `make twrr-validate`                                    |
| Regenerate AVIF/WebP background tiers   | `make images`                                           |

- Use scoped commands for the edit→verify loop and `make` targets for
  whole-repo runs. Gate internals (complexity ratchet, mutation testing,
  dependency structure) live in `docs/agentic-quality-gates.md`.
- Jest runs silent (`console.log` prints nothing) and under `TZ=UTC`, while
  the user's browser is UTC+8 — a date off-by-one can be green in tests and
  wrong in the browser. Read `docs/testing-notes.md` before debugging an odd
  JS test.
- `make type` runs mypy (blocking) and JS `tsc` (non-blocking in CI — keep the
  strict-error count from rising; `docs/js-typing-strategy.md`).
- Python tools (`ruff`, `black`, `mypy`, `pytest`, `diff-cover`) live in
  `venv/bin/`. A linked worktree has no local `venv/`: `make` resolves the
  main checkout's, and direct calls use
  `$(git rev-parse --path-format=absolute --git-common-dir | sed 's|/.git$||')/venv/bin/<tool>`.
- Setup: `make install-dev` (pip + `requirements-dev.txt` + `npm ci`). Without
  the Python side, `make test` silently runs only the JS half — confirm both
  jest and pytest ran.

## Layout

- `js/` — frontend ES modules: `js/pages/<page>/` per-page entries, `js/ui/`
  shared UI/effects, `js/config.js` central tunables; `@js/`-style aliases come
  from each `*/index.html` import map and jest `moduleNameMapper`.
- `css/<page>/` — stylesheets by page. `<page>/index.html` — page entries
  (`terminal/`, `position/`, `calendar/`).
- `scripts/` — Python pipeline and tooling (`pyproject.toml`), agent helpers in
  `scripts/agents/`. `tests/python/test_doc_tool_references.py` checks that
  scripts and docs referenced by agent docs and skills exist.
- `bin/` — CLI entry points (`fund`, `portfolio`, `holdings`, `update-all`).
- `data/` — generated JSON/CSV for the frontend. `tests/js/**` (jest),
  `tests/python/**` (pytest). `docs/` — read the subsystem doc before deep
  work there.

## Subsystem landmines

Several of these fail as silent wrong output rather than an error. Read the
doc before touching the area.

- **Liquid glass** (terminal panes, position donut) → `docs/liquid-glass.md`.
  Layered Canvas/WebGL/SVG, Chromium-only; verify in Chrome (`make serve`,
  `/terminal/`). The doc's gotcha checklist saves a debugging round-trip.
- **Transaction chart crosshair** → `docs/chart-crosshair-layout.md`.
  `interaction.js` reads layout fields by name; a stacked renderer that omits
  one (e.g. `dates`) renders 0%.
- **Calendar renderer migration** (Cal-Heatmap → DOM/CSS behind a flag) →
  `docs/calendar-renderer-migration.md`, before touching `js/pages/calendar/`
  or `js/ui/cal-heatmap-src/`.
- **Y-axis ticks** → `docs/y-axis-tick-algorithm.md`: a generate→collide
  pipeline with a strict no-overlap invariant (`generateConcreteTicks`, the
  `drawAxes` collision filter in `core.js`).
- **PE pipeline** → `docs/pe-forward-pe-pipeline.md`. VT's forward P/E derives
  from `forward_pe.msci_pe_ratio` in `pe_ratio.json`; a null ratio renders the
  cell trailing-only. Historical PE is point-in-time by design — past dates
  stay fixed (the doc lists what can still rewrite them).
- **Pages deploy and bot data workflows** → `docs/pages-deploy.md`. Bot
  commits reach the live site only via an explicit `workflow_dispatch` of
  `pages.yml`; a skip-ci marker anywhere in a commit message (even quoted in
  the body) suppresses every push workflow, including the deploy.
- **Terminal output vs. data load** → `docs/terminal-data-readiness.md`.
  Commands run before `loadTransactions()` settles; output that reads
  `transactionState` must await `whenTransactionDataReady()` or it prints
  "(no data)".
- **Position table starts hidden** (`display:none` until the donut-center
  toggle, `setTableVisibilityState` in `js/charts/allocationChartManager.js`).
  Layout measurements during the initial render return 0 — measure on reveal
  (e.g. ResizeObserver), as `alignDayChangeStacks` in
  `js/services/dataService.js` does.
- **Skill sync** → `docs/command-skill-sync.md`. Author skills in
  `.agents/skills/<name>/SKILL.md` and keep helper scripts and assets inside
  the skill directory. `scripts/sync_commands.py` regenerates
  `.claude/commands/` from scratch, so edits made there are lost;
  `tests/python/test_skills.py` validates every skill.
- **Data flow** → `docs/overview.md`, `docs/ai_update_flow.md`.
- **TWRR price pipeline** → `docs/twrr-data-pipeline.md`. `step03` fetch
  failures plus `step04`'s `fillna(0.0)` turn missing prices into $0
  valuations across all history; stale upstream snapshots pass as success and
  get flat-lined by ffill. `make twrr-validate` gates the bot's auto-commit.
- **Position day-change baseline (`fund_data.json`)** → baseline section of
  `docs/twrr-data-pipeline.md`. `update_fund_data.py` writes the official
  regular-session close of the last completed session; fetchers pick the bar
  by session date vs. run time because Actions delays can push the nightly run
  past the 20:00 ET overnight open or into the next session.
- **SEC filings adapter** → `docs/filings-adapter.md`. Run it as
  `venv/bin/python -m scripts.analysis.filings_adapter`; `ingest` a new ticker
  before `list`/`verify`; `verify` confidence is numeric-anchored, so confirm
  claims by reading the cited section.
- **Security, error handling, dead-code removal** →
  `docs/security-and-cleanup-pitfalls.md` (CORS origin matching, secret
  scrubbing across URL encodings, fail-closed financial RNG, repo-wide
  reference search before deleting).
- **Portfolio math** → `docs/fermat-pascal-kelly-system.md`.
- **Analysis Decision Chart pane** → `docs/analysis-decision-chart-design.md`.
  The terminal `analysis` command has a 2-view grammar (`analysis` → Decision
  Board; `analysis <ticker> [full]` → Decision Chart; `analysis close` → hide).
  JS (`js/pages/analysis/decision.js`) and Python (`scripts/analysis/sync_configs.py`)
  must maintain GH-7 quadrature parity for Kelly sizing and Total Return
  compounding; scenario `terminalPrice` stays price-only while
  `terminalTotalValue`, CAGR, and Kelly compound dividends (`dividendYield`).
  `PORT` sizing uses USD-normalized weights from `realTimeData.tickerWeights`
  divided by `balance` (never raw `composition.percent` percentages without
  normalization). Directional triggers (`BUY`/`ADD`/`TRIM`/`EXIT`) fire only in
  their direction (overvalued names never trigger `BUY`). Market data uses two
  staleness scopes: per-ticker `market.marketDataUpdatedAt` vs. global
  `event_flags.generatedAt`.
