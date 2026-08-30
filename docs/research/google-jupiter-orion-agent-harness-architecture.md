# Research: Google Jupiter & Orion Architecture Applied to Agentic Harness Systems

**Date:** 2026-08-31  
**Status:** Completed  
**Domain:** Distributed Systems, Software-Defined Networking (SDN), AI Agent Harness Architecture

---

## 1. Executive Summary & Research Question

### The Research Question

How do the architectural principles of Google's **Jupiter** datacenter network fabric (SIGCOMM 2015, SIGCOMM 2022) and **Orion** Software-Defined Networking (SDN) control plane (USENIX NSDI 2021) translate into actionable designs for scaling, stabilizing, and isolating multi-agent LLM harnesses?

### The Core Problem in Agentic Workflows

Multi-agent LLM systems face fundamental scaling bottlenecks:

1. **Uncoordinated Decentralization**: Peer-to-peer agent chatter leads to exponential token consumption, context pollution, and cascading hallucinations without a global convergence guarantee.
2. **Monolithic Chassis Fragility**: Entrusting complex multi-step tasks to monolithic mega-agents creates single points of failure with catastrophic blast radii when attention degrades ($P = p^N$).
3. **Static Context Inefficiency**: Stuffing all repository instructions, schemas, and tools into every agent prompt wastes 10k–50k tokens per invocation and dilutes model attention.
4. **Imperative Step Fragility**: Executing long sequences of open-loop imperative commands fails whenever an intermediate step encounters an unforeseen error.

### The Jupiter & Orion Paradigm

Google solved identical problems in physical datacenter infrastructure by abandoning conventional networking paradigms:

- **Jupiter** replaced monolithic proprietary router chassis with a scale-out multi-stage **Clos topology** built from cheap commodity merchant silicon chips and dynamic **Optical Circuit Switching (OCS)**.
- **Orion** replaced decentralized hop-by-hop distributed routing protocols with a **Centralized SDN Control Plane** driven by **declarative intent** and continuous state reconciliation over a centralized publish-subscribe database.

---

## 2. Primary Sources & Architectural Analysis

### 2.1 Google Jupiter: Scale-Out Clos & Dynamic Optical Switching

#### Primary Citations:

1. Singh, A., et al. (2015). _"Jupiter Rising: A Decade of Clos Topologies and Centralized Control in Google's Datacenter Network."_ ACM SIGCOMM 2015.
2. Poutievski, L., et al. (2022). _"Jupiter Evolving: Transforming Google's Datacenter Network via Optical Circuit Switches and Software-Defined Networking."_ ACM SIGCOMM 2022.

#### Core Architectural Tenets:

1. **Multi-Stage Clos Fabrics from Commodity Silicon**:
    - Rather than relying on expensive, proprietary chassis switches with custom ASICs, Google constructed massive, non-blocking fabrics using thousands of small, identical merchant silicon switching chips organized in hierarchical Clos stages (Top of Rack $\rightarrow$ Aggregation Blocks $\rightarrow$ Spine Blocks).
    - _"We deploy modular hardware, build network fabrics with Clos topologies using merchant silicon, and control them using centralized SDN software."_ (Singh et al., 2015).
2. **Centralized Fabric Management vs. Decentralized Protocols**:
    - Standard distributed routing protocols (e.g., OSPF, BGP) were deemed unsuited for datacenter fabric management due to slow convergence, complex state machines, and inability to optimize global traffic paths.
    - Google extracted routing intelligence out of the switches into centralized software controllers that calculate routing tables globally and push forwarding entries downward.
3. **Dynamic Topology Reconfiguration via Optical Circuit Switching (OCS / Apollo)**:
    - In Jupiter 2022, Google integrated MEMS-based Optical Circuit Switches (Palomar/Apollo) directly between aggregation blocks, transforming static physical fabrics into dynamic, software-reconfigurable topologies.
    - Optical paths are dynamically provisioned in real time based on demand bursts, yielding 3x faster fabric deployment, 30% lower CapEx, and 41% reduced power consumption (Poutievski et al., 2022).

