---
name: ship
description: Ship work — verify, commit, push to main; merges branches/worktrees and cleans them up
argument-hint: '[branch_name]'
---

You are tasked with shipping: **{{args}}**

## Pick the mode first

Inspect where you are before touching anything:

```bash
git branch --show-current
git worktree list        # first entry is the primary checkout
git status --short
```

- **Branch-name argument** → Mode B for that branch. If the argument is empty
  or clearly not a branch name (e.g. injected `<system-reminder>` text or a
  sentence), treat it as no argument — never `git checkout` a garbage string.
- **No argument, on `main` in the primary checkout** → Mode A: ship the
  working tree as-is.
- **No argument, on a non-main branch or inside a linked worktree** (common
  for spawned background-task sessions) → Mode B for the current branch,
  plus worktree cleanup.

## Mode A — ship the working tree on main

1. **Verify:** `make precommit && make verify`. If it fails only on
   formatting/lint, run `make fix` and re-verify.
2. **Commit:** stage and commit all pending work with a real
   conventional-commit message describing the change (never "WIP" or
   "fix quality gate"). Include fix-up changes from step 1 in the same commit.
3. **Push:** `git pull --rebase origin main && git push origin main`.

## Mode B — ship a branch (and its worktree, if any)

1. **Sync:** `git fetch origin`. Work in the branch's own worktree if it has
   one (see `git worktree list`); otherwise `git checkout <branch>`. If the
   branch has an upstream, `git pull origin <branch>`.
2. **Commit pending work on the branch:** uncommitted changes in a worktree
   are part of the deliverable — commit them with a descriptive message
   before merging.
3. **Fix quality and CI failures on the branch:**
    - `make verify` (lint + type + sec + tests); if it fails on
      formatting/lint, `make fix`.
    - `make precommit` until clean.
    - Commit any fixes.
4. **Merge into main from the primary checkout** (the first path in
   `git worktree list` — you cannot check out `main` inside a linked
   worktree):
    - `git checkout main && git pull origin main`
    - `git merge <branch>`
    - On conflicts: `git status`, resolve each file, `git add`, `git commit`.
5. **Final verification on merged main:** `make precommit && make verify`.
6. **Push:** `git push origin main`.
7. **Cleanup:**
    - Remove the worktree if the branch lived in one (run from the primary
      checkout): `git worktree remove <path>` (`--force` only if you are sure
      nothing unshipped remains).
    - `git branch -d <branch>`
    - Delete the remote branch only if it exists:
      `git ls-remote --exit-code origin <branch> && git push origin --delete <branch>`

## Report

Summarize what shipped: mode used, commits created, gate results, conflicts
resolved, and what was cleaned up.
