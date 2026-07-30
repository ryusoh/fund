#!/usr/bin/env python3
"""Stream-of-consciousness gate (AGENTS.md non-negotiable #9).

Deterministic scan of ALL git-tracked sources (Python, JS/TS, CSS — not just
tests; unattended agents write both languages) for:
1. Thinking-out-loud comments ("Wait, ...", "Ah, ...", "To hit line N, ...").
2. Abandoned test bodies: pytest-collectable functions (module-level ``test_*``
   or methods of ``Test*`` classes) whose body is only ``pass``, ``...``, or a
   docstring, and JS ``it()``/``test()`` calls whose callback body is empty.

Exit code 1 (and one line per violation) if anything is found. Wired into the
CI gate (``make precommit-fix``) as the ``thinking-check`` make target.
"""

import ast
import io
import re
import subprocess
import sys
import tokenize
from pathlib import Path

SCAN_EXTENSIONS = ('.py', '.js', '.cjs', '.mjs', '.ts', '.css')

# Third-party and pipeline-generated trees are not ours to police (AGENTS.md
# non-negotiable #4). scripts/vendor/ is first-party tooling — not excluded.
EXCLUDED_PARTS = ('assets/vendor/', 'js/vendor/', 'tests/js/vendor/', 'node_modules/', 'data/')

# Anchored-at-start patterns match the comment text after the marker is
# stripped; unanchored ones may appear anywhere in the comment.
THINKING_RE = re.compile(
    r'(?:'
    r'\bwait[,!?…—]'  # "Wait, ..." / "oh wait!"
    r'|^hmm+\b'
    r'|^huh\b'
    r'|^ah[,!?]'  # "Ah, ..."
    r'|^oh\s+(?:wait|hmm|no)\b'
    r'|^oops\b'
    r'|^nope\b'
    r'|^hold on\b'
    r'|^actually[,!?]'
    r'|^how about\b'
    r"|^let'?s (?:check|see|try|look)\b"
    r'|^let me think\b'
    r'|\bto (?:hit|reach) line \d+'  # coverage-chasing notes
    r')',
    re.IGNORECASE,
)

# A `//` or `/*` that is not part of a URL scheme (`https://`) or a path.
JS_INLINE_MARKER_RE = re.compile(r'(?<![:\w/])(//|/\*)')

# it('...', () => {}) / test("...", function () {}) with a body of only
# whitespace or comments — the JS form of the abandoned `pass`-only test.
JS_EMPTY_TEST_RE = re.compile(
    r'\b(?:it|test)\s*\(\s*'
    r"(['\"`])((?:\\.|(?!\1).)*?)\1\s*,\s*"
    r'(?:async\s+)?'
    r'(?:\(\s*\)\s*=>|function\s*\(\s*\))\s*'
    r'\{(?P<body>[^{}]*)\}',
    re.DOTALL,
)

JS_COMMENT_STRIP_RE = re.compile(r'//[^\n]*|/\*.*?\*/', re.DOTALL)


def scan_js_empty_tests(src):
    """Yield (lineno, title) for it()/test() calls whose callback body is empty.

    ``[^{}]*`` bodies mean no nested blocks — a match is whitespace/comments at
    most, so flagging on comment-stripped emptiness is exact, not heuristic.
    """
    for match in JS_EMPTY_TEST_RE.finditer(src):
        body = JS_COMMENT_STRIP_RE.sub('', match.group('body')).strip()
        if not body:
            lineno = src.count('\n', 0, match.start()) + 1
            yield lineno, match.group(2)


def thinking_in_comment(text):
    """True if a comment's text (marker already stripped) reads as thinking-out-loud."""
    return bool(THINKING_RE.search(text.strip()))


def scan_python_comments(src):
    """Yield (lineno, comment_text) for COMMENT tokens matching the pattern."""
    try:
        tokens = tokenize.generate_tokens(io.StringIO(src).readline)
        for tok in tokens:
            if tok.type == tokenize.COMMENT:
                text = tok.string.lstrip('#').strip()
                if thinking_in_comment(text):
                    yield tok.start[0], text
    except (tokenize.TokenError, SyntaxError, IndentationError):
        return  # unparseable files are the formatter's/linter's problem, not ours


