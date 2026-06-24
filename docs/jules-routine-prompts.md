# Jules routine prompts

Personas now live in `.jules/<name>.md` (read-only role definitions). The Jules
scheduled-task prompt is just a tiny invocation — all the durable rules sit in the
persona file and in `AGENTS.md`, so you maintain them in the repo, not in the UI.

## Stop the journaling

In each scheduled task's prompt, **delete any clause that tells the routine to
record/append/log learnings to `.jules/<name>.md`.** That instruction is the only
reason the journals grew. With it gone, the file is read-only and merge-conflict
friction disappears.

## The invocation prompt (paste into each task, swap the name)

> Read `AGENTS.md` and `.jules/<name>.md`, then act as that persona. Run
> `make install-dev` first. Work only in your lane, smallest single-purpose diff.
> Open a PR **only if `make verify` is green**, and paste the verification output
> in the PR body. **Never modify any file under `.jules/`.** If a finding belongs
> to another lane, skip it.

That's the whole prompt for every routine — `architect`, `bolt`, `janitor`,
`palette`, `sentinel`, `testpilot`, `typist`. Lane, constraints, verification gate,
and known pitfalls all come from the persona file.

## Operational settings (this is what actually cuts human interaction)

- **Required status check** = `make verify` (CI) on every routine's PR. A red PR
  can't merge, so you never manually catch broken ones.
- **Manual approve** for every routine — the self-proving PR body makes each a
  ~10-second approve/close. (Typist and Testpilot are the safest lanes if you ever
  want to switch them to auto-merge on green.)
- **Required status checks** on the default branch: `web-ci` (runs
  `make precommit-fix`) and `Commit lint` (PR-title convention). A red PR can't
  merge, so you never manually catch broken ones.
- **Stagger schedules** so routines that share file regions don't run at once
  (fewer conflicting PRs to close).
- **Label closed PRs** with a reason (`close:dup`, `close:wrong-lane`,
  `close:not-worth-it`, `close:broke-it`, `close:ugly`, `close:flaky` — defined in
  `.github/labels.json`, auto-created by the sync-labels workflow). Routines read
  these via `python3 -m scripts.agents.prior_prs` and avoid repeating closed work.

## Guardrails (enforce the rules so you don't have to)

- **CODEOWNERS** (`.github/CODEOWNERS`) requires your review for `AGENTS.md`,
  `.jules/`, `scripts/agents/`, `.github/CODEOWNERS`, and `commit-lint.yml` — the
  agent-governance surface. Scoped deliberately **not** to all of
  `.github/workflows/`, so dependabot's github-actions bumps to other workflows
  aren't gated. Enable "Require review from Code Owners" in branch protection for
  this to bite.
- **Commit lint** (`.github/workflows/commit-lint.yml`) rejects emoji,
  routine-name prefixes, and non-Conventional PR titles via
  `scripts/agents/check_commit_message.py`.

## Shared helper scripts (`scripts/agents/`)

Deterministic "find the work" tools — tested, reviewed code, not agent-authored:

- `coverage_rank` — ranks files by coverage, lowest first (Testpilot target select).
- `prior_prs` — lists recent PRs + labels (the prior-PR check, all routines).
- `check_commit_message` — validates a commit subject (used by Commit lint CI).

## Editing personas

Personas are plain Markdown in `.jules/`. Edit them by hand to retune a lane; the
routines read the new version on their next run. They will not write back.
