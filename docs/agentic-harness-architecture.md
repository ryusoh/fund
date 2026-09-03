# Architecture of the Agentic Harness System

**Repository:** `ryusoh/fund`
**Status:** Canonical Master Reference Architecture
**Domain:** AI-Native Engineering, Software-Defined Agent Control Planes, Autonomous Workflows, Deterministic Quality Gates

---

## 1. Executive Summary & Evolutionary History

The `fund` repository implements a production-grade, state-oriented AI agent harness. It bridges autonomous background routines (Jules bots), interactive pair-programming agents (Antigravity, Claude Code, Kimi), automated execution skills, and deterministic quality gates into a cohesive, high-reliability engineering system.

```mermaid
timeline
    title Evolution of the Fund Repository Agentic Harness System
    Generation 1 : Autonomous Jules Lanes (2026-07)
                 : "Measure, Don't Read" Gates
                 : ESLint Bulk Suppressions & Xenon Complexity Ratchet
                 : Stream-of-Consciousness Scan (thinking-check)
                 : Bot Commit Hygiene Gate (bot-pr-check)
                 : Stryker & Mutmut Mutation Testing
    Generation 2 : Canonical Agent Skills Standard (.agents/skills/)
                 : Automated Slash Command Sync Engine (scripts/sync_commands.py)
                 : Symlink Discovery (.claude/skills) & CI sync-check
    Generation 3 : State-Oriented Architecture (Arista EOS SysDB Model)
                 : Externalized JSON State Ledger (.agents/state/)
                 : Ephemeral Stateless Worker Synthesis (O(1) Context)
                 : Zero Tacit Context Transaction Boundaries
    Generation 4 : Software-Defined Agent Control Plane (Google Jupiter & Orion Model)
                 : Declarative Intent & Continuous State Reconciliation Loop (reconcile)
                 : Dynamic Context & Tool Circuit Switching (Jupiter Agent OCS)
                 : Hermetic Fault Isolation, Slice Draining, and Cluster Sync
```

### The Core Failure Modes of AI Coding Agents

Standard multi-turn LLM agent workflows suffer from four fatal vulnerabilities:

1. **The Multiplicative Reliability Decay ($P = p^N$)**: Multi-turn agents using conversational memory compound step-level errors exponentially.
2. **Context Pollution & Attention Degradation**: As chat history grows, autoregressive attention is diluted across irrelevant tokens, increasing hallucination rates.
3. **Monolithic Chassis Fragility**: Entrusting multi-file refactors to a single persistent agent creates single points of failure with catastrophic blast radii.
4. **Open-Loop Execution Drift**: Imperative scripts assuming step $N$ succeeds silently derail when intermediate assumptions fail.

### The System's Solution

The `fund` repository resolves these failure modes by treating AI agents not as conversational chatbots, but as **ephemeral, stateless computational transforms governed by a centralized, software-defined control plane**.

---

## 2. Theoretical & Mathematical Foundations

### 2.1 The Probability Decay Paradox

In classical multi-turn agent interactions, the agent uses conversational context as an in-memory execution ledger. For a task composed of $N$ sequential sub-tasks, each with independent step-level execution success probability $p_i \in (0, 1)$:

$$P(\text{Workflow Success}) = \prod_{i=1}^N p_i = p^N \xrightarrow[N \to \infty]{} 0$$

For example, with a high per-step accuracy of $p = 0.96$ on an $N = 15$ step implementation:

$$P(\text{Workflow Success}) = (0.96)^{15} \approx 0.542 \quad (45.8\% \text{ overall failure rate})$$

```mermaid
graph LR
    subgraph Multi_Turn_Memory["Classical Conversational Memory (Compounding Risk)"]
        Turn1["Turn 1 (p=0.96)"] --> Turn2["Turn 2 (p=0.96)"]
        Turn2 --> Turn3["Turn 3 (p=0.96)"]
        Turn3 --> TurnN["Turn N (P = p^N -> 0)"]
    end

    subgraph State_Oriented_Ledger["State-Oriented Architecture (Resetting Risk)"]
        G1["Gate 1 [Verified Commit]"] ==>|State Ledger Disk Boundary| G2["Gate 2 [Verified Commit]"]
        G2 ==>|State Ledger Disk Boundary| G3["Gate 3 [Verified Commit]"]
        G3 ==>|State Ledger Disk Boundary| GN["Gate N [Verified Commit]"]
    end
```

