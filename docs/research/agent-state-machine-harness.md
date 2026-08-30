# Research: Eliminating Attention Degradation in Agent Harnesses via Externalized State & Gated Dispatch

**Status:** Proposed  
**Date:** 2026-08-30  
**Authors:** Antigravity (Pair Programming Agent)  
**Primary References:**

- Autoregressive Attention Dynamics: Context Dilution & "Lost in the Middle" attention degradation in long-context Transformers.
- Gated Engineering State Machines: Deterministic discrete state transition models for autonomous workflows.
- This Repository's Architecture: [AGENTS.md](file:///Users/lz/dev/fund/AGENTS.md), [docs/ai_native_repo_structure.md](file:///Users/lz/dev/fund/docs/ai_native_repo_structure.md), [docs/agentic-quality-gates.md](file:///Users/lz/dev/fund/docs/agentic-quality-gates.md), [.agents/skills/](file:///Users/lz/dev/fund/.agents/skills/).

---

## 1. Problem Definition & Mathematical Modeling

When executing complex, multi-step skills (e.g. implementing 10+ action items, deep bug diagnosis, or multi-module refactoring), LLM-based autonomous coding agents exhibit systematic reliability degradation in the second half of execution. This is characterized by:

- **Attention Dilution ("Lost in the Middle")**: As context accumulates conversation history, tool outputs, and diff traces, tokens at the center of the context window receive lower self-attention weight compared to initial system prompts and trailing tokens. Being present "in context" is structurally distinct from being in active "working memory".
- **Absence of a Hardware Program Counter (PC)**: Unlike a CPU executing discrete instruction pointers, an autoregressive LLM perceives skill workflows as natural language descriptions that must be re-parsed and re-interpreted on every forward pass.
- **Multiplicative Failure Dynamics**: In an autoregressive agentic loop of $N$ interdependent steps, even if single-step execution accuracy is high ($p = 0.99$), overall task success decays exponentially:
  $$P_{\text{success}}(N) = \prod_{i=1}^N p_i = p^N$$
    - For $N = 5$: $0.99^5 \approx 95.1\%$
    - For $N = 15$: $0.99^{15} \approx 86.0\%$
    - For $N = 30$: $0.99^{30} \approx 73.9\%$ (and if $p = 0.95$, $0.95^{30} \approx 21.4\%$)

---

## 2. Architectural Analysis: Monolithic Context Loop vs. Externalized Gated State Machine

| Dimension            | Monolithic Context Loop (Traditional)                                    | Externalized Gated State Machine (Target)                                             | Synthesis for this Repository                                                                                              |
| :------------------- | :----------------------------------------------------------------------- | :------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------- |
| **State Storage**    | Ephemeral context tokens + inline conversational memory.                 | Durable artifacts on disk for every gate decision, review finding, and checkpoint.    | Standardized JSON/Markdown State Ledger (`.agents/state/<task>.json` or doc-anchored state).                               |
| **Context Scope**    | Single agent session loop executing across all work orders sequentially. | Controller-Worker separation (Orchestrator $\to$ gate-scoped subagents).              | Orchestrator-Worker subagent model: 1 Gate = 1 isolated subagent context ($N$ small contexts rather than 1 giant context). |
| **State Recovery**   | Implicit reliance on agent memory across conversational turns.           | Explicit `## Resume` protocol & transaction boundary state reloads from ground truth. | Universal `## Resume` section across all complex skills + mandatory state re-anchor before tool dispatch.                  |
| **Gate Enforcement** | Soft prompt constraints in markdown instructions.                        | Deterministic Gate State Machine with strictly non-halting progression.               | `scripts/agents/task_harness.py` state machine CLI enforcing valid gate transitions.                                       |

---

## 3. Core Architectural Recommendations for this Repository

### Recommendation A: Externalized State Ledger (Disk-Backed Working Memory)

Never permit the agent to maintain execution state solely in conversation tokens.

