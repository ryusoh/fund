"""Unit tests for scripts.agents.check_md_latex."""

from __future__ import annotations

from pathlib import Path

import pytest

from scripts.agents.check_md_latex import check_text, main


def test_single_line_display_math_is_expanded_and_idempotent() -> None:
    """Column-0 single-line $$expr$$ expands into standalone $$ lines with blank lines."""
    raw = 'Before:\n$$ 1 + R_{i,k} = (1 + r_i)\\exp(\\sigma z_k) $$\nAfter.\n'
    fixed, violations = check_text(raw, Path('sample.md'))
    assert [v.code for v in violations] == [
        'display-math-blank-line',
        'display-math-fence',
        'display-math-blank-line',
    ]
    assert fixed == (
        'Before:\n' '\n' '$$\n' '1 + R_{i,k} = (1 + r_i)\\exp(\\sigma z_k)\n' '$$\n' '\n' 'After.\n'
    )
    refixed, second_violations = check_text(fixed, Path('sample.md'))
    assert second_violations == []
    assert refixed == fixed


def test_multiline_display_math_splits_delimiters_and_drops_stray_dd() -> None:
    """$$ \\begin{aligned} ... \\end{aligned}$$ followed by stray $$ fixes cleanly."""
    raw = '## Summary\n' '\n' '$$ \\begin{aligned}\n' 'a &= b \\\\\n' '\\end{aligned}$$\n' '$$\n'
    fixed, violations = check_text(raw, Path('arch.md'))
    assert any(v.code == 'unmatched-display-math' for v in violations)
    assert any(v.code == 'display-math-fence' for v in violations)
    assert fixed == (
        '## Summary\n' '\n' '$$\n' '\\begin{aligned}\n' 'a &= b \\\\\n' '\\end{aligned}\n' '$$\n'
    )
    refixed, second_violations = check_text(fixed, Path('arch.md'))
    assert second_violations == []
    assert refixed == fixed


def test_caret_star_in_inline_and_display_math_becomes_ast() -> None:
    """^* inside math is rewritten to ^{\\ast} to avoid CommonMark emphasis stripping."""
    raw = (
        'Solve $f^* = \\arg\\max f$ and set $f_{\\text{scaled}} = c \\cdot f^*$.\n'
        '\n'
        '$$\n'
        'L^* = f^{*}\n'
        '$$\n'
    )
    fixed, violations = check_text(raw, Path('kelly.md'))
    assert [v.code for v in violations] == [
        'caret-star-in-math',
        'caret-star-in-math',
        'caret-star-in-math',
    ]
    assert fixed == (
        'Solve $f^{\\ast} = \\arg\\max f$ and set $f_{\\text{scaled}} = c \\cdot f^{\\ast}$.\n'
        '\n'
        '$$\n'
        'L^{\\ast} = f^{\\ast}\n'
        '$$\n'
    )
    refixed, second_violations = check_text(fixed, Path('kelly.md'))
    assert second_violations == []
    assert refixed == fixed


def test_ignores_code_fences_inline_code_and_currency_prose() -> None:
    """Code blocks, inline code spans, and financial $ amounts must not be flagged."""
    raw = (
        '```markdown\n'
        '$$ x = 1 $$\n'
        '$f^*$\n'
        '```\n'
        '\n'
        'Backlog $80.6M vs $100.6M, inline `$$f^*$$` and `$f^*$`, and price $120 – $155.\n'
    )
    fixed, violations = check_text(raw, Path('thesis.md'))
    assert violations == []
    assert fixed == raw


def test_unambiguous_unclosed_display_math_reports_error_even_with_fix(tmp_path: Path) -> None:
    """An unclosed $$ block before prose cannot be guessed and fails both check and --fix."""
    md = tmp_path / 'broken.md'
    md.write_text('$$\nx = 1\n\nSome prose with no closing fence\n', encoding='utf-8')
    assert main([str(md)]) == 1
    assert main(['--fix', str(md)]) == 1


def test_indented_display_math_in_lists_fails_without_mangling(tmp_path: Path) -> None:
    """Indented $$ blocks inside list items fail check and --fix without breaking list indentation."""
    raw_multi = '- Bullet:\n\n    $$\n    x = 1\n    $$\n'
    fixed, violations = check_text(raw_multi, Path('list.md'))
    assert [v.code for v in violations] == ['indented-display-math']
    assert fixed == raw_multi

    md = tmp_path / 'list_single.md'
    raw_single = '- Bullet:\n  $$x = 1$$\n'
    md.write_text(raw_single, encoding='utf-8')
    assert main([str(md)]) == 1
    assert main(['--fix', str(md)]) == 1
    assert md.read_text(encoding='utf-8') == raw_single


def test_main_check_and_fix_cli(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """CLI exits 1 on violations, rewrites on --fix, and exits 0 afterwards."""
    md = tmp_path / 'math.md'
    md.write_text('Text\n$$x = f^*$$\nMore text\n', encoding='utf-8')
    assert main([str(md)]) == 1
    err = capsys.readouterr().err
    assert 'display-math-fence' in err
    assert 'caret-star-in-math' in err

    assert main(['--fix', str(md)]) == 0
    assert main([str(md)]) == 0
    assert md.read_text(encoding='utf-8') == 'Text\n\n$$\nx = f^{\\ast}\n$$\n\nMore text\n'
