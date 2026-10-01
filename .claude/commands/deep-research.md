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

1. **Parallel subagent fan-out:** Launch specialized read-only subagents:
    - **Filings subagent:** Queries SEC filings via `venv/bin/python scripts/analysis/filings_adapter.py`
      (`sections`, `read`, `verify`). Extracts hard financial numbers, risk disclosures,
      customer concentration, and management commentary.
    - **Internal state subagent:** Audits `data/analysis/<TICKER>.json`, `*.evidence.jsonl`,
      and `docs/thesis/**`. Tracks prior beliefs, falsifiable prediction track records,
      and open questions.
    - **Web subagent:** Investigates primary external sources only: regulatory disclosures,
      investor relations presentations, earnings call transcripts, and industry standards bodies.
      Secondary blog posts and unverified aggregators are excluded.

2. **Synthesis pass:** Consolidate subagent outputs into a coherent claim-to-source mapping.
   Every quantitative claim or thesis assertion must carry its exact locator or cited URL.

3. **Confirm pass:**
    - Verify every quantitative claim against SEC filings using
      `venv/bin/python scripts/analysis/filings_adapter.py verify --ticker <T> --claim "<claim>"`.
      Enforce confidence ≥ 0.60.
    - Re-verify critical web claims by direct source inspection.

4. **Persist findings:**
    - Write the cited findings doc to `docs/research/<topic>.md`.
    - Structure: executive summary, baseline vs new evidence, claim-by-claim breakdown with
      source anchors, open questions / unverified claims, and action items.
    - Only after findings are committed may `docs/thesis/<TICKER>.md` or `data/analysis/*.json`
      be updated.

## Guardrails

- **Reserve for thesis-affecting questions:** Multi-agent fan-out costs ~15× tokens compared
  to single-agent chat. Do not invoke for simple queries or quick lookups.
- **Leakage and forecast discipline:** Per Paleka et al., never self-evaluate forecast quality
  or Brier scores within the research agent; forecasting track records require prospective,
  dated resolution.
- **Authoritative sources only:** Rely on primary sources with verified locators; speculative
  rumors or ungrounded claims must be flagged explicitly as unverified.
