---
description: Update an investment thesis and scenario analysis from new filings or raw notes directly in chat with zero external API keys, backed by primary-source confirm pass and sequential evidence logging.
---

# Thesis Update Skill (/thesis-update)

Update `docs/thesis/<TICKER>.md`, `data/analysis/<TICKER>.json`, and
`data/analysis/<TICKER>.evidence.jsonl` directly in chat with local repo tools
(no external LLM APIs). Usage:
`/thesis-update <TICKER> [optional: filing ref, topic, or clip]`. Design
context: `docs/ai_update_flow.md`, `docs/research/compounding-research-engine.md`.

## Ownership & data boundaries

- **LLM authors reasoning; code owns volatile data & gates:**
  `sync_configs` owns `market`, `position.shares`, and `derived`
  (`expectedCagr` = Mean-wealth CAGR, `expectedMultiple`, and GH-7
  `derived.kelly`, computed identically to `js/pages/analysis/decision.js`).
  Keep live prices, multiples, and engine outputs out of `belief_state`,
  scenario notes, evidence arrays, and thesis body prose — dated valuations
  belong strictly in historical logs (`decision_journal` and thesis §8.2).
- **Explicit thesis-intact probability (`belief_state.thesis_intact_probability`):**
  Preserve `belief_state.probability` as an ambiguous legacy field (never copy or
  infer `thesis_intact_probability` from `belief_state.probability`,
  Bull/Base/Bear scenario probabilities, or `confidence`). Set or update the
  optional `belief_state.thesis_intact_probability` (`[0, 1]`) only from an
  explicit primary-source thesis review; it is the sole probability eligible for
  Decision Gate 1's `< 0.15` kill test.
- **Guided non-GAAP EPS:** when intentionally modeling guided non-GAAP EPS
  (especially with negative trailing GAAP EPS), set
  `model.preferences.overrides.eps` from a sourced calculation rather than
  substituting vendor `market.forwardEps`.
- **Primary-source anchor:** verify empirical SEC claims via the confirm pass
  (confidence ≥ 0.60 with primary text spans) before promoting them.

## Protocol

### 1. Gather inputs & confirm facts

Read `docs/thesis/<TICKER>.md`, `data/analysis/<TICKER>.json`, and
`data/analysis/<TICKER>.evidence.jsonl`. Pull new material from the user
prompt, `docs/thesis/<TICKER>/<TICKER>-inbox.md`, or SEC filings:

```bash
venv/bin/python -m scripts.analysis.filings_adapter list --ticker <TICKER>
venv/bin/python -m scripts.analysis.filings_adapter candidates --ticker <TICKER>
venv/bin/python -m scripts.analysis.filings_adapter verify --ticker <TICKER> --claim "<EXACT CLAIM TEXT>"
```

### 2. Synthesize in chat

Present:

1. **Classification:** Bull / Base / Bear / Neutral.
2. **Key insight:** 3–5 concise bullets on moat, unit economics, or tail risks.
3. **Scenario impact:** proposed edits to `prob` (summing to 1.0), `epsCagr`,
   exit P/E, `belief_state` (`thesis_intact_probability`, `confidence`,
   `evidence_for`, `evidence_against`, `open_questions`; never overwrite or infer
   `thesis_intact_probability` from legacy `probability`, scenario `prob`s, or
   `confidence`), dated `predictions`, and `decision_journal`. If a scenario has
   a `drivers` block, reconcile modeled vs. actual revenue per driver, update
   inputs with sources, register each named falsification driver as a dated
   `predictions` entry for `prediction_sweeper.py`, and align start/end periods
   before comparing fixed-fiscal-year driver CAGR against the engine's rolling
   five-year `epsCagr`.

### 3. Apply surgical patches

Patch the smallest unique block in each file (if a match fails, re-read and
shrink the anchor):

1. **`data/analysis/<TICKER>.json`:**
    - For watchlist / initial coverage outside current holdings, register
      `<TICKER>` in `data/analysis/watchlist.json` first (`sync_configs`
      prunes configs outside holdings ∪ watchlist — `docs/ai_update_flow.md`
      §1.1).
    - Apply belief/scenario edits, then run:
      `venv/bin/python -m scripts.analysis.sync_configs --ticker <TICKER>`
      Always pass `--ticker` so only this ticker refreshes (leave full
      refreshes to the nightly bot; if an unscoped run happens, commit
      incidental refreshes separately as `chore(data)`).
    - Inspect `market.eps`, `marketDataUpdatedAt`, and price timeliness
      afterward; if they predate the new print, flag that `derived.expectedCagr`
      still reflects pre-earnings market inputs.
2. **`docs/thesis/<TICKER>.md`:** edit the specific numbered sections (e.g.
   §4.2, §8.2 dated log) and link `docs/thesis/industry/` docs when relevant.
3. **`data/analysis/<TICKER>.evidence.jsonl`:** append one JSON line with
   date, direction, strength, citation locator, `valid_from` (defaults to
   record date), and `valid_to` (`null` while active; set `valid_to` when
   later evidence supersedes a record so history stays append-only).

### 4. Verify & hand off

```bash
npx jest tests/js/pages/analysis/ && venv/bin/pytest tests/python/test_sync_configs_currency.py tests/python/test_sync_configs_watchlist.py
```

Ask the user for acknowledgement before staging/committing, and suggest
`/anki-capture` to convert the new thesis insights into 金融 deck flashcards.
