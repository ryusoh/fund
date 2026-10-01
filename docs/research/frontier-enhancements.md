# Frontier Enhancements for the Compounding Research Engine

**Status: Findings / Recommendation**
**Date: 2026-10-01**

All external claims below cite a primary source fetched this session (arXiv
abstract pages, official docs, first-party repos/posts). Maturity labels:
**[established]** = peer-reviewed or deployed at scale; **[preprint]** = single
arXiv paper, unverified; **[vendor]** = claim from the product's own
benchmark/blog; **[practitioner]** = engineering blog / community evidence.

## Current system baseline

- **fund** (`~/dev/fund`): financial dashboard + Python pipeline; cited findings
  docs via `/research` (`.agents/skills/research/SKILL.md`); thesis subsystem
  (`docs/thesis/<TICKER>.md` + `data/analysis/<TICKER>.json`, single source of
  truth per `docs/ai_update_flow.md`); BLF-style belief state +
  `evidence.jsonl` + dated falsifiable predictions with live Brier scoring
  (`js/pages/analysis/bayes.js`, `data/analysis/<TICKER>.json`); Farnam-Street
  decision journal; fan/VaR/Kelly visualizations per
  `docs/fermat-pascal-kelly-system.md`; vendored SEC filings read tools at
  `scripts/vendor/filings/` with adapter `scripts/analysis/filings_adapter.py`
  (evaluation: `docs/research/external-filings-agent-evaluation.md`);
  `/anki-capture` skill (`.agents/skills/anki-capture/SKILL.md`).
- **networking** (`~/dev/networking`): deterministic research/Anki pipeline —
  chunk manifest, BM25+dense hybrid search with RRF (`tools/research/search_chunks.py`,
  `dense_indexer.py`), scene builder, citation engine, durable memory host,
  card validator/density gate/dedup/AnkiConnect import
  (`docs/research/anki-card-pipeline-spec.md`, `research-agent-spec.md`).
- **anki** (`~/dev/anki`): vendored AnkiConnect; weighted PageRank over
  textual cross-references in the unified 金融 deck (~15k notes);
  graph rebuilt on `make precommit-fix YOLO=1`
  (`graph/builder.py`, `graph/analyze.py`).
- Portfolio context: concentrated datacenter networking (ANET-heavy);
  industry theses in `docs/thesis/industry/`; covariance Kelly implemented in
  `js/pages/analysis/lab.js`.

What the baseline already gets right per the frontier: "LLM authors, code
gates" matches Anthropic's context-engineering doctrine (curate the smallest
high-signal token set; just-in-time retrieval with lightweight identifiers)
[practitioner, fetched: <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>],
and git-versioned artifacts match Anthropic's memory tool design (file-based
memory outside the context window, resumed per session)
[vendor, fetched: <https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool>].

## Frontier survey

### 1. Agentic memory and self-improving agents

