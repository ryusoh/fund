"""Tests for scripts.sync_commands.

`.agents/skills/<name>/SKILL.md` is the canonical source; `.claude/commands/`
is generated. See docs/command-skill-sync.md.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from scripts.sync_commands import main, parse_markdown


def test_parse_markdown() -> None:
    content = """---
name: ship
description: Ship a branch
argument-hint: "<branch_name>"
---

You are tasked with shipping the branch: **{{args}}**.
"""
    yaml_data, body = parse_markdown(content)
    assert yaml_data == {
        "name": "ship",
        "description": "Ship a branch",
        "argument-hint": "<branch_name>",
    }
    assert body == "You are tasked with shipping the branch: **{{args}}**."


def _run_main(skills_dir: Path, claude_dir: Path) -> None:
    # Patch out the prettier subprocess so the test is hermetic and fast; the
    # sync-logic assertions below are on the raw generated output.
    with (
        patch("scripts.sync_commands.SKILLS_DIR", str(skills_dir)),
        patch("scripts.sync_commands.CLAUDE_DIR", str(claude_dir)),
        patch("scripts.sync_commands.format_generated_commands"),
    ):
        main()


def test_main_generates_commands_from_skills(tmp_path: Path) -> None:
    skills_dir = tmp_path / ".agents" / "skills"
    claude_dir = tmp_path / ".claude" / "commands"

    jules_dir = skills_dir / "jules-persona"
    jules_dir.mkdir(parents=True)
    (jules_dir / "SKILL.md").write_text(
        "---\nname: jules-persona\ndescription: Jules Persona\n---\nHello Jules",
        encoding="utf-8",
    )

    ship_dir = skills_dir / "ship"
    ship_dir.mkdir(parents=True)
    (ship_dir / "SKILL.md").write_text(
        '---\nname: ship\ndescription: Ship Claude\nargument-hint: "<branch_name>"\n---\n'
        "Ship **{{args}}** now.",
        encoding="utf-8",
    )

    _run_main(skills_dir, claude_dir)

    assert (claude_dir / "jules-persona.md").exists()
    assert (claude_dir / "ship.md").exists()

    jules_content = (claude_dir / "jules-persona.md").read_text(encoding="utf-8")
    assert "description: Jules Persona" in jules_content
    assert "Hello Jules" in jules_content
    assert "name:" not in jules_content

    ship_content = (claude_dir / "ship.md").read_text(encoding="utf-8")
    assert "description: Ship Claude" in ship_content


def test_non_skill_entries_are_ignored(tmp_path: Path) -> None:
    """A skills-dir entry without a SKILL.md must not produce a command."""
    skills_dir = tmp_path / ".agents" / "skills"
    claude_dir = tmp_path / ".claude" / "commands"
    skills_dir.mkdir(parents=True)

    ship_dir = skills_dir / "ship"
    ship_dir.mkdir(parents=True)
    (ship_dir / "SKILL.md").write_text(
        "---\nname: ship\ndescription: Ship Claude\n---\nHello Claude Ship",
        encoding="utf-8",
    )
    # A stray file (not a skill directory) must be ignored.
    (skills_dir / "README.md").write_text("not a skill", encoding="utf-8")

    _run_main(skills_dir, claude_dir)

    ship_content = (claude_dir / "ship.md").read_text(encoding="utf-8")
    assert "description: Ship Claude" in ship_content
    assert not (claude_dir / "README.md").exists()


def test_arguments_placeholder_is_translated(tmp_path: Path) -> None:
    """{{args}} (Agent Skills) must become $ARGUMENTS (Claude)."""
    skills_dir = tmp_path / ".agents" / "skills"
    claude_dir = tmp_path / ".claude" / "commands"
    ship_dir = skills_dir / "ship"
    ship_dir.mkdir(parents=True)
    (ship_dir / "SKILL.md").write_text(
        "---\nname: ship\ndescription: Ship\n---\nShip **{{args}}** now.",
        encoding="utf-8",
    )

    _run_main(skills_dir, claude_dir)

    content = (claude_dir / "ship.md").read_text(encoding="utf-8")
    assert "Ship **$ARGUMENTS** now." in content
    assert "{{args}}" not in content


def test_argument_hint_is_quoted_string(tmp_path: Path) -> None:
    """A bare `argument-hint: [..]` parses as a YAML array, not a string."""
    skills_dir = tmp_path / ".agents" / "skills"
    claude_dir = tmp_path / ".claude" / "commands"
    retro_dir = skills_dir / "retro"
    retro_dir.mkdir(parents=True)
    (retro_dir / "SKILL.md").write_text(
        '---\nname: retro\ndescription: Retro\nargument-hint: "[optional focus]"\n---\nbody',
        encoding="utf-8",
    )

    _run_main(skills_dir, claude_dir)

    content = (claude_dir / "retro.md").read_text(encoding="utf-8")
    assert 'argument-hint: "[optional focus]"' in content
