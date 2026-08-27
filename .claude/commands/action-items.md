---
description: Turn a findings/analysis doc into mechanical, anchor-verified work orders that a cheaper implementation agent can execute without interpretation. Use when the user asks to compile, distill, or convert findings/recommendations into action items for later implementation.
argument-hint: "[path/to/findings.md]"
---

# Action items

Convert the improvements in a findings doc into **implementation-ready work
orders** inside that same doc, written so a cheaper, more hallucination-prone
model can execute them mechanically. Input doc: **$ARGUMENTS** (or the doc from
the conversation).

## Verify before you write

Read every file the work orders will touch and confirm each anchor exists
**right now** — the writing model must burn its own tokens so the
implementation model doesn't have to search, guess, or interpret. Never write a
`Find` string, path, or before/after snippet you haven't seen in the current
file contents this session.

## Format

Replace/extend the doc's action-items section in place (don't spawn a second
file). Structure:

1. **Preamble — rules for the implementer**, e.g.: one work order per change;
   `Find` strings are unique anchors, and if one doesn't match, STOP and report
   rather than improvise; line numbers are dated and may drift; the formatting
   and lint commands to run after editing; never edit `data/`.
2. **Numbered work orders**, ranked by expected impact, each tagged:
    - `[trivial]` — markup/attribute/deletion only
    - `[low]` — small logic change
    - `[visual]` — a human must review the rendered page afterwards
    - `[skip]` — needs a design decision or new tests; route to a stronger
      model instead of letting a weak one flail

    Each work order: **File**, **Find** (exact unique anchor text from the
    current file), **Change** (what to do), **Verify** (the exact scoped
    commands), and a one-line guardrail where a trap exists.

## Keep it cheap (token balance)

The implementing model is billed per token too — be terse, but spend words
where ambiguity is dangerous:

- **Paste-ready snippets for trivial edits.** The exact line to insert or the
  exact attribute to add — a weak model should paste, not compose.
- **No essays for complex items.** If a change needs design judgment or new
  tests, don't explain how — tag it `[skip]` with a two-line pointer and move
  on.
- **Bake in verified traps** you discovered while reading (wrong fallback
  paths, execution-order hazards, missing minified twins) as single sentences,
  not paragraphs.
- **Scoped verification per item** (`npx jest tests/js/pages/<page>`,
  `npx stylelint <file>`), not a full-repo gate per item.

## Execution contract

State in the preamble that the implementation agent works one item at a time
and **commits after each item but never pushes** — per-item commits keep each
change reviewable and revertible; pushing stays a human decision. The executor
side of this contract lives in the `implement-action-items` skill.

## Finish

Run the repo's formatter on the doc and tell the user where the work orders
live and which items are tagged `[skip]`.
