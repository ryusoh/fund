---
description: Orchestrate multi-agent deep research fanning out to parallel subagents across SEC filings, internal thesis state, and primary web sources, with a grounded confirm pass.
---

# Deep Research Skill (/deep-research)

Multi-agent parallel research for complex, thesis-affecting questions
(`$ARGUMENTS`). Reserve for thesis-affecting work — fan-out costs ~15× a
single-agent chat turn. Design context: `docs/research/frontier-enhancements.md`
(WO-6b).

## Workflow

0. **Disambiguate the subject before fan-out:** this repo is a fund, so treat
   a bare uppercase token as a **stock ticker first**. When a token collides
   with a non-ticker acronym, check thematic adjacency against
   `data/analysis/`, `docs/thesis/`, and `docs/thesis/industry/`. If two
   readings both touch portfolio holdings or industry docs, ask the user one
   clarifying question before launching subagents.
1. **Parallel read-only fan-out (4 subagents):**
    - **Filings:** query SEC filings via
      `venv/bin/python -m scripts.analysis.filings_adapter` (`ingest` first
      for new tickers — `docs/filings-adapter.md`). Extract financials, risk
      disclosures, customer concentration, and management commentary. For
      earnings 8-Ks, `ingest` often fetches only the body and misses Exhibit
      99.1 — inspect the filing index and fetch the SEC exhibit directly
      before confirming earnings numbers.
    - **Internal state:** audit `data/analysis/<TICKER>.json`,
      `*.evidence.jsonl`, and `docs/thesis/**` for prior beliefs, prediction
      track records, and open questions.
    - **Web (primary sources only):** regulatory disclosures, IR decks,
      earnings-call transcripts, and standards bodies (skip blogs and
      aggregators).
    - **Red team (adversarial):** argue the strongest case against
      `data/analysis/<TICKER>.json` `belief_state`, attack load-bearing
      claims, and list concrete falsifiers ranked by thesis-killing potential.
2. **Synthesis:** merge all four outputs into a claim-to-source map where
   every quantitative claim carries an exact locator or URL. Preserve the red
   team's disconfirming case in its own dedicated section. If workers disagree
   on verification status, reconcile against the strongest primary source
   before synthesizing.
3. **Fresh-context confirm pass:** launch a **new** subagent (independent of
   synthesis) to verify every quantitative SEC claim via
   `venv/bin/python -m scripts.analysis.filings_adapter verify --ticker <T> --claim "<claim>"`
   (threshold confidence ≥ 0.60) and directly inspect critical web citations.
4. **Persist findings first:** write to `docs/research/tickers/<topic>.md`
   (keeps ticker research separate from engineering docs at `docs/research/`).
   Sections: executive summary, baseline vs. new evidence, red-team case,
   claim-by-claim evidence with anchors, open questions / unverified claims,
   and action items. Commit findings before updating `docs/thesis/<TICKER>.md`
   or `data/analysis/*.json`.

## Quarterly primary-source sweep & evidence discipline

- **Quarterly sweep:** once per quarter per covered ticker (and before any
  thesis-affecting run after a new print), include the latest earnings-call
  transcript, IR/analyst-day decks, supplemental outlook decks, and official
  webcast captions. Treat management Q&A as primary evidence for guidance
  intent and capital allocation, while anchoring hard numbers to SEC filings
  or official decks.
- **Automated-transcript quarantine (all workers, including red team):** when
  only an automated fallback transcript is available, keep its numeric claims
  and verbatim quotes marked `UNVERIFIED` in open questions until confirmed by
  a primary source.
- **Prospective forecast discipline (Paleka et al.):** evaluate forecast
  quality and Brier scores only through prospective, dated resolution — leave
  self-scoring out of research runs.
- **Repro tool failures before escalating:** if a subagent reports a local
  tool or adapter as broken, run a minimal direct repro in the orchestrator
  first (field misreads often look like tool defects).
