"""Conformance gate for the autonomous Jules routine personas.

Every ``.jules/<name>.md`` must carry the shared house conventions, and the
AGENTS.md lanes table must list exactly the live routines. This promotes the
manual consistency sweep into a CI-enforced check so persona drift fails fast
instead of needing a human review.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from scripts.agents.check_commit_message import EMOJI

REPO_ROOT = Path(__file__).resolve().parents[2]
JULES_DIR = REPO_ROOT / ".jules"
AGENTS = REPO_ROOT / "AGENTS.md"

LIVE_ROUTINES = {"architect", "bolt", "janitor", "sentinel", "testpilot", "typist"}
RETIRED_ROUTINES = {"palette"}

# Phrases (lower-case) every persona must contain after whitespace is collapsed.
REQUIRED_PHRASES = (
    "never ask",
    "read `agents.md`",
    "do not modify",
    "`.jules/`",
    "conventional commits per `agents.md`",
    "no emoji",
    "## lane",
)


def _persona_files() -> list[Path]:
    return sorted(JULES_DIR.glob("*.md"))


def _collapsed(path: Path) -> str:
    return re.sub(r"\s+", " ", path.read_text(encoding="utf-8")).lower()


def test_live_personas_present_and_retired_absent() -> None:
    names = {p.stem for p in _persona_files()}
    assert names == LIVE_ROUTINES, f"unexpected persona set: {sorted(names)}"
    for retired in RETIRED_ROUTINES:
        assert not (JULES_DIR / f"{retired}.md").exists()


@pytest.mark.parametrize("persona", _persona_files(), ids=lambda p: p.stem)
def test_persona_has_required_sections(persona: Path) -> None:
    text = _collapsed(persona)
    missing = [phrase for phrase in REQUIRED_PHRASES if phrase not in text]
    assert not missing, f"{persona.name} is missing: {missing}"


@pytest.mark.parametrize("persona", _persona_files(), ids=lambda p: p.stem)
def test_persona_has_no_emoji(persona: Path) -> None:
    found = EMOJI.findall(persona.read_text(encoding="utf-8"))
    assert not found, f"{persona.name} contains emoji: {found}"


def test_agents_lanes_match_live_routines() -> None:
    text = AGENTS.read_text(encoding="utf-8")
    section = text.split("## Lanes", 1)[1].split("\n## ", 1)[0]
    routines = {
        m.group(1).lower()
        for line in section.splitlines()
        if (m := re.match(r"\|\s*([A-Za-z]+)\s*\|", line)) and m.group(1).lower() != "routine"
    }
    assert routines == LIVE_ROUTINES, f"AGENTS lanes != live routines: {sorted(routines)}"
