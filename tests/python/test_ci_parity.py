#!/usr/bin/env python3
"""
Verify that GitHub Actions CI workflow calls 'make precommit-fix'.

This ensures CI parity with local development - any checks added to
'make precommit-fix' will automatically run in CI.
"""

from pathlib import Path

import pytest

CI_WORKFLOW = Path(".github/workflows/ci.yml")
MAKEFILE = Path("Makefile")


def get_ci_workflow_content() -> str:
    """Read CI workflow file."""
    if not CI_WORKFLOW.exists():
        pytest.skip(f"CI workflow not found: {CI_WORKFLOW}")
    return CI_WORKFLOW.read_text()


def get_makefile_content() -> str:
    """Read Makefile."""
    if not MAKEFILE.exists():
        pytest.skip(f"Makefile not found: {MAKEFILE}")
    return MAKEFILE.read_text()


class TestCIParity:
    """Test suite for CI parity verification."""

    def test_makefile_has_precommit_fix_target(self):
        """Verify Makefile has 'precommit-fix' target."""
        content = get_makefile_content()
        assert "precommit-fix:" in content, "Makefile missing 'precommit-fix' target"

    def test_ci_calls_makefile_target(self):
        """Verify CI workflow calls 'make precommit-fix' directly."""
        content = get_ci_workflow_content()
        assert (
            "make precommit-fix" in content
        ), "CI workflow should call 'make precommit-fix' to ensure parity"

    def test_ci_no_duplicate_ruff(self):
        """Verify CI doesn't duplicate ruff check."""
        content = get_ci_workflow_content()
        assert (
            "ruff check" not in content
        ), "CI should not call 'ruff check' directly - use Makefile"

    def test_ci_no_duplicate_pytest(self):
        """Verify CI doesn't duplicate pytest."""
        content = get_ci_workflow_content()
        # Allow 'python -m pytest' only if it's within a make command
        lines = content.split("\n")
        for line in lines:
            if "pytest" in line and "make" not in line:
                pytest.fail(
                    f"CI should not call 'pytest' directly - use Makefile. Found: {line.strip()}"
                )

    def test_ci_no_duplicate_eslint(self):
        """Verify CI doesn't duplicate eslint."""
        content = get_ci_workflow_content()
        assert "eslint" not in content, "CI should not call 'eslint' directly - use Makefile"

    def test_ci_no_duplicate_stylelint(self):
        """Verify CI doesn't duplicate stylelint."""
        content = get_ci_workflow_content()
        assert "stylelint" not in content, "CI should not call 'stylelint' directly - use Makefile"

    def test_ci_no_duplicate_prettier(self):
        """Verify CI doesn't duplicate prettier."""
        content = get_ci_workflow_content()
        assert "prettier" not in content, "CI should not call 'prettier' directly - use Makefile"

    def test_ci_no_duplicate_black(self):
        """Verify CI doesn't duplicate black."""
        content = get_ci_workflow_content()
        assert "black" not in content, "CI should not call 'black' directly - use Makefile"

    def test_ci_no_duplicate_mypy(self):
        """Verify CI doesn't duplicate mypy."""
        content = get_ci_workflow_content()
        # mypy is allowed via pre-commit hooks
        if "mypy" in content:
            # Check it's only in pre-commit context, not as direct run
            assert "run: mypy" not in content, "CI should not call 'mypy' directly - use Makefile"

    def test_ci_no_duplicate_bandit(self):
        """Verify CI doesn't duplicate bandit."""
        content = get_ci_workflow_content()
        assert "bandit" not in content, "CI should not call 'bandit' directly - use Makefile"

    def test_wrangler_in_package_json(self):
        """Verify wrangler is in package.json for deploy-worker target."""
        pkg_json = Path("package.json")
        if not pkg_json.exists():
            pytest.skip("package.json not found")

        import json

        data = json.loads(pkg_json.read_text())
        dev_deps = data.get("devDependencies", {})

        assert (
            "wrangler" in dev_deps
        ), "wrangler should be in devDependencies for deploy-worker target"

    def test_makefile_uses_npx_yes_for_wrangler(self):
        """Verify Makefile uses npx --yes for wrangler."""
        content = get_makefile_content()
        # Check that deploy-worker uses npx --yes wrangler or wrangler is in package.json
        if "wrangler deploy" in content:
            assert (
                "npx --yes wrangler deploy" in content
            ), "Makefile should use 'npx --yes wrangler deploy' for CI compatibility"
