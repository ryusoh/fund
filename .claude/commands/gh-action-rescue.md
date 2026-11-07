---
description: Fully diagnose and repair a failed GitHub Actions workflow run, then automatically verify, commit, push, open and merge a PR, dispatch a fresh run, and regenerate or backfill its data. Use when the user names or links a failed workflow run, reports a failing scheduled/manual workflow, or asks for end-to-end Actions recovery without further confirmation.
argument-hint: "[workflow run number, run URL, or workflow name]"
---

Rescue this failed GitHub Actions workflow end to end: **$ARGUMENTS**

Invocation explicitly authorizes edits, tests, commits, pushes, PR creation,
squash merges, workflow dispatches/reruns, generated-data recovery, and cleanup.
Do not ask for further confirmation. Stop only for a real blocker such as
unavailable authentication, missing required secrets, or evidence that recovery
would corrupt or fabricate data; report that blocker precisely.

## 1. Anchor the target and current state

Re-resolve the run from GitHub rather than trusting a stale page or run title.
A workflow `run_number` (for example #523) is not the API `run.id`.

```bash
git status --short
git branch --show-current
git log --oneline -3
```

- Record the workflow name/path, run number and ID, head SHA/branch, failing
  jobs/steps, conclusion, and HTML URL.
- Check recent runs to find the last success and first consecutive failure.
  Compare dependency/runtime versions and error signatures across that boundary.
- Read the workflow YAML and the subsystem docs governing its scripts/data
  before editing. Read `docs/pages-deploy.md` when the workflow commits data or
  dispatches deployment.
- Check open/recently closed PRs for overlapping work. Use
  `venv/bin/python -m scripts.agents.prior_prs`; if unauthenticated `gh` makes it
  fail, query the public pulls API instead.
- Create a todo list covering diagnosis, fix/regression tests, shipping, fresh
  workflow execution, and output recovery. Keep exactly one item in progress.

Use authenticated `gh` when available. Otherwise use public GitHub APIs for run
metadata and an authenticated browser for logs, PR creation/merge, and manual
dispatch. Never print credentials or place API keys in URLs.

## 2. Establish the failure before theorizing

Read the actual failing step log bottom-up. Capture the first actionable error,
final exit status, runtime/dependency versions, and whether the script started
producing output. Do not mistake echoed shell text or annotations for the root
error. A fast failure usually precedes the test suite; a segfault before the
first program print points to imports/native code, not later business logic.

Build the tightest deterministic loop that exercises this exact symptom:

1. scoped regression test at the real call site;
2. pipeline invocation with temporary output paths;
3. clean isolated environment reproducing resolved dependency versions;
4. replay of a captured provider response or generated artifact;
5. workflow rerun only when no local seam exists.

Watch the loop fail before the fix and pass afterward. Keep temporary virtual
environments, logs, and outputs inside the workspace and delete them afterward.
For a difficult diagnosis, invoke `diagnosing-bugs` and rank 3–5 falsifiable
hypotheses before probing. For a date-sensitive issue, read
`docs/testing-notes.md` and test relevant timezones.

Classify the result before changing files:

- **Repository defect:** fix the smallest root cause and add a regression test.
- **Runtime/dependency rollover:** correlate the first failure with resolved
  versions; pin a supported runtime or remove/replace the incompatible
  dependency rather than hiding the error.
- **Provider outage/rollover:** add or repair an independent authenticated
  fallback, bounded retries, and exact-session validation as appropriate.
- **Transient GitHub/infrastructure failure with no code defect:** rerun the
  failed jobs; do not invent a code change or open an empty PR.
- **Validation rejection:** preserve the gate. Repair upstream data/fetching;
  never weaken freshness, coverage, seam, or integrity checks to obtain green.

## 3. Fix and prove it

Make one concern-sized change on a branch off current `main`. Stage only files
owned by this rescue; concurrent agents and the user may share the worktree.
Never discard foreign changes or use destructive git cleanup.

For each behavior fix, include a test that fails before and passes after.
Prefer structural prevention over prose: runtime pins, dependency removal,
bounded fallback logic, schema checks, or validation. Avoid global version pins
when a workflow-local pin fixes the incompatibility with less collateral risk.

Exercise the real recovery path, not just mocks. For fetch pipelines, run with
actual current dependencies and temporary output files when credentials/network
allow. Clearly distinguish mocked outage coverage from live-provider evidence.

Run `make precommit-fix` on the finished committed tree before opening a PR.
If the local command exceeds its execution cap, complete every remaining phase
separately and report exactly that—never claim the capped command returned green.
Check the final diff for formatter damage, scratch artifacts, and unrelated edits.

## 4. Ship without pausing

- Create one real conventional commit; do not push empty/no-op commits.
- Push the branch and open a non-draft PR unless human visual review is required.
- Use a conventional PR title and include What & why, Lane, exact Verification
  output, and Visual status in the body.
- Wait for all required checks, including diff coverage. If red, inspect logs,
  fix on the same branch, rerun the gate, amend/squash, and force-push with lease.
- Squash-merge only after required checks pass. Confirm the merged SHA through
  GitHub rather than inferring success from a button click.
- Confirm the local tree is clean, switch to `main`, and run:

```bash
git pull --rebase origin main
```

Do not delete branches or worktrees while they contain unshipped or foreign work.

## 5. Execute the fixed workflow

Dispatch the workflow on merged `main`; do not treat rerunning the old failed SHA
as proof of the fix. Resolve and record the new run number and ID from its head
SHA. Monitor every material stage: dependency installation, fetch/generation,
validation, generated-data commit/push, and deployment dispatch.

If this run fails, return to step 2 with its new logs and continue automatically.
Respect provider rate limits and use bounded backoff rather than tight polling or
retry loops. Do not weaken checks or manually mark a run successful.

## 6. Recover all missing outputs, not just the latest row

Determine the expected coverage interval from the last valid committed output,
the schedule, and the current completed period. Compare actual generated files
against that interval.

- Prefer the workflow's authoritative regeneration/backfill path on Actions.
  Generated `data/` files must come from the pipeline, not hand edits.
- If the workflow only appends the current period, inspect for a multi-period
  gap. Implement and test historical backfill from an authoritative provider
  when necessary; a successful latest-only rerun is not complete gap recovery.
- Never invent prices, dates, or missing history. Explicit carry-forward is only
  valid when it is the pipeline's documented behavior and passes validation.
- Verify chronological ordering, no duplicate periods, expected held-item/series
  coverage, freshness, historical continuity, and application-specific gates.
- Confirm the bot data commit SHA and the exact output artifacts on `main`.
  For Pages-backed data, confirm deployment dispatch and inspect the deployed
  artifact when a same-file race could leave the site one commit behind.

## 7. Finish only with evidence

The rescue is incomplete until the fixed workflow has actually succeeded and
required outputs are verified. If a provider cannot supply part of the missing
history, report the precise unrecovered interval instead of claiming full recovery.

Respond with:

1. root cause and failing step;
2. code/config fix and regression evidence;
3. PR number and merge commit;
4. fresh run number/result and generated-data commit;
5. recovered interval/artifacts and validation/deployment result;
6. any external limitation or unrecovered data, without guarantees that every
   future third-party outage is impossible.

Clean up temporary environments and diagnostic files. Update the todo list and
re-anchor from `git status` and `git log` before reporting completion.
