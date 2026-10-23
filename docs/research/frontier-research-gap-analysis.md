# Frontier Research Gap Analysis — our engine vs. top research institutions

**Status: Findings / Recommendation**
**Date: 2026-10-23**
**Question:** What are the gaps between this repo's "deep research engine" (an agentic
investment-research pipeline for a personal fund) and the research processes of absolute
top/frontier financial research institutions (Bridgewater, Two Sigma, Citadel,
Renaissance, top sell-side desks, SemiAnalysis as a primary-source research shop)?

## Executive summary

The honest answer: our engine is already at or near the frontier on the _epistemic
discipline_ layer — primary-source anchoring with a machine-checkable confirm pass,
dated falsifiable predictions, a sequential evidence log, and git-versioned memory are
practices most sell-side desks do not implement as rigorously (and Deep FinResearch
Bench shows even frontier commercial deep-research agents "still fall short" of
financial professionals on rigor, forecasting accuracy, and claim verifiability —
[arXiv:2604.21006](https://arxiv.org/abs/2604.21006)). The real gaps are concentrated in
three places: **(1) data** — frontier shops buy or build proprietary measurement
(SemiAnalysis runs a teardown lab, tracks 5,000+ datacenters via permits/FOIA/satellite
imagery; Citadel staffs central alternative-data teams), while we read SEC filings and
curated public web; **(2) model granularity** — frontier research is built bottom-up
from drivers (bills of materials, wafer starts, cluster power budgets), while our
valuation layer is a three-scenario EPS-CAGR/exit-P/E abstraction; and **(3) process
machinery around the judgment** — prospective scoring (Brier tournaments), division of
labor (analyst/PM/risk separation, red teams), and monitoring cadence. Of these, only
(3) is cheaply closable by a one-person agentic fund; (1) is closable only at the
margin (transcripts, conference proceedings, structured public datasets); (2) is
closable for 2–3 highest-conviction names only. The structural disadvantages —
management access, expert networks, paid alternative data, coverage breadth, execution
speed — should be deliberately _not_ pursued.

## Part 1 — What our engine actually is

Repo-cited characterization of the current pipeline.

### Architecture

- **Two core skills.** `/deep-research` (`.agents/skills/deep-research/SKILL.md`) is an
  orchestrator-worker fan-out over three read-only subagents (SEC filings via
  `scripts.analysis.filings_adapter`, internal state, primary web), followed by a
  synthesis pass, a deterministic confirm pass (confidence ≥ 0.60), and a persisted
  findings doc in `docs/research/tickers/`. It is explicitly reserved for
  thesis-affecting questions because multi-agent fan-out costs "~15× tokens" vs chat
  (guardrail in the skill, sourced from Anthropic's production numbers). `/thesis-update`
  (`.agents/skills/thesis-update/SKILL.md`) is the incremental path: interpret new
  material in-chat, run the confirm pass on empirical claims, apply surgical patches to
  `docs/thesis/<TICKER>.md` + `data/analysis/<TICKER>.json`, append to
  `<TICKER>.evidence.jsonl`, gate on tests.
- **Design invariant:** "LLM authors, code gates" — every durable artifact (findings
  docs, thesis patches, belief-state JSON, evidence.jsonl, decision-journal entries) is
  git-reviewed; the UI never writes state (`docs/research/compounding-research-engine.md`).
- **Durable state per ticker** (`data/analysis/CBRS.json` as the concrete instance):
  `belief_state` (probability, confidence, evidence_for/against, open_questions,
  as_of), `predictions` (dated, binary resolution criteria, probability — e.g.
  `cbrs-q3-2026-core-revenue`, P=0.55, target 2026-11-30), `decision_journal`
  (action/situation/alternatives_rejected/expected_outcomes/review_date), and
  three-scenario valuation (bull/base/bear with `epsCagr` and `exitPe`). The Lab page
  replays evidence.jsonl into posterior trajectories and renders Brier/fan/Kelly views
  (`js/pages/analysis/bayes.js`, per `docs/research/compounding-research-engine.md` WO-7).
- **Filings tooling** (`scripts/analysis/filings_adapter.py`, 684 lines;
  `docs/filings-adapter.md`): verbs `ingest, list, sections, read, export-manifest,
verify, candidates` over a vendored SEC toolkit. Known limits (documented):
  `verify` is coarse grounding (numeric-anchored confidence 0.60/0.80/0.95, "not
  proof"), silently defaults to the newest filing when `--doc` is omitted, `sections`
  prints only 25 of N sections, and large HTML S-1/424B4 prospectuses have no processor
  (workaround: direct text extraction of the cached `.htm`).

### What it does well (evidence: the Cerebras runs)

- **Primary-source anchoring at sell-side-or-better rigor.** The initial CBRS findings
  doc (`docs/research/tickers/cerebras-systems.md`) tags every claim CONFIRMED / Primary
  / SECONDARY / UNVERIFIED with filing locators (e.g. `10-Q fil_0001628280-26-056357
s_0001_c06`); 6/6 key quantitative claims passed the confirm pass at 80%.
- **Self-correction.** The follow-up run (`docs/research/tickers/cerebras-customer-economics.md`)
  explicitly retracts two earlier claims ("Trainium-3 prefill + Cerebras decode" role
  split not stated in filings; Bedrock Q1 2027 is press-only) — a corrections culture
  most research products lack.
- **Dated falsifiable predictions + decision journal** (`data/analysis/CBRS.json`
  predictions and decision_journal arrays), with review dates that force revisits.
- **Adversarial discipline rules:** probabilities move only on specified catalysts
  ("the SemiAnalysis original or the Q3 print"), not on price action or commentary
  (decision journal, 2026-10-23 entry).

### Structural limits

- **Universe: 6 tickers** (`data/analysis/`: AEHR, ANET, CBRS, GOOG, PDD, VT, plus
  `watchlist.json`); research is reactive (question-triggered), not a monitoring sweep.
- **Prediction resolution is manual** — `docs/research/frontier-enhancements.md` (A4/WO-5)
  notes "resolution is manual" and no resolution tooling exists; Brier scores depend on
  the human remembering to score.
- **Valuation granularity:** scenarios are single-point EPS CAGR + exit P/E with a
  prose note; there is no driver-based revenue build, no quarterly cadence, no
  reconciliation against reported results.
- **Single-agent judgment:** the same model family writes, verifies, and scores;
  the confirm pass is keyword/numeric grounding, not an independent second analyst
  (`docs/filings-adapter.md` §Confirm-pass semantics).
- **Retrieval plane is filings + curated web only** — no transcripts pipeline, no
  alternative data, no conference/standards corpus, no expert input.

## Part 2 — What frontier institutions actually do (primary sources)

### Bridgewater Associates

- Research is a _daily production system_: "Bridgewater's Daily Observations, the
  firm's daily research publication" is authored by named investment staff and read by
  policymakers ([bridgewater.com people pages](https://www.bridgewater.com/working-at-bridgewater/nina-investment-associate)).
- Research is _systemized into trading strategies_: the Co-CIO "oversees the
  systemization of Bridgewater's research into trading strategies" and manages
  proprietary investment models
  ([Karen Karniol-Tambour bio](https://www.bridgewater.com/people/karen-karniol-tambour)).
- A dedicated AI research venture: AIA Labs, "a dedicated in-house venture" applying
  AI/ML to markets, run under the co-CIO
  ([Greg Jensen bio](https://www.bridgewater.com/people/greg-jensen)); a 20+-person
  AI/ML investment-strategy team
  ([Nina Lozinski bio](https://www.bridgewater.com/people/nina-lozinski-named-to-forbes-30-under-30)).
- Public research templates: "How the Economic Machine Works" debt-cycle template at
  [economicprinciples.org](https://www.economicprinciples.org/).

### Two Sigma / Citadel / D.E. Shaw / Renaissance

- **Two Sigma** runs a public research operation tied to the academic frontier —
  published paper surveys from ICML/NeurIPS, academic partnerships
  ([twosigma.com/type/research](https://www.twosigma.com/type/research/),
  [ICML 2025 highlights](https://www.twosigma.com/articles/icml-2025-key-ideas-on-llms-human-ai-alignment-and-more/)).
- **Citadel** (fundamental equities + central data teams): job postings are primary
  evidence of process — Investment Associates "focus on a small number of stocks",
  "build and maintain detailed financial models; work with data sources to build their
  insight into company fundamentals"
  ([International Equities intern posting](https://www.citadel.com/careers/details/international-equities-intern-asia/));
  a central team of Sector Data Scientists delivers "data checks, tracker enhancements"
  with "broad exposure to alternative data"
  ([Sector Data Scientist posting](https://www.citadel.com/careers/details/sector-data-scientist-central-team/));
  career-perspectives piece:
  [How Alternative Data Powers Investment Decisions at Citadel](https://www.citadel.com/careers/career-perspectives/real-people-real-impact-how-alternative-data-powers-investment-decisions-at-citadel/).
- **D.E. Shaw** publishes a research Library spanning "finance, economics, and
  technology" ([deshaw.com/library](https://www.deshaw.com/library)); its strategies
  "run on quantitative and computational techniques developed by the firm over more
  than 35 years of research and trading"
  ([Investment Management](https://www.deshaw.com/what-we-do/investment-management)).
- **Renaissance Technologies** — no official research-process publications exist;
  the firm's site carries no research pages. Everything known about internals comes
  from a secondary book-length account (Zuckerman, _The Man Who Solved the Market_).
  **All Renaissance-internal claims in this doc are UNVERIFIED and intentionally omitted.**

### SemiAnalysis (primary-source research shop)

From the first-party [FAQ/about page](https://semianalysis.com/faq/):

- **Proprietary measurement, not just reading:** "analyst networks across the industry,
  on-the-ground work at 40+ conferences a year, and a teardown lab that takes
  leading-edge hardware apart".
- **Fourteen institutional industry models**, bottoms-up and _reconciled against each
  other_, "updated as the industry moves rather than on a reporting calendar" — e.g.
  the Accelerator & HBM Model (SKU-level shipments/ASPs/specs, forecasts to 2030,
  history to 2021, quarterly), the Foundry Model ("back-tested against reported results
  each quarter"), the AI Cloud TCO Model (per-accelerator benchmarks + a full
  three-statement cluster-finance suite), the VR NVL72 rack bill-of-materials model.
- **Alternative data at scale:** the Datacenter Industry Model tracks "more than five
  thousand tracked facilities" using "property records, permits, power usage, FOIA
  requests, and frequent satellite imagery, with computer vision models" accelerating
  the reads.
- **Revenue derivable from the builds:** "revenue for many upstream and downstream
  companies can be estimated directly from the data" — the model layer _is_ the
  equity-research layer.

### Sell-side top desks

Goldman Sachs Research publishes company coverage with ratings and price targets,
economist-driven macro forecasts, and a documented institutional history asserting
"the quality, integrity and commercial impact" of research as the cornerstone of the
business ([GS Research history PDF](https://www.goldmansachs.com/what-we-do/research/the-history-of-goldman-sachs-research.pdf);
e.g. [HALO framework note](https://www.goldmansachs.com/insights/goldman-sachs-research/the-halo-effect-heavy-assets-low-obsolescence-in-the-ai-era)).
The differentiators vs. our engine are management/conference access, sector-analyst
specialization, and earnings-cycle cadence — none of which are visible artifacts we can
replicate, so they are noted here as structural, not process, gaps.

### Academic forecasting and agentic-research literature

- **Tetlock / Good Judgment Project:** tournament-winning recipe = probability
  training, teaming, and aggregation of forecasters selected by _prospective Brier
  score_ (Mellers et al., _Psychological Science_ 2014,
  [doi:10.1177/0956797614524255](https://doi.org/10.1177/0956797614524255));
  superforecasters are identified by scored track records and "grown through training,
  teams and practice" (Mellers et al. 2015, _Perspectives on Psychological Science_).
  The core discipline: forecasts you can be measurably wrong about, resolved
  prospectively on a fixed deadline.
- **LLM forecasting pitfalls:** Paleka et al. catalog temporal-leakage modes that
  inflate LLM forecasting claims ([arXiv:2506.00723](https://arxiv.org/abs/2506.00723));
  our deep-research skill already encodes this ("never self-evaluate forecast quality
  or Brier scores within the research agent"). ForecastBench (1,000 always-future
  questions; experts beat the top LLM, p<0.001;
  [arXiv:2409.19839](https://arxiv.org/abs/2409.19839)) and Halawi et al. (retrieval +
  base rates + aggregation nearing the human crowd;
  [arXiv:2402.18563](https://arxiv.org/abs/2402.18563)) — both already surveyed in
  `docs/research/frontier-enhancements.md`.
- **LLM analyst benchmarks (2025–2026):** Deep FinResearch Bench evaluates deep-research
  agents against financial professionals on qualitative rigor, quantitative
  forecasting/valuation accuracy, and claim credibility — "AI-generated reports still
  fall short across these dimensions" ([arXiv:2604.21006](https://arxiv.org/abs/2604.21006)).
  FinRpt formulates equity-research-report generation with its own evaluation system
  ([arXiv:2511.07322](https://arxiv.org/abs/2511.07322)); StockBench shows most LLM
  agents fail to trade profitably in contamination-free multi-month backtests
  ([arXiv:2510.02209](https://arxiv.org/pdf/2510.02209)). Read together: agentic
  research is not yet at professional-analyst quality on average — which makes our
  confirm-pass discipline a genuine differentiator, not table stakes.
- **Agentic architecture reference:** Anthropic's production multi-agent research
  system — orchestrator-worker with parallel subagents + a separate CitationAgent;
  "+90.2%" over a single agent on an internal research eval; ~15× the tokens of chat;
  token usage alone explains 80% of BrowseComp variance; LLM-as-judge rubric covering
  factual accuracy, citation accuracy, completeness, source quality, tool efficiency
  ([anthropic.com/engineering/multi-agent-research-system](https://www.anthropic.com/engineering/multi-agent-research-system)).
  Our `/deep-research` skill is a direct, deliberate port of this architecture
  (`.agents/skills/deep-research/SKILL.md` cites it as design context).

## Part 3 — Gap analysis by dimension

Verdicts: **CLOSABLE** = feasible for a one-person agentic fund this quarter;
**PARTIAL** = closable at the margin; **STRUCTURAL** = do not pursue.

### 1. Data breadth

- **Frontier has:** teardown labs and analyst networks (SemiAnalysis FAQ); permit/FOIA/
  satellite pipelines over 5,000+ datacenters with computer-vision reads (same FAQ);
  central alternative-data teams and "data checks, tracker enhancements" (Citadel
  postings); management access and earnings-cycle conference access (sell-side).
- **We have:** SEC EDGAR via the vendored filings layer (latest filing per form only;
  no 8-K exhibit 99.1, no S-1 processor — `docs/filings-adapter.md` §Known gaps), plus
  curated primary web fetched during a run. No transcripts pipeline, no conference
  corpus, no alternative data, no expert input.
- **Verdict: PARTIAL.** Paid alt-data and expert networks are structural; but
  _transcripts_, conference proceedings (Hot Chips, OFC), standards bodies, and
  government datasets (FERC/permits, customs) are public and scrapable — we already use
  some ad hoc (Hot Chips blog cited in `docs/research/tickers/cerebras-systems.md`).
- **Cheapest concrete move:** add an earnings-call-transcript verb to the retrieval
  plane (company IR pages post transcripts/slides every quarter) and a per-holding
  quarterly "all primary sources since last run" checklist in the deep-research skill.

### 2. Financial modeling

- **Frontier has:** bottom-up driver models reconciled against each other and
  back-tested quarterly — BoM-level rack builds, wafer-start-to-revenue chains,
  three-statement cluster-finance suites (SemiAnalysis FAQ, model-by-model); detailed
  per-name financial models maintained by dedicated analysts (Citadel IA postings).
- **We have:** a three-scenario abstraction — bull/base/bear with a single `epsCagr`
  and `exitPe` plus a prose note (e.g. CBRS base: "Revenue ~$4.5B by 2031 at ~18% core
  net margin"; `data/analysis/CBRS.json`). No quarterly cadence, no driver build, no
  back-test against prints.
- **Verdict: PARTIAL.** A full SemiAnalysis-style model suite is a 60-person team;
  but a _single driver-based revenue build for the 2–3 highest-conviction names_ (e.g.
  ANET revenue from hyperscaler capex × networking attach; CBRS revenue from MW
  delivered × utilization × price per token-hour) is within reach and directly upgrades
  the scenario notes from assertion to derivation.
- **Cheapest concrete move:** add a `drivers` block (units × price, with sources) to
  one scenario of one holding as a pilot, and require new scenario notes to name the
  2–3 drivers that would falsify them.

### 3. Forecast discipline

- **Frontier has:** prospective Brier-scored tournaments with fixed deadlines, team
  aggregation, extremization (Mellers et al. 2014,
  [doi:10.1177/0956797614524255](https://doi.org/10.1177/0956797614524255));
  ForecastBench/Metaculus-style always-future, leakage-free scoring
  ([arXiv:2409.19839](https://arxiv.org/abs/2409.19839)).
- **We have:** dated predictions with binary resolution criteria and live Brier
  rendering — but **manual resolution** and no aggregate calibration review;
  `docs/research/frontier-enhancements.md` (A4/WO-5) already designed the fix
  (`scripts/analysis/prediction_sweeper.py` + weekly workflow + Lab staleness badge)
  and it is not yet built.
- **Verdict: CLOSABLE — the single cheapest high-leverage gap.** The schema, scoring
  code (`js/pages/analysis/bayes.js`), and work-order spec all exist.
- **Cheapest concrete move:** implement WO-5 (5a/5b/5c) from
  `docs/research/frontier-enhancements.md` — scanner + weekly GitHub Action + badge.
  Add a quarterly calibration review line to the retro skill.

### 4. Verification

- **Frontier has:** multi-person editorial/compliance review, independence between
  analyst and checker, source-quality hierarchies enforced by humans; sell-side
  compliance sign-off as a legal function (no legal interpretation here — reported as
  process description only).
- **We have:** a deterministic confirm pass (numeric-anchored spans, ≥0.60) that is
  genuinely stronger than nothing and caught real errors — but it is keyword grounding,
  not proof (`docs/filings-adapter.md`: "Treat it as coarse grounding, not proof"), and
  the _same model family_ authors, verifies, and judges (correlated blind spots, noted
  in `docs/research/frontier-enhancements.md` WO-3 guardrail).
- **Verdict: CLOSABLE at the margin.** We cannot buy independence, but we can
  de-correlate: run the confirm/judge pass with a different model family than the
  author, and keep the SECONDARY/UNVERIFIED tagging discipline that already worked in
  the CBRS run.
- **Cheapest concrete move:** one line in the deep-research skill requiring the confirm
  pass and final review to run in a _fresh context with a different model_ where the
  harness allows; keep human review as the final gate (Anthropic's own finding:
  "Human evaluation catches what automation misses",
  [multi-agent post](https://www.anthropic.com/engineering/multi-agent-research-system)).

### 5. Speed & coverage

- **Frontier has:** continuous monitoring — daily research publication (Bridgewater
  Daily Observations), models "updated monthly or faster, with interim updates when the
  market moves" (SemiAnalysis FAQ), hundreds of covered names per desk.
- **We have:** 6 tickers (`data/analysis/`), a nightly market-data sync
  (`analysis-sync.yml`, per `docs/ai_update_flow.md` §1.1), and question-triggered
  deep research. Nothing watches for thesis-relevant events between runs.
- **Verdict: PARTIAL, and mostly _should not_ be closed as breadth.** A one-person
  fund's edge is concentration and depth (the CBRS decision journal explicitly rejects
  event-timing bets). What _is_ worth closing: event-detection cadence on the existing
  6 names (new filing, earnings date, lockup window) so monitoring is not purely
  human-initiated.
- **Cheapest concrete move:** extend the nightly sync or the WO-5 weekly workflow to
  flag new EDGAR filings and approaching prediction/decision-journal review dates for
  tracked tickers (read-only flags; never auto-write thesis state).

### 6. Memory / compounding

- **Frontier has:** decades of institutional research libraries and systemized
  playbooks (D.E. Shaw's "35 years of research and trading"; Bridgewater's
  systemization of research into strategies); SemiAnalysis ships "update notes" with
  every model release — a versioned research memory.
- **We have:** genuinely strong primitives — git-versioned findings/thesis docs,
  `belief_state`, sequential `*.evidence.jsonl` with valid_from/valid_to, decision
  journals, Anki distillation with PageRank ranking
  (`docs/research/compounding-research-engine.md`). Missing: _procedural_ memory
  (sessions produce docs, not reusable skill deltas — the ACE/AWM gap identified in
  `docs/research/frontier-enhancements.md` A1) and retention feedback (A2).
- **Verdict: CLOSABLE.** This is our home-field advantage — most institutions'
  libraries are worse-structured than our git ledger.
- **Cheapest concrete move:** implement the already-specified WO-1/WO-4 (skill
  distillation step in `/retro`; retention-gap hubs in `/anki-capture`) from
  `docs/research/frontier-enhancements.md`.

### 7. Division of labor

- **Frontier has:** analyst / PM / risk-manager separation, red teams, and teams of
  specialists per sector (Citadel structure in its postings; Bridgewater's Investment
  Committee); tournament aggregation of independent forecasters (Mellers 2014).
  Anthropic's finding that parallel subagents give "separation of concerns" and reduce
  path dependency is the agentic analogue
  ([multi-agent post](https://www.anthropic.com/engineering/multi-agent-research-system)).
- **We have:** an orchestrator + filings/internal/web subagents — parallel _coverage_,
  but no adversarial _roles_. No dedicated bear-case/red-team subagent, no independent
  risk view; the AlphaAgents-style role split (fundamentals/sentiment/valuation debate)
  is named as the Phase-3 template in `docs/research/frontier-enhancements.md` but the
  implemented skill fans out by _source_, not by _stance_.
- **Verdict: CLOSABLE — cheap.** Prompt-only change to the skill.
- **Cheapest concrete move:** add a fourth subagent to `/deep-research`: a red-team
  whose brief is to attack the synthesis's three load-bearing claims and enumerate what
  would falsify them, with output recorded in the findings doc's open-questions
  section.

### 8. What we should NOT try to close (structural)

- **Management access, expert networks, channel checks** — paid, relationship-based,
  and legally sensitive; no agentic pipeline replicates them.
- **Paid alternative data at scale** (satellite, credit panels, app telemetry) —
  budget-structural.
- **Execution speed, market microstructure, intraday signals** — irrelevant to a
  5-year-horizon scenario fund; pursuing it is pure waste (Renaissance's domain, and
  even its internals are UNVERIFIED public knowledge).
- **Coverage breadth** (hundreds of names) — a 15×-token fan-out per name makes
  breadth economically irrational for a one-person fund; the correct response to
  breadth pressure is the watchlist mechanism that already exists
  (`data/analysis/watchlist.json`).
- **Sell-side distribution/compliance machinery** — we have no clients; the only
  consumer of the research is the portfolio.

## Action items

**Status check (verified in the working tree on 2026-10-23):** items 1 and 5 of the
original ranking are **already shipped** — `scripts/analysis/prediction_sweeper.py`,
`.github/workflows/prediction-sweep.yml`, the Lab stale badge
(`js/pages/analysis/lab.js:1727-1749`), the `/retro` ACE step
(`.agents/skills/retro/SKILL.md:46`), and the retention bridge
(`~/dev/networking/tools/research/anki_retention.py` + `/anki-capture` step 0b) all
exist. The work orders below cover what remains, re-ranked by expected impact.

### Preamble — rules for the implementer

- One work order per change. `Find` strings are unique anchors copied from the current
  file contents (verified 2026-10-23); **if one does not match exactly, STOP that item
  and report the mismatch — do not improvise an alternative anchor.** Line numbers are
  dated and may drift; trust the `Find` string, not the line number.
- WO-1 through WO-3 all edit `.agents/skills/deep-research/SKILL.md`. After **each**
  skill edit run `make sync-check` — it regenerates `.claude/commands/` and fails on
  drift; if the first run reports drift, run it again and the second run must be green.
  Never edit `.claude/commands/` by hand.
- Markdown check per edit:
  `npm exec -- markdownlint-cli2 ".agents/skills/deep-research/SKILL.md"`.
  Skill schema check: `venv/bin/pytest tests/python/test_skills.py -q`.
- Never edit `data/` (pipeline-generated).
- Commit after each item; never push.

### WO-1 [low] — red-team subagent in `/deep-research`

- **File:** `/Users/lz/dev/fund/.agents/skills/deep-research/SKILL.md`
- **Find:**

    ```text
        - **Web subagent:** Investigates primary external sources only: regulatory disclosures,
          investor relations presentations, earnings call transcripts, and industry standards bodies.
          Secondary blog posts and unverified aggregators are excluded.

    2. **Synthesis pass:** Consolidate subagent outputs into a coherent claim-to-source mapping.
    ```

- **Change:** insert the red-team bullet between the web bullet and step 2, and extend
  step 2's first sentence, so the block becomes:

    ```text
        - **Web subagent:** Investigates primary external sources only: regulatory disclosures,
          investor relations presentations, earnings call transcripts, and industry standards bodies.
          Secondary blog posts and unverified aggregators are excluded.
        - **Red-team subagent:** Same question, adversarial stance. Argue the strongest case
          AGAINST the thesis's current position (`data/analysis/<TICKER>.json` belief_state is
          its target), attack the load-bearing claims the other subagents' outputs rest on,
          and enumerate falsifiers — what specific evidence would flip the conclusion.
          Reports disconfirming evidence first, ranked by thesis-killing potential.

    2. **Synthesis pass:** Consolidate all four subagent outputs into a coherent claim-to-source
       mapping. The red team's disconfirming case must survive into the findings doc as its
       own section — do not average it away.
    ```

- **Verify:** `make sync-check` (second run green if the first regenerates);
  `npm exec -- markdownlint-cli2 ".agents/skills/deep-research/SKILL.md"`;
  `venv/bin/pytest tests/python/test_skills.py -q`.
- **Guardrail:** the red team works from the question and primary sources, in parallel
  with the other three — do not feed it the sibling subagents' outputs, or its blind
  spots correlate with theirs.

### WO-2 [trivial] — fresh-context confirm pass

- **File:** `/Users/lz/dev/fund/.agents/skills/deep-research/SKILL.md`
- **Find:**

    ```text
    3. **Confirm pass:**
        - Verify every quantitative claim against SEC filings using
    ```

- **Change:** insert between those two lines:

    ```text
        - Run in a **fresh context** (a new subagent or a cleared session): the agent that
          synthesized the claims never verifies its own synthesis.
    ```

- **Verify:** same as WO-1.
- **Guardrail:** "fresh context" means the verifying context has not seen the synthesis
  reasoning — re-running `verify` in the same session does not count.

### WO-3 [trivial] — quarterly primary-source sweep section

- **File:** `/Users/lz/dev/fund/.agents/skills/deep-research/SKILL.md`
- **Find:** `## Guardrails`
- **Change:** insert immediately before that line:

    ```text
    ## Quarterly primary-source sweep

    Once per quarter per covered ticker — and always before a thesis-affecting run on a
    subject that has reported since the last sweep — the web subagent's source list must
    include the latest earnings-call transcript and any investor/analyst-day deck from the
    company's IR site. These are the highest-signal primary sources this pipeline otherwise
    touches only ad hoc. Management Q&A language is primary evidence for guidance intent
    and capital-allocation posture, never for hard numbers (those anchor to filings).

    ```

- **Verify:** same as WO-1.
- **Guardrail:** `## Guardrails` must match exactly once in the file; if it matches
  anything else, STOP.

### WO-4 — driver-based model pilot (ANET) — designed 2026-10-23

Schema constraint discovered during design (verified against the working tree):
`sync_configs.py:485-501` rebuilds every scenario from a **fixed key set** (`id`,
`name`, `prob`, `macroState`, `growth`, `valuation`, `notes`) — a `drivers` key added
to a scenario today would be **silently deleted by the nightly sync**. Same whitelist
on `belief_state` (`:524-530`). But `predictions` passes through untouched (`:533-534`),
and a passthrough-test precedent already exists
(`tests/python/test_sync_configs_scenario_passthrough.py`, the `macroState` tests).
So the pilot needs one small code change (4a) before any data change (4c) can stick.

#### WO-4a [low] — pass `drivers` through the scenario whitelist

- **File:** `/Users/lz/dev/fund/scripts/analysis/sync_configs.py`
- **Find:**

    ```python
        normalized.append(
            {
                'id': scenario_id,
                'name': name,
                'prob': prob,
                'macroState': scenario.get('macroState'),
    ```

- **Change:** make the appended dict a variable, then conditionally attach `drivers`
  only when present (an unconditional `'drivers': scenario.get('drivers')` would add
  `drivers: null` to every ticker's scenarios — shape churn across the repo):

    ```python
        entry = {
            'id': scenario_id,
            'name': name,
            'prob': prob,
            'macroState': scenario.get('macroState'),
            'growth': {...},          # unchanged
            'valuation': {...},       # unchanged
            'notes': notes,
        }
        if scenario.get('drivers') is not None:
            entry['drivers'] = scenario['drivers']
        normalized.append(entry)
    ```

- **Tests:** add to `tests/python/test_sync_configs_scenario_passthrough.py` following
  the `macroState` tests verbatim: (1) a scenario with a `drivers` dict survives
  `ensure_structure` unchanged; (2) a scenario without `drivers` produces **no**
  `drivers` key in the output.
- **Verify:** `venv/bin/pytest tests/python/test_sync_configs_scenario_passthrough.py
tests/python/test_sync_configs_currency.py tests/python/test_sync_configs_watchlist.py -q`
- **Guardrail:** the sync runs nightly via `analysis-sync.yml`; without test (1) a
  regression here silently erases the pilot's data.

#### WO-4b [trivial] — reconciliation ritual in `/thesis-update`

- **File:** `/Users/lz/dev/fund/.agents/skills/thesis-update/SKILL.md`
- **Find:** the Step 3 synthesis bullet `- **Scenario Impact**:` block — append one
  sub-bullet to its assessment list:

    ```text
        - If any scenario carries a `drivers` block: reconcile its derived values against
          the new print (actual vs modeled revenue per driver), update driver inputs with
          sources, and register each named falsification driver as a dated entry in
          `predictions` so `prediction_sweeper.py` enforces resolution.
    ```

- **Verify:** `make sync-check` (second run green if the first regenerates);
  `npm exec -- markdownlint-cli2 ".agents/skills/thesis-update/SKILL.md"`.
- **Guardrail:** `data/` edits still happen only through the thesis-update flow; this
  line changes the ritual, not the write path.

#### WO-4c [thesis session] — the ANET pilot itself

Not a mechanical work order — one thesis session with the main agent:

1. In `data/analysis/ANET.json`, add to the **base** scenario only:

    ```json
    "drivers": {
        "revenueBuild": [
            {"id": "<driver-id>", "label": "<name>", "formula": "<units × price expression>",
             "inputs": {"<var>": <number>}, "valueB": <number>, "sources": ["<filing locator or URL>"]}
        ],
        "derivedRevenueB": <sum of valueB>,
        "netMargin": <number>,
        "sharesM": <number>,
        "derivedEps": <derivedRevenueB * 1000 * netMargin / sharesM>,
        "falsifiers": ["<prediction ids>"],
        "asOf": "<date>"
    }
    ```

    Suggested ANET base-case drivers (labels from the gap analysis §3.2): AI back-end
    Ethernet (hyperscaler AI capex × networking attach), classic DC growth, campus —
    numbers come from Arista 10-K/10-Q segment disclosures and investor-day targets via
    the filings adapter (`ingest --ticker ANET` first if `list` errors), each with a
    confirm pass ≥ 0.60.

2. Register 2–3 dated falsification-driver predictions in ANET's existing
   `predictions` array (which the sweeper already scans).
3. Update `docs/thesis/ANET.md` §4.3 so the base-case note presents the derivation
   (driver build → revenue → margin → EPS) instead of the bare assertion, and append
   the evidence to `data/analysis/ANET.evidence.jsonl`.
4. Run `sync_configs --ticker ANET` and confirm the `drivers` block survives — the
   end-to-end test of WO-4a.

- **Verify:** `npx jest tests/js/pages/analysis/ && venv/bin/pytest
tests/python/test_sync_configs_scenario_passthrough.py -q`.
- **Guardrail:** pilot stays on ANET base only — do not propagate the schema to other
  tickers or scenarios until the pilot has survived one quarterly reconciliation.
  No Lab rendering in the pilot (unknown scenario keys are ignored by the frontend;
  display is a later `[visual]` item).

### WO-5 [skip] — event-detection flags on the tracked universe

Needs design (which events, where they surface, dedup against the nightly sync).
The dated-prediction slice of this idea already shipped as `prediction-sweep.yml`.
Pointer: this doc's Part 3 §5 (speed & coverage) and original item 6.

## Open questions / what I couldn't verify

1. **Renaissance Technologies internals** — no official research-process material
   exists; everything public is a secondary book account. All such claims omitted as
   UNVERIFIED.
2. **Bridgewater's research-to-trade systemization mechanics** — the bios confirm
   systemization exists ("systemization of Bridgewater's research into trading
   strategies") but the internal tooling (e.g. how research rules become tradeable
   signals) is not public beyond Dalio's books and economicprinciples.org templates.
3. **Citadel fundamental-equities research depth** — job postings evidence detailed
   models and alternative-data use, but internal review/red-team processes are not
   publicly documented; inferred from structure only.
4. **Sell-side desk processes** (management access frequency, model-update cadence) —
   described from public research pages and report artifacts, not from internal process
   documentation; compliance-review specifics deliberately not interpreted.
5. **Deep FinResearch Bench and FinRpt results** — single-team preprints (2026);
   "still fall short" is the authors' measured conclusion on their own benchmark, not
   independently replicated. Paleka et al.'s leakage critique applies to every LLM
   forecasting/agentic result cited here.
6. **SemiAnalysis model accuracy** — the FAQ describes methodology (bottom-up,
   reconciled, quarterly back-tests) but publishes no accuracy track record for the
   models; the "back-tested against reported results" claim is first-party and
   unaudited.
7. **Whether a driver-based scenario block measurably improves our calibration** —
   no internal evidence; the pilot (action item 4) is the test.
8. **Feasibility of a different-model confirm pass** depends on harness capabilities
   not audited this session; recorded as an assumption, not a verified capability.
