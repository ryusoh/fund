#!/usr/bin/env python3
"""Check and optionally auto-fix Unicode box-drawing rectangles in Markdown.

Prettier and markdownlint-cli2 treat fenced code blocks as opaque text, so
hand-drawn Unicode box diagrams (``┌─┐ / │ │ / └─┘``) inside `` ```text ``
blocks can drift out of alignment. This gate scans closed box rectangles in
Markdown code fences, verifies uniform left/right border display widths, and
with ``--fix`` pads/adjusts each row to a consistent rectangle.

Open tree listings (``├──`` / ``└──``) and unclosed flow diagrams are left
untouched.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

EXCLUDED_PREFIXES = (
    'node_modules/',
    'venv/',
    '.venv/',
    '.claude/',
    '.qwen/',
    'mutants/',
    'reports/',
    '.stryker-tmp/',
    'data/',
    'assets/vendor/',
    'js/vendor/',
)

FENCE_OPEN_RE = re.compile(r'^(\s*)(`{3,}|~{3,})(.*)$')
TOP_BORDER_RE = re.compile(r'^(\s*)┌([─┬┴┼]+)┐(.*)$')
MID_BORDER_RE = re.compile(r'^(\s*)├([─┬┴┼]+)┤(.*)$')
BOT_BORDER_RE = re.compile(r'^(\s*)└([─┬┴┼]+)┘(.*)$')


@dataclass(frozen=True)
class BoxRow:
    """Single parsed row inside a closed Unicode box rectangle."""

    index: int
    line_no: int
    kind: str
    indent: str
    left_char: str
    interior: str
    right_char: str
    trailing: str


@dataclass(frozen=True)
class BoxViolation:
    """Single alignment mismatch inside a Markdown box diagram."""

    path: Path
    line_no: int
    actual_width: int
    expected_width: int


def display_width(text: str) -> int:
    """Return terminal display cell width accounting for wide and combining chars."""
    width = 0
    for ch in text:
        if unicodedata.combining(ch) or unicodedata.category(ch) in ('Mn', 'Me', 'Cf'):
            continue
        if unicodedata.east_asian_width(ch) in ('W', 'F'):
            width += 2
        else:
            width += 1
    return width


def _strip_trailing_blank(trailing: str) -> str:
    return '' if trailing.strip() == '' else trailing.rstrip()


def _parse_border_row(
    line: str, index: int, line_no: int, kind: str, pattern: re.Pattern[str], left: str, right: str
) -> BoxRow | None:
    match = pattern.match(line)
    if not match:
        return None
    indent, interior, trailing = match.groups()
    return BoxRow(
        index=index,
        line_no=line_no,
        kind=kind,
        indent=indent,
        left_char=left,
        interior=interior,
        right_char=right,
        trailing=_strip_trailing_blank(trailing),
    )


def _parse_content_row(line: str, index: int, line_no: int, indent: str) -> BoxRow | None:
    prefix = indent + '│'
    if not line.startswith(prefix):
        return None
    last_pipe = line.rfind('│', len(prefix))
    if last_pipe == -1:
        return None
    return BoxRow(
        index=index,
        line_no=line_no,
        kind='content',
        indent=indent,
        left_char='│',
        interior=line[len(prefix) : last_pipe],
        right_char='│',
        trailing=_strip_trailing_blank(line[last_pipe + 1 :]),
    )


def _collect_box_from(lines: list[str], start_idx: int, base_line_no: int) -> list[BoxRow] | None:
    top = _parse_border_row(
        lines[start_idx], start_idx, base_line_no + start_idx, 'top', TOP_BORDER_RE, '┌', '┐'
    )
    if top is None:
        return None

    rows: list[BoxRow] = [top]
    idx = start_idx + 1
    while idx < len(lines):
        line = lines[idx]
        line_no = base_line_no + idx
        bot = _parse_border_row(line, idx, line_no, 'bot', BOT_BORDER_RE, '└', '┘')
        if bot is not None and bot.indent == top.indent:
            rows.append(bot)
            return rows

        mid = _parse_border_row(line, idx, line_no, 'mid', MID_BORDER_RE, '├', '┤')
        if mid is not None and mid.indent == top.indent:
            rows.append(mid)
            idx += 1
            continue

        content = _parse_content_row(line, idx, line_no, top.indent)
        if content is not None:
            rows.append(content)
            idx += 1
            continue

        return None
    return None


def iter_fenced_blocks(lines: list[str]) -> list[tuple[int, int]]:
    """Return (start_line_idx, end_line_idx) spans of fenced code block bodies."""
    blocks: list[tuple[int, int]] = []
    open_fence_char = ''
    open_fence_len = 0
    body_start = -1

    for idx, line in enumerate(lines):
        stripped = line.lstrip()
        if body_start == -1:
            match = FENCE_OPEN_RE.match(line)
            if match:
                fence = match.group(2)
                open_fence_char = fence[0]
                open_fence_len = len(fence)
                body_start = idx + 1
        elif stripped.startswith(open_fence_char * open_fence_len):
            rest = stripped.lstrip(open_fence_char)
            if rest.strip() == '':
                blocks.append((body_start, idx))
                body_start = -1
    return blocks


def find_closed_boxes(lines: list[str]) -> list[list[BoxRow]]:
    """Find all closed Unicode box rectangles inside fenced code blocks."""
    boxes: list[list[BoxRow]] = []
    for start, end in iter_fenced_blocks(lines):
        block_lines = lines[start:end]
        idx = 0
        while idx < len(block_lines):
            box = _collect_box_from(block_lines, idx, start + 1)
            if box is None:
                idx += 1
                continue
            reindexed = [
                BoxRow(
                    index=start + r.index,
                    line_no=r.line_no,
                    kind=r.kind,
                    indent=r.indent,
                    left_char=r.left_char,
                    interior=r.interior,
                    right_char=r.right_char,
                    trailing=r.trailing,
                )
                for r in box
            ]
            boxes.append(reindexed)
            idx = box[-1].index + 1
    return boxes


def _min_row_width(row: BoxRow, border_width: int) -> int:
    width = display_width(row.interior)
    if row.kind != 'content' or width <= border_width:
        return width
    trailing_spaces = len(row.interior) - len(row.interior.rstrip(' '))
    # Keep at least 1 trailing space when trimming padding back to the border width.
    reducible = max(0, trailing_spaces - 1)
    return max(border_width, width - reducible)


def compute_target_width(box: list[BoxRow]) -> int:
    """Compute the tightest uniform interior display width without truncating text."""
    border_widths = [display_width(r.interior) for r in box if r.kind in ('top', 'mid', 'bot')]
    border_width = max(border_widths) if border_widths else 0
    return max(_min_row_width(r, border_width) for r in box)


def _adjust_border_interior(interior: str, diff: int) -> str:
    match = re.search(r'─+$', interior)
    if not match:
        match = re.search(r'─+', interior)
    if not match:
        return interior + ('─' * max(0, diff))
    start, end = match.span()
    run_len = end - start
    new_len = max(1, run_len + diff)
    return interior[:start] + ('─' * new_len) + interior[end:]


def _adjust_content_interior(interior: str, diff: int) -> str:
    if diff > 0:
        pad_char = '·' if interior.endswith('···') else ' '
        return interior + (pad_char * diff)
    if diff < 0:
        trim = -diff
        trailing_spaces = len(interior) - len(interior.rstrip(' '))
        if trailing_spaces >= trim:
            return interior[:-trim]
    return interior


def _format_row(row: BoxRow, target_width: int) -> str:
    diff = target_width - display_width(row.interior)
    if diff == 0:
        interior = row.interior
    elif row.kind == 'content':
        interior = _adjust_content_interior(row.interior, diff)
    else:
        interior = _adjust_border_interior(row.interior, diff)
    return f'{row.indent}{row.left_char}{interior}{row.right_char}{row.trailing}'


def check_text(text: str, path: Path) -> tuple[str, list[BoxViolation]]:
    """Check Markdown text for misaligned boxes and return (fixed_text, violations)."""
    has_trailing_nl = text.endswith('\n')
    lines = text.splitlines()
    boxes = find_closed_boxes(lines)
    violations: list[BoxViolation] = []
    updated_lines = list(lines)

    for box in boxes:
        target_width = compute_target_width(box)
        for row in box:
            actual_width = display_width(row.interior)
            if actual_width != target_width:
                violations.append(
                    BoxViolation(
                        path=path,
                        line_no=row.line_no,
                        actual_width=actual_width,
                        expected_width=target_width,
                    )
                )
                updated_lines[row.index] = _format_row(row, target_width)

    fixed_text = '\n'.join(updated_lines)
    if has_trailing_nl and fixed_text:
        fixed_text += '\n'
    elif has_trailing_nl and text == '\n':
        fixed_text = '\n'
    return fixed_text, violations


def iter_markdown_files(paths: list[str] | None = None) -> list[Path]:
    """Return Markdown files to inspect, either from explicit CLI args or git ls-files."""
    if paths:
        return sorted(Path(p) for p in paths if Path(p).is_file())

    try:
        out = subprocess.check_output(
            ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '*.md'],
            cwd=REPO_ROOT,
            text=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return sorted(
            p
            for p in REPO_ROOT.rglob('*.md')
            if not any(
                p.relative_to(REPO_ROOT).as_posix().startswith(pref) for pref in EXCLUDED_PREFIXES
            )
        )

    result: list[Path] = []
    for rel in out.splitlines():
        rel_norm = rel.replace('\\', '/')
        if any(rel_norm.startswith(pref) for pref in EXCLUDED_PREFIXES):
            continue
        candidate = REPO_ROOT / rel_norm
        if candidate.is_file():
            result.append(candidate)
    return sorted(result)


def main(argv: list[str] | None = None) -> int:
    """CLI entry point for checking or auto-fixing Markdown box rectangles."""
    parser = argparse.ArgumentParser(
        description='Check and optionally auto-fix Unicode box-drawing rectangles in Markdown.'
    )
    parser.add_argument(
        '--fix',
        action='store_true',
        help='Rewrite files in place to align closed box borders.',
    )
    parser.add_argument(
        'files',
        nargs='*',
        help='Optional Markdown file paths (defaults to tracked/untracked repo .md files).',
    )
    args = parser.parse_args(argv)

    md_files = iter_markdown_files(args.files)
    all_violations: list[BoxViolation] = []
    fixed_count = 0

    for md_file in md_files:
        original = md_file.read_text(encoding='utf-8')
        fixed_text, violations = check_text(original, md_file)
        if not violations:
            continue
        if args.fix and fixed_text != original:
            md_file.write_text(fixed_text, encoding='utf-8')
            fixed_count += 1
        else:
            all_violations.extend(violations)

    if args.fix:
        if fixed_count:
            print(f'md-box-align: fixed {fixed_count} file(s).')
        return 0

    if all_violations:
        for v in all_violations:
            try:
                rel = v.path.relative_to(REPO_ROOT)
            except ValueError:
                rel = v.path
            print(
                f'{rel}:{v.line_no}: box border misaligned '
                f'(width {v.actual_width} != expected {v.expected_width})',
                file=sys.stderr,
            )
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
