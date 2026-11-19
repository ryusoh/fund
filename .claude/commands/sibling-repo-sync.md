---
description: Propagate a tooling/gate improvement from this repo to the sibling repos (ryusoh.github.io, anki, networking) — adapt, don't copy
argument-hint: "[what to sync, e.g. 'the complexity gate' or 'depcheck']"
---

Propagate an improvement from `~/dev/fund` to the sibling repos (verify
against each repo's current `AGENTS.md` and `Makefile`, as details drift).

## Shared sibling traits vs. fund-only quirks

- **All three siblings** generate `.claude/commands/` via
  `tools/sync_commands.py` with a naive `content.split("---", 2)` parser —
  omit `---` horizontal rules in skill bodies (anki also expects single-line
  `description`/`argument-hint` frontmatter).
- **Fund-only (absent in all siblings):** `.husky/pre-push`
  fast-forward/deletion guard, `.github/workflows/commit-lint.yml` +
  `scripts/agents/check_commit_message.py` (keep commit-title guidance generic
  per target `AGENTS.md`). Jules routines were retired across all four repos
  in November 2026.
- This skill exists in all four repos with perspective flipped to the home
  repo; sync improvements to this skill back to the other three copies.

## Sibling repo profiles

- **`~/dev/ryusoh.github.io`** — JS-only static site (plain `<script>`, no ES
  modules, no Python data pipeline); Python tooling lives under
  `tools/sync_commands.py` + `tools/__tests__/` (pytest via
  `/Users/lz/dev/.venv`, wired into a pre-push hook `pytest -q || [ $? -eq 5 ]`,
  unwired in Makefile; mypy hook targets `^scripts/|^tests/python/` which
  matches nothing). Default branch: **`master`**. CI gate:
  `make precommit-fix` (runs `.pre-commit-config.yaml` hooks, `sync-check`,
  `bot-pr-check`, Jest+coverage, and `git add -u` — use `make gate` while
  iterating or with dirty trees). `lint-js` uses `--max-warnings=0`; prettier
  runs via `./scripts/run-npx.sh prettier`. `package-lock.json` is
  authoritative (`pnpm-lock.yaml` drifts out-of-band). Its `ship` skill is a
  single `master` flow (`make check` + `make test`, asks before push). No
  screenshot/smoke/serve targets.
- **`~/dev/anki`** — JS + Python Anki addons; no `.pre-commit-config.yaml`. CI
  gate: `make precommit SKIP=1` (`fmt-check lint typecheck-js quality-py check
sync-check thinking-check bot-pr-check`); `precommit-fix` with `YOLO=1`/
  `MSG=` runs `git add -A`. Aliases via `package.json` `imports` (`#js/*`,
  `#ui/*`). Addon dirs are real Python packages (`__init__.py` present —
  import-linter works). Has a generated `data/` dir (`data/anki/`) and
  Conventional Commits. Jest runs only under `review_heatmap/tests/`; scoped
  Python tests run from repo root (`conftest.py` mocks `aqt`/`anki`) via
  `make test-py SUITE=<addon>/tests` or `make test-addon ADDON=<dir>`.
  Durable guidance: `AGENTS.md`, `docs/lint-and-quality.md`, `docs/gotchas.md`.
- **`~/dev/networking`** — JS + Python; no `.pre-commit-config.yaml`. CI gate:
  `make precommit` (on macOS: `make precommit-docker`, because raw-socket
  tests fail on host; host `make test-py`/`lint`/`thinking-check` need
  `PY=/Users/lz/dev/.venv/bin/python3` when system `python3` lacks
  `pytest`/`xenon`). `precommit-docker` exits 0 amid noisy logs — judge by
  exit code; cold path (colima + image build + tests) takes 10+ min, so warm
  Docker early and run once at the end. `Dockerfile.precommit` installs
  `requirements-dev.txt` + `npm ci`. `AGENTS.md` #6 restricts unrequested
  dep/config edits (#5 pins jest v29); covers `adblock/` (no `gov_bypass/`).
  No stylelint (prettier handles CSS). `ci.yml` already rejects empty PRs.
  `ship` uses `<primary-branch>`/`<branch_name>` placeholders and asks before
  push. Generated outputs: `coverage/`, `adblock/dist/`, `nas_proxy/out/`,
  `.claude/commands/`, command logs.

## Process

Delegate one subagent per sibling repo in parallel. Brief each with:

1. **Reference implementation:** concrete files in `~/dev/fund` carrying the
   pattern (config, Makefile target, hook, doc).
2. **Adapt to the target:** measure rules/ceilings against the target's own
   structure and `AGENTS.md` — drop decorative rules that match nothing it
   cares about, and enable checks that fit (e.g. `no-cross-page-imports`
   dropped where no `js/pages/` exists; Python import-linter enabled in `anki`
   where real packages exist).
3. **Wire into the real CI gate:** read `.github/workflows`, `Makefile`, and
   `.pre-commit-config.yaml` first so the check runs in the actual CI path.
4. **Baselines and ratchets:** for legacy violations, pair error severity with
   a shrink-only baseline (ESLint bulk suppressions model); zero violations
   ships baseline-free.
5. **Probe protocol:** append a violating probe to a tracked file → confirm
   gate fails → `git restore` → confirm gate passes and `git status` is clean
   (let restore errors surface rather than masking with `|| true`).
6. **Dependency-cruiser alias proof:** wire aliases via a webpack-config stub
   (avoids TS v7's `missing-typescript-transpiler` warning on
   `options.tsConfig`; `enhancedResolveOptions` rejects alias keys). Prove
   resolution by comparing `"N modules, M dependencies"` with and without
   aliases — identical dependency counts and no inflated external-node count.
   Skip stubs when a repo has no aliases.
7. **Python import-linter:** `grimp` lacks PEP 420 namespace-package support,
   so check `__init__.py` and edge visibility first; if invisible, document
   the skip with measurements and unblock criteria. Invoke via the click entry
   point (`python -m importlinter.cli` silently no-ops) and gitignore/delete
   `.grimp_cache/`.
8. **Finish per repo:** iterate with scoped checks, then run the full
   CI-parity gate once at the end (for docs-only changes in `networking`,
   decide whether the 10-min container run is warranted first). Format new
   config files, update the repo's `AGENTS.md` and gate docs, leave changes
   uncommitted, and report: violation counts, resolution proof, files changed,
   probe exit codes, gate result, and evidenced skip decisions.

## After the sync & resilience

- Update the sibling profiles above with any newly discovered drift; keep
  repo-specific docs inside each sibling repo.
- Because each subagent is isolated to its own repo, if a provider error kills
  parallel workers mid-flight, resume each failed worker to audit `git status`
  / `git log` and continue. Any parallel work touching `~/dev/fund` follows
  AGENTS.md "Shared checkout".
