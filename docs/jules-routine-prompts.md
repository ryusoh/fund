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
- **Auto-merge on green** for **Typist** and **Testpilot** only — provably-safe
  lanes where "passes CI" _is_ correctness. These stop needing your eyes entirely.
- **Manual approve** for Architect, Sentinel, Janitor, Palette, Bolt — the
  self-proving PR body makes each a ~10-second approve/close.
- **Stagger schedules** so routines that share file regions don't run at once
  (fewer conflicting PRs to close).

## Editing personas

Personas are plain Markdown in `.jules/`. Edit them by hand to retune a lane; the
routines read the new version on their next run. They will not write back.
