# Command / skill sync

Slash-commands (a.k.a. skills) are maintained in **one** place and generated into
the others. Getting this wrong wastes a round-trip: authoring a skill in the
generated directory looks fine until the next sync **deletes it**.

## The one rule

- **Canonical source:** `.claude/commands/<name>.md` — YAML frontmatter
  (`description`, optional `argument-hint`) + Markdown body. Edit skills **here**.
- **Generated:** `.agents/skills/<name>/SKILL.md` — consumed by the Antigravity
  CLI. **Never hand-edit.** `scripts/sync_commands.py` calls `shutil.rmtree` on the
  whole directory and regenerates it, so any manual edit is **silently lost**.
- **Frozen legacy:** `.gemini/commands/<name>.toml` — old Gemini CLI config.
  Gemini CLI is deprecated in favour of Antigravity (which reads `.agents/`), so
  the sync **no longer reads or writes** `.gemini/`. Don't add new `.toml`; the
  existing ones are left untouched only for history.

## Adding or editing a skill

1. Create/edit `.claude/commands/<name>.md`.
2. Run the sync: `python3 scripts/sync_commands.py` (or the `/sync-commands` skill).
3. Commit **both** the source `.md` and the regenerated `.agents/skills/`.

## What the generator does (`scripts/sync_commands.py`)

For each `.claude/commands/*.md` it writes `.agents/skills/<name>/SKILL.md`:

- Adds `name: <filename>` to the frontmatter.
- Translates `$ARGUMENTS` (Claude placeholder) → `{{args}}` (Antigravity placeholder).
- Emits `argument-hint` as a **quoted** YAML string — bare values starting with
  `[`/`<` would otherwise parse as an array/tag, not a string, and fail validation.
- Runs `prettier` over the output (mirroring the lint-staged pre-commit hook) so a
  fresh sync is **idempotent** — no phantom diff between generated and committed
  files. (Without this, the commit hook reformats generated Markdown after the
  fact and every subsequent sync shows spurious drift.)

## Tests

`tests/python/test_sync_commands.py` covers the generator. **Run it when you touch
`scripts/sync_commands.py`** — the scoped `ruff`/`black`/`mypy` loop does _not_ run
tests, so a signature change (e.g. dropping a function) passes those and still
breaks the suite:

```sh
venv/bin/pytest tests/python/test_sync_commands.py
```

It locks the behaviours that have already regressed once: `.gemini` is not a
source, `$ARGUMENTS` → `{{args}}` translation, and `argument-hint` quoting.

## Gotchas that already cost a round-trip

- Authoring a new skill under `.agents/skills/` → wiped by the next `/sync-commands`.
  Author under `.claude/commands/`.
- Re-adding `.gemini/*.toml` for a new skill → pointless; that CLI is dead and the
  sync ignores it.
- Editing a generated `.agents/skills/*/SKILL.md` directly → lost on next sync, and
  it won't match the canonical source.
