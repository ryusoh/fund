"""Task harness state ledger: externalize execution state to avoid attention drift.

Provides a deterministic state machine for multi-step agent workflows.
Work orders are parsed from an action-items/findings markdown document and
tracked in a disk-backed JSON state file.

Usage::

    python3 -m scripts.agents.task_harness init docs/research/task.md
    python3 -m scripts.agents.task_harness current
    python3 -m scripts.agents.task_harness record-commit 1 <commit_sha>
    python3 -m scripts.agents.task_harness status
    python3 -m scripts.agents.task_harness verify-all
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass
class GateItem:
    id: str
    number: int
    title: str
    tag: str
    file: str
    status: str  # PENDING, IN_PROGRESS, DONE, SKIPPED, FAILED
    commit: str | None = None
    verification: str | None = None
    notes: str | None = None


@dataclass
class TaskState:
    task_id: str
    source_doc: str
    total_gates: int
    current_gate_index: int
    gates: list[GateItem]
    mounts: dict[str, list[str]] | None = None


def extract_mounts(gates: list[GateItem]) -> dict[str, list[str]]:
    """Group unique gate target files by top-level category."""
    mount_map: dict[str, set[str]] = {}
    for gate in gates:
        if not gate.file:
            continue
        # Support comma-separated files
        for raw_path in gate.file.split(","):
            p = raw_path.strip()
            if not p:
                continue
            parts = Path(p).parts
            category = parts[0] if parts else "root"
            mount_map.setdefault(category, set()).add(p)
    return {k: sorted(v) for k, v in sorted(mount_map.items())}


def parse_work_orders(markdown_content: str, source_doc: str = "") -> TaskState:
    """Parse work orders from markdown content."""
    # Matches: ### Work Order 1: Title or ### Item 1: Title
    pattern = re.compile(
        r"###\s+(?:Work Order|Item)\s+(\d+):\s+([^\n]+)(.*?)(?=(?:###\s+(?:Work Order|Item)\s+\d+:|$))",
        re.DOTALL | re.IGNORECASE,
    )

    gates: list[GateItem] = []
    for match in pattern.finditer(markdown_content):
        num = int(match.group(1))
        title = match.group(2).strip()
        body = match.group(3).strip()

        # Extract tags: [low], [trivial], [skip], [visual], [docs]
        tag_match = re.search(r"\[(trivial|low|visual|skip|docs)\]", body, re.IGNORECASE)
        tag = tag_match.group(1).lower() if tag_match else "standard"

        # Extract file: - **File**: `path`, - **Files**: path1, path2, or in `path`
        file_match = re.search(
            r"-\s+\*\*(?:Files?|Targets?)\*\*:\s*`?([^\n`]+)`?", body, re.IGNORECASE
        )
        if not file_match:
            file_match = re.search(
                r"-\s+\*\*Find(?:\s+Anchor)?:\*\*.*?in\s+`?([^\n`]+)`?", body, re.IGNORECASE
            )
        target_file = file_match.group(1).strip() if file_match else ""

        # Extract verify command
        verify_match = re.search(r"-\s+\*\*Verify\*\*:\s*`?([^\n`]+)`?", body, re.IGNORECASE)
        verify_cmd = verify_match.group(1).strip() if verify_match else None

        initial_status = "SKIPPED" if tag == "skip" else "PENDING"

        gates.append(
            GateItem(
                id=f"gate-{num}",
                number=num,
                title=title,
                tag=tag,
                file=target_file,
                status=initial_status,
                verification=verify_cmd,
            )
        )

    task_name = Path(source_doc).stem if source_doc else "task-workflow"
    mounts = extract_mounts(gates)
    return TaskState(
        task_id=task_name,
        source_doc=source_doc,
        total_gates=len(gates),
        current_gate_index=0,
        gates=gates,
        mounts=mounts,
    )


def get_default_state_path(repo_root: Path, task_id: str = "state") -> Path:
    """Return default path for state file under .agents/state/."""
    state_dir = repo_root / ".agents" / "state"
    state_dir.mkdir(parents=True, exist_ok=True)
    return state_dir / f"{task_id}.json"


def save_state(state: TaskState, state_file: Path) -> None:
    """Save task state to JSON file."""
    state_file.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "task_id": state.task_id,
        "source_doc": state.source_doc,
        "total_gates": state.total_gates,
        "current_gate_index": state.current_gate_index,
        "mounts": state.mounts or {},
        "gates": [asdict(g) for g in state.gates],
    }
    state_file.write_text(json.dumps(data, indent=2), encoding="utf-8")


def load_state(state_file: Path) -> TaskState:
    """Load task state from JSON file."""
    if not state_file.is_file():
        raise FileNotFoundError(f"State file not found: {state_file}")
    data = json.loads(state_file.read_text(encoding="utf-8"))
    gates = [GateItem(**g) for g in data.get("gates", [])]
    return TaskState(
        task_id=data.get("task_id", "task"),
        source_doc=data.get("source_doc", ""),
        total_gates=data.get("total_gates", len(gates)),
        current_gate_index=data.get("current_gate_index", 0),
        gates=gates,
        mounts=data.get("mounts", {}),
    )


def validate_commit(repo_root: Path, commit_sha: str) -> bool:
    """Verify that commit_sha exists in git history."""
    try:
        res = subprocess.run(
            ["git", "cat-file", "-e", f"{commit_sha}^{{commit}}"],
            cwd=repo_root,
            capture_output=True,
            check=False,
        )
        return res.returncode == 0
    except OSError:
        return False


def render_worker_prompt(state: TaskState, gate_query: str) -> str:
    """Render a hermetic, zero-tacit-context prompt for an ephemeral worker agent."""
    query = str(gate_query).strip().lower()
    target = None
    for g in state.gates:
        if str(g.number) == query or g.id.lower() == query:
            target = g
            break
    if not target:
        raise ValueError(f"Gate '{gate_query}' not found in task '{state.task_id}'.")

    target_file_str = target.file if target.file else "(see work order)"
    verify_str = target.verification if target.verification else "make verify"

    return f"""# Work Order Execution Task: Gate {target.number}

