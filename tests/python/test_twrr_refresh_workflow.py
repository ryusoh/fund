#!/usr/bin/env python3
"""
Verify that twrr-refresh.yaml commits every data artifact its steps generate.

2026-09-08 incident: `update_fund_data.py` wrote `data/prev_close.json` (then
the day-change baseline for /position/), but the workflow's `git add` list
omitted it. The file stayed frozen at its first commit for days, so the
position page silently diffed live prices against a stale previous close with
no error. The sidecar was removed on 2026-09-09 — the baseline is now
`data/fund_data.json` itself — but the commit-list guard remains.
"""

from pathlib import Path

import pytest

WORKFLOW = Path(".github/workflows/twrr-refresh.yaml")


def get_workflow_content() -> str:
    """Read the twrr-refresh workflow file."""
    if not WORKFLOW.exists():
        pytest.skip(f"Workflow not found: {WORKFLOW}")
    return WORKFLOW.read_text()


class TestTwrrRefreshWorkflow:
    """Test suite for the twrr-refresh workflow's commit step."""

    def test_workflow_runs_update_fund_data(self):
        """The fund_data.json writer must actually run in the workflow."""
        content = get_workflow_content()
        assert (
            "scripts/data/update_fund_data.py" in content
        ), "twrr-refresh.yaml should run scripts/data/update_fund_data.py"

    def test_fund_data_is_committed(self):
        """data/fund_data.json must be in the auto-commit's git add list.

        It is the /position/ day-change baseline, so a missing entry would
        freeze the intraday PnL baseline silently.
        """
        content = get_workflow_content()
        assert (
            "data/fund_data.json" in content
        ), "twrr-refresh.yaml should commit data/fund_data.json"
