---
name: branch-cleanup
description: Prune the repo down to main — delete branches of merged/closed PRs, audit remaining branches for content worth merging (salvage via squash or discard), clean up worktrees. Use when the user asks to clean up branches, delete stale/closed-PR branches, or reduce the repo to only the main branch.
---

Reduce the repository to a single `main` branch (local and remote), salvaging
anything worth keeping along the way. Work from the **primary checkout** (first
entry of `git worktree list`) and never check out `main` inside a linked
worktree.

## 1. Survey — build the branch inventory

```bash
git fetch --prune origin
git worktree list
git branch -vv                          # local branches + upstream tracking
git branch -r                           # remote branches
gh pr list --state all --limit 100 --json number,title,headRefName,state,mergedAt
```

Build a table with one row per non-`main` branch (local or remote). Classify
each into exactly one bucket:

- **PR merged** — its PR shows `mergedAt` set. Content is on `main`; the branch
  is pure garbage.
- **PR closed unmerged** — PR closed without merging. Salvageable only if the
  diff is still relevant (step 3).
- **PR open** — live work. **Never touch.** Report it as intentionally kept.
- **No PR, fully merged** — `git branch --merged main` (local) or
  `git merge-base --is-ancestor <branch> origin/main` (remote-only). Garbage.
- **No PR, unmerged** — orphan work. Audit the diff (step 3).

Remote-only branches need a local tracking ref before you can diff them:
`git fetch origin <branch>:refs/remotes/origin/<branch>` (already present after
`git fetch`), then diff against `origin/<branch>`.

## 2. Delete the safe buckets

Safe = content is provably preserved elsewhere (merged into `main`, or retained
on GitHub under a merged PR). For every **PR merged** and **No PR, fully
merged** branch:

```bash
git branch -d <branch>                                          # local
git push origin --delete <branch>                               # remote, if it exists
```

If a pre-push hook mistakes the remote delete for history rewriting, retry it
alone with `git push --no-verify origin --delete <branch>`.

For a local branch that refuses `-d` because its tip was **squash-merged**
(Git sees no ancestry), verify the content first:
`git diff origin/main...<branch> --stat` should be empty, or every change
already present on `main`. Only then `git branch -D <branch>`.

## 3. Audit the unmerged buckets

For each **PR closed unmerged** and **No PR, unmerged** branch:

```bash
git log --oneline origin/main..<ref>
git diff origin/main...<ref> --stat
```

Decide one of three outcomes per branch:

- **Already on main** — the net diff is empty or every hunk is superseded by
  current `main` (common for stale Jules/bot PRs; see the bot-pr-rescue skill's
  duplicate check). Delete like step 2, noting the evidence.
- **Worth merging** — the diff adds real value and is not superseded. Salvage
  it with the **ship skill's Mode B**: squash-merge into `main`, run
  `make precommit-fix` green, push, then delete the branch. One branch at a
  time; never batch unverified merges.
- **Discard** — abandoned, superseded, or broken work. Branch deletion here
  destroys unrecoverable content, so **get explicit user confirmation** listing
  what will be lost before `git branch -D` / `git push origin --delete`.
  (Deleting merged-PR branches needs no confirmation — the PR retains the
  commits.)

When unsure between salvage and discard, show the user the diff stat and last
commit date and let them decide.

## 4. Worktree cleanup

```bash
git worktree list
git worktree remove <path>          # --force only when nothing unshipped remains
```

Remove any worktree whose branch was deleted above. Warn about worktrees with
uncommitted changes instead of force-removing them.

## 5. Final state and report

End state: `git branch -a` shows only `main` (plus any **PR open** branches you
deliberately kept). Report a table: branch, bucket, action taken
(deleted/merged/kept), and one line of evidence for each. Anything kept must
have a reason; anything discarded must have had user confirmation.

## Safety rules (absolute)

- Never delete `main`, never touch a branch with an open PR, never delete a
  branch another active session/worktree is sitting on (`git worktree list`).
- Never run `git clean`, `git reset --hard`, or `git stash` — concurrent
  agents share this worktree.
- Salvage merges go through the full gate (`make precommit-fix`, this repo's
  CI-parity check) before pushing; a cleanup run must not leave `main` red.
