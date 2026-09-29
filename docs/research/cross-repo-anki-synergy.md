# Cross-Repo Anki Synergy: fund × networking × anki

**Status: Findings / Proposal**
**Date: 2026-09-29**

Most of the machinery already exists — the work is **wiring, not building**:

1. **`~/dev/networking` already contains a complete, tested chat→Anki pipeline**
   whose _default deck is 金融_ and which already reads the PageRank graph from
   `~/dev/anki`. Its core pattern is "LLM authors, code gates": deterministic
   code selects/validates/imports; the agent writes card prose as JSONL.
2. **`~/dev/anki` already computes PageRank over the 金融 deck** (15,212 nodes)
   from textual cross-references between card fronts — writing new cards whose
   fronts name existing hub concepts is what earns them priority.
3. **`~/dev/fund` already has the durable-knowledge funnel** (research → cited
   findings doc → action items → committed work) and a thesis subsystem — but
   zero Anki awareness.
4. The missing piece is one thin fund-side skill (e.g. `/anki-capture`) that
   converts a findings doc / thesis update into the JSONL card schema
   networking's pipeline already validates and imports, plus a finance tag
   vocabulary in networking's validator.

State-of-the-art methodology (§4) independently endorses this shape: file-based
agent memory, human-reviewable card staging, PageRank for _what_ to learn and
FSRS for _when_ to review, and multi-agent research orchestration with a
citation-verification pass.

## 1. What each repo already has (primary-source inventory)

### 1a. `~/dev/networking` — the Anki pipeline lives here

The key inversion: `research/` is **data only**; the agent code is in
`tools/research/` (`research/README.md`). Architecture spec:
`docs/research/research-agent-spec.md` — Layer 4 (LLM invocation) is
deliberately descoped to the interactive host agent; the repo ships
deterministic CLIs, no inference code.

**The chat→card pipeline** (spec: `docs/research/anki-card-pipeline-spec.md`;
skill: `.agents/skills/anki/SKILL.md`):

```text
python3 tools/research/anki_generator.py --count 5 --deck "金融"
    → writes research/anki_candidates.jsonl (chunk_id, file_path, heading,
      line range, content, citation); marks chunks "candidate";
      REFUSES to run while any chunk is still candidate/pending
LLM reads candidates → authors cards → research/anki_cards.jsonl
    ({chunk_id, front, back, tags, citation, external_sources?})
python3 tools/research/anki_card_validator.py research/anki_cards.jsonl
python3 tools/research/anki_density_gate.py --cards ...
python3 tools/research/anki_generator.py --import --deck "金融"
    → re-validates, content-hash dedup, AnkiConnect addNotes
```

Supporting machinery, all in `tools/research/anki_generator.py` (~1594 lines):

- **AnkiConnect client** (`AnkiConnectChecker`, ~lines 769–893): stdlib
  `urllib` POSTs to `http://127.0.0.1:8765`, protocol v6; `version`,
  `findNotes`, `modelNames`/`modelFieldNames` (resolves localized note types),
  `addNotes`; `--auto-launch` starts Anki and polls.
- **Coverage state machine** `unvisited → candidate → imported` in
  `research/.anki_coverage.json` (single-writer, never hand-edited).
- **Two-layer dedup**: selection-time title match against a temp copy of
  `collection.anki2`; import-time SHA-1 of normalized front. Safety rule
  everywhere: never raw-write the live SQLite collection.
- **Ad-hoc path**: `--front/--back --deck --tags [--auto-launch]` — single-card
  import, works with zero chunk infrastructure. This is what the
  `/research-agent` skill's post-answer "Export Answer to Anki?" offer uses,
  and it **works for fund content today**.
- **金融 is the default deck** (`anki_generator.py:1467-1471`); 金融 appears in
  25 files / 127 occurrences.

**PageRank bridge**: `tools/research/anki_graph_bridge.py` reads
`~/dev/anki/graph/graph_data.json` (verified present, 154 MB), filters strictly
to `deck == "金融"`, exposes `score_chunk_pagerank()` and `get_related_hubs()`
so cards are ranked by, and cross-linked to, high-PageRank concept hubs.