### 2.2 Attention Density & Token Growth

As conversational token length $L$ expands, the model's effective attention density $D_{\text{attn}}(L)$ degrades inversely:

$$D_{\text{attn}}(L) \propto \frac{1}{1 + \alpha L}, \quad \alpha > 0$$

Under monolithic conversational execution, total token consumption $C_{\text{token}}(N)$ grows quadratically with turn count $N$, whereas stateless gated dispatch maintains constant token overhead per gate:

$$C_{\text{monolithic}}(N) = \sum_{k=1}^N \mathcal{O}(k \cdot \bar{L}_{\text{turn}}) = \mathcal{O}(N^2), \qquad C_{\text{gated}}(N) = \sum_{k=1}^N \mathcal{O}(\bar{L}_{\text{slice}}) = \mathcal{O}(N)$$

### 2.3 Declarative State Convergence Function

Let $S_{\mathrm{declared}}$ be the target intent specified in an action items document, $S_{\mathrm{git}}$ be the ground truth git DAG, and $S_{\mathrm{disk}}$ be the externalized JSON state ledger. The control plane implements a continuous reconciliation operator $\mathcal{R}$:

$$\mathcal{R} : S_{\mathrm{git}} \times S_{\mathrm{disk}} \times S_{\mathrm{declared}} \longrightarrow S_{\mathrm{disk}}'$$

The Program Counter ($PC$) identifies the exact minimal unresolved gate:

$$PC = \min \Big( \{i \in \{1, \dots, N\} \mid \text{Status}(g_i) \notin \{\text{DONE}, \text{SKIPPED}\}\} \cup \{\infty\} \Big)$$

Convergence is achieved when $PC = \infty$ (all gates $\in \{\text{DONE}, \text{SKIPPED}\}$ with verified git commit SHAs).

---

## 3. High-Level System Architecture

```mermaid
graph TD
    subgraph Layer1["1. Intent & Policy Layer"]
        Docs["Markdown Findings & Action Items<br/>(docs/research/*.md)"]
        AgentsMD["Agent Guidance & Working Rules<br/>(AGENTS.md)"]
        SkillsDef[".agents/skills/*/SKILL.md<br/>(Canonical Skills)"]
    end

    subgraph Layer2["2. SDN Control Plane & Orchestrator"]
        TaskHarness["Task Harness Engine<br/>(scripts/agents/task_harness.py)"]
        StateLedger[("Disk-Backed JSON Ledger<br/>.agents/state/<task_id>.json")]
        Reconciler["Declarative Reconcile Engine<br/>(reconcile_state)"]
        OCSRouter["Dynamic Agent OCS Matrix<br/>(derive_scoped_tools)"]
        SyncGen["Command Synchronizer<br/>(scripts/sync_commands.py)"]
    end

    subgraph Layer3["3. Execution & Agent Pool"]
        InteractiveAgents["Interactive Agents (main branch)<br/>- Antigravity / Claude Code / Kimi<br/>- Pre-authorized Local Commits"]
        JulesBots["Unattended Jules Routines (isolated PRs)<br/>- Typist (Types) / Testpilot (Tests)<br/>- Architect (Complexity) / Sentinel (Sec)<br/>- Janitor (Dead Code) / Bolt (Features)"]
        StatelessWorkers["Ephemeral Gated Subagents<br/>- Zero Tacit Context (O(1) Memory)<br/>- Single-Gate Lifespan"]
    end

    subgraph Layer4["4. Deterministic Quality Gates (Measure, Don't Read)"]
        FastLoop["Fast Verification: npx jest / pytest"]
        ThinkingCheck["Thinking Check: scripts/check_thinking_comments.py"]
        BotPRCheck["Bot PR Hygiene: scripts/agents/check_bot_pr_hygiene.py"]
        Ratchets["Complexity (Xenon) & Mutation (Stryker/Mutmut)"]
        CIParity["Full CI Parity Gate: make precommit-fix"]
    end

    Layer1 --> Layer2
    Layer2 <--> StateLedger
    Layer2 --> Layer3
    Layer3 --> Layer4
    Layer4 -->|Green: Advance PC| Layer2
    Layer4 -->|Red: Drain Slice & Revert| Layer2
```

