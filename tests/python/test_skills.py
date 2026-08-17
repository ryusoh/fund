"""Tests for Agent Skills validation, metadata schema, and symlink discovery.

Validates that all .agents/skills/ definitions follow the Open Agent Skills
specification, contain required frontmatter, use standard placeholders, and
that .claude/skills correctly symlinks to .agents/skills for autonomous runtimes.
"""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SKILLS_DIR = REPO_ROOT / ".agents" / "skills"
CLAUDE_SKILLS_SYMLINK = REPO_ROOT / ".claude" / "skills"


def _parse_frontmatter(content: str) -> tuple[dict[str, str], str]:
    """Extract YAML frontmatter and body from markdown content."""
    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}, content.strip()

    yaml_lines = parts[1].strip().splitlines()
    data: dict[str, str] = {}
    for line in yaml_lines:
        if ":" in line:
            key, val = line.split(":", 1)
            data[key.strip()] = val.strip().strip('"').strip("'")
    return data, parts[2].strip()


def test_skills_directory_exists() -> None:
    """Canonical .agents/skills directory must exist and contain skills."""
    assert SKILLS_DIR.is_dir(), ".agents/skills directory missing"
    skills = [p for p in SKILLS_DIR.iterdir() if p.is_dir()]
    assert len(skills) > 0, "No skills found in .agents/skills"


def test_each_skill_has_valid_skill_md() -> None:
    """Each skill subfolder must contain a valid SKILL.md with required frontmatter."""
    for skill_dir in sorted(SKILLS_DIR.iterdir()):
        if not skill_dir.is_dir():
            continue

        skill_md = skill_dir / "SKILL.md"
        assert skill_md.is_file(), f"Missing SKILL.md in {skill_dir.name}"

        content = skill_md.read_text(encoding="utf-8")
        frontmatter, body = _parse_frontmatter(content)

        assert "name" in frontmatter, f"{skill_md} missing 'name' in frontmatter"
        assert (
            frontmatter["name"] == skill_dir.name
        ), f"{skill_md} frontmatter name '{frontmatter['name']}' does not match directory '{skill_dir.name}'"
        assert "description" in frontmatter, f"{skill_md} missing 'description' in frontmatter"
        assert len(frontmatter["description"]) > 10, f"{skill_md} description too short or empty"
        assert len(body) > 0, f"{skill_md} body is empty"

        # Canonical skills should use open standard {{args}}, not Claude's generated $ARGUMENTS
        assert (
            "$ARGUMENTS" not in body
        ), f"{skill_md} contains '$ARGUMENTS' — canonical skills must use '{{{{args}}}}' standard"


def test_claude_skills_symlink_resolves() -> None:
    """Verify .claude/skills symlink exists and resolves to .agents/skills."""
    assert CLAUDE_SKILLS_SYMLINK.exists(), ".claude/skills does not exist"
    assert CLAUDE_SKILLS_SYMLINK.is_symlink(), ".claude/skills must be a symbolic link"
    resolved_target = CLAUDE_SKILLS_SYMLINK.resolve()
    assert (
        resolved_target == SKILLS_DIR.resolve()
    ), f".claude/skills target {resolved_target} does not resolve to {SKILLS_DIR.resolve()}"


def test_self_contained_skill_bundle_paths() -> None:
    """If a skill directory contains scripts/ or references/, verify valid structure."""
    for skill_dir in SKILLS_DIR.iterdir():
        if not skill_dir.is_dir():
            continue

        scripts_dir = skill_dir / "scripts"
        if scripts_dir.is_dir():
            scripts = list(scripts_dir.iterdir())
            assert len(scripts) > 0, f"Empty scripts/ directory in {skill_dir.name}"

        refs_dir = skill_dir / "references"
        if refs_dir.is_dir():
            refs = list(refs_dir.iterdir())
            assert len(refs) > 0, f"Empty references/ directory in {skill_dir.name}"
