#!/usr/bin/env python3
"""
CI parity check wrapper - runs pytest on test_ci_parity.py.

This ensures CI parity with local development - any checks added to
'make precommit-fix' will automatically run in CI.

Usage:
    python scripts/ci_parity_check.py  # Direct run
    pytest tests/python/test_ci_parity.py  # Via pytest
"""

import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
TEST_FILE = PROJECT_ROOT / "tests" / "python" / "test_ci_parity.py"


def main() -> int:
    """Run parity checks via pytest and return exit code."""
    print("=" * 60)
    print("CI Parity Check")
    print("=" * 60)
    print()

    if not TEST_FILE.exists():
        print(f"❌ Test file not found: {TEST_FILE}")
        return 1

    # Run pytest on the parity test
    result = subprocess.run(
        [sys.executable, "-m", "pytest", str(TEST_FILE), "-v"],
        cwd=PROJECT_ROOT,
    )

    print()
    if result.returncode == 0:
        print("=" * 60)
        print("✅ CI parity verified - Makefile is single source of truth")
        print("=" * 60)
    else:
        print("=" * 60)
        print("❌ CI parity gap detected!")
        print("=" * 60)
        print("\nRecommendation:")
        print("1. Add new checks to 'make precommit-fix' in Makefile")
        print("2. Update CI workflow to call 'make precommit-fix'")
        print("3. Avoid duplicating tool calls in CI workflow")

    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