---

## 4. The Two-Audience Operating Model

The repository establishes a fundamental distinction between **Unattended Jules Routines** and **Interactive Coding Agents** in `AGENTS.md`.

```mermaid
graph TD
    User([Developer / User])

    subgraph Unattended_Audience["Audience 1: Unattended Jules Routines (.jules/)"]
        JulesScheduler["Scheduled Cron / CI Dispatch"]
        JulesWorker["Autonomous Headless Agent"]
        JulesBranch["Feature Branch (jules/*)"]
        JulesPR["Pull Request (GitHub PR)"]
        BinaryReview{"Human Binary Decision:<br/>Approve & Merge OR Close"}

        JulesScheduler --> JulesWorker --> JulesBranch --> JulesPR --> BinaryReview
    end

    subgraph Interactive_Audience["Audience 2: Interactive Coding Agents"]
        ChatSession["Interactive Chat Session<br/>(Antigravity, Claude Code, Kimi)"]
        DirectMain["Working Tree / main Branch"]
        AutoSkills["Pre-Authorized Workflow Skills<br/>(/implement-action-items, /tdd, /ship)"]
        LocalCommit["Local Atomic Commits"]
        PushAck{"User Acknowledgment<br/>Before Remote Push"}

        User <-->|Pair Programming| ChatSession
        ChatSession --> DirectMain
        ChatSession --> AutoSkills
        AutoSkills --> LocalCommit
        LocalCommit --> PushAck --> User
    end
```

### 4.1 Audience Comparison Matrix

| Property                | Unattended Jules Routines (`.jules/`)                        | Interactive Coding Agents (Antigravity, Claude, etc.)                                       |
| :---------------------- | :----------------------------------------------------------- | :------------------------------------------------------------------------------------------ |
| **Human in the Loop**   | None during execution; zero review iteration.                | Continuous pair-programming and real-time guidance.                                         |
| **Review Standard**     | Binary approve/close in $\le 10$ seconds. No comments left.  | Interactive diff review in IDE / terminal.                                                  |
| **Optimization Target** | **Approve rate**, smallest possible diff, zero scope creep.  | Problem resolution speed, architectural depth, thoroughness.                                |
| **Branching Strategy**  | Never touches `main`; isolated branch $\to$ GitHub PR.       | Works directly on `main`; branches only when directed.                                      |
| **Commit Authority**    | Commits to PR branch with bot author trailer.                | Local commits pre-authorized for workflow skills; remote push gated on user acknowledgment. |
| **Scope Limits**        | Strict lane boundaries; forbidden from touching other lanes. | Full repo access; may edit build configs, Makefiles, and `.jules/`.                         |

---

## 5. Jules Personas & The Lane Ownership Matrix

To prevent unattended background bots from colliding or causing scope creep, each Jules persona owns a disjoint vertical lane:

```mermaid
graph LR
    subgraph Jules_Lanes["Jules Routine Lane Ownership"]
        Typist["Typist Lane<br/>- JSDoc Strict Annotations<br/>- Zero Logic Changes"]
        Testpilot["Testpilot Lane<br/>- Missing Test Coverage<br/>- Append-Only in tests/"]
        Architect["Architect Lane<br/>- Cyclomatic Complexity Refactors<br/>- Behavior Preserving"]
        Sentinel["Sentinel Lane<br/>- Security Fixes & Leaks<br/>- Empty Catches & Resource Audits"]
        Janitor["Janitor Lane<br/>- Dead Code & Stale Deps<br/>- Real TODO Cleanup"]
        Bolt["Bolt Lane<br/>- Features & Performance<br/>- New Optimizations"]
    end

    Typist -.->|Forbidden from touching| ProdLogic[Runtime Behavior]
    Testpilot -.->|Forbidden from touching| ProdCode[js/ & scripts/ Prod Files]
    Architect -.->|Forbidden from touching| Tests[Tests & Features]
    Sentinel -.->|Forbidden from touching| Complexity[Complexity Refactors]
    Janitor -.->|Forbidden from touching| Tooling[Harness Scripts & Makefiles]
```