**Card format contract** (spec §8): Chinese-primary bilingual HTML; front =
`<strong>中文概念</strong>: 具体问题？`; back ≥2 `<b>`-headed dense sections;
acronyms expanded on first use (machine-enforced); mandatory final
`源码与文档引用` citation section with line-anchored links; tags restricted to
`CANONICAL_TAGS` in `tools/research/anki_card_validator.py` — currently
networking-scoped (`research`, `networking`, `cs231`–`cs234`, `tcp`,
`consensus`, …). **A finance vocabulary must be added** for fund cards.

**Density gate**: `anki_density*.py` compares card information density against
a pinned baseline of the existing 金融 deck (`research/.anki_density_baseline.json`,
jieba tokenization). The baseline is already finance-flavored — fund cards
inherit it for free.

Tests: `tools/research/__tests__/` covers the whole pipeline including an e2e
test with mocked LLM/AnkiConnect (`test_research_agent_e2e.py`).

### 1b. `~/dev/anki` — AnkiConnect + PageRank over cards

- **Repo is symlinked into Anki's add-ons dir** (`AGENTS.md:259-267`) — editing
  here edits the live add-ons. `anki_connect/` is a vendored upstream
  AnkiConnect exposing HTTP JSON at `127.0.0.1:8765`
  (`anki_connect/config.json`). Full note/deck/tag/model/scheduling API
  (`addNotes` at `anki_connect/__init__.py:2069`, `findNotes:1506`,
  `updateNoteFields:838`, …).
- **Canonical invocation example**: `tools/fix_jp_pinyin_front.py:185-205` —
  a ~20-line `ankiconnect_invoke(action, params)` helper with retry/backoff.
- **Deck-name gotcha** (`docs/deck-aliases.md`): AnkiConnect/UI use `::`
  hierarchy separators (e.g. `言語::日語`); SQLite/graph data use U+001F. Build
  queries from `deckNames` output, never hand-type CJK paths.
