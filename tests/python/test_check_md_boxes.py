"""Unit tests for scripts.agents.check_md_boxes."""

from __future__ import annotations

from pathlib import Path

import pytest

from scripts.agents.check_md_boxes import check_text, display_width, main


def test_display_width_handles_ascii_cjk_and_combining() -> None:
    """Display width counts wide CJK chars as 2 and combining accents as 0."""
    assert display_width('abc') == 3
    assert display_width('金融') == 4
    assert display_width('e\u0301') == 1


def test_check_text_detects_and_fixes_misaligned_box_with_annotations() -> None:
    """Check mode reports misaligned rows and --fix pads borders and dotted rows."""
    raw = (
        '```text\n'
        '┌──────────┐\n'
        '│ short   │ ← note\n'
        '├──────────┤\n'
        '│ a ·······│\n'
        '│ much longer │\n'
        '└──────────┘\n'
        '```\n'
    )
    fixed, violations = check_text(raw, Path('sample.md'))
    assert len(violations) == 5
    expected = (
        '```text\n'
        '┌─────────────┐\n'
        '│ short       │ ← note\n'
        '├─────────────┤\n'
        '│ a ··········│\n'
        '│ much longer │\n'
        '└─────────────┘\n'
        '```\n'
    )
    assert fixed == expected
    refixed, second_violations = check_text(fixed, Path('sample.md'))
    assert second_violations == []
    assert refixed == fixed


def test_check_text_trims_excess_cjk_padding_to_border_width() -> None:
    """Wide CJK chars with extra trailing padding trim back to the border width."""
    raw = (
        '```text\n'
        '┌────────────┐\n'
        '│ hello      │\n'
        '│ x -> 金融   │\n'
        '└──────┬─────┘\n'
        '```\n'
    )
    fixed, violations = check_text(raw, Path('cjk.md'))
    assert len(violations) == 1
    assert violations[0].actual_width == 13
    assert violations[0].expected_width == 12
    assert '│ x -> 金融  │' in fixed


def test_check_text_ignores_open_trees_and_flow_arrows() -> None:
    """Tree listings and unclosed arrows must not trigger box-alignment errors."""
    raw = (
        '```text\n'
        'root/\n'
        '├── scripts/\n'
        '│   └── cli.py\n'
        '└── README.md\n'
        '\n'
        '┌─────────┐\n'
        '│ unclosed\n'
        '└──► next\n'
        '```\n'
    )
    fixed, violations = check_text(raw, Path('tree.md'))
    assert violations == []
    assert fixed == raw


def test_check_text_skips_side_by_side_boxes() -> None:
    """Side-by-side multi-box layouts are skipped instead of merging across the gap."""
    raw = (
        '```text\n'
        '┌───────┐   ┌───────┐\n'
        '│ left  │   │ right │\n'
        '└───────┘   └───────┘\n'
        '```\n'
    )
    fixed, violations = check_text(raw, Path('side_by_side.md'))
    assert violations == []
    assert fixed == raw


def test_main_check_and_fix_cli(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """CLI exits 1 on misaligned boxes, rewrites on --fix, and exits 0 afterwards."""
    md = tmp_path / 'diagram.md'
    md.write_text(
        '```text\n┌─────┐\n│ hi │\n│ longest │\n└─────┘\n```\n',
        encoding='utf-8',
    )
    assert main([str(md)]) == 1
    err = capsys.readouterr().err
    assert 'box border misaligned' in err

    assert main(['--fix', str(md)]) == 0
    assert main([str(md)]) == 0
    lines = md.read_text(encoding='utf-8').splitlines()
    assert lines[1] == '┌─────────┐'
    assert lines[2] == '│ hi      │'
    assert lines[3] == '│ longest │'
    assert lines[4] == '└─────────┘'