### Lane Boundary Specifications

| Routine       | Owns Exclusively                                                  | Must NOT Touch                                               | Verification Target                                           |
| :------------ | :---------------------------------------------------------------- | :----------------------------------------------------------- | :------------------------------------------------------------ |
| **Typist**    | JS strict-type annotations (JSDoc `@param`, `@returns`).          | Runtime logic, branching, or behavior.                       | `npx tsc -p jsconfig.json` strict error count drops.          |
| **Testpilot** | Test additions, edge case assertions, coverage floors.            | Production code (`js/`, `scripts/`).                         | `make test` coverage increases; tests are append-only.        |
| **Architect** | Cyclomatic complexity refactors (breaking up mega-functions).     | Error handling, tests, feature changes.                      | `xenon` / ESLint complexity decreases; tests stay 100% green. |
| **Sentinel**  | Security vulnerabilities (Bandit), resource leaks, bare `except`. | Complexity refactors or performance tweaks.                  | Bandit clean; error handling verified.                        |
| **Janitor**   | Dead code removal, stale package dependencies, real TODOs.        | Tooling (`scripts/agents/`, `bin/`, `Makefile`, `.agents/`). | Zero test regressions; dead symbols removed.                  |
| **Bolt**      | Features, performance optimizations, rendering speed.             | Anything owned by another lane in the same PR.               | Benchmark measurements, `make verify`.                        |

---

## 6. Pre-Existing Quality Gates ("Measure, Don't Read")

Before today's control plane enhancements, the repository established a rigorous "Measure, Don't Read" quality gate infrastructure inspired by Uncle Bob's automated verification philosophy.

```mermaid
graph TD
    subgraph Static_And_Hygiene["1. Static & Behavioral Hygiene Gates"]
        ThinkingCheck["Stream-of-Consciousness Scan<br/>(scripts/check_thinking_comments.py)"]
        BotHygiene["Bot Commit Hygiene Gate<br/>(scripts/agents/check_bot_pr_hygiene.py)"]
        CommitMsg["Commit Message Checker<br/>(scripts/agents/check_commit_message.py)"]
        GateGuard["Gate Guard Idempotency<br/>(scripts/agents/gate_guard.py)"]
        PriorPRs["Prior PR Deduplicator<br/>(scripts/agents/prior_prs.py)"]
    end

    subgraph Structural_And_Coverage["2. Structural, Coverage & Complexity Gates"]
        DiffCov["Diff-Coverage Gate (>= 90%)<br/>(.github/workflows/diff-coverage.yml)"]
        DepCruiser["Dependency-Cruiser Isolation<br/>(.dependency-cruiser.cjs)"]
        ComplexityRatchet["Complexity Ratchet<br/>(Xenon + ESLint Bulk Suppressions)"]
        MutationTesting["Mutation Testing Ratchet<br/>(StrykerJS + Mutmut)"]
    end

    subgraph CI_Composite["3. Composite CI Gates"]
        VerifyTarget["make verify<br/>(lint + type + sec + test)"]
        PrecommitFixTarget["make precommit-fix<br/>(web-ci CI Parity Gate: --max-warnings=0)"]
    end

    Static_And_Hygiene --> Structural_And_Coverage --> CI_Composite
```

### Detailed Gate Specifications

#### 1. Stream-of-Consciousness / Cognitive Leakage Guard (`make thinking-check`)

- **Script**: `scripts/check_thinking_comments.py`.
- **Purpose**: Scans all tracked py/js/ts/css files for model thinking-out-loud remnants (`Wait,`, `Ah,`, `Let me check`, `Oops,`, abandoned `pass`-only test bodies).
- **Invariant**: Code comments must state facts about behavior; reasoning trails belong in PR descriptions or scratch files.

#### 2. Bot PR Hygiene Gate (`make bot-pr-check`)