- **MemGPT/Letta** — OS-style virtual context management with tiered memory;
  the foundational paper for agents that page memory in/out
  ([arXiv:2310.08560](https://arxiv.org/abs/2310.08560), v1 Oct 2023, v2 Feb
  2024). **[preprint→deployed]** (Letta is a maintained open-source product).
- **Reflexion** — verbal reinforcement: agents write self-reflections into an
  episodic buffer instead of updating weights; 91% HumanEval pass@1 reported
  ([arXiv:2303.11366](https://arxiv.org/abs/2303.11366), 2023, NeurIPS 2023
  version of record). **[established as technique; headline number
  single-benchmark]**.
- **Voyager** — an ever-growing skill library of executable code, retrieved
  and composed; "compounds the agent's abilities rapidly" and transfers to new
  environments ([arXiv:2305.16291](https://arxiv.org/abs/2305.16291), May
  2023). **[preprint, widely replicated as pattern]**.
- **Agent Workflow Memory (AWM)** — induces reusable workflows from past
  trajectories and injects them into later runs; +24.6% / +51.1% relative
  success on Mind2Web/WebArena, works offline and online
  ([arXiv:2409.07429](https://arxiv.org/abs/2409.07429), Sep 2024).
  **[preprint, two public benchmarks]**.
- **ACE (Agentic Context Engineering)** — contexts as evolving *playbooks*:
  incremental, structured delta updates instead of wholesale rewrites, to
  avoid "brevity bias" and "context collapse"; +10.6% on agent benchmarks and
  **+8.6% on finance tasks** vs strong baselines; adapts from execution
  feedback without labels ([arXiv:2510.04618](https://arxiv.org/abs/2510.04618),
  v1 Oct 2025, v3 Mar 2026). **[preprint; finance result is the most
  on-target datum for this system, but single-team, self-reported]**.
- **Continual-memory benchmarks**: LongMemEval (500 questions over sustained
  chat histories; commercial assistants drop ~30% accuracy cross-session;
  prescribes session decomposition + fact-augmented key indexing + time-aware
  query expansion, [arXiv:2410.10813](https://arxiv.org/abs/2410.10813), Oct
  2024, ICLR 2025) and LoCoMo (very-long-term dialogues, ~300 turns/35
  sessions; LLMs "substantially lag behind human performance" on temporal and
  causal dynamics, [arXiv:2402.17753](https://arxiv.org/abs/2402.17753), Feb
  2024). **[established benchmarks]** — they quantify exactly the failure the
  compounding engine exists to prevent.

### 2. Spaced repetition and memory science

- **FSRS is settled as the scheduling state of the art and it is still
  moving.** Built into Anki since 23.10, per-card D/S/R (difficulty,
  stability, retrievability) state fitted per user by ML
  ([Anki manual FAQ](https://faqs.ankiweb.net/what-spaced-repetition-algorithm),
  fetched). Research lineage: MaiMemo's papers at ACM KDD and IEEE TKDE
  (per the [fsrs4anki research-resources
  wiki](https://github.com/open-spaced-repetition/fsrs4anki/wiki/Research-resources),
  fetched). **[established, peer-reviewed]**.
- **The frontier is FSRS-7 and beyond.** The [SRS
  benchmark](https://github.com/open-spaced-repetition/srs-benchmark) (fetched;
  ~727M reviews from 10k Anki users, time-split evaluation) shows FSRS-7
  (fractional intervals, 8-parameter forgetting curve, per-preset/per-deck
  params, recency weighting) beating FSRS-6/-5/v4 on log loss — but a neural
  RWKV-Instant model tops the table (log loss 0.2773 vs 0.3370 for FSRS-7
  recency), at 2.7M parameters and no Anki integration. HLR (Duolingo
  half-life regression) and Ebisu (Bayesian half-life) sit far below FSRS.
  **[community benchmark, large-N, not peer-reviewed]**.
- **LLM-in-the-loop scheduling is simulated-only so far.** LECTOR uses LLM
  semantic similarity to de-interfere confusable items; 90.2% vs 88.4% success
  vs the best baseline — over 100 *simulated* learners
  ([arXiv:2508.03275](https://arxiv.org/abs/2508.03275), Aug 2025).
  **[preprint, simulation only — hype-adjacent]**.
- **LLM-generated card quality**: a Brown medical-school case study of
  LLM-authored Anki cards found, after rigorous prompt engineering, 1
  hallucination per 21 flashcards, 100% coverage of faculty learning
  objectives, no measurable exam-score difference, and 74% of users reporting
  time savings ([medRxiv
  10.1101/2025.05.13.25327518](https://www.medrxiv.org/content/10.1101/2025.05.13.25327518v1),
  May 2025). **[preprint, single institution, null efficacy result — supports
  "authoring aid, not replacement," and quantifies why a confirm pass is
  non-optional]**.

### 3. Research agents / deep research

- **Anthropic's production multi-agent architecture** (fetched
  [engineering post](https://www.anthropic.com/engineering/multi-agent-research-system)):
  orchestrator-worker with parallel subagents and a separate citation agent;
  +90.2% over a single agent on their internal research eval; ~15× the tokens
  of chat; three factors explain 95% of BrowseComp variance, with token usage
  alone at 80%. LLM-as-judge rubric: factual accuracy, citation accuracy,
  completeness, source quality, tool efficiency. **[vendor, production system;
  internally measured]**.
- **OpenAI deep research** (fetched
  [announcement](https://openai.com/index/introducing-deep-research/)): a
  browsing-specialized o3 variant trained end-to-end with RL on browsing
  tasks; SOTA on GAIA at launch; self-acknowledged weaknesses: hallucination,
  rumor-vs-authoritative confusion, and poor confidence calibration.
  **[vendor]**.
- **Stanford STORM / Co-STORM** — multi-perspective question-asking writes
  Wikipedia-grade outlines grounded in sources
  ([arXiv:2402.14207](https://arxiv.org/abs/2402.14207), Feb 2024, NAACL
  2024); Co-STORM adds a user-steerable multi-agent discourse with a dynamic
  mind map for "unknown unknowns" discovery — 70% of eval participants
  preferred it over a search engine
  ([arXiv:2408.15232](https://arxiv.org/abs/2408.15232), Aug 2024).
  **[peer-reviewed (STORM) / preprint (Co-STORM)]**.
- **PaperQA2** — literature-research agent matching or exceeding human experts
  on retrieval/summarization/contradiction-detection; wrote cited summaries
  more accurate than existing Wikipedia articles in their evaluation
  ([arXiv:2409.13740](https://arxiv.org/abs/2409.13740), Sep 2024).
  **[preprint; strong human-baseline methodology]**.
- **Benchmarks**: GAIA (real-world tool-use QA; humans 92% vs GPT-4+plugins
  15% at release, [arXiv:2311.12983](https://arxiv.org/abs/2311.12983)) and
  BrowseComp (1,266 hard-to-find-information questions from OpenAI,
  [arXiv:2504.12516](https://arxiv.org/abs/2504.12516), Apr 2025).
  **[established]** — these are the yardsticks deep-research products report
  against.

### 4. Forecasting and belief state

- **BLF (Bayesian Linguistic Forecaster)** — the paper our belief-state schema
  already implements: a ReAct search agent carrying a linguistic belief state
  (probability + structured evidence summary); best overall Brier among
  compared external agents on 400 ForecastBench question-date instances; only
  compared method to beat a crowd+empirical-prior baseline significantly
  ([arXiv:2604.18576](https://arxiv.org/abs/2604.18576), v1 Apr 2026, v5 Sep
  2026). **[preprint, actively revised — treat magnitude as preliminary]**.
- **Halawi et al.** — retrieval-augmented LM forecasting system nearing the
  human crowd aggregate; core recipe: retrieve, reason with base rates,
  aggregate many forecasts ([arXiv:2402.18563](https://arxiv.org/abs/2402.18563),
  Feb 2024, NeurIPS 2024). **[peer-reviewed venue; system results
  pre-cutoff-sensitive]**.
- **ForecastBench** — 1,000 always-future questions (leakage-free by
  construction); experts beat the top LLM, p<0.001; public leaderboard
  ([arXiv:2409.19839](https://arxiv.org/abs/2409.19839), ICLR 2025).
  **[peer-reviewed]**.
- **Metaculus AI Benchmark series** — quarterly bot-vs-pro tournaments; Q3
  2024: 55 bots, 10 Pros; Pros significantly better (p=0.036); bots showed a
  positive bias (when bots said 29%, events happened 12% of the time) and
  clustered near 50% ([Metaculus staff writeup on the EA
  Forum](https://forum.effectivealtruism.org/posts/E3hiRG68wc6zLWr6m/can-ai-outpredict-humans-results-from-metaculus-s-q3-ai),
  Oct 2024). **[official tournament analysis, not peer-reviewed]**.
- **Paleka et al., "Pitfalls in Evaluating Language Model Forecasters"** —
  catalogs temporal-leakage modes that inflate LLM forecasting claims and
  warns against extrapolating eval results to real forecasting
  ([arXiv:2506.00723](https://arxiv.org/abs/2506.00723), May 2025).
  **[preprint; the standing caveat for every forecasting claim above]**.

### 5. Knowledge graphs + personal knowledge bases

- **GraphRAG (Microsoft Research)** — LLM-built entity knowledge graph +
  hierarchical community summaries; beats vanilla RAG on *global sensemaking*
  questions ("what are the main themes in this corpus?") in the ~1M-token
  regime ([arXiv:2404.16130](https://arxiv.org/abs/2404.16130), Apr 2024).
  **[preprint + shipped OSS library; evaluation is QFS-style, not decision
  quality]**.
- **Zep/Graphiti** — temporally-aware knowledge graph engine for agent memory:
  edges carry validity intervals so facts are updated, not duplicated; beats
  MemGPT on DMR (94.8% vs 93.4%) and claims up to +18.5% accuracy on
  LongMemEval with 90% lower latency
  ([arXiv:2501.13956](https://arxiv.org/abs/2501.13956), Jan 2025).
  **[vendor-authored preprint — self-reported numbers]**. The bi-temporal
  idea (valid time vs transaction time) is the transplantable part.
- Our own PageRank-over-cards system (`~/dev/anki/graph/`) is the same family
  of idea — centrality over explicit links — already validated as a design
  choice in `docs/research/cross-repo-anki-synergy.md` §4.3 (precedented
  heuristic, keep it orthogonal to FSRS).

### 6. LLM-assisted Anki card authoring

Covered in thread 2 (medRxiv study; LECTOR). Additional practitioner evidence
already surveyed internally (`cross-repo-anki-synergy.md` §4.2): fully
autonomous generation produces trivia cards; the human-reviewable intermediate
artifact is the fix — which the JSONL staging design already implements. The
incremental frontier step is **LLM-as-judge pre-screening** before human
review, using the rubric style Anthropic reports as most consistent (single
judge, 0.0–1.0 rubric scores + pass/fail) [vendor, same fetched Anthropic
multi-agent post].

### 7. Finance-specific agents and benchmarks

- **FinRobot** — open-source multi-layer platform for equity-research agents
  (Financial CoT decomposition)
  ([arXiv:2405.14767](https://arxiv.org/abs/2405.14767), May 2024).
  **[preprint]**.
- **FinMem** — trading agent with a layered memory module (shallow/intermediate/
  deep) tuned to different data latencies; reported leading trading
  performance on its dataset
  ([arXiv:2311.13743](https://arxiv.org/abs/2311.13743), Nov 2023).
  **[preprint; trading returns self-reported, single-period backtests — do
  not trust the P&L, the memory layering is the idea]**.
- **AlphaAgents** — role-based fundamental/sentiment/valuation agents with
  debate for stock selection ([arXiv:2508.11152](https://arxiv.org/abs/2508.11152),
  Aug 2025). **[preprint]**. Already the template for our Phase 3 role split.
- **FinanceBench** — 10,231 open-book financial QA questions with evidence
  strings; GPT-4-Turbo + vector store incorrectly answered or refused 81% of
  sampled cases ([arXiv:2311.11944](https://arxiv.org/abs/2311.11944), Nov
  2023). **[established benchmark]** — the hard evidence that
  retrieval-over-filings QA fails without grounded tooling, which is what our
  vendored filings layer + confirm pass is for.
- **FinBen** — 36 datasets / 24 tasks; LLMs excel at extraction, struggle with
  forecasting and decision-making ([arXiv:2402.12659](https://arxiv.org/abs/2402.12659),
  Feb 2024). **[established benchmark]**.

## Candidate enhancements, ranked

Ranking criterion: compounding payoff per unit of new infrastructure, given
what already exists.

### Tier A — adoptable now with existing tooling

**A1. Session→skill distillation pass (ACE/AWM applied to `.agents/skills/`)**
The highest-leverage gap: sessions already produce docs/cards, but not
*procedures*. AWM (24.6–51.1% relative gains) and Voyager show agents compound
by distilling trajectories into reusable routines; ACE shows the mechanics
matter — incremental delta edits to an evolving playbook, not rewrites, to
avoid context collapse. ACE's +8.6% was specifically on a **finance**
benchmark.
*Plug-in:* extend fund's `.agents/skills/retro/SKILL.md` (and its
`~/dev/networking` analog) with an explicit "what did this session teach about
*how* to do X?" step whose output is a small diff to an existing SKILL.md or
AGENTS.md — delta-edit, never rewrite. No new code.
*Payoff:* the skill corpus becomes the Voyager-style skill library; every
repeated failure mode becomes a one-time cost.
*Cost/risk:* prompt-only change. Risk is skill bloat / staleness (networking's
AGENTS.md already documents the stale-scheduled-prompt failure mode); mitigate
by making the distillation step *edit existing skills* preferentially.
*Maturity:* [preprint] mechanics; pattern is established.

**A2. FSRS-state-aware card authoring (close the retention loop)**
FSRS-7's per-card D/S/R state already exists inside Anki; the SRS benchmark
shows optimized-per-user FSRS is meaningfully better than defaults. Today the
system uses PageRank to decide *what to add* but has no signal about *what was
actually retained*. AnkiConnect exposes per-card data, so a read-only bridge
can flag: high-PageRank hubs whose cards keep lapsing (author a better/denser
card), vs stable concepts (stop carding them).
*Plug-in:* new read-only verb in `~/dev/networking/tools/research/anki_graph_bridge.py`
(or a sibling script) joining `graph_data.json` hub labels with card review
state via AnkiConnect; surfaced as a "retention-gap hubs" section in
`/anki-capture` step 0 (fund `.agents/skills/anki-capture/SKILL.md`).
*Payoff:* card effort flows to the concepts that are both load-bearing
*and* not yet retained — the actual objective the deck serves.
*Cost/risk:* small Python, read-only, zero schema change. Keep the
PageRank ⊥ FSRS rule: FSRS state steers *authoring*, never overrides review
scheduling.
*Maturity:* [established] FSRS internals; the joining is novel but trivial.

**A3. LLM-as-judge pre-screen for staged cards**
The Brown med-ed study measured ~1 hallucination per 21 LLM-authored
flashcards even with careful prompting — our confirm pass exists for filings
anchors but not for card truth in general. Anthropic reports a single
LLM-as-judge with a rubric (accuracy, citation match, completeness, source
quality) as their most consistent scalable eval.
*Plug-in:* an optional review step in `/anki-capture` between validator and
human review: the host agent re-reads each staged card against its cited
source lines and scores the rubric; failures are rewritten before the human
sees the batch. No new code — the harness is the judge.
*Payoff:* fewer bad cards reach the human; the review step the pipeline
already mandates gets pre-filtered.
*Cost/risk:* one skill edit. Risk: judge = same model family as author
(correlated blind spots); mitigated by the existing hard gates + human review.
*Maturity:* [vendor-reported] technique; [preprint] efficacy evidence.

**A4. Automated resolution sweeps for dated predictions (tournament discipline)**
ForecastBench/Metaculus/BLF all treat *prospective, dated, scored* questions
as the only trustworthy signal. Our `predictions` arrays have binary
resolution criteria and live Brier, but resolution is manual. Paleka et al.
warn that leakage and lax resolution inflate forecasting claims.
*Plug-in:* a small scheduled check (fund `scripts/analysis/`, e.g. a weekly
GitHub Action or a `/ship`-adjacent chore) that scans unresolved predictions
in `data/analysis/<TICKER>.json` past their resolution date and opens a chat
task to resolve them against primary sources; rendered staleness badge in
`js/pages/analysis/lab.js`.
*Payoff:* the Brier track record stops depending on the human remembering to
score; the Lab's calibration view becomes honest.
*Cost/risk:* small Python + workflow; beware auto-resolution from non-primary
sources — keep resolution human-confirmed.
*Maturity:* [established] as tournament practice.

### Tier B — would require new infrastructure

**B1. Filings→cards manifest adapter + confirm pass (finish the data plane)**
Still the one "Missing" engine piece (`compounding-research-engine.md`
component table). FinanceBench's 81% wrong-or-refused rate for naive
retrieval over filings is the external proof that grounded extraction +
verified anchors are the whole game. The vendored layer
(`scripts/vendor/filings/`, adapter `scripts/analysis/filings_adapter.py`)
produces exactly the chunk metadata networking's manifest format expects.
*Plug-in:* adapter emitting `research/`-compatible chunk manifests from
processed filings (fund) → existing validator/density/import gates
(networking) → confirm pass re-verifying each card claim against the filing
section via the vendored read tools (host agent).
*Payoff:* a finite, coverage-trackable primary-source corpus feeding cards
with machine-checked provenance — the densest compounding surface available.
*Cost/risk:* the evaluation doc's §7 scope; a real build, not a prompt edit.
*Maturity:* [established] need; [preprint] tooling quality.

**B2. Multi-agent deep-research orchestration with a citation pass (Phase 3)**
The last "Missing" row in the component table. Anthropic's production evidence
(parallel subagents + separate citation agent, +90.2% internal) and the
AlphaAgents role split (fundamentals/sentiment/valuation debate) give the
architecture; PaperQA2 shows what rigorous citation-grounded output looks
like; OpenAI's own listed weaknesses (calibration, rumor discrimination) argue
for keeping our evidence-anchor gates.
*Plug-in:* new fund skill under `.agents/skills/` fanning a question to
parallel subagents over the vendored filings layer + `data/analysis/*.json`,
with the confirm pass before anything lands in `docs/thesis/`.
*Payoff:* breadth-first research (the case multi-agent actually wins) becomes
routine instead of heroic.
*Cost/risk:* ~15× token cost per Anthropic's numbers — reserve for
thesis-affecting questions; per Paleka, distrust any self-evaluation of
forecast quality.
*Maturity:* [vendor production] architecture; [preprint] finance specifics.

**B3. Bi-temporal thesis layer (Graphiti idea over git)**
Zep/Graphiti's transferable insight is temporal edges: facts have *valid
time* (when true) and *transaction time* (when we learned it). Our theses
evolve; git history gives transaction time for free, but the schema doesn't
mark when a claim stopped being true. GraphRAG shows community summaries
answer "what are the main themes" questions our per-ticker docs can't.
*Plug-in:* extend the belief-state schema in `data/analysis/<TICKER>.json` with
`valid_from`/`valid_to` on evidence items; a read-only indexer over
`docs/thesis/**` + `data/analysis/*.json` building a temporal claim graph
(could reuse `~/dev/anki/graph/builder.py` idioms); rendered as theme/
community summaries on the Lab page.
*Payoff:* "what did we believe, when, and when did it stop being true" becomes
a query, not an archaeology dig; theme-level views for the industry layer.
*Cost/risk:* schema migration + new index pipeline; GraphRAG community
summaries add LLM cost; vendor claims on Graphiti are self-reported.
*Maturity:* [vendor preprint]; conceptually sound, thin independent evidence.

### Tier C — bleeding-edge / unproven (watch, don't build)

- **C1. Neural schedulers beyond FSRS.** RWKV-Instant tops the SRS benchmark
  (log loss 0.277 vs 0.337 for tuned FSRS-7) but is a 2.7M-parameter model
  with no Anki integration and no interpretability. Watch for Anki/FSRS-8
  absorbing the gains; adopt only when shipped upstream.
- **C2. LLM-in-the-loop scheduling (LECTOR).** Semantic-interference-aware
  scheduling is plausible for a deck dense with near-duplicate networking
  concepts, but the only evidence is simulated learners. Do not build.
- **C3. Prediction-market priors for theses.** Pulling Metaculus/Polymarket
  community prices as base rates for thesis-relevant questions (e.g. AI
  capex, rate paths) follows Halawi's "anchor on the crowd" recipe — but
  equity-specific efficacy is untested, and Paleka's leakage critique applies
  to any self-evaluation. Cheap to try manually in a thesis session; no
  automation yet.
- **C4. Full MemGPT/Letta-style runtime.** Validated pattern, wrong
  abstraction for this setup — the repos + git already are the memory store
  (per the Anthropic memory-tool design), and the filings evaluation already
  rejected adopting a second agent runtime on the same grounds.

## Open questions / what I could not verify

1. **Metaculus contest-rules page returned HTTP 403** this session; tournament
   facts above come from Metaculus staff's EA Forum writeup (fetched), not the
   rules page itself. Later-quarter results (bots approaching pros) are known
   only from search snippets — unverified, not cited as fact.
2. **ACE's +8.6% finance result** is from a single preprint (v3 Mar 2026) with
   self-reported AppWorld standing; no independent replication found.
3. **Graphiti/Zep numbers** (DMR 94.8%, LongMemEval +18.5%) are vendor-authored;
   no third-party replication located.
4. **FinMem/FinRobot/AlphaAgents performance claims** are self-reported
   preprints with period-limited backtests; only the architectural patterns
   (memory layering, role split) are recommended for adoption.
5. **LLM-authored flashcard evidence is thin and medical-education-scoped**
   (one preprint, null exam-score effect); nothing rigorous exists for
   finance/industry-mechanics card quality.
6. **LECTOR and other LLM-schedulers** rest on simulation; no human-deployment
   data.
7. **Whether FSRS-7's per-deck parameter split should apply to the unified
   金融 deck** (theory + industry cards in one deck) is untested — a real
   question for the anki repo, not answerable from literature.
8. **BLF is one actively-revised 2026 preprint**; its belief-state ablation
   magnitude (already cited internally) should be treated as preliminary
   pending independent replication.
