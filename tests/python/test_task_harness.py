"""Tests for scripts.agents.task_harness state ledger."""

from __future__ import annotations

import json
from pathlib import Path

from scripts.agents.task_harness import (
    GateItem,
    TaskState,
    load_state,
    main,
    parse_work_orders,
    save_state,
)

SAMPLE_MARKDOWN = """
# Action Items

### Work Order 1: First item
- **File**: `src/first.py`
- **Tag**: `[trivial]`
- **Find**: `old_func()`
- **Change**: Replace with `new_func()`
- **Verify**: `pytest tests/test_first.py`

### Work Order 2: Second item to skip
- **Files**: `src/second.py`, `src/helper.py`
- **Tag**: `[skip]`
- **Find**: `complex_logic()`
- **Change**: Hand off to human
- **Verify**: `make verify`

### Work Order 3: Third item
- **File**: `src/third.py`
- **Tag**: `[low]`
- **Find**: `target_line`
- **Change**: Update target line
- **Verify**: `pytest tests/test_third.py`
"""


def test_parse_work_orders() -> None:
    state = parse_work_orders(SAMPLE_MARKDOWN, source_doc="docs/task.md")
    assert state.total_gates == 3
    assert state.task_id == "task"
    assert state.gates[0].number == 1
    assert state.gates[0].title == "First item"
    assert state.gates[0].tag == "trivial"
    assert state.gates[0].file == "src/first.py"
    assert state.gates[0].status == "PENDING"
    assert state.gates[0].verification == "pytest tests/test_first.py"

    assert state.gates[1].number == 2
    assert state.gates[1].tag == "skip"
    assert state.gates[1].status == "SKIPPED"
    assert state.mounts is not None
    assert "src" in state.mounts
    assert "src/first.py" in state.mounts["src"]


def test_save_and_load_state(tmp_path: Path) -> None:
    state_file = tmp_path / "state.json"
    state = TaskState(
        task_id="test-task",
        source_doc="test.md",
        total_gates=1,
        current_gate_index=0,
        gates=[
            GateItem(
                id="gate-1",
                number=1,
                title="Title",
                tag="low",
                file="test.py",
                status="PENDING",
            )
        ],
        mounts={"root": ["test.py"]},
    )
    save_state(state, state_file)
    assert state_file.is_file()

    loaded = load_state(state_file)
    assert loaded.task_id == "test-task"
    assert len(loaded.gates) == 1
    assert loaded.gates[0].title == "Title"
    assert loaded.mounts == {"root": ["test.py"]}


def test_cli_lifecycle(tmp_path: Path, capsys) -> None:
    doc_path = tmp_path / "orders.md"
    doc_path.write_text(SAMPLE_MARKDOWN, encoding="utf-8")
    state_file = tmp_path / "state.json"

    # 1. init
    ret = main(["--repo", str(tmp_path), "--state-file", str(state_file), "init", str(doc_path)])
    assert ret == 0
    capsys.readouterr()  # clear buffer

    # 2. current
    ret = main(["--repo", str(tmp_path), "--state-file", str(state_file), "current"])
    assert ret == 0
    captured = capsys.readouterr()
    current_json = json.loads(captured.out)
    assert current_json["number"] == 1
    assert current_json["status"] == "PENDING"

    # 3. record-commit for gate 1
    ret = main(
        ["--repo", str(tmp_path), "--state-file", str(state_file), "record-commit", "1", "abc1234"]
    )
    assert ret == 0
    capsys.readouterr()

    # 4. current should now be gate 3 (since gate 2 is SKIPPED)
    ret = main(["--repo", str(tmp_path), "--state-file", str(state_file), "current"])
    assert ret == 0
    captured = capsys.readouterr()
    current_json = json.loads(captured.out)
    assert current_json["number"] == 3

    # 5. verify-all should fail before gate 3 is done
    ret = main(["--repo", str(tmp_path), "--state-file", str(state_file), "verify-all"])
    assert ret == 1
    capsys.readouterr()

    # 6. record-commit for gate 3
    ret = main(
        ["--repo", str(tmp_path), "--state-file", str(state_file), "record-commit", "3", "def5678"]
    )
    assert ret == 0
    capsys.readouterr()

    # 7. verify-all should now pass
    ret = main(["--repo", str(tmp_path), "--state-file", str(state_file), "verify-all"])
    assert ret == 0
    capsys.readouterr()

    # 8. status check
    ret = main(["--repo", str(tmp_path), "--state-file", str(state_file), "status"])
    assert ret == 0
    status_out = capsys.readouterr().out
    assert "2/3 done, 1 skipped, 0 pending" in status_out


def test_render_worker_prompt(tmp_path: Path, capsys) -> None:
    doc_path = tmp_path / "orders.md"
    doc_path.write_text(SAMPLE_MARKDOWN, encoding="utf-8")
    state_file = tmp_path / "state.json"

    main(["--repo", str(tmp_path), "--state-file", str(state_file), "init", str(doc_path)])
    capsys.readouterr()

    ret = main(
        ["--repo", str(tmp_path), "--state-file", str(state_file), "render-worker-prompt", "1"]
    )
    assert ret == 0
    prompt = capsys.readouterr().out
    assert "Work Order Execution Task: Gate 1" in prompt
    assert "src/first.py" in prompt
    assert "pytest tests/test_first.py" in prompt

