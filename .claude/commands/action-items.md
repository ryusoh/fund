---
description: Turn a findings/analysis doc into complete, anchor-verified work orders ready for implementation without guesswork. Use when the user asks to compile, distill, or convert findings/recommendations into action items for later implementation.
argument-hint: "[path/to/findings.md]"
---

# Action items

Convert the improvements in **$ARGUMENTS** (or the findings doc from this
conversation) into implementation-ready work orders **in place** inside that
same doc, written so an implementation agent can execute them cleanly via
`/implement-action-items`.

## Verify every anchor and design every item up front

- Read every target file right now and confirm every `Find` string, path, and
  snippet against current file contents — spend authoring tokens up front so
  the implementer pastes instead of searching or guessing.
- **You are the design authority — never punt design work to `[skip]`.** When
  an item requires new modules, architectural refactors, canvas/renderer
  geometry, or new test suites, fully design it right here (module boundaries,
  exported signatures, data contracts, rendering/algorithm details, edge cases,
  and test assertions) and tag it `[design]`. Reserve `[skip]` strictly for
  items that are genuinely blocked on external credentials, unresolved human
  product decisions, or intentionally deferred out of scope.

## Format

Replace or extend the doc's action-items section with:

1. **Preamble for the implementer:** one work order at a time; `Find` strings
   are unique anchors (report mismatches rather than improvising); line
   numbers may drift; exact format/lint commands; `data/` is pipeline output;
   update each work order's `- **Status:**` line in the doc and commit locally
   after each item, leaving pushing to the user.
2. **Numbered work orders**, ranked by impact, each tagged:
    - `[trivial]` — markup, attribute, or deletion only (include paste-ready
      snippets)
    - `[low]` — small, localized logic change with verified anchor and tests
    - `[design]` — new module, complex renderer, or architectural refactor,
      fully specified inline (contracts, algorithms, DOM/data shapes, helper
      decomposition keeping every JS function at ESLint `complexity ≤ 20`, and
      test cases) so implementation needs no further design work
    - `[visual]` — requires human visual review afterward (`make screenshot`)
    - `[skip]` — blocked on external input / unresolved human decision /
      explicitly deferred out of scope (never used to punt design work)

    Each executable order specifies **Status** (`Pending`), **File**, **Find**
    (exact unique anchor), **Change** (complete spec or paste-ready snippet),
    **Verify** (scoped fast gates covering every touched language: include
    `npx eslint --max-warnings=0 <file>` + `npx jest <test>` for JS,
    `npx stylelint <file>` for CSS, and `venv/bin/ruff check <file> && venv/bin/mypy <file> && venv/bin/pytest <test>`
    for Python), and a one-line **Guardrail** for any verified trap (fallback
    path, execution order, `sync_configs.ensure_structure` schema preservation
    when adding fields to `data/analysis/<SYM>.json`, hidden measurement, or
    data-unit quirk).

## Finish

Format the doc with Prettier and report where the work orders live, calling out
any `[visual]` items needing human review and any genuinely blocked `[skip]`
items.