def _is_docstring(stmt):
    return (
        isinstance(stmt, ast.Expr)
        and isinstance(stmt.value, ast.Constant)
        and isinstance(stmt.value.value, str)
    )


def _is_trivial_stmt(stmt):
    if isinstance(stmt, ast.Pass):
        return True
    return (
        isinstance(stmt, ast.Expr)
        and isinstance(stmt.value, ast.Constant)
        and stmt.value.value is Ellipsis
    )


def _abandoned_body(node):
    """True if a function body is only a docstring, ``pass``, or ``...``."""
    body = [s for s in node.body if not _is_docstring(s)]
    return not body or all(_is_trivial_stmt(s) for s in body)


def scan_abandoned_tests(src):
    """Yield (lineno, name) for pytest-collectable tests with an empty body.

    Only module-level ``test_*`` functions and methods of ``Test*`` classes are
    collectable by pytest; nested helpers (e.g. a ``test_func`` closure used to
    exercise a decorator) are deliberately not flagged.
    """
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return
    candidates = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith(
            'test_'
        ):
            candidates.append(node)
        elif isinstance(node, ast.ClassDef) and node.name.startswith('Test'):
            candidates.extend(
                item
                for item in node.body
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef))
                and item.name.startswith('test_')
            )
    for node in candidates:
        if _abandoned_body(node):
            yield node.lineno, node.name


def scan_js_comments(src):
    """Yield (lineno, comment_text) for JS comments matching the pattern.

    Line-based with minimal block-comment state; `//` preceded by `:` (URL
    schemes) or word chars is not treated as a comment start.
    """
    in_block = False
    for lineno, line in enumerate(src.splitlines(), 1):
        stripped = line.lstrip()
        if in_block:
            text = stripped.lstrip('*').strip()
            if thinking_in_comment(text):
                yield lineno, text
            if '*/' in stripped:
                in_block = False
            continue
        if stripped.startswith(('//', '/*')):
            text = stripped[2:].lstrip('*').strip()
            if thinking_in_comment(text):
                yield lineno, text
            if stripped.startswith('/*') and '*/' not in stripped:
                in_block = True
            continue
        match = JS_INLINE_MARKER_RE.search(line)
        if match:
            text = line[match.end() :].lstrip('*').strip()
            if thinking_in_comment(text):
                yield lineno, text
            if match.group(1) == '/*' and '*/' not in line[match.end() :]:
                in_block = True


def iter_tracked_sources():
    """Git-tracked source files in scope (tracked only, so .gitignore is honored)."""
    result = subprocess.run(
        ['git', 'ls-files', '--', *[f'*{ext}' for ext in SCAN_EXTENSIONS]],
        capture_output=True,
        text=True,
        check=True,
    )
    for path in result.stdout.split():
        if path.endswith('.min.js') or any(part in path for part in EXCLUDED_PARTS):
            continue
        yield path


def find_violations(paths):
    """Yield 'path:lineno: message' strings for every violation in the given files."""
    for path in paths:
        src = Path(path).read_text(encoding='utf-8', errors='replace')
        if path.endswith('.py'):
            for lineno, text in scan_python_comments(src):
                yield f'{path}:{lineno}: thinking-out-loud comment: # {text}'
            for lineno, name in scan_abandoned_tests(src):
                yield f'{path}:{lineno}: abandoned test body (pass/docstring only): {name}'
        else:
            for lineno, text in scan_js_comments(src):
                yield f'{path}:{lineno}: thinking-out-loud comment: // {text}'
            if not path.endswith(('.css', '.ts')):
                for lineno, title in scan_js_empty_tests(src):
                    yield f'{path}:{lineno}: abandoned test body (empty callback): {title!r}'


def main():
    violations = list(find_violations(iter_tracked_sources()))
    for violation in violations:
        print(f'❌ {violation}')
    if violations:
        print(
            f'\n{len(violations)} stream-of-consciousness violation(s) '
            '(AGENTS.md non-negotiable #9). Delete the reasoning — '
            'code comments state facts about behaviour.'
        )
        return 1
    print('✅ No stream-of-consciousness comments or abandoned test bodies')
    return 0


if __name__ == '__main__':
    sys.exit(main())
