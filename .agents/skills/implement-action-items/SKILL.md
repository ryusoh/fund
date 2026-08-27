---
name: implement-action-items
description: Execute the work orders in an action-items doc one at a time, verifying and committing after each item without pushing. Use when the user points you at a doc containing tagged work orders (Find/Change/Verify) and asks you to implement them.
argument-hint: '[path/to/action-items.md]'
---

# Implement action items

Execute the work orders in **{{args}}** (or the doc from the conversation)
mechanically, one at a time, in order. You are an implementer, not a designer:
the doc's anchors and snippets were verified by the authoring agent — follow
them literally.

## Per work order

1. **Read the tags.** `[skip]` → skip the item entirely and record it as
   skipped (it is routed to a stronger model). `[visual]` → implement normally,
   but flag "visual — human review required" in your final report.
2. **Match the Find anchor.** Locate the exact `Find` string in the named
   file. If it does not match — even slightly — **stop that item, record the
   mismatch, and move to the next item.** Do not improvise an alternative
   anchor, and do not "fix" the work order.
3. **Make exactly the stated change.** Nothing more: no drive-by edits, no
   refactors, no comment rewording, no touching `data/`.
4. **Verify.** Run the item's **Verify** commands plus the doc's preamble
   formatting/lint commands. If verification fails and the item gave a fallback
   instruction, apply it once; otherwise revert your edit for that item
   (`git checkout -- <files>`), record the failure, and move on.
5. **Commit that item only:**
    - `git add <the specific files you changed>` — never `git add -A` or
      `git add .` (other agents' work may share the tree).
    - Commit with a Conventional Commits subject
      (`type(scope): summary`, lower-case imperative, ≤ 72 chars), referencing
      the work-order number in the body.
    - **Never push, never amend, never rebase.** Pushing is the human's call.

## Final report

List each work order as done / skipped ([skip] tag) / failed (anchor mismatch
or red verification), with the commit hash for each done item and the failing
command's output for each failed item. Do not claim anything you didn't
verify this run.
