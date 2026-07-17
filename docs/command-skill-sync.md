# Command / skill sync

Slash-commands (a.k.a. skills) are maintained in **one** place and generated into
the others. Getting this wrong wastes a round-trip: authoring a command in the
generated directory looks fine until the next sync **deletes it**.

## The one rule

- **Canonical source:** `.agents/skills/<name>/SKILL.md` — the open Agent Skills
  format: YAML frontmatter (`name`, `description`, optional `argument-hint`) +
  Markdown body, using `{{args}}` for interpolated arguments. Edit skills **here**.
- **Generated:** `.claude/commands/<name>.md` — consumed by Claude Code.
  **Never hand-edit.** `scripts/sync_commands.py` calls `shutil.rmtree` on the
  whole directory and regenerates it, so any manual edit is **silently lost**.

## Adding or editing a skill

1. Create/edit `.agents/skills/<name>/SKILL.md`.
2. Run the sync: `python3 scripts/sync_commands.py` (or the `/sync-commands` skill).
3. Commit **both** the source `SKILL.md` and the regenerated `.claude/commands/`.

## What the generator does (`scripts/sync_commands.py`)

For each `.agents/skills/<name>/SKILL.md` it writes `.claude/commands/<name>.md`:

- Drops the `name` field (redundant — Claude Code infers it from the filename).
- Translates `{{args}}` (Agent Skills placeholder) → `$ARGUMENTS` (Claude placeholder).
- Emits `argument-hint` as a **quoted** YAML string — bare values starting with
  `[`/`<` would otherwise parse as an array/tag, not a string, and fail validation.
- Runs `prettier` over the output (mirroring the lint-staged pre-commit hook) so a
  fresh sync is **idempotent** — no phantom diff between generated and committed
  files. (Without this, the commit hook reformats generated Markdown after the
  fact and every subsequent sync shows spurious drift.)

## Gate enforcement

`make sync-check` (part of `make verify`) regenerates `.claude/commands/` and
compares a content hash before/after. If the sync was not a no-op, the check
fails with the exact remedy — so the generated copy can never silently go stale.

## Tests

`tests/python/test_sync_commands.py` covers the generator. **Run it when you touch
`scripts/sync_commands.py`** — the scoped `ruff`/`black`/`mypy` loop does _not_ run
tests, so a signature change (e.g. dropping a function) passes those and still
breaks the suite:

```sh
venv/bin/pytest tests/python/test_sync_commands.py
```

It locks the behaviours that have already regressed once: `{{args}}` → `$ARGUMENTS`
translation and `argument-hint` quoting.

## Gotchas that already cost a round-trip

- Authoring a new command under `.claude/commands/` → wiped by the next
  `/sync-commands`. Author under `.agents/skills/<name>/SKILL.md`.
- Editing a generated `.claude/commands/*.md` directly → lost on next sync, and
  it won't match the canonical source.
