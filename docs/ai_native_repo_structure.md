# Research: AI-Native Repository Structure

This document explores how frontier AI research labs structure their codebases and proposes a set of design principles and structural recommendations to transform a codebase into an **AI-Native Repository**—optimized for maximum efficiency, accuracy, and autonomy when edited by AI agents.

---

## 1. How Frontier Labs Structure Repositories

Frontier AI labs operate at the intersection of extreme-scale infrastructure, rapid scientific research, and production software engineering. Their repository architectures generally center around a few key paradigms:

### A. The Managed Monorepo (Bazel/Pants/Nx)

- **Scale**: Labs typically keep research, data pipelines, model training, evaluation harnesses, and web applications in a single monorepo.
- **Hermetic Builds**: They use build systems like **Bazel** (popular at Google/GDM) or **Pants** (popular in Python-heavy environments) to ensure builds are completely reproducible, hermetic, and cached.
- **Impact**: If a researcher changes a model architecture, the system knows exactly which downstream evaluation tasks and production endpoints are affected and triggers only those tests.

### B. First-Class Evaluation Directories (`/evals`)

- **Evals as a Contract**: Evals are not just unit tests; they measure model capability, behavioral drift, and safety regressions.
- **Structure**: Every core model or agent system has a sibling `/evals` or `/benchmarks` directory containing datasets, expected outputs, and scoring scripts. Model promotion in CI/CD is dependent on passing these evals.

### C. Rigid Separation of Training vs. Serving vs. Tooling

- **Training (`/train` or `/research`)**: Highly dynamic, historically messy, and notebook-heavy. However, modern labs enforce configuration frameworks (like **Hydra**, **Gin**, or typed configs) to separate code logic from hyperparameters.
- **Serving (`/serving` or `/inference`)**: Low-latency C++, Rust, or optimized Python (TGI, vLLM, TensorRT-LLM) with strict typing, rigorous memory profiling, and load testing.
- **Tooling/UI (`/playground` or `/apps`)**: Web interfaces, data labeling tools, and agent playgrounds. These are usually TypeScript/React apps communicating with the backend via strongly typed RPCs (like gRPC, Protocol Buffers, or OpenAPI schemas).

---

## 2. Core Constraints of AI Agents

To design an **AI-Native Repository**, we must design for the cognitive and technical constraints of LLM-based agents:

| Constraint                       | Description                                                                                                            | AI-Native Mitigation                                             |
| :------------------------------- | :--------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------- |
| **Context Window Limits**        | LLMs have finite attention spans. Huge files (>500 lines) consume tokens and cause the model to lose track of details. | Modular, single-responsibility files and strict boundaries.      |
| **High Search & Discovery Cost** | Searching files, running ripgrep, and browsing directories takes time, tool calls, and tokens.                         | Self-documenting paths, root-level maps, and clean code layouts. |
| **Indeterminacy of Environment** | Agents struggle when setup, building, linting, or testing commands are obscure or change frequently.                   | Standardized task runner interfaces (e.g., `Makefile`).          |
| **Loss of State Across Turns**   | Standard git commits don't explain _why_ an agent did something, and context is lost between chat sessions.            | File-based memory/artifacts (e.g., `task.md`, `.cursorrules`).   |

---

## 3. Principles of an AI-Native Repository

An AI-Native Repository is optimized for a machine-in-the-loop workflow. It should follow four main principles:

1. **Self-Documenting & Navigable**: An agent should be able to read one or two root files and instantly understand where everything is and how the system fits together (e.g., via `REPO_MAP.md`).
2. **Deterministic Interface (Unified Task Runner)**: The agent should not need to inspect `package.json` to find frontend commands and `pyproject.toml`/`Makefile` to find backend commands. There should be a single, unified command interface (e.g., `Makefile`).
3. **Low Context Footprint & Strict Boundaries**: Code should be highly modular. Interfaces between modules should be typed so that an agent editing module `A` does not need to read the implementation of module `B`—only its types/interfaces.
4. **Explicit Agent State & Memory**: The repo should reserve directories for agents to store their execution states, tasks, and rules.

