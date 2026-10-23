---
description: Orchestrate multi-agent deep research fanning out to parallel subagents across SEC filings, internal thesis state, and primary web sources, with a grounded confirm pass.
---

# Deep Research Skill (/deep-research)

Orchestrates multi-agent parallel investigations for complex, thesis-affecting questions.
Employs an orchestrator-worker architecture with parallel specialized subagents, followed
by synthesis, a deterministic confirm pass against primary sources, and output to a
persisted findings doc in `docs/research/`.

Design context: `docs/research/frontier-enhancements.md` (WO-6b) and
Anthropic production multi-agent research architecture patterns.

## Orchestration architecture

For the given research question `$ARGUMENTS`:

0. **Resolve the subject before fan-out (2026-10-13 lesson):** a bare uppercase token is
   a **stock ticker first** — this repo is a fund. If the token collides with a well-known
   non-ticker acronym (2026-10-13: `CBRS` = Cerebras Systems the stock, not Citizens
   Broadband Radio Service the spectrum band), disambiguate by **thematic adjacency**:
   check `data/analysis/`, `docs/thesis/`, and `docs/thesis/industry/` for which reading
   touches an existing holding or industry doc. A reading with zero adjacency to anything
   in the portfolio is almost certainly a misread — a ~15×-token fan-out on the wrong
   subject was the cost. If two readings both have real adjacency, ask the user one
   question before launching subagents; never fan out on an unresolved ambiguity.

1. **Parallel subagent fan-out:** Launch specialized read-only subagents:
    - **Filings subagent:** Queries SEC filings via `venv/bin/python -m scripts.analysis.filings_adapter`
      (`sections`, `read`, `verify` — the direct script path fails with `ModuleNotFoundError`;
      the `-m` form is required). If the ticker is not yet in the filings workspace
      (`list` raises "do not have this company"), ingest it first:
      `venv/bin/python -m scripts.analysis.filings_adapter ingest --ticker <T>`
      (idempotent; see `docs/filings-adapter.md`). Extracts hard financial numbers,
      risk disclosures, customer concentration, and management commentary.
    - **Internal state subagent:** Audits `data/analysis/<TICKER>.json`, `*.evidence.jsonl`,
      and `docs/thesis/**`. Tracks prior beliefs, falsifiable prediction track records,
      and open questions.
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
   Every quantitative claim or thesis assertion must carry its exact locator or cited URL.

3. **Confirm pass:**
    - Run in a **fresh context** (a new subagent or a cleared session): the agent that
      synthesized the claims never verifies its own synthesis.
    - Verify every quantitative claim against SEC filings using
      `venv/bin/python -m scripts.analysis.filings_adapter verify --ticker <T> --claim "<claim>"`.
      Enforce confidence ≥ 0.60.
    - Re-verify critical web claims by direct source inspection.

4. **Persist findings:**
    - Write the cited findings doc to `docs/research/tickers/<topic>.md` for company/security-specific
      research (keeps ticker findings separate from general engineering research at the
      `docs/research/` top level).
    - Structure: executive summary, baseline vs new evidence, claim-by-claim breakdown with
      source anchors, open questions / unverified claims, and action items.
    - Only after findings are committed may `docs/thesis/<TICKER>.md` or `data/analysis/*.json`
      be updated.

## Quarterly primary-source sweep

Once per quarter per covered ticker — and always before a thesis-affecting run on a
subject that has reported since the last sweep — the web subagent's source list must
include the latest earnings-call transcript and any investor/analyst-day deck from the
company's IR site. These are the highest-signal primary sources this pipeline otherwise
touches only ad hoc. Management Q&A language is primary evidence for guidance intent
and capital-allocation posture, never for hard numbers (those anchor to filings).

## Guardrails

- **Reserve for thesis-affecting questions:** Multi-agent fan-out costs ~15× tokens compared
  to single-agent chat. Do not invoke for simple queries or quick lookups.
- **Leakage and forecast discipline:** Per Paleka et al., never self-evaluate forecast quality
  or Brier scores within the research agent; forecasting track records require prospective,
  dated resolution.
- **Authoritative sources only:** Rely on primary sources with verified locators; speculative
  rumors or ungrounded claims must be flagged explicitly as unverified.
- **Repro reported tool failures before acting on them:** a subagent's "tool X is broken"
  claim needs a minimal direct repro by the orchestrator before it becomes an action item —
  field misreads present as defects (2026-10-12: `query_xbrl_facts` reported as returning
  null values was healthy; the null lived in `get_financial_statement`'s period columns).