- **Script**: `scripts/agents/check_bot_pr_hygiene.py`.
- **Purpose**: Inspects all bot-authored commits in `origin/main..HEAD`.
- **Invariants**:
    - Rejects empty commits (zero changed files).
    - Rejects placeholder files (e.g. `dummy_file.txt` added and deleted).
    - Rejects line deletions in test files (bot lanes are strictly append-only in `tests/`).
    - Rejects stray bot artifacts (`pr_body.txt`, `pr_description.txt`, scratch files).
    - Enforces complexity ratchet integrity on `eslint-suppressions.json` (rejects new suppressions / count increases; lane-restricted to Architect `refactor` commits).

#### 3. Gate Guard Idempotency (`scripts/agents/gate_guard.py`)

- **Purpose**: Prevents unattended routines from wasting runs against an untouched worktree. Takes a hash snapshot before the run; blocks retrying red gates if the tree has not changed.

#### 4. Complexity Ratchet (Xenon + ESLint Bulk Suppressions)

- **Python**: `xenon --max-average C --max-modules F --max-absolute F scripts tests`.
- **JavaScript**: ESLint `complexity: ['error', { max: 20 }]` baselined via `eslint-suppressions.json`.
- **Ratcheting Mechanism**: Legacy code is baselined; newly added code cannot introduce high-complexity blocks. As functions are refactored, `npx eslint --prune-suppressions` permanently ratchets down the ceiling.

#### 5. Mutation Testing Ratchet (`make mutate-js`, `make mutate-py`)

- **Tools**: StrykerJS (`.stryker.config.json`) and Mutmut.
- **Principle**: Coverage only proves code _ran_; mutation testing proves tests _assert_. Mutants injected into code must be killed by failing tests.

#### 6. Dependency Architecture & Boundary Gate (`make depcheck`)

- **Tool**: Dependency-Cruiser (`.dependency-cruiser.cjs`).
- **Invariants**: Prohibits circular dependencies and strictly forbids cross-page imports (e.g. terminal code importing from calendar or position pages).

---

## 7. The Agent Skills & Slash Commands Engine

The repository organizes reusable workflows into **Agent Skills** following the open Agent Skills standard.

```mermaid
graph TD
    SkillSource[".agents/skills/<name>/SKILL.md<br/>(Canonical Source of Truth)"]

    subgraph Compilation_Pipeline["Autonomous Compilation Pipeline"]
        SyncScript["scripts/sync_commands.py<br/>(Compilation Engine)"]
        TestSkills["tests/python/test_skills.py<br/>(Schema Validator)"]
    end

    subgraph Targets["Generated Targets & Discovery"]
        ClaudeCommands[".claude/commands/<name>.md<br/>(Claude Slash Commands)"]
        ClaudeSymlink[".claude/skills<br/>(Symlinked to ../.agents/skills)"]
    end

    subgraph CI_Gate["CI Freshness Verification"]
        SyncCheck["make sync-check<br/>(Fails if .claude/commands is stale)"]
    end

    SkillSource --> SyncScript --> ClaudeCommands
    SkillSource --> ClaudeSymlink
    SkillSource --> TestSkills
    ClaudeCommands --> SyncCheck
```

### Canonical Skills Registry

| Skill Name                   | Invocation                | Role & Operational Workflow                                                                                                             |
| :--------------------------- | :------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------- |
| **`action-items`**           | `/action-items`           | Compiles a research/findings document into mechanical, anchor-verified work orders for downstream execution.                            |
| **`implement-action-items`** | `/implement-action-items` | Executes work orders sequentially; validates Find anchors, executes target changes, verifies with scoped commands, and commits locally. |
| **`tdd`**                    | `/tdd`                    | Test-Driven Development red-green-refactor loop; generates failing tests first, implements minimal code, verifies, and refactors.       |
| **`ship`**                   | `/ship`                   | Final verification gate; runs full CI suite, squash-merges branch, deletes worktrees, and pushes to remote with user authorization.     |
| **`research`**               | `/research`               | Primary source research investigation against authoritative literature and specifications; emits cited findings doc.                    |
| **`retro`**                  | `/retro`                  | Retrospective compounding loop; turns session friction into durable repository rules, gates, and skill improvements.                    |
| **`diagnosing-bugs`**        | `/diagnosing-bugs`        | Structured diagnosis loop for hard bugs and performance regressions; generates minimal reproductions before patching.                   |
| **`sibling-repo-sync`**      | `/sibling-repo-sync`      | Propagates harness, tooling, and gate improvements across the four sibling repositories with perspective-flipped adaptations.           |
| **`sync-commands`**          | `/sync-commands`          | Compiles `.agents/skills/` into `.claude/commands/` and validates symlink integrity.                                                    |
| **`jules-persona`**          | `/jules-persona`          | Tunes scheduled prompts and enhances `.jules/<name>.md` personas to match repo house conventions.                                       |