---

## 4. Proposed Repository Structure for a Hybrid Project

Based on these principles, here is how a hybrid Python/JavaScript repository can be restructured to optimize it for AI agents:

```text
/fund (Repository Root)
├── .github/                  # CI/CD pipelines (agent run verifications)
├── .gemini/                  # App data directory for agent memory
│   └── prompt_rules/         # Agent-specific instructions (e.g., lint rules)
├── .cursorrules              # Global rules for Cursor/Claude/Gemini IDE integrations
├── REPO_MAP.md               # A high-level map explaining where features live
├── Makefile                  # The single source of truth for ALL commands
│
├── docs/                     # Architectural documents and design decisions
│   ├── architecture.md       # High-level system design
│   └── ai_native_repo_structure.md  # This document
│
├── frontend/                 # Unified JS/TS client
│   ├── package.json          # Dependencies for JS
│   ├── src/                  # Standardized source directory
│   │   ├── components/       # Highly modular, pure UI components
│   │   ├── hooks/            # State and side effects
│   │   └── index.tsx         # Entry point
│   ├── tsconfig.json         # Strict TypeScript settings
│   └── tests/                # Frontend unit and component tests
│
├── backend/                  # Unified Python engine
│   ├── pyproject.toml        # Unified Python dependencies and tool configs
│   ├── src/                  # Standardized Python source directory
│   │   ├── analysis/         # Analysis scripts
│   │   ├── position/         # Position engine
│   │   └── terminal/         # CLI / terminal interface
│   └── tests/                # Python pytest suite
│
├── schemas/                  # Shared contracts (OpenAPI, JSON schema, or Protobuf)
│   └── api.yaml              # The exact contract between backend and frontend
│
└── scripts/                  # Internal automation scripts
    └── bootstrap.sh          # One-click environment setup script
```

### Key Reorganization Concepts

#### 1. Move JavaScript/CSS into a unified `frontend/` directory

Grouping these into `/frontend` prevents the agent from getting confused by root-level config files. It separates the JS environment context entirely from the Python environment context.

#### 2. Move Python modules into a unified `backend/` directory

Nesting these under `/backend` (or `/core`) creates a clear logical separation. The agent immediately knows that anything under `backend/` is Python code governed by `pyproject.toml`.

#### 3. Introduce `REPO_MAP.md` at the Root

This file is a cheat sheet for the AI. It outlines the directories, the core technologies used, and the locations of key business logic.

#### 4. The Unified `Makefile` Contract

The `Makefile` should map all agent operations. This allows the agent to run commands blindly but successfully. Examples of targets:

- `make bootstrap`
- `make lint`
- `make test`
- `make dev`

#### 5. Strict Interface Typing (`/schemas`)

Pydantic exported JSON schemas, OpenAPI specifications, or Protocol Buffers create a compile-time boundary. If the agent modifies the backend API, the frontend compile fails immediately, giving the agent a direct feedback loop to fix its own code.

---

## 5. URL and Routing Preservation (Decoupling Code vs. Delivery)

A common concern when moving static website entries (like `/terminal`, `/position`) into a subfolder like `/frontend` is that public URL endpoints will break or change to `/frontend/terminal` or `/frontend/position`.

This concern is resolved by **decoupling the physical repository layout from the public routing structure**. Repository structure is optimized for **AI developer ergonomics**, while deployment routing is optimized for **user navigation**.

There are two primary ways to manage this separation depending on the deployment strategy:

### A. Deploying Static Roots (Cloudflare Pages, Vercel, Netlify)

If the project is hosted on a static provider (e.g., Cloudflare Pages via `wrangler` or Vercel), the build configuration allows specifying a **Root Directory** or **Publish Directory**:

- **Root Directory (Source)**: Set to `frontend/`. The hosting provider treats this folder as the git root for builds.
- **Publish Directory (Output)**: Set to `frontend/` (or the build output like `frontend/dist`).
- **Result**: When deployed, `frontend/terminal/index.html` becomes the server root's `/terminal/index.html`. Users still visit `fund.lyeutsaon.com/terminal`, keeping URLs completely unchanged.

### B. Bundler-Based Rewrite Rules (Vite, Webpack, Next.js)

If using a modern frontend bundler inside `frontend/`, entry-point aliases or output path overrides can map folder paths to clean outputs:

- For MPA (Multi-Page Apps), configure Vite/Webpack to fetch inputs from `frontend/src/pages/` and output them as flat files:

    ```js
    // vite.config.js example
    export default {
        build: {
            rollupOptions: {
                input: {
                    main: 'index.html',
                    terminal: 'src/pages/terminal/index.html',
                    position: 'src/pages/position/index.html',
                },
            },
        },
    };
    ```

- The built artifact directory (e.g., `dist/`) is served at the domain root, so files are mapped back to their canonical URLs `/terminal` and `/position`.

### C. Server-Level Aliasing (Nginx, Apache, or dev_server.py)

If using a custom dev server (such as Python's `SimpleHTTPRequestHandler`), we can run the server with the root pointed to the `frontend/` directory instead of the project root:

```bash
# Old dev command:
python3 scripts/dev_server.py 8000  # served root (included terminal/ at root)

# New dev command:
cd frontend && python3 ../scripts/dev_server.py 8000  # serves frontend/ at root
```

This preserves `localhost:8000/terminal/` locally just as it is in production.

---

## 6. Restructuring Strategies & Migration Plan (Managing Risk)

Physical reorganizations of a live codebase run the risk of breaking paths, imports, and CI/CD pipelines. To manage this risk in a hybrid repository, two strategies are recommended:

### Strategy 1: The "Virtual" AI-Native Repo (Zero-Risk, High-Reward)

For codebases where physical file movement is too risky, we can construct a virtual layer that gives AI agents the same context and validation capabilities without altering any directory paths:

1. **Create `REPO_MAP.md` at the Root**: Map current paths to functional areas (e.g. `scripts/analysis/` -> backend engine, `js/pages/` -> page logic).
2. **Unified `Makefile`**: Bind all testing, formatting, and linting commands under a root `Makefile` so the agent has a single command interface.
3. **Agent Rules (`.cursorrules` or `.geminiprompt`)**: Provide prompt-level rules to guide the agent through the codebase structure.

- **Impact**: Zero downtime, zero code changes, 90% of the developer experience benefits for AI agents.

### Strategy 2: Incremental, Test-Driven Restructuring (Controlled Physical Migration)

If a physical layout change is desired, it should be executed in discrete, tested stages instead of a single massive change:

```mermaid
graph TD
    A[Current Layout] --> B[Stage 1: Normalize JS Imports with Aliases]
    B --> C[Stage 2: Move Frontend & Update CI/CD]
    C --> D[Stage 3: Move Backend & Resolve Script Paths]
    D --> E[Clean AI-Native Layout]
```

- **Stage 1: Import Path Normalization (JS & Python)**
    - Replace relative JS imports (e.g., `../../utils.js`) with path aliases (e.g., `@utils/utils.js`) which are already configured in Jest. Once aliases are used, physical movement will not break imports.
- **Stage 2: Frontend Migration**
    - Create `/frontend` and move `js/`, `css/`, `package.json`, and page entrypoints.
    - Update the GitHub Pages workflow publish path from `.` to `frontend`.
    - Update `scripts/dev_server.py` to serve the `frontend/` directory.
    - Run JS Jest tests and verify local UI.
- **Stage 3: Backend Migration**
    - Create `/backend` and move `scripts/analysis/`, `pyproject.toml`, and python tests.
    - Ensure python scripts resolve data paths (like `data/analysis/`) relative to their execution location or via an environment variable rather than hardcoded root paths.
    - Run python `pytest` and linters to verify.

---

## 7. Agentic Harness Engineering (Persona, Knowledge, Skills, Workflows)

An AI-native repository is not just a collection of directories; it is a **collaborative workspace** where the AI agent is a first-class developer. **Agentic Harness Engineering** is the practice of equipping the repository with the specific persona, knowledge, skills, and workflows the agent needs to operate with high autonomy and minimal errors.

```mermaid
graph LR
    H[Agentic Harness] --> P[Persona]
    H --> K[Knowledge]
    H --> S[Skills]
    H --> W[Workflows]

    P --> P1["agent.md / prompt rules"]
    K --> K1["docs/ / schemas/"]
    S --> S1["scripts/ / CLI tools"]
    W --> W1["task.md / CI checks"]
```

### A. Persona (Who the Agent Is)

To ensure the agent writes code aligned with your specific design standards, we define a repo-specific persona (usually in `.cursorrules` or `.agent/agent.md`):

- **Context**: Explain the system's purpose (e.g., _"You are the Senior Quantitative Software Engineer managing the Fund Portfolio system"_).
- **Architecture Philosophy**: Specify strict guidelines (e.g., _"Minimize dependencies. Prefer pure mathematical functions. Always implement strict types in Python via Mypy/Ruff"_).
- **Rule Sets**: Set behavioral constraints (e.g., _"Never run git operations without user confirmation. List files to be committed before staging."_).

### B. Knowledge (What the Agent Knows)

Standard model weights do not know your private business rules or custom algorithms. We explicitly write down this knowledge inside the repository so the agent can reference it:

- **Mathematical Reference Sheets**: If the repo uses Fermat-Pascal-Kelly, we store the formula derivations, hyperparameter limits, and scaling criteria under `docs/fermat-pascal-kelly-system.md`.
- **API contracts**: We maintain `/schemas` (like OpenAPI or JSON Schema) so the agent knows the exact payload formats without looking at the backend code.
- **Architecture manuals**: A short `docs/architecture.md` outlining the data flow (e.g., how the Service Worker intercepts fetches, or how `sync_configs.py` populates UI assets).

### C. Skills (What the Agent Can Do)

Skills are **executable tools and automation scripts** checked into the repository that the agent can run to accomplish complex, repetitive, or error-prone tasks.

- **Audit & Verify Scripts**: Instead of the agent reading every JSON file to verify currency conversion manually, we check in a script like `scripts/audit_analysis_data.py`. The agent simply runs the script.
- **Code/Type Generators**: Scripts that parse backend Python files and automatically export TypeScript interfaces. This gives the agent the "skill" of keeping both layers in sync automatically.
- **Database/Fixtures Bootstrap**: A quick command (like `make bootstrap-test-db`) that sets up mock data so the agent can run tests in a sandbox instantly.

### D. Workflows (How the Agent Works)

Workflows are **structured, file-based task sheets** and verification pipelines that keep the agent aligned across multiple prompt turns:

- **The Living Task List (`task.md`)**: A markdown file at the root or under `.gemini/` that acts as the agent's memory. The agent updates this file dynamically (`[ ]`, `[/]`, `[x]`) as it works.
- **Step-by-Step Checklists**: For common procedures (e.g., "Adding a new asset class"), we write a recipe file:
    1. Add asset symbol in `holdings_details.json`.
    2. Map currency in `sync_configs.py`.
    3. Run `make sync` to populate data.
    4. Run `npm test` and `pytest`.
- **Pre-commit Verifications**: Git hooks that enforce that the agent runs linting and formatting scripts before asking for commit confirmation. This prevents "lazy commits" with syntax errors.

---

## 8. Hermetic Agent Sandboxing (Nix & Devcontainers)

To prevent agents from modifying global system configurations, introducing dependency mismatches, or encountering different behavior on host machines, a frontier-lab codebase provides an isolated, completely deterministic developer environment:

- **Nix Flakes (`flake.nix`)**: Puts every system tool (such as specific python versions, Node, C++ compilers, linters) in a completely reproducible, read-only store. The agent operates within a shell context created by Nix.
- **VS Code Devcontainers (`.devcontainer/`)**: Defines a Docker container config specifying the exact OS, extensions, and workspace files:

    ```json
    // .devcontainer/devcontainer.json example
    {
        "name": "AI-Native Dev Environment",
        "dockerFile": "Dockerfile",
        "settings": {
            "python.defaultInterpreterPath": "/usr/local/bin/python",
            "python.linting.enabled": true
        },
        "extensions": ["ms-python.python", "dbaeumer.vscode-eslint"]
    }
    ```

- **Impact**: Ensures the agent cannot break your local computer's global packages, and the commands it executes behave identically in local development, subagents, and CI/CD pipelines.

---

## 9. Agent Security Guardrails & AST Auditing

Agents are vulnerable to model hallucinations (generating incorrect imports) and prompt injection attacks (executing commands to steal data or fetch untrusted third-party files). A robust AI-native repository integrates automated verification gates:

- **Dependency Lockdown**: Block agents from randomly installing new libraries unless verified through a sandbox rule. The CI/CD step validates new packages against known vulnerability databases (e.g. `npm audit`, `pip-audit`).
- **AST-Based Static Analysis (Semgrep)**: Runs semantic checks before letting the agent make changes. For example, Semgrep rules can block the agent from adding `dangerouslySetInnerHTML` in JS or starting raw SQL queries without parameterized inputs.
- **Mock Execution Sandboxes**: For file-writing operations, the repo can configure a temporary branch where scripts are run and evaluated, preventing an agent from modifying the master branch if tests fail.

---

## 10. First-Class Agent Evals (`/evals`)

At Anthropic and DeepMind, code usability for agents is treated as a regression metric. If the codebase becomes too complex, the agent fails to work on it.

- **Testing the Agent on the Repo**: We define a directory `/evals` containing test suites that verify the agent's ability to maintain the repo.
- **Workflow**:
    1. The eval script creates a dummy branch.
    2. The script introduces a known bug (e.g., break currency conversion in `sync_configs.py`).
    3. The agent is invoked with a prompt: _"Fix the bug in sync_configs.py"_.
    4. The script measures:
        - **Success Rate**: Did the agent fix the bug?
        - **Token Cost**: How many tokens did the agent consume?
        - **Time to Fix**: How many tool calls were required?
- **Impact**: If a refactoring makes the code so spaghetti that the agent can no longer fix the bug in under 5 minutes, the PR is flagged as having poor "Agent Ergonomics."

---

## 11. LLM-Optimized Code Semantics (Designing for Attention Heads)

Humans scan code visually, using indentation and alignment. Transformer models read code **token by token** and process it using **attention layers**. An AI-native repository adopts a style guide optimized for token conservation and attention focusing:

- **Token-Bound File Limits**: File size is strictly limited to $2,000$ tokens (approx. 200–300 lines of code). If a file grows larger, it is split into independent sub-modules. This makes it cheap and fast for the agent's `view_file` tool to parse.
- **Explicit Imports (No Wildcards)**: Always write `import { getFXRate, convertCurrency } from './currency'` instead of `import * as currency from './currency'`. Wildcards force the LLM to search multiple files to resolve symbol definitions, increasing the risk of hallucination.
- **Deterministic Side-Effect Annotation**: Since LLMs cannot simulate runtimes, functions are heavily annotated with explicit decorators or docstrings indicating state mutation:

    ```python
    def calculate_position_weights(portfolio: dict) -> dict:
        """
        Calculates weights using the Kelly Criterion.

        Preconditions: portfolio must contain 'shares' and 'price'.
        Side Effects: None (Does not write to disk or mutate inputs).
        """
    ```

    This prevents the agent from assuming a function has side effects (like saving to database) when it does not.