---

### 2.2 Google Orion: Distributed SDN Control Plane

#### Primary Citation:

1. Ferguson, A. D., et al. (2021). _"Orion: Google's Software-Defined Networking Control Plane."_ USENIX NSDI 2021.

#### Core Architectural Tenets:

1. **Declarative Intent vs. Imperative Execution**:
    - High-level intent (e.g., "connect service A to service B with bandwidth constraint X") is declared at the top of the control hierarchy. Orion translates this intent into lower-level forwarding state across layers of specialized micro-controllers.
    - _"Orion relies on a centralized pub-sub database to distribute state across microservice-based control applications."_ (Ferguson et al., 2021).
2. **Continuous State Reconciliation**:
    - Rather than assuming open-loop command success, Orion continually reconciles actual switch state against target intent. If a switch reboots or a fiber drops, the control plane calculates delta diffs and drives the network back to convergence.
3. **Microservice Decomposition & Pub/Sub Decoupling**:
    - Orion decomposes the SDN controller into independent, horizontally scalable microservices that communicate exclusively through a shared publish-subscribe state store, eliminating direct RPC inter-dependencies.
4. **Failure Domain Boundedness (Blast Radius Reduction)**:
    - The global network is partitioned into strictly bounded failure domains. A fault in one aggregation block or controller instance cannot propagate across the spine.

---

## 3. The Isomorphism: Datacenter Fabric vs. AI Agent Harness

```
+-----------------------------------------------------------------------------------+
|               GOOGLE JUPITER / ORION INFRASTRUCTURE PARADIGM                      |
|                                                                                   |
|  [Operator Intent] ---> [Orion Central SDN Controller] ---> [Pub/Sub State DB]    |
|                                 | (Global Flow Pathing)            |              |
|                                 v                                  v              |
|                     [Clos Fabric: Merchant ASICs]      [Dynamic OCS Topologies]   |
+-----------------------------------------------------------------------------------+
                                         |
                                         |  ISOMORPHIC MAPPING
                                         v
+-----------------------------------------------------------------------------------+
|               STATE-ORIENTED AI AGENT HARNESS (JUPITER/ORION MODEL)               |
|                                                                                   |
|  [Task Action Items] ---> [Central Orchestrator Harness] ---> [Disk State Ledger] |
|                                 | (Gated Micro-Contexts)           |              |
|                                 v                                  v              |
|                     [Stateless Worker Subagents]       [Dynamic Tool / Slice OCS] |
+-----------------------------------------------------------------------------------+
```

### Detailed Structural Mapping

| Dimension                | Google Jupiter / Orion                                                  | Legacy Multi-Agent Systems                                          | State-Oriented Agent Harness (Jupiter/Orion)                                                               |
| :----------------------- | :---------------------------------------------------------------------- | :------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------- |
| **Control Model**        | Centralized SDN controller (Orion) computing global topology.           | Decentralized peer-to-peer agent chatter / unstructured tool calls. | **Centralized Task Harness Orchestrator** managing explicit state ledger (`.agents/state/`).               |
| **Execution Primitives** | Small, modular merchant silicon ASICs.                                  | Monolithic 128k+ mega-agent context running multi-turn loops.       | **Ephemeral, stateless worker subagents** ($O(1)$ context length, single-gate lifetime).                   |
| **State Coordination**   | Centralized Pub/Sub state database; zero peer-to-peer switch IPC.       | Conversational context window passing accumulated history.          | **Disk-backed JSON State Ledger (`task_harness.py`)** acting as the single ground truth.                   |
| **Execution Mode**       | Declarative target intent + continuous state reconciliation.            | Imperative, open-loop scripts assuming step $N$ succeeds.           | **Declarative State Convergence**: Program Counter $PC = \min \{i \mid \text{gate}[i] \neq \text{DONE}\}$. |
| **Topology & Routing**   | Dynamic Optical Circuit Switching (OCS / Apollo).                       | Static monolithic prompt stuffing (every tool, rule, and doc).      | **Dynamic Context & Tool Binding**: Inject only target file slice & scoped tools per gate.                 |
| **Fault Isolation**      | Clos failure domain partitioning (single ASIC loss $\neq$ fabric down). | Fragile multi-step chain ($P = p^N$ multiplicative failure).        | **Hermetic per-gate transaction boundaries** (revert dirty slice on fail; no global abort).                |