---

## 8. Today's State-Oriented SDN Upgrades (Arista EOS & Google Jupiter/Orion)

Today's architectural enhancement integrates the **Arista EOS SysDB** state separation model and **Google Jupiter / Orion SDN Control Plane** principles into the harness:

```mermaid
graph TD
    subgraph Orion_SDN_Controller["Centralized Task Harness Controller (scripts/agents/task_harness.py)"]
        Parser["Work Order Parser (parse_work_orders)"]
        FSM["Finite State Machine Engine"]
        ReconcileEngine["Declarative Reconciler (reconcile_state)"]
        PromptRenderer["Stateless Prompt Synthesizer (render_worker_prompt)"]
    end

    subgraph State_DB["Externalized State Store (SysDB Model)"]
        JSONState[(".agents/state/<task_id>.json<br/>- Task ID & Source Doc<br/>- Top-level State Mounts<br/>- Gates List & Commit SHAs")]
    end

    subgraph Jupiter_OCS["Dynamic Context & Tool Router (Jupiter Agent OCS)"]
        Router{"Target Extension?"}
        PY_Tools["Python Slice: ruff, mypy, pytest"]
        JS_Tools["JS Slice: eslint, tsc, jest"]
        CSS_Tools["CSS Slice: stylelint, screenshot"]
        MD_Tools["Doc Slice: markdownlint, prettier, thinking-check"]
    end

    subgraph Execution_Pool["Stateless Ephemeral Subagents (Merchant ASICs)"]
        Worker["Worker Subagent (O(1) Context)"]
    end

    Parser --> FSM
    FSM <--> JSONState
    FSM --> ReconcileEngine
    FSM --> PromptRenderer
    PromptRenderer --> Router
    Router --> PY_Tools & JS_Tools & CSS_Tools & MD_Tools
    PY_Tools & JS_Tools & CSS_Tools & MD_Tools --> Worker
```

### 8.1 The State Ledger Finite State Machine (`task_harness.py`)

The state machine manages work order lifecycles through explicit CLI commands:

```bash
# Initialize state ledger from markdown findings doc
python3 -m scripts.agents.task_harness init docs/research/task.md

# Inspect current Program Counter (active gate) as JSON
python3 -m scripts.agents.task_harness current

# Synthesize hermetic, zero-tacit-context prompt for active gate (Agent OCS)
python3 -m scripts.agents.task_harness render-worker-prompt 1

# Reconcile state against git DAG ground truth
python3 -m scripts.agents.task_harness reconcile

# Record verified git commit SHA for a gate
python3 -m scripts.agents.task_harness record-commit 1 <commit_sha>

# Mark non-viable gate as skipped
python3 -m scripts.agents.task_harness skip 2 --reason "Deferred to follow-up"

# Final verification that all gates are resolved
python3 -m scripts.agents.task_harness verify-all
```

### 8.2 Dynamic Optical Circuit Switching (Agent OCS) Matrix

Just as Google Jupiter dynamically reconfigures optical switches to match traffic patterns, the prompt synthesizer dynamically binds only the tools and rules relevant to the active gate:

```python
def derive_scoped_tools(target_file: str) -> list[str]:
    """Derive minimal required toolset based on target file type (Jupiter OCS routing)."""
    p = target_file.lower().strip()
    if p.endswith(".py"):
        return ["ruff (lint)", "mypy (types)", "pytest (test)", "view_file", "replace_file_content"]
    if p.endswith((".js", ".mjs", ".jsx")):
        return ["eslint (lint)", "tsc (types)", "jest (test)", "view_file", "replace_file_content"]
    if p.endswith(".css"):
        return ["stylelint (lint)", "screenshot (visual)", "view_file", "replace_file_content"]
    if p.endswith(".md"):
        return ["markdownlint", "prettier", "thinking-check", "view_file", "replace_file_content"]
    return ["view_file", "replace_file_content", "scoped verify command"]
```

