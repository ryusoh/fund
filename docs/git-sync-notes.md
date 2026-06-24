# Git sync notes (the Jules / squash-merge workflow)

Autonomous routines (Jules) and your own branches land on `main` via
**squash-merged PRs**. A branch you worked on becomes a _single_ new commit on
`origin/main`, so your local unsquashed commits become redundant duplicates of
content that is now upstream. This causes one recurring, expensive failure.

## Symptom: `git pull --rebase` explodes into many conflicts

After your work is squash-merged upstream, local `main` shows `ahead N, behind 1`
and `git pull --rebase` replays your N local commits onto the squashed upstream —
conflicting on **every** commit that touched the same files (one session hit a
15-commit cascade). Aborting and re-pulling just repeats it: `git pull --rebase`
re-initiates the same rebase each time.

## Fix: reset to upstream (do NOT rebase)

First confirm your local commits add nothing upstream lacks:

```sh
git diff main origin/main --stat   # near-empty == your work is already upstream
```

If so, adopt upstream and drop the redundant local lineage:

```sh
git reset --hard origin/main       # recoverable via `git reflog`
```

Then a plain `git pull` is a no-op. Do **not** `git pull --rebase` again — that
re-creates the cascade. (Note: an agent's Bash tool runs in a _different shell_
than your interactive terminal; if both touch `git` at once you ping-pong. Do the
resync in one place.)

## Avoid it entirely: don't PR trivial changes

A one-line config or doc change does **not** need a Jules PR. The PR squash-merges
and diverges local `main` for no benefit — that is exactly what triggered the
cascade above. Make a **direct commit on `main`** for small chores; reserve the
PR-and-approve flow for the autonomous routines doing real code work.