You are an ephemeral, stateless worker agent executing a single discrete work order.
Do not assume any conversational history from previous steps. All state is externalized.

## Work Order Specification
- **Task ID**: {state.task_id}
- **Source Document**: {state.source_doc}
- **Gate ID**: {target.id} (Gate {target.number})
- **Title**: {target.title}
- **Target File**: `{target_file_str}`
- **Tag**: `[{target.tag}]`
- **Verify Command**: `{verify_str}`

## Execution Instructions
1. **Locate & Read**: Inspect the target file `{target_file_str}`.
2. **Atomic Modification**: Make only the minimal changes required for this work order. Never perform drive-by edits.
3. **Verify**: Execute the verification command `{verify_str}` and ensure all checks pass.
4. **Report**: Return a concise summary of modified files and verification results.
"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Task harness state ledger for autonomous agent gate management."
    )
    parser.add_argument("--repo", type=Path, default=Path.cwd(), help="Path to repository root")
    parser.add_argument("--state-file", type=Path, default=None, help="Custom path to state file")

    sub = parser.add_subparsers(dest="command", required=True)

    # init <doc>
    init_parser = sub.add_parser("init", help="Initialize state from markdown document.")
    init_parser.add_argument("doc", type=Path, help="Path to markdown document")

    # status
    sub.add_parser("status", help="Print overall task status.")

    # current
    sub.add_parser("current", help="Print current active gate as JSON.")

    # render-worker-prompt <gate>
    prompt_parser = sub.add_parser(
        "render-worker-prompt",
        help="Render a stateless, zero-tacit-context prompt for a specific gate.",
    )
    prompt_parser.add_argument("gate", help="Gate number or ID (e.g. 1 or gate-1)")

    # record-commit <gate_num> <commit_sha>
    record_parser = sub.add_parser("record-commit", help="Record commit for gate.")
    record_parser.add_argument("gate", help="Gate number or ID (e.g. 1 or gate-1)")
    record_parser.add_argument("commit", help="Commit SHA hash")

    # skip <gate_num>
    skip_parser = sub.add_parser("skip", help="Mark a gate as skipped.")
    skip_parser.add_argument("gate", help="Gate number or ID")
    skip_parser.add_argument("--reason", default="", help="Reason for skipping")

    # verify-all
    sub.add_parser("verify-all", help="Verify all gates are done or skipped.")

    args = parser.parse_args(argv)
    repo = args.repo

    if args.command == "init":
        doc_path = args.doc if args.doc.is_absolute() else repo / args.doc
        if not doc_path.is_file():
            print(f"Error: Doc not found: {doc_path}", file=sys.stderr)
            return 1
        content = doc_path.read_text(encoding="utf-8")
        state = parse_work_orders(
            content, str(doc_path.relative_to(repo) if doc_path.is_relative_to(repo) else doc_path)
        )
        state_file = args.state_file or get_default_state_path(repo, state.task_id)
        save_state(state, state_file)
        print(f"Initialized {state.total_gates} gates from {doc_path.name} -> {state_file}")
        return 0

    state_file = args.state_file or get_default_state_path(repo, "task-workflow")
    # If default doesn't exist, pick the newest json file in .agents/state/
    if not state_file.is_file() and not args.state_file:
        state_dir = repo / ".agents" / "state"
        if state_dir.is_dir():
            files = sorted(state_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
            if files:
                state_file = files[0]

    if not state_file.is_file():
        print("Error: No active state file found. Run 'init' first.", file=sys.stderr)
        return 1

    state = load_state(state_file)

    if args.command == "status":
        done = sum(1 for g in state.gates if g.status == "DONE")
        skipped = sum(1 for g in state.gates if g.status == "SKIPPED")
        pending = sum(1 for g in state.gates if g.status in ("PENDING", "IN_PROGRESS"))
        print(f"Task: {state.task_id} ({state.source_doc})")
        print(f"Progress: {done}/{state.total_gates} done, {skipped} skipped, {pending} pending")
        for g in state.gates:
            commit_str = f" [{g.commit[:8]}]" if g.commit else ""
            print(f"  [{g.status:10}] Gate {g.number}: {g.title} ({g.tag}){commit_str}")
        return 0

    if args.command == "current":
        pending_gates = [g for g in state.gates if g.status in ("PENDING", "IN_PROGRESS")]
        if not pending_gates:
            print(json.dumps({"status": "ALL_GATES_COMPLETED"}))
            return 0
        current_gate = pending_gates[0]
        print(json.dumps(asdict(current_gate), indent=2))
        return 0

    if args.command == "render-worker-prompt":
        try:
            prompt = render_worker_prompt(state, args.gate)
            print(prompt)
            return 0
        except ValueError as e:
            print(f"Error: {e}", file=sys.stderr)
            return 1

    if args.command == "record-commit":
        gate_query = str(args.gate).strip().lower()
        target = None
        for g in state.gates:
            if str(g.number) == gate_query or g.id.lower() == gate_query:
                target = g
                break
        if not target:
            print(f"Error: Gate '{args.gate}' not found.", file=sys.stderr)
            return 1
        if not validate_commit(repo, args.commit):
            print(
                f"Warning: Commit '{args.commit}' not verified in git, recording anyway.",
                file=sys.stderr,
            )
        target.status = "DONE"
        target.commit = args.commit
        save_state(state, state_file)
        print(f"Recorded Gate {target.number} as DONE with commit {args.commit}")
        return 0

    if args.command == "skip":
        gate_query = str(args.gate).strip().lower()
        target = None
        for g in state.gates:
            if str(g.number) == gate_query or g.id.lower() == gate_query:
                target = g
                break
        if not target:
            print(f"Error: Gate '{args.gate}' not found.", file=sys.stderr)
            return 1
        target.status = "SKIPPED"
        if args.reason:
            target.notes = args.reason
        save_state(state, state_file)
        print(f"Marked Gate {target.number} as SKIPPED")
        return 0

    if args.command == "verify-all":
        unresolved = [g for g in state.gates if g.status in ("PENDING", "IN_PROGRESS", "FAILED")]
        if unresolved:
            print(f"Error: {len(unresolved)} gates unresolved:", file=sys.stderr)
            for g in unresolved:
                print(f"  - Gate {g.number}: {g.title} [{g.status}]", file=sys.stderr)
            return 1
        print(f"All {state.total_gates} gates verified (done or skipped).")
        return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
