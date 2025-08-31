from __future__ import annotations

import os
import shutil
import stat
import sys
from pathlib import Path


def _print(title: str, value: str) -> None:
    print(f"- {title}: {value}")


def _ok(msg: str) -> None:
    print(f"OK: {msg}")


def _warn(msg: str) -> None:
    print(f"WARN: {msg}")


def _info(msg: str) -> None:
    print(f"INFO: {msg}")


def _check_executable(path: Path, name: str) -> None:
    if not path.exists():
        _warn(f"{name} not found at {path}")
        return
    mode = path.stat().st_mode
    if not (mode & stat.S_IXUSR):
        _warn(f"{name} exists but is not executable: chmod +x {path}")
    else:
        _ok(f"{name} is executable")


def _detect_rc() -> Path:
    shell = os.path.basename(os.environ.get("SHELL", "zsh"))
    if shell == "bash":
        return Path.home() / ".bashrc"
    # default to zsh
    zdot = os.environ.get("ZDOTDIR")
    return Path(zdot) / ".zshrc" if zdot else Path.home() / ".zshrc"


def _has_marker_block(rc_path: Path) -> bool:
    if not rc_path.exists():
        return False
    try:
        text = rc_path.read_text(encoding="utf-8", errors="ignore")
        return "# >>> fund aliases >>>" in text and "# <<< fund aliases <<<" in text
    except Exception:
        return False


def _has_completion_line(rc_path: Path) -> bool:
    if not rc_path.exists():
        return False
    try:
        text = rc_path.read_text(encoding="utf-8", errors="ignore")
        if "register-python-argcomplete fund" in text:
            return True
        # Also accept zsh fallback registration
        return "compdef _fund_complete fund" in text
    except Exception:
        return False


def add_parser(subparsers):
    parser = subparsers.add_parser("doctor", help="Diagnose CLI setup and completions")
    parser.set_defaults(func=_run)


def _run(args) -> None:
    base = Path(__file__).resolve().parents[2]
    _print("Python", sys.version.split()[0])
    _print("Executable", sys.executable)

    # argcomplete status
    try:
        import argcomplete  # type: ignore
        ver = "unknown"
        try:
            import importlib.metadata as m  # type: ignore

            ver = m.version("argcomplete")
        except Exception:
            pass
        _ok(f"argcomplete importable (version {ver})")
    except Exception as e:
        _warn(f"argcomplete not importable: {e}. Install with: pip install argcomplete")

    cmd = shutil.which("register-python-argcomplete")
    if cmd:
        _ok(f"register-python-argcomplete found at {cmd}")
    else:
        _warn("register-python-argcomplete not on PATH; try: python -m pip install argcomplete")

    # bin permissions
    _check_executable(base / "bin" / "fund", "bin/fund")
    _check_executable(base / "bin" / "portfolio", "bin/portfolio")
    _check_executable(base / "bin" / "holdings", "bin/holdings")
    _check_executable(base / "bin" / "update-all", "bin/update-all")

    # import scripts.cli
    try:
        sys.path.insert(0, str(base))
        import scripts.cli  # noqa: F401

        _ok("scripts.cli import successful")
    except Exception as e:
        _warn(f"failed to import scripts.cli: {e}")

    # rc checks
    rc = _detect_rc()
    _print("Shell rc", str(rc))
    if _has_marker_block(rc):
        _ok("Found Fund alias block in rc")
    else:
        _warn("Fund alias block not found; run: ./scripts/setup-aliases.sh --install")

    if _has_completion_line(rc):
        _ok("Found register-python-argcomplete fund in rc")
    else:
        _warn("Completion not registered; ensure rc contains: eval \"$(register-python-argcomplete fund)\"")

    # final guidance
    _info("Reload your shell after changes: source \"$(echo $SHELL | sed 's:.*/::; s/zsh/.zshrc/; s/bash/.bashrc/')\"")
    _info("To enable completion for the current shell only:")
    _info("  eval \"$(register-python-argcomplete fund 2>/dev/null || python -m argcomplete.register-python-argcomplete fund)\"")