- **PageRank system** (`graph/`): nodes = notes keyed by Anki `guid`; edges =
  textual cross-references within a deck (note A's front text appearing in note
  B's fields ⇒ edge B→A, "B cites A"). Four typed/weighted edges
  (`front_in_front` 3.0 … `subphrase_in_back` 1.0, `graph/references.py:37-42`),
  sub-phrases gated by document frequency, Aho-Corasick + multiprocessing.
  PageRank is plain weighted `nx.pagerank` (α=0.85, `graph/builder.py:97-119`)
  — **not personalized, and nothing reorders Anki reviews by it**: consumption
  is reporting (CLI `graph/analyze.py --deck F --top N --hubs`, markdown
  reports in `data/pagerank/`) and a Three.js 3D viz
  (`graph/graph_data.json`: 165,104 nodes / 2,221,170 links).
- **The 金融 deck exists**: deck id `1734923746259` (`data/anki/decks.json`),
  ~13,147–15,212 notes depending on the snapshot. It is now **one unified deck
  with no sub-decks** (verified in `data/anki/decks.json` 2026-09-29); the
  former **金融理論** (CFA-style theory) and **金融産研** (industry research —
  largely networking/infra concepts) sub-decks were merged into it. The mix of
  theory + industry-research cards in one deck means fund cards land alongside
  both, and the 金融-filtered PageRank bridge ranks across all of them.
- New cards written via AnkiConnect join the graph on the next fetch+rebuild;
  their PageRank reflects how many existing cards reference their front text —
  so **fronts that reuse existing hub-concept names are what earn priority**.

### 1c. `~/dev/fund` — the durable-knowledge funnel, no Anki awareness

- **Capture loop already exists**: `/research` → cited findings doc
  (`.agents/skills/research/SKILL.md`); `/action-items` +
  `/implement-action-items` → committed work orders with a git-backed resume
  protocol; `/retro` → session friction becomes docs/gates/skills
  (`docs/ai_native_repo_structure.md` §17, the "compounding loop" doctrine).
- **Thesis subsystem** (`docs/ai_update_flow.md`, `docs/thesis-template.md`,
  `docs/thesis/`): raw material → inbox → classify Bull/Base/Bear → patch-style
  diffs to `docs/thesis/<TICKER>.md` + `data/analysis/<TICKER>.json` (single
  source of truth for scenario numbers) → human git-diff review. Currently 4
  tickers (ANET, GOOG, PDD, VT). `scripts/thesis_update_gemini.py` is the
  existing precedent for an LLM-in-the-loop research digest CLI.
- **Machine-refreshed fundamentals** (`data/analysis/<TICKER>.json`):
  price/EPS/P-E/forward P-E/EV-EBITDA/market cap/PEG/beta, refreshed by
  `scripts/analysis/sync_configs.py`; P/E pipeline in
  `scripts/generate_pe_data.py` (governed by `docs/pe-forward-pe-pipeline.md`).
- Grep for 金融/flashcard/spaced-repetition: **zero hits** — no Anki-as-study
  integration exists here.
- Cross-repo precedent: `.agents/skills/sibling-repo-sync/SKILL.md` propagates
  tooling across fund/anki/networking/ryusoh.github.io ("adapt, don't copy",
  changes left uncommitted for review); the 4-repo mesh is documented in
  `docs/agentic-harness-architecture.md` §9.

## 2. The gap analysis

| Need                                                                           | Status                                                                                                             |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Write a card to 金融 from a chat session                                       | **Works today** — networking's `anki_generator.py --front/--back` ad-hoc path                                      |
| Rank card candidates by concept importance                                     | **Works today** — `anki_graph_bridge.score_chunk_pagerank()` over the 金融 subgraph                                |
| Batch, gated card generation from fund research docs                           | **Missing** — networking's chunker expects `research/**/*.md` courseware; fund findings/theses aren't chunked      |
| Finance tag vocabulary                                                         | **Missing** — `CANONICAL_TAGS` in `tools/research/anki_card_validator.py` is networking-scoped                     |
| Fund-side skill that turns a findings doc / thesis update into card candidates | **Missing** — the one new artifact to author                                                                       |
| Review scheduling by importance                                                | **Out of scope by design** — FSRS schedules reviews; PageRank should only steer _what to add/emphasize_ (see §4.3) |

## 3. Proposed architecture

```text
finance question in fund chat
   │
   ▼  (existing) /research or thesis-update flow
docs/research/<topic>.md  +  docs/thesis/<TICKER>.md patch   ← durable, cited, git-reviewed
   │
   ▼  (NEW) fund skill: /anki-capture
fund writes anki_cards.jsonl in networking's schema
   (front names existing 金融 hub concepts verbatim where possible)
   │
   ▼  (existing, networking) validator → density gate → AnkiConnect import
金融 deck gains cards; next graph rebuild picks up new edges
   │
   ▼  (existing, anki repo) graph/analyze.py + anki_graph_bridge
PageRank of new concepts feeds back into future card-candidate ranking
```

Design principles (each justified in §4):

1. **Cards are a downstream artifact of docs, never a parallel track.** The
   findings doc is the durable, versioned source of truth; cards are derived,
   atomic, and cite the doc path for provenance.
2. **LLM authors, code gates.** Fund's agent writes prose; networking's
   validator/density/dedup machinery decides what enters the deck.
3. **Human review rides the existing git-diff habit** — `anki_cards.jsonl` is
   staged and reviewed like any other change before import.
4. **Explicit links over embeddings.** Card fronts and doc text that name
   existing hub concepts create real graph edges (which PageRank consumes);
   embedding similarity is at most a suggestion generator.
5. **Reuse by invocation, not vendoring.** Fund calls networking's CLIs in
   place (the repos are sibling checkouts on one machine; the bridge already
   hard-codes `~/dev/anki` and honors `ANKI_REPO_ROOT`). Port through
   `/sibling-repo-sync` only if a second machine ever needs it.

### Domain concentration: the networking/finance overlap

The portfolio is concentrated in data-center networking (thesis: `docs/thesis/ANET.md`,
Arista / AI networking), and the former 金融産研 deck's top-PageRank cards were
already networking-industry concepts (LPO, PM fiber, Arista CLB). This makes
the overlap a **multiplier** for the knowledge system and a **risk** for the
investment process:

- **Multiplier**: one domain corpus serves both learning and investing.
  Networking-repo research output (technical fundamentals) and fund-repo
  research output (industry/company analysis) name the same hub concepts in
  card fronts, so PageRank edges form between theory and industry cards in the
  unified 金融 deck. The highest-PageRank hubs are then the concepts
  load-bearing for both understanding and investment decisions — a built-in
  "study this deeper" signal.
- **Risk — correlated information diet**: the same sessions and sources feed
  both domain understanding and the investment thesis, amplifying confirmation
  bias. Controls (from `docs/research/analysis-lab-revival.md` §4–5, here
  promoted from good-practice to load-bearing): mandatory `evidence_against[]`
  in the belief-state schema, dated falsifiable predictions with Brier scoring,
  pre-mortems.
- **Risk — unmodeled industry tail**: the Lab's PORT view assumes zero
  correlation (`lab.js:1055-1060`), which under industry concentration hides
  the dominant risk — a single industry-level Bear scenario hits all positions
  at once. Add an industry-thesis layer (`docs/thesis/industry/<name>.md`)
  that per-ticker theses reference, and either implement covariance Kelly
  (`docs/fermat-pascal-kelly-system.md` §7) or apply an explicit industry Bear
  scenario across positions. Concentration telemetry already exists
  (`data/etf_hhi.json`, `data/fund_sector_allocations.json`) and should be
  surfaced next to the Kelly curve on the revived analysis page.

### Which repo is the question surface?

**Ask in the repo that owns the domain; every repo's research flow funnels
into the same 金融 deck.** Concretely:

- **Finance questions → fund.** The durable outputs of a finance chat (thesis
  patches, `data/analysis/<TICKER>.json`, `docs/research/` findings) are
  governed by fund's gates, deploy, and git-review flow; the agent's cwd
  determines which skills/state/conventions apply. Asking finance questions in
  networking would strand the durable artifacts in the wrong repo.
- **Networking questions → networking**, using its existing `/research-agent`
  skill as-is. It is corpus-bound: `tools/research/parse_chunks.py` chunks
  `research/**/*.md` courseware (cs231–cs234), `curriculum_service.py` holds a
  course prerequisite graph, and `memory_host.py` tracks per-course mastery.
  Reuse its **architecture, not the skill instance**: port it to fund via
  `/sibling-repo-sync` ("adapt, don't copy") as a finance-scoped skill that
  chunks `docs/thesis/**` + `docs/research/**` + `data/analysis/*.json`
  instead, keeps the citation-engine contract, and ends with the same
  post-answer Anki export offer (which invokes networking's `anki_generator.py`
  in place — see principle 5).
- **anki repo → never a question surface.** It is the execution backend
  (AnkiConnect + PageRank rebuilds), with no research corpus or findings-doc
  convention.

### Phased plan

- **Phase 0 — zero code, usable today.** After any fund research chat, run
  `python3 ~/dev/networking/tools/research/anki_generator.py --front … --back …
--deck "金融" --tags research finance --auto-launch` for the 1–3 key facts of
  the session. (Verify exact CLI flags against `--help` before first use.)
- **Phase 1 — fund `/anki-capture` skill.** A new
  `.agents/skills/anki-capture/SKILL.md` in fund that: reads the session's
  findings doc / thesis diff, authors candidate cards in networking's JSONL
  schema (card format contract §8), then invokes networking's
  `anki_card_validator.py` and `anki_generator.py --import`. Companion change
  in networking: add finance tags (`finance`, `valuation`, `moat`, `earnings`,
  per-ticker tags) to `CANONICAL_TAGS`.
- **Phase 2 — graph-driven prioritization.** Use
  `anki_graph_bridge.get_related_hubs()` / `graph/analyze.py --deck F --hubs`
  to list high-PageRank 金融 concepts that a new thesis touches; card fronts
  reuse those hub names verbatim so edges form; after import, rebuild the graph
  (`make graph-export` in ~/dev/anki) so the new cards get ranks.
- **Phase 3 — finance deep-research orchestration.** A fund research skill
  that fans a company/industry question out to parallel subagents
  (fundamentals / industry-TAM / valuation — the AlphaAgents role split) over
  primary sources (filings, `data/analysis/<TICKER>.json`), with a
  citation-verification pass before anything lands in `docs/thesis/` — then
  Phase 1 cards fall out of the verified doc.

## 4. State-of-the-art methodologies (industry/academic, with citations)

### 4.1 Agentic memory / context engineering — well-established

- **Context engineering** is the canonical framing: curate the smallest
  high-signal token set per step; use compaction, structured note-taking
  outside the context window, and sub-agent architectures.
  <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>;
  empirical basis ("lost in the middle"): <https://arxiv.org/abs/2307.03172>.
- **File-based agent memory**: Anthropic's memory tool (beta) is a filesystem
  store the agent reads/writes outside the context window for cross-session
  persistence — validates the "chat → durable files in the repo" instinct.
  <https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool>.
- **AGENTS.md and Agent Skills are now cross-tool standards** (AGENTS.md
  donated to the Agentic AI Foundation, Dec 2025; skills spec at
  <https://agentskills.io>,
  <https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills>).
  All three repos already follow these — the skill is the right unit for the
  new integration.
- **MemGPT/Letta** (OS-style self-editing memory blocks,
  <https://arxiv.org/abs/2310.08560>) is an established pattern but heavier
  than a CLI-chat setup needs; **basic-memory MCP**
  (<https://github.com/basicmachines-co/basic-memory>) shows plain Markdown +
  derived graph is sufficient. Recommendation: skip runtimes; repo files + git
  are the memory store.
- **Compound engineering** (Every): plan → work → review → _compound_ loop
  where every task writes durable artifacts so future sessions start smarter.
  Practitioner methodology, not academic:
  <https://every.to/guides/compound-engineering>,
  <https://github.com/everyinc/compound-engineering-plugin>. This repo's
  `/retro` skill is already a homegrown version. Related preprint: Agentic
  Context Engineering (evolving "playbook" contexts),
  <https://arxiv.org/abs/2510.04618> — promising, not proven.

### 4.2 LLM-driven spaced repetition

- **FSRS is the scheduling state of the art**, built into Anki since 23.10;
  beats SM-2 on 727M+ review logs. <https://faqs.ankiweb.net/what-spaced-repetition-algorithm>,
  <https://github.com/open-spaced-repetition/fsrs4anki>. AnkiConnect card
  creation needs nothing FSRS-specific.
- **Wozniak's 20 rules / minimum information principle** remain the card-quality
  standard that generation prompts should encode:
  <https://www.supermemo.com/en/blog/twenty-rules-of-formulating-knowledge>;
  modern complement: Matuschak on effortful, understanding-focused prompts
  (<https://andymatuschak.org/prompts/>).
- **Academic validation of LLM-generated cards is thin but positive** (small
  medical-education studies, e.g.
  <https://www.medrxiv.org/content/10.1101/2025.05.13.25327518v2.full.pdf>) —
  preliminary, not settled.
- **Practitioner lesson** (obsidian-synapse, anki-llm): fully-autonomous Q&A
  generation produces unwanted trivia cards; the fix is a **human-reviewable
  intermediate artifact** — generate to a file, review, then push.
  <https://github.com/st3v3nmw/obsidian-synapse>,
  <https://github.com/raine/anki-llm>. This is exactly networking's
  JSONL-staging design — keep it.
- **Incremental reading** (SuperMemo) has no mature LLM-agent implementation;
  a chat session approximates its extract step. Opportunity, not a gap to fix.

### 4.3 PageRank over notes/cards — precedented heuristic, not science

- Direct production precedent: the Obsidian Spaced Repetition plugin orders
  note review by **PageRank over the note link graph**
  (<https://github.com/st3v3nmw/obsidian-spaced-repetition>, discussion #430).
- **No peer-reviewed study** compares centrality-weighted vs. pure
  forgetting-curve prioritization. SRS literature optimizes retrievability;
  importance weighting traces to SuperMemo's manual priority queue.
- Design rule: **keep PageRank and FSRS orthogonal** — PageRank decides _what
  to add and emphasize_ (card-creation priority, hub linking); FSRS decides
  _when_ to review. Do not override FSRS intervals with PageRank.

### 4.4 Deep-research agents for finance

- **Anthropic's multi-agent research system**: orchestrator-worker, parallel
  subagents with separate context windows, dedicated citation-verification
  pass; ~90% internal-eval improvement at ~15× token cost.
  <https://www.anthropic.com/engineering/multi-agent-research-system>.
  OpenAI Deep Research and Gemini Deep Research follow the same plan → browse →
  cited-report shape (<https://openai.com/index/introducing-deep-research/>).
- **Finance-specific (preprints — adopt architectures, distrust metrics)**:
  FinRobot (multi-layer agent platform for equity research,
  <https://arxiv.org/abs/2405.14767>, <https://github.com/AI4Finance-Foundation/FinRobot>;
  independent reviews flag weak traceability — treat outputs as drafts);
  AlphaAgents (BlackRock-authored role-based fundamental/sentiment/valuation
  agents with debate, <https://arxiv.org/abs/2508.11152>) — its role split is a
  good template for Phase 3. Survey:
  <https://dl.acm.org/doi/full/10.1145/3768292.3770387>.

### 4.5 Linking new research to existing knowledge

- **Zettelkasten / evergreen notes**: atomic, concept-oriented, densely linked;
  links are the thinking (<https://notes.andymatuschak.org/Evergreen_notes>).
  Matuschak's five-year reflection names the exact pain this system automates:
  manual duplication between prose notes and SRS prompts.
- **PARA / progressive summarization** (<https://fortelabs.com/blog/para/>) —
  organize by actionability; practitioner-grade.
- **Embeddings for auto-linking: speculative.** Common in plugins, no rigorous
  learning-outcome evidence. Agent-written explicit links double as the
  PageRank edge set — embeddings at most suggest, never assert.

## 5. Open questions / what I could not verify

1. **Whether networking's pipeline CLIs run cleanly from outside its repo
   root.** `anki_generator.py` paths (`research/.anki_coverage.json`, baselines)
   appear repo-relative; invoking from fund may need `cwd=~/dev/networking` or
   small patches. Test before writing the `/anki-capture` skill.
2. **金融 deck note type.** Card content lives only in the private Anki
   collection; the exact note type/fields fund cards should use (cloze vs.
   basic bilingual) needs one `modelNames`/`modelFieldNames` query against the
   live collection.
3. **Coverage-state semantics for fund content.** Networking's coverage tracker
   assumes a finite corpus (`research/**/*.md` courseware). Fund theses are
   living documents — decide whether fund cards skip the coverage state machine
   (ad-hoc path) or get a separate manifest.
4. **Graph rebuild cadence.** New cards earn PageRank only after a fetch +
   rebuild of `graph/graph_data.json` (10k+ notes ≈ 30s+ per
   `docs/graph-analysis-guide.md`); how often to rebuild is an open workflow
   choice.
5. **LLM card quality** rests on small, domain-specific studies; expect to
   tune the card-format contract empirically against the density gate.
6. **AlphaAgents/FinRobot return claims** are self-reported preprints — only
   the role-split architecture is recommended for adoption.
