"""Guard the weekly mutation-testing workflow and mutmut sandbox config."""

import tomllib
from pathlib import Path

WORKFLOW = Path(".github/workflows/mutation-testing.yml")
PYPROJECT = Path("pyproject.toml")


def test_mutation_workflow_pins_supported_python_runtime() -> None:
    """A floating 3.x runtime can select Python 3.15 whose native stack segfaults."""
    workflow = WORKFLOW.read_text(encoding="utf-8")
    assert "python-version: '3.12'" in workflow
    assert "python-version: '3.x'" not in workflow


def test_mutmut_pytest_args_exclude_sandbox_incompatible_tests() -> None:
    """mutmut runs pytest inside mutants/ without .git or full repo root files."""
    config = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))
    args = config["tool"]["mutmut"]["pytest_add_cli_args"]
    required_filters = (
        "--ignore=tests/python/test_csp_consistency.py",
        "--ignore=tests/python/test_doc_tool_references.py",
        "--ignore=tests/python/test_skills.py",
        "--deselect=tests/python/test_check_thinking_comments.py::test_iter_tracked_sources_excludes_vendor_and_minified",
        "--deselect=tests/python/test_generate_composition_data.py::test_deploy_figures_clean_generation",
    )
    for item in required_filters:
        assert item in args, f"[tool.mutmut].pytest_add_cli_args missing {item}"
