"""Verify that tool and script files referenced in agent docs and skills exist on disk.

Ensures automated cleanup bots (e.g. Janitor) and refactors never delete
standalone CLI tools, pipeline scripts, or helpers that are referenced by agent
workflows, skills, or documentation.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# Regex pattern to extract scripts/, bin/, or tools/ paths from markdown text
SCRIPT_PATH_PATTERN = re.compile(
    r"(?<!venv/)(?<!/)\b((?:scripts|bin|tools)/[a-zA-Z0-9_\-/\.]+\.(?:py|sh|mjs|js|ts|cjs)|bin/(?:fund|portfolio|holdings|update-all))\b"
)

# Regex pattern to extract python -m module references (e.g. python3 -m scripts.agents.gate_guard)
PYTHON_MODULE_PATTERN = re.compile(r"python3\s+-m\s+(scripts\.[a-zA-Z0-9_\.]+)")


def _collect_markdown_files() -> list[Path]:
    """Collect AGENTS.md, .jules persona docs, and agent skill definitions."""
    md_files = [REPO_ROOT / "AGENTS.md"]

    jules_dir = REPO_ROOT / ".jules"
    if jules_dir.is_dir():
        md_files.extend(sorted(jules_dir.glob("*.md")))

    skills_dir = REPO_ROOT / ".agents" / "skills"
    if skills_dir.is_dir():
        for f in sorted(skills_dir.rglob("*.md")):
            # sibling-repo-sync describes foreign sibling repo scripts (e.g. ryusoh.github.io run-npx.sh)
            if f.name == "SKILL.md" and f.parent.name == "sibling-repo-sync":
                continue
            md_files.append(f)

    return [f for f in md_files if f.is_file()]


def test_documented_tool_scripts_exist() -> None:
    """All scripts in scripts/, bin/, tools/ referenced by agent docs must exist on disk."""
    md_files = _collect_markdown_files()
    assert md_files, "No markdown documentation files found to validate."

    missing_refs: list[str] = []

    for md_file in md_files:
        content = md_file.read_text(encoding="utf-8")

        for path_match in SCRIPT_PATH_PATTERN.findall(content):
            script_path = REPO_ROOT / path_match
            if not script_path.exists():
                missing_refs.append(
                    f"{md_file.relative_to(REPO_ROOT)} references missing script: {path_match}"
                )

        for mod_match in PYTHON_MODULE_PATTERN.findall(content):
            mod_rel_path = mod_match.replace(".", "/") + ".py"
            mod_path = REPO_ROOT / mod_rel_path
            mod_dir = REPO_ROOT / mod_match.replace(".", "/")
            if not (mod_path.is_file() or (mod_dir / "__init__.py").is_file()):
                missing_refs.append(
                    f"{md_file.relative_to(REPO_ROOT)} references missing module: {mod_match} ({mod_rel_path})"
                )

    assert (
        not missing_refs
    ), f"Found {len(missing_refs)} missing script reference(s) in documentation:\n" + "\n".join(
        missing_refs
    )


def test_core_infrastructure_tools_exist() -> None:
    """Explicitly verify critical infrastructure tools and scripts exist."""
    core_tools = [
        "scripts/agents/gate_guard.py",
        "scripts/agents/prior_prs.py",
        "scripts/agents/coverage_rank.py",
        "scripts/agents/check_commit_message.py",
        "scripts/check_thinking_comments.py",
        "scripts/check_mutation_ratchet.py",
        "scripts/sync_commands.py",
        "bin/fund",
        "bin/portfolio",
        "bin/holdings",
        "bin/update-all",
    ]

    missing = [tool for tool in core_tools if not (REPO_ROOT / tool).exists()]
    assert not missing, f"Core infrastructure tools missing: {missing}"
