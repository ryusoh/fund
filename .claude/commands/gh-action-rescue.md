---
description: Fully diagnose and repair a failed GitHub Actions workflow run, then automatically verify, commit, push, open and merge a PR, dispatch a fresh run, and regenerate or backfill its data. Use when the user names or links a failed workflow run, reports a failing scheduled/manual workflow, or asks for end-to-end Actions recovery without further confirmation.
argument-hint: "[workflow run number, run URL, or workflow name]"
---

Rescue this failed GitHub Actions workflow end to end: **$ARGUMENTS**

Invocation authorizes the full loop — edits, tests, commits, pushes, PR
creation, squash merge, workflow dispatch/rerun, generated-data recovery, and
cleanup — without pausing for confirmation. Stop only on a real blocker
(missing auth or secrets, or risk of corrupting/fabricating data) and report
it precisely.

## 1. Anchor target and state

Resolve the run live from GitHub (`run_number` like `#523` differs from the
API `run.id`). Use authenticated `gh` when available, or public GitHub APIs for
metadata plus an authenticated browser for logs, PRs, and manual dispatch;
keep credentials out of command output and URLs.

- Run `git status --short`, `git branch --show-current`, and
  `git log --oneline -3`.
- Record workflow path, run number/ID, head SHA/branch, failing jobs/steps,
  and URL. Compare recent runs across the last-success → first-failure
  boundary (runtime/dependency versions and error signatures).
- Read the workflow YAML and governing subsystem docs (`docs/pages-deploy.md`
  for data/deploy workflows).
- Check overlapping PRs with `venv/bin/python -m scripts.agents.prior_prs` (or
  the public pulls API if `gh` is unauthenticated).

## 2. Reproduce before theorizing

Read the failing step log bottom-up: Actions echoes every shell line (even
untaken `if` branches), so anchor on the step ending in
`##[error]Process completed with exit code 1`. A fast failure precedes tests;
a segfault before the first print points to imports or native code.

Build the tightest deterministic local loop (watch it fail before the fix,
pass after):

1. Scoped regression test at the real call site.
2. Pipeline run writing to temporary paths.
3. Isolated env matching the failing dependency versions.
4. Replay of a captured provider response or artifact.
5. Workflow rerun only when no local seam exists.

Keep temporary venvs/logs inside the workspace and delete them afterward. For
tricky failures use `diagnosing-bugs`; for date bugs check
`docs/testing-notes.md` and relevant timezones.

Classify before editing:

- **Repository defect:** minimal root-cause fix + regression test.
- **Runtime/dependency rollover:** correlate versions at the failure boundary;
  pin a supported runtime (workflow-local over global when sufficient) or
  replace the incompatible dependency.
- **Provider outage/rollover:** add or repair an independent authenticated
  fallback, bounded retries, and exact-session validation.
- **Transient GitHub/infra failure:** rerun the failed jobs; skip creating a
  code change or empty PR.
- **Validation rejection:** keep freshness, coverage, seam, and integrity
  gates intact; repair upstream fetching/data.
- **Red PR check:** `pr-title` (`commit-lint.yml`) checks the event payload,
  so `gh run rerun` replays the old title — retrigger with a fresh event
  (force-push, or close + reopen). For a Dependabot bump failing on an
  existing file, reproduce with `npm ci` on the PR lockfile in a worktree,
  then accept the fixer output or exclude the file citing the upstream issue;
  push an additive commit so Dependabot's signed commit stays intact.

## 3. Fix, prove, and ship

Follow AGENTS.md (shared checkout, single concern on a branch off `main`,
one conventional commit, PR body with What & why / Verification / Visual).

- Prefer structural prevention (runtime pins, dependency removal, bounded
  fallbacks, schema validation) over prose.
- Exercise the real recovery path (actual dependencies and temp output files
  when network/credentials allow), distinguishing mocked outage coverage from
  live-provider evidence.
- Run `make precommit-fix` on the finished committed tree. If the command hits
  a local timeout, finish every remaining phase separately and report that
  explicitly.
- Push, open a PR (draft only if visual review is needed), wait for all
  required checks including diff coverage (amend + `--force-with-lease` on
  fixes), then squash-merge and verify the merged SHA on GitHub.
- Return to a clean `main` (`git pull --rebase origin main`), keeping any
  branch or worktree that holds unshipped or foreign work.

## 4. Execute on merged `main` and recover all missing outputs

Dispatch the workflow on merged `main` (rerunning the old failed SHA does not
test the fix), resolve the new run number/ID from its head SHA, and monitor
install, fetch/generation, validation, data commit, and deploy dispatch using
bounded backoff. If it fails, loop back to step 2 automatically.

Compare committed outputs against the expected coverage interval from the last
valid output through the current completed period:

- Regenerate `data/` via the workflow's authoritative pipeline/backfill path.
- For append-only workflows with multi-period gaps, implement and test
  historical backfill from an authoritative provider — a latest-only rerun
  leaves the gap open.
- Use real provider data only (explicit carry-forward is valid only when it is
  the pipeline's documented behavior and passes validation).
- Verify chronological order, unique periods, held-item/series coverage,
  freshness, historical continuity, and application gates.
- Confirm the bot data commit SHA on `main`, and for Pages-backed data verify
  deployment dispatch and the live artifact.

## 5. Evidence report

The rescue finishes only when the fixed workflow succeeds and outputs are
verified (if a provider lacks part of the history, name the exact unrecovered
interval). Clean up temp files, re-anchor with `git status` and `git log`, and
report:

1. Root cause and failing step.
2. Code/config fix and regression evidence.
3. PR number and merge commit.
4. Fresh run number/result and generated-data commit.
5. Recovered interval/artifacts and validation/deployment result.
6. Any external limitation or unrecovered interval.
