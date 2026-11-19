---
name: implement-action-items
description: Execute the work orders in an action-items doc one at a time, verifying and committing after each item without pushing. Use when the user points you at a doc containing tagged work orders (Find/Change/Verify) and asks you to implement them.
argument-hint: '[path/to/action-items.md]'
---

# Implement action items

Execute the work orders in **{{args}}** (or the doc from the conversation) in
order, one at a time. You are the implementer: the authoring agent verified
the anchors and snippets, so apply them literally and report anything that
doesn't fit rather than redesigning it.

Invoking this skill (including via `/goal`) authorizes a local commit per
verified work order. Pushing stays with the user.

## Per work order

1. **Tags.** `[skip]` → record as skipped (routed to a stronger model).
   `[visual]` → implement, and flag "visual — human review required" in the
   report.
2. **Anchor.** Find the exact `Find` string in the named file. If it doesn't
   match exactly, record the mismatch and move to the next item — the doc's
   author fixes work orders, not you.
3. **Change.** Make exactly the stated change and nothing else.
4. **Verify.** Run the item's Verify commands plus the preamble's
   format/lint commands, covering every file type you touched (a markdownlint
   MD040/MD038 error has broken CI here while JS/CSS were green;
   `make precommit-fix` is the CI-identical gate). Check that the verification
   could actually go red on the unfixed state — e.g. a layout assertion must
   first confirm the element is constrained, or `scroll == client` passes
   vacuously. On failure, apply the item's fallback once if it has one;
   otherwise undo your edit (confirm with `git diff <file>` that every hunk is
   yours), record the failure, and move on.
5. **Commit that item alone.** `git add <the files you changed>`; a
   Conventional Commits subject (`type(scope): summary`) with the work-order
   number in the body. Each item gets its own new commit — leave earlier
   commits and the remote as they are.

## Final report

Each work order as done (commit hash) / skipped (`[skip]`) / failed (anchor
mismatch or red verification, with the failing command's output). Report only
what you verified this run.

## Resume protocol

After an interruption or compaction: `git status --short`,
`git log -n 5 --oneline`, and the doc identify the first work order without a
commit. State its number, target file, and Verify command before calling
tools.