1. **Task Ledger Schema**:
   Store task progress on disk (`.agents/state/<task-id>.json` or within the governing markdown artifact):

    ```json
    {
        "task_id": "refactor-mobile-terminal",
        "source_doc": "docs/research/mobile-terminal-ux.md",
        "total_gates": 8,
        "current_gate_index": 3,
        "gates": [
            {
                "id": "gate-1",
                "file": "js/terminal/core.js",
                "status": "DONE",
                "commit": "a1b2c3d",
                "verification": "green"
            },
            {
                "id": "gate-2",
                "file": "css/terminal/layout.css",
                "status": "DONE",
                "commit": "e4f5g6h",
                "verification": "green"
            },
            {
                "id": "gate-3",
                "file": "js/terminal/touch.js",
                "status": "IN_PROGRESS",
                "commit": null,
                "verification": null
            }
        ]
    }
    ```

2. **Transaction Boundary Invariant**:
   A transaction boundary is defined after:
    - Tool execution resulting in `git commit`.
    - Gate verification command execution.
    - User interruption or handoff.
      At every transaction boundary, the agent MUST write the updated status to disk before proceeding.

### Recommendation B: Gated Context Partitioning (Orchestrator-Worker Subagent Dispatch)

Instead of running one agent across a 30-step task, decompose the workflow into $N$ micro-contexts:

```text
[Orchestrator Agent] (Holds high-level Gate List & State Ledger)
       │
       ├── Spawn Subagent 1 ──> [Context: Only Gate 1 Prompt + File + Verify Command]
       │                         └── Returns: {status: DONE, commit: "a1b2c3d"}
       │
       ├── Read Artifact & Advance State Ledger (Transaction Boundary)
       │
       ├── Spawn Subagent 2 ──> [Context: Clean Context, Only Gate 2 Prompt]
       │                         └── Returns: {status: DONE, commit: "e4f5g6h"}
       │
       └── Aggregate Verification (make verify)
```

**Benefits**:

- Resets token accumulation to zero for each work order.
- Prevents cognitive pollution from previous failed attempts or noisy tool outputs.
- Keeps single-step reliability $p_i$ consistently near peak ($>99\%$) rather than decaying.

### Recommendation C: Universal `## Resume` Protocol Across Skills

Embed a standardized `## Resume` protocol in:

