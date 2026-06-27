"""Tests for scripts.sync_commands."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from scripts.sync_commands import main, parse_markdown, parse_toml


def test_parse_toml() -> None:
    content = """
description = "Retrospective — turn this session's friction into durable repo improvements (the compounding loop)"
prompt = '''
You just finished a task. {{args}}
'''
"""
    description, prompt = parse_toml(content)
    assert (
        description
        == "Retrospective — turn this session's friction into durable repo improvements (the compounding loop)"
    )
    assert prompt == "You just finished a task. {{args}}"


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


def test_main_sync(tmp_path: Path) -> None:
    # Set up source directories
    claude_dir = tmp_path / ".claude" / "commands"
    gemini_dir = tmp_path / ".gemini" / "commands"
    skills_dir = tmp_path / ".agents" / "skills"

    claude_dir.mkdir(parents=True)
    gemini_dir.mkdir(parents=True)

    # Write source files
    jules_persona_md = claude_dir / "jules-persona.md"
    jules_persona_md.write_text(
        "---\ndescription: Jules Persona\n---\nHello Jules", encoding="utf-8"
    )

    ship_md = claude_dir / "ship.md"
    ship_md.write_text("---\ndescription: Ship Claude\n---\nHello Ship", encoding="utf-8")

    ship_toml = gemini_dir / "ship.toml"
    ship_toml.write_text(
        "description = \"Ship Gemini\"\nprompt = '''Hello Gemini Ship'''",
        encoding="utf-8",
    )

    # Patch constants in scripts.sync_commands
    with (
        patch("scripts.sync_commands.CLAUDE_DIR", str(claude_dir)),
        patch("scripts.sync_commands.GEMINI_DIR", str(gemini_dir)),
        patch("scripts.sync_commands.SKILLS_DIR", str(skills_dir)),
    ):
        main()

    # Assert expected output directories and files exist
    assert (skills_dir / "jules-persona" / "SKILL.md").exists()
    assert not (skills_dir / "claude-ship").exists()
    assert (skills_dir / "ship" / "SKILL.md").exists()
    assert not (skills_dir / "gemini-ship").exists()

    # Read back and verify contents
    jules_content = (skills_dir / "jules-persona" / "SKILL.md").read_text(encoding="utf-8")
    assert "name: jules-persona" in jules_content
    assert "description: Jules Persona" in jules_content
    assert "Hello Jules" in jules_content

    ship_content = (skills_dir / "ship" / "SKILL.md").read_text(encoding="utf-8")
    assert "name: ship" in ship_content
    assert "description: Ship Gemini" in ship_content
    assert "Hello Gemini Ship" in ship_content
