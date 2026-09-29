# The Compounding Research Engine — Integrated Design

**Status: Synthesis / Proposal**
**Date: 2026-09-29**
**Component findings** (evidence lives there, not repeated here):

- `docs/research/cross-repo-anki-synergy.md` — the loop: chat → docs → cards → PageRank
- `docs/research/analysis-lab-revival.md` — the feedback surface: what the human sees
- `docs/research/external-filings-agent-evaluation.md` — the data source: primary-source filings

The synergy doc's loop lacks a primary-source data plane (supplied by the
filings evaluation) and a human feedback surface (supplied by the lab revival).
Integrated, they form one engine with a single invariant: **every session starts
smarter than the last, because the last session left durable, ranked, testable
artifacts behind.**

```text
            ┌─────────────────────────────────────────────────────┐
            │                    ASK (entry)                      │
            │  fund chat: thesis-affecting research               │
            │  networking chat: pure domain study                 │
            └──────────────┬──────────────────────────────────────┘
                           ▼
            ┌─────────────────────────────────────────────────────┐
            │                 RETRIEVE (data plane)               │
            │  fund pipeline (yfinance, P/E) · vendored filings   │
            │  layer (SEC/CNINFO/HKEX, XBRL) · networking         │
            │  courseware corpus · web primary sources            │
            └──────────────┬──────────────────────────────────────┘
                           ▼
            ┌─────────────────────────────────────────────────────┐
            │                 REASON (agent plane)                │
            │  host code agent + parallel subagents               │
            │  (fundamentals / industry / valuation split),       │
            │  citation contract, belief-state update             │
            └──────────────┬──────────────────────────────────────┘
                           ▼
            ┌─────────────────────────────────────────────────────┐
            │              COMMIT (durable artifacts)             │
            │  findings docs · thesis patches (md+json) ·         │
            │  belief-state JSON · evidence.jsonl ·               │
            │  decision-journal entries  — all git-reviewed       │
            └──────────────┬──────────────────────────────────────┘
                           ▼
            ┌─────────────────────────────────────────────────────┐
            │              DISTILL (Anki plane)                   │
            │  LLM authors anki_cards.jsonl → validator →         │
            │  density gate → confirm pass → AnkiConnect → 金融    │
            └──────────────┬──────────────────────────────────────┘
                           ▼
            ┌─────────────────────────────────────────────────────┐
            │           RENDER + RANK (feedback plane)            │
            │  Lab page: probability history, Kelly curves, fan   │
            │  charts, calibration — read-only over data/         │
            │  anki repo: graph rebuild → PageRank hubs           │
            └──────────────┬──────────────────────────────────────┘
                           │
                           └── feedback into next ASK ──►
                 (hubs steer card/research priorities;
                  Brier scores discipline future probabilities;
                  retro turns friction into gates/skills)
```

## Design invariants (each traced to a component doc)

1. **LLM authors, code gates** — card prose is agent-written; structure,
   density, dedup, and (with the filings layer) factuality are machine-checked
   (synergy §4.2; evaluation §2).
2. **Cards are downstream of docs** — the git-versioned doc is the source of
   truth; cards derive from it and cite it (synergy §3).
3. **The UI never writes state** — the Lab page renders derived views only;
   judgment artifacts live in git (lab revival §5).
4. **PageRank ⊥ FSRS** — centrality decides *what* to learn/emphasize; the
   scheduler decides *when* (synergy §4.3).
5. **Domain ownership of sessions** — ask in the repo that owns the artifact;
   networking's research-agent serves pure-study questions directly (synergy
   §3, question-surface subsection).
6. **Evidence has an anchor or it didn't happen** — thesis claims, report
   chapters, and cards all carry `source | locator` citations; the confirm
   pass re-verifies them (evaluation §2, §7.2).

## Component status

| Engine piece | Home | Status |
| --- | --- | --- |
| Findings/thesis capture (`/research`, thesis flow) | fund | **Exists** |
| Card pipeline (validator, density, dedup, AnkiConnect) | networking | **Exists**; ad-hoc path usable from fund today |
| PageRank graph + bridge | anki + networking | **Exists**; rebuild already hooked to anki's `precommit-fix YOLO=1` |
| Fund `/anki-capture` skill + finance tags | fund + networking | **Missing** — the one new skill to author |
| Belief-state schema + evidence.jsonl | fund | **Missing** (BLF schema, lab revival §5.2–5.3) |
| Lab page revival (read-only derived views) | fund | **Repair + rework** (4 fixes, then inversion of the Bayesian Lab) |
| Filings layer (vendored subset) | fund | **Unevaluated** — appliance test first (evaluation §6.1) |
| Filings→cards manifest adapter + confirm pass | fund + networking | **Missing** (evaluation §7) |
| Industry-thesis layer + covariance Kelly | fund | **Missing** (synergy §3, concentration subsection) |
| Research orchestration (parallel subagents) | fund | **Missing** (synergy Phase 3) |

## Build order (dependencies respected)

- **Phase 0 — this week, zero new infra.** Repair the Lab's four bugs (lab
  revival §3a); use networking's ad-hoc card path after research chats
  (synergy Phase 0).
- **Phase 1 — the skill.** Fund `/anki-capture` (JSONL schema + card-format
  contract + invocation of networking's gates); add finance tags to
  `CANONICAL_TAGS` in networking.
- **Phase 2 — the feedback surface.** Belief-state schema + `evidence.jsonl`
  in `data/analysis/`; Lab page renders probability history, Kelly curves,
  calibration; resolution criteria added to thesis template.
- **Phase 3 — the data plane.** Appliance-test the external filings project on
  ANET/GOOG/PDD; if it beats plain `edgartools`, vendor the subset; build the
  sections→chunks adapter so filings become coverage-tracked card corpora with
  a confirm pass.
- **Phase 4 — orchestration.** Finance research skill fanning out parallel
  subagents; industry-thesis layer; covariance-aware (or explicitly
  industry-scenario) Kelly on the Lab's PORT view.

## What the engine buys that the pieces don't

- **Ranking closes the loop**: PageRank hubs over the unified 金融 deck
  identify which concepts are load-bearing for both domain understanding and
  the (networking-concentrated) portfolio — steering both study and research
  priorities (synergy §3, concentration subsection).
- **Scoring closes the loop**: dated falsifiable predictions + Brier
  calibration turn thesis probabilities from decoration into a feedback
  signal (lab revival §4.1, §5.4).
- **Provenance closes the loop**: machine-checked evidence anchors flow from
  filings → reports → theses → cards, so every artifact can be re-verified
  against its source (evaluation §7.2).

## Open questions

Consolidated, unresolved: extraction quality of the filings candidate on our
tickers (evaluation §8.1); whether the Lab stays a page or folds into the
terminal (lab revival §6.1); PORT Monte Carlo semantics (lab revival §6.3);
finance-card density behavior vs. the pinned baseline — monitor, revisit only
on empirical divergence (synergy §5.5).
