"""Tests for scripts.sync_commands.

`.claude/commands/*.md` is the canonical source; `.agents/skills` is generated.
`.gemini` is frozen legacy and no longer read (Gemini CLI is deprecated).
See docs/command-skill-sync.md.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from scripts.sync_commands import main, parse_markdown


def test_parse_markdown() -> None:
    content = """---
description: Ship a branch
argument-hint: "<branch_name>"
---

You are tasked with shipping the branch: **$ARGUMENTS**.
"""
    yaml_data, body = parse_markdown(content)
    assert yaml_data == {
        "description": "Ship a branch",
        "argument-hint": "<branch_name>",
    }
    assert body == "You are tasked with shipping the branch: **$ARGUMENTS**."


def _run_main(claude_dir: Path, skills_dir: Path) -> None:
    # Patch out the prettier subprocess so the test is hermetic and fast; the
    # sync-logic assertions below are on the raw generated output.
    with (
        patch("scripts.sync_commands.CLAUDE_DIR", str(claude_dir)),
        patch("scripts.sync_commands.SKILLS_DIR", str(skills_dir)),
        patch("scripts.sync_commands.format_generated_skills"),
    ):
        main()


def test_main_generates_skills_from_claude(tmp_path: Path) -> None:
    claude_dir = tmp_path / ".claude" / "commands"
    skills_dir = tmp_path / ".agents" / "skills"
    claude_dir.mkdir(parents=True)

    (claude_dir / "jules-persona.md").write_text(
        "---\ndescription: Jules Persona\n---\nHello Jules", encoding="utf-8"
    )
    (claude_dir / "ship.md").write_text(
        '---\ndescription: Ship Claude\nargument-hint: "<branch_name>"\n---\n'
        "Ship **$ARGUMENTS** now.",
        encoding="utf-8",
    )

    _run_main(claude_dir, skills_dir)

    assert (skills_dir / "jules-persona" / "SKILL.md").exists()
    assert (skills_dir / "ship" / "SKILL.md").exists()

    jules_content = (skills_dir / "jules-persona" / "SKILL.md").read_text(encoding="utf-8")
    assert "name: jules-persona" in jules_content
    assert "description: Jules Persona" in jules_content
    assert "Hello Jules" in jules_content

    ship_content = (skills_dir / "ship" / "SKILL.md").read_text(encoding="utf-8")
    assert "name: ship" in ship_content
    assert "description: Ship Claude" in ship_content


def test_gemini_is_not_a_source(tmp_path: Path) -> None:
    """A .gemini/commands entry must not add or override a generated skill."""
    claude_dir = tmp_path / ".claude" / "commands"
    gemini_dir = tmp_path / ".gemini" / "commands"
    skills_dir = tmp_path / ".agents" / "skills"
    claude_dir.mkdir(parents=True)
    gemini_dir.mkdir(parents=True)

    (claude_dir / "ship.md").write_text(
        "---\ndescription: Ship Claude\n---\nHello Claude Ship", encoding="utf-8"
    )
    # A stray legacy toml — and one with no claude counterpart — must be ignored.
    (gemini_dir / "ship.toml").write_text(
        "description = \"Ship Gemini\"\nprompt = '''Hello Gemini Ship'''", encoding="utf-8"
    )
    (gemini_dir / "legacy-only.toml").write_text(
        "description = \"Legacy\"\nprompt = '''gone'''", encoding="utf-8"
    )

    _run_main(claude_dir, skills_dir)

    ship_content = (skills_dir / "ship" / "SKILL.md").read_text(encoding="utf-8")
    assert "description: Ship Claude" in ship_content
    assert "Gemini" not in ship_content
    assert not (skills_dir / "legacy-only").exists()


def test_arguments_placeholder_is_translated(tmp_path: Path) -> None:
    """$ARGUMENTS (Claude) must become {{args}} (Antigravity)."""
    claude_dir = tmp_path / ".claude" / "commands"
    skills_dir = tmp_path / ".agents" / "skills"
    claude_dir.mkdir(parents=True)
    (claude_dir / "ship.md").write_text(
        "---\ndescription: Ship\n---\nShip **$ARGUMENTS** now.", encoding="utf-8"
    )

    _run_main(claude_dir, skills_dir)

    content = (skills_dir / "ship" / "SKILL.md").read_text(encoding="utf-8")
    assert "Ship **{{args}}** now." in content
    assert "$ARGUMENTS" not in content


def test_argument_hint_is_quoted_string(tmp_path: Path) -> None:
    """A bare `argument-hint: [..]` parses as a YAML array, not a string."""
    claude_dir = tmp_path / ".claude" / "commands"
    skills_dir = tmp_path / ".agents" / "skills"
    claude_dir.mkdir(parents=True)
    (claude_dir / "retro.md").write_text(
        '---\ndescription: Retro\nargument-hint: "[optional focus]"\n---\nbody',
        encoding="utf-8",
    )

    _run_main(claude_dir, skills_dir)

    content = (skills_dir / "retro" / "SKILL.md").read_text(encoding="utf-8")
    assert 'argument-hint: "[optional focus]"' in content