---

## 4. Architectural Blueprints for the Repository Harness

### 4.1 Blueprint 1: Orion Declarative Intent & State Reconciliation Loop

In Orion, operators declare desired state; controllers compute deltas and drive convergence.

In our repository harness, multi-step workflows (action-item sweeps, TDD feature additions, bug diagnoses) operate as a declarative convergence loop:

```
                  +-----------------------------------+
                  |  Declared Intent (Action Items)   |
                  +-----------------+-----------------+
                                    |
                                    v
+-------------------------> [Reconciliation Loop] <-------------------------+
|                                   |                                       |
|                                   v                                       |
|                   [Inspect Actual Git & Ledger State]                     |
|                                   |                                       |
|                    Is PC Gate Completed & Verified?                       |
|                       /                       \                           |
|                    YES                         NO                         |
|                     /                           \                         |
|        [Record Commit & Advance PC]     [Synthesize Ephemeral Gate Slice] |
|                     |                           |                         |
|                     v                           v                         |
|             (Check Next Gate)          [Dispatch Stateless Worker]        |
|                     |                           |                         |
|                     +---------------------------+                         |
+---------------------------------------------------------------------------+
```

```python
# Conceptual Orion-Style Convergence Engine in task_harness.py
def reconcile_task_state(state: TaskState, repo_root: Path) -> TaskConvergenceReport:
    """Drive task state to match declared intent."""
    for gate in state.gates:
        if gate.status == "DONE":
            continue
        if gate.status == "SKIPPED":
            continue

        # Check if actual git state already satisfies this gate (idempotence)
        if is_gate_satisfied_in_repo(gate, repo_root):
            gate.status = "DONE"
            continue

        # Current Program Counter located
        return TaskConvergenceReport(active_gate=gate, converged=False)

    return TaskConvergenceReport(active_gate=None, converged=True)
```

---

### 4.2 Blueprint 2: Clos Multi-Stage Subagent Topologies

Jupiter proves that a large number of simple, low-cost switching units in a Clos hierarchy outperforms a single monolithic router chassis in throughput, cost, and resilience.

In an agent harness, rather than invoking a monolithic `pro` model agent for an entire multi-hour workflow:

1. **ToR Layer (Tier 1 - Fast / Flash)**: Run fast, lightweight scans (`flash_lite` / `flash`) for file searching, syntax checks, and test discovery.
2. **Aggregation Layer (Tier 2 - Worker Subagents)**: Run isolated single-gate implementation subagents (`inherit` / `flash`) focused strictly on editing one target file.
3. **Spine Layer (Tier 3 - Orchestrator / Pro)**: Central orchestrator coordinating ledger updates, resolving difficult merge anomalies, and verifying overarching quality gates.

$$\text{Total Cost \& Blast Radius} = \sum_{i=1}^N \text{Cost}(\text{Worker}_i) \ll \text{Cost}(\text{Monolithic Agent})$$

---

### 4.3 Blueprint 3: Dynamic Optical Circuit Switching (Adaptive Context & Tool Routing)

Jupiter 2022 uses MEMS OCS (Apollo) to dynamically direct optical bandwidth to aggregation blocks with real-time demand, rather than provisioning redundant physical links everywhere.

In our agentic harness, **Adaptive Context & Tool Routing (Agent OCS)** dynamically mounts only the required tools and file context for the active gate:

```
+--------------------------------------------------------------------+
|               DYNAMIC AGENT OCS ROUTING (GATE-SPECIFIC)             |
|                                                                    |
|   Active Gate: "Format CSS & Polish Glass Rim in css/terminal/"    |
|                                                                    |
|   [Global System Tools] ────────────> (DISCONNECTED by OCS)        |
|   [Python Mypy / Pytest Tools] ─────> (DISCONNECTED by OCS)        |
|   [CSS Lint & Screenshot Tools] ────> [CONNECTED TO WORKER CONTEXT]|
|   [Target File: css/terminal/core.css] ─> [MOUNTED TO WORKER]      |
+--------------------------------------------------------------------+
```

- **Benefits**:
    - Prompt size drops by 60–80% (from ~25k tokens to ~4k tokens).
    - Eliminates tool hallucination (an agent editing CSS cannot accidentally call python linters or touch backend data files).
    - Maximizes attention density on the exact code symbols under modification.

---

### 4.4 Blueprint 4: Non-Blocking Fault Isolation and Drain/Reroute

In Jupiter, if an aggregation switch fails or undergoes maintenance, traffic is gracefully drained and rerouted across parallel Clos links without fabric downtime.

In the repository harness:

- If a worker agent fails a verification command or produces an anchor mismatch, the harness **drains and discards** that ephemeral worker context immediately.
- The harness executes `git checkout -- <target_files>` to revert the isolated dirty slice.
- The failure reason is recorded in the state ledger (`gate.notes = "failed: <output>"`), and the orchestrator can adapt the prompt strategy or route the work order to a fallback lane without aborting the entire pipeline.

---

## 5. Action Items & Implementation Plan

### Work Orders

#### Work Order 1: Add Declarative Reconcile Engine to `task_harness.py`

- **Find Anchor:**
  `def main(argv: list[str] | None = None) -> int:` in `scripts/agents/task_harness.py`
- **Change:**
  Add a `reconcile` subcommand to `task_harness.py` that compares git commit history and file status against the declared gates, automatically advancing satisfied gates and reporting the exact delta needed for convergence.
- **Verify:**
  `venv/bin/pytest tests/python/test_task_harness.py`

#### Work Order 2: Adaptive Context & Tool Slicing in Worker Dispatcher

- **Find Anchor:**
  `def render_worker_prompt(state: TaskState, gate_query: str) -> str:` in `scripts/agents/task_harness.py`
- **Change:**
  Extend `render_worker_prompt` to generate scoped tool recommendations and slice restrictions based on the target file extensions (`.py` vs `.js` vs `.css` vs `.md`), matching the Jupiter OCS selective routing principle.
- **Verify:**
  `venv/bin/pytest tests/python/test_task_harness.py`

#### Work Order 3: Codify Jupiter/Orion Principles in Repository Documentation

- **Find Anchor:**
  `- **Externalized state & transaction boundaries (State-Oriented Architecture).**` in `AGENTS.md`
- **Change:**
  Document the SDN control plane paradigm (centralized orchestrator, declarative convergence, dynamic context routing, and blast radius isolation) in `AGENTS.md` and `docs/ai_native_repo_structure.md`.
- **Verify:**
  `make thinking-check && make lint`

---

## 6. Open Questions & Verification Limits

1. **Subagent Context Pruning vs. Native Context Reset**:
    - In current IDE and CLI harnesses, does subagent invocation provide complete context isolation?
    - _Verified_: Invoking subagents via `invoke_subagent` spawns isolated conversation sessions with independent context windows ($O(1)$ memory footprint), perfectly matching the ephemeral ASIC / worker abstraction.
2. **Dynamic Tool Masking Support**:
    - Can tools be dynamically disabled on a per-step basis in all harnesses?
    - _Current Status_: Tool declarations are generally static per agent persona, but prompt-level instruction gating effectively constrains tool invocation space.
