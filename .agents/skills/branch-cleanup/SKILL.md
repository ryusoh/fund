---
name: branch-cleanup
description: Prune the repo down to main — delete branches of merged/closed PRs, audit remaining branches for content worth merging (salvage via squash or discard), clean up worktrees. Use when the user asks to clean up branches, delete stale/closed-PR branches, or reduce the repo to only the main branch.
---

Reduce the repo to a single `main` branch (local and remote), salvaging
anything worth keeping. Run from the **primary checkout** (first entry in
`git worktree list`; `main` stays checked out there, outside linked worktrees).

## 1. Survey and classify

```bash
git fetch --prune origin
git worktree list
git branch -vv
git branch -r
gh pr list --state all --limit 100 --json number,title,headRefName,state,mergedAt
```

Classify every non-`main` branch (local or remote) into one bucket:

- **PR merged** (`mergedAt` set) — content is on `main`; safe to delete.
- **No PR, fully merged** (`git branch --merged main` or
  `git merge-base --is-ancestor <branch> origin/main`) — safe to delete.
- **PR open** — live work; keep untouched and report as kept.
- **PR closed unmerged** or **No PR, unmerged** — audit the diff in step 3.

## 2. Delete safe buckets

```bash
git branch -d <branch>
git push origin --delete <branch>                               # if remote exists
```

If a pre-push hook flags the remote delete as history rewriting, retry it
alone with `git push --no-verify origin --delete <branch>`. For squash-merged
local branches where `-d` refuses, confirm `git diff origin/main...<branch> --stat`
is empty or superseded on `main`, then use `git branch -D <branch>`.

## 3. Audit unmerged buckets

Inspect `git log --oneline origin/main..<ref>` and
`git diff origin/main...<ref> --stat` (for remote-only refs, diff
`origin/<branch>`), then choose one outcome:

- **Already on `main`** (empty or superseded net diff) — delete as in step 2
  with evidence.
- **Worth merging** — salvage one branch at a time via `/ship` Mode B
  (squash-merge into `main`, `make precommit-fix` green, push, then delete).
- **Discard** (unrecoverable content) — get explicit user confirmation listing
  what will be lost before `git branch -D` / `git push origin --delete`. When
  unsure between salvage and discard, show the diff stat and last commit date
  and let the user decide.

## 4. Clean up worktrees and report

Remove worktrees whose branch was deleted (`git worktree remove <path>`;
warn instead of forcing if uncommitted changes exist). End with `git branch -a`
showing only `main` plus deliberately kept open-PR branches, and report a
table of branch, bucket, action (deleted/merged/kept), and one-line evidence.

## Invariants

- Kept: `main`, branches with an open PR, and branches checked out in another
  active worktree (`git worktree list`).
- `main` ends green: every salvage merge passes `make precommit-fix` before
  pushing.
- AGENTS.md "Shared checkout" rules apply throughout.