- [.agents/skills/implement-action-items/SKILL.md](file:///Users/lz/dev/fund/.agents/skills/implement-action-items/SKILL.md)
- [.agents/skills/diagnosing-bugs/SKILL.md](file:///Users/lz/dev/fund/.agents/skills/diagnosing-bugs/SKILL.md)
- [.agents/skills/tdd/SKILL.md](file:///Users/lz/dev/fund/.agents/skills/tdd/SKILL.md)
- [.agents/skills/retro/SKILL.md](file:///Users/lz/dev/fund/.agents/skills/retro/SKILL.md)

**Standard Protocol Text**:

```markdown
## Resume Protocol

When resumed, invoked on an in-progress task, or recovering from context compaction:

1. **Never trust conversation memory** for progress tracking.
2. **Inspect authoritative ground truth**:
    - Run `git status --short` and `git log -n 5 --oneline`.
    - Read the external task state artifact / findings doc.
3. **Locate the Program Counter**:
    - Identify the first gate marked `PENDING` or `IN_PROGRESS` where the corresponding commit/verification is missing.
4. **Re-anchor working memory**: State the current Gate ID, target file, and entry verification command explicitly in the first tool call.
```

### Recommendation D: Machine-Checked Gate State Guard (`scripts/agents/task_harness.py`)

Augment [scripts/agents/gate_guard.py](file:///Users/lz/dev/fund/scripts/agents/gate_guard.py) with a lightweight CLI tool to enforce gate integrity deterministically:

- `python3 -m scripts.agents.task_harness init <doc>`: Parses work orders from markdown into a tracked state file.
- `python3 -m scripts.agents.task_harness current`: Returns the exact JSON payload for the current pending gate.
- `python3 -m scripts.agents.task_harness record-commit <gate_id> <commit_sha>`: Validates that the commit exists in git history and updates state.
- `python3 -m scripts.agents.task_harness verify-all`: Verifies that all non-skipped gates are green and recorded.

---

## 4. Evidentiary Citations & Primary Sources

1. **State Boundary Principle**:
    - Discrete gate verification requires durable artifacts and authoritative evidence on disk; conversation-only results cannot serve as valid state transitions.
2. **Controller-Worker Isolation**:
    - Orchestration logic must remain strictly decoupled from code-generation tasks. The orchestrator adjudicates gates and tracks residual risks, while scoped workers execute single-concern diffs.
3. **Context Economy in Agentic Repositories ([docs/ai_native_repo_structure.md:L35-41](file:///Users/lz/dev/fund/docs/ai_native_repo_structure.md#L35-L41))**:
    - Highlights _Context Economy_ ("attention dilutes as it fills"), _Imprecise Edits_, and _Loss of State Across Turns_.
4. **Deterministic Quality Gates ([scripts/agents/gate_guard.py](file:///Users/lz/dev/fund/scripts/agents/gate_guard.py))**:
    - Enforces deterministic hashing to block redundant CI gate runs on unmodified worktrees.

---

## 5. Open Questions & What Couldn't Be Verified

1. **Subagent Tool Availability across Runtimes**: `invoke_subagent` is natively supported in modern multi-agent harnesses, but in single-agent CLI harnesses, subagent spawning falls back to sequential sub-prompts or scoped process execution. The skill must remain functional in single-agent mode while taking advantage of subagents when available.
2. **Git Worktree Overhead**: For highly parallel subagent dispatch, worktree creation has a minor filesystem latency cost (~100-300ms) on macOS. For purely sequential gated tasks, shared worktree with scoped file paths is sufficient.

---

## 6. Action Items (Ranked Implementation Roadmap)

### Work Order 1: Add Universal `## Resume` Section to `implement-action-items`

- **File**: [.agents/skills/implement-action-items/SKILL.md](file:///Users/lz/dev/fund/.agents/skills/implement-action-items/SKILL.md)
- **Tag**: `[low]`
- **Find**: `## Unattended runs`
- **Change**: Insert the standardized `## Resume Protocol` and transaction boundary reload instructions.
- **Verify**: `make sync-check && python3 -m pytest tests/python/test_skills.py`

### Work Order 2: Add `## Resume` Protocol to `tdd` and `diagnosing-bugs`

- **Files**: [.agents/skills/tdd/SKILL.md](file:///Users/lz/dev/fund/.agents/skills/tdd/SKILL.md), [.agents/skills/diagnosing-bugs/SKILL.md](file:///Users/lz/dev/fund/.agents/skills/diagnosing-bugs/SKILL.md)
- **Tag**: `[low]`
- **Change**: Add explicit state recovery steps on transaction boundaries.
- **Verify**: `make sync-check && python3 -m pytest tests/python/test_skills.py`

### Work Order 3: Implement Deterministic Task State Machine Helper

- **File**: `scripts/agents/task_harness.py`
- **Tag**: `[low]`
- **Change**: Create helper to parse work orders, track status on disk, and validate commit integrity.
- **Verify**: `python3 -m pytest tests/python/` with new test suite `tests/python/test_task_harness.py`.

### Work Order 4: Update `docs/ai_native_repo_structure.md` and `AGENTS.md`

- **Files**: [docs/ai_native_repo_structure.md](file:///Users/lz/dev/fund/docs/ai_native_repo_structure.md), [AGENTS.md](file:///Users/lz/dev/fund/AGENTS.md)
- **Tag**: `[docs]`
- **Change**: Document the State Externalization & Gated Dispatch architectural patterns as core repo conventions.
- **Verify**: `make thinking-check`