---

## 9. Cluster-Wide Mesh Synchronization

The repository functions as the hub of a 4-repository cluster. Tooling and architectural improvements are synchronized via `/sibling-repo-sync`:

```mermaid
graph TD
    Fund["<b>ryusoh/fund</b> (Hub)<br/>- Canonical Reference Harness<br/>- scripts/agents/task_harness.py<br/>- Gate: make verify & make precommit-fix"]

    Ryusoh["<b>ryusoh.github.io</b><br/>- Static JS Portfolio<br/>- tools/task_harness.py<br/>- Gate: make gate & make precommit-fix"]

    Anki["<b>ryusoh/anki</b><br/>- JS + Python Anki Addons<br/>- tools/task_harness.py<br/>- Gate: make precommit SKIP=1"]

    Networking["<b>ryusoh/networking</b><br/>- Python + JS System Tools<br/>- tools/task_harness.py<br/>- Gate: make precommit-docker"]

    Fund <===>|Bi-directional Sync| Ryusoh
    Fund <===>|Bi-directional Sync| Anki
    Fund <===>|Bi-directional Sync| Networking
```

### Cluster Invariants & Adaptation Rules

1. **Perspective-Flipped Authoring**: Each repository maintains its own copy of `AGENTS.md` and skills written from its local viewpoint.
2. **Tooling Path Adaptation**: Python tooling paths adapt between `scripts/agents/` (`fund`) and `tools/` (`ryusoh.github.io`, `anki`, `networking`).
3. **Uncommitted Sync Review**: Sibling repository modifications remain uncommitted for explicit user inspection before push.

---

## 10. Master Reference & Command Cheat Sheet

```text
+-----------------------------------------------------------------------------------------+
|                              AGENTIC HARNESS COMMAND CHEAT SHEET                        |
+-----------------------------------------------------------------------------------------+
| WORKFLOW COMMAND                     | PURPOSE & INVOCATION                             |
+--------------------------------------+--------------------------------------------------+
| make verify                          | Full checks: lint + types + sec + tests          |
| make precommit-fix                   | CI parity gate (web-ci: --max-warnings=0)        |
| make thinking-check                  | Scan for stream-of-consciousness comments        |
| make bot-pr-check                    | Verify Jules bot PR commit hygiene               |
| make depcheck                        | Verify JS modular dependency boundaries          |
| make sync-check                      | Check generated Claude commands freshness        |
| make mutate-js / mutate-py           | Run Stryker / Mutmut mutation test ratchets      |
| /action-items <doc>                  | Compile findings doc into tagged work orders     |
| /implement-action-items <doc>        | Execute work orders sequentially with commits    |
| /tdd                                 | Test-driven red-green-refactor loop              |
| /ship                                | Final verify, squash-merge, push gate            |
| /research                            | Deep primary source investigation                |
| /retro                               | Friction-to-improvement compounding loop         |
| /sibling-repo-sync                   | Propagate tooling across cluster repos           |
| python3 -m ...task_harness init      | Initialize JSON state ledger from doc            |
| python3 -m ...task_harness reconcile | Reconcile state against git ground truth         |
| python3 -m ...task_harness current   | Print active Program Counter gate                |
+-----------------------------------------------------------------------------------------+
```

---

## 11. Architectural Axioms Summary

$$ \begin{aligned}
\text{State Ledger} &\implies \text{Externalized Disk JSON File (Arista SysDB Model)} \\
\text{Orchestration Control} &\implies \text{Centralized Declarative SDN Engine (Google Orion Model)} \\
\text{Subagent Execution} &\implies \mathcal{O}(1) \text{ Ephemeral Single-Gate Lifetime (Merchant Silicon Clos)} \\
\text{Tool Provisioning} &\implies \text{Dynamic Adaptive Slicing (Google Jupiter OCS)} \\
\text{Quality Assurance} &\implies \text{Automated Layered Gates (Measure, Don't Read)} \\
\text{Verification Authority} &\implies \text{Strict Deterministic CI Parity (make precommit-fix)}
\end{aligned}$$
$$
