---
description: Update an investment thesis and scenario analysis from new filings or raw notes directly in chat with zero external API keys, backed by primary-source confirm pass and sequential evidence logging.
---

# Thesis Update Skill (/thesis-update)

Update an investment thesis (`docs/thesis/<TICKER>.md`), scenario analysis (`data/analysis/<TICKER>.json`), and sequential evidence log (`data/analysis/<TICKER>.evidence.jsonl`) directly in this chat session without external API keys.

Design context: `docs/ai_update_flow.md` and `docs/research/compounding-research-engine.md`.

## Core Philosophy

- **The Chat Agent IS the Engine**: You (the AI coding assistant) perform all interpretation, scenario adjustment, and patch generation directly within this conversation. Never call external LLM APIs or standalone external model scripts; use local repository tools.
- **LLM Authors, Code Gates**: You draft the synthesis and patch; local scripts (`scripts.analysis.filings_adapter`, `scripts.analysis.sync_configs`, Jest, Pytest) enforce determinism and factuality.
- **Evidence Has an Anchor**: Any numerical or material assertion from SEC reports must be verified against primary filing text via the confirm pass before being promoted into the thesis.

## Usage

```text
/thesis-update <TICKER> [optional: specific filing ref, topic, or clip]
```

Example: `/thesis-update ANET` or `/thesis-update GOOG "TPU v6 and cloud margins"`

## Execution Protocol

### Step 1: Gather Inputs & Primary Sources

1. Read existing thesis files:
    - `docs/thesis/<TICKER>.md`
    - `data/analysis/<TICKER>.json`
    - `data/analysis/<TICKER>.evidence.jsonl`
2. Check for new input material:
    - User-provided text in the prompt, or
    - `docs/thesis/<TICKER>/<TICKER>-inbox.md`, or
    - Primary SEC filing data via the local filings adapter:

        ```bash
        # List available filings
        python3 -m scripts.analysis.filings_adapter list --ticker <TICKER>

        # Extract filing evidence candidates
        python3 -m scripts.analysis.filings_adapter candidates --ticker <TICKER>
        ```

### Step 2: Confirm Pass (Factuality Verification)

If the new insight cites specific empirical claims from SEC filings (e.g., customer concentration percentages, revenue segments, supply chain risks), execute the confirm pass:

```bash
python3 -m scripts.analysis.filings_adapter verify --ticker <TICKER> --claim "<EXACT CLAIM TEXT>"
```

Ensure the claim is verified (confidence >= 60% with primary text spans) before including it in the record.

### Step 3: In-Chat Synthesis

Synthesize the incremental findings in the chat response:

1. **Classification**: Bull / Base / Bear / Neutral.
2. **Key Insight**: 3–5 concise bullets focused on moat, unit economics, or tail risks.
3. **Scenario Impact**:
    - Assess whether changes are required to `data/analysis/<TICKER>.json`:
        - Probabilities (`prob` across bull/base/bear, summing to 1.0)
        - EPS CAGRs or exit P/E multiples
        - Belief state (`confidence`, `evidence_for`, `evidence_against`, `open_questions`)
        - Dated falsifiable predictions (`predictions`)
        - Decision journal entry (`decision_journal`)

### Step 4: Apply Surgical Patches

1. **Update `data/analysis/<TICKER>.json`**:
    - Apply any numerical or belief-state changes.
    - Run `python3 -m scripts.analysis.sync_configs` to normalize and validate the JSON schema.
2. **Update `docs/thesis/<TICKER>.md`**:
    - Make surgical edits to specific numbered sections (e.g. §4.2, §8.2 dated log).
    - Link any industry layer docs (`docs/thesis/industry/`) if relevant.
3. **Append to `data/analysis/<TICKER>.evidence.jsonl`**:
    - Add a single JSON line recording the dated evidence with direction, strength, and citation locator. Include valid_from (when the fact became true; defaults to the record's date) and valid_to (null while the fact holds; set it when later evidence supersedes or refutes the claim — never delete the old record).

### Step 5: Verify & Gate

Run tests to verify that math, schema, and page smoke pass:

```bash
npx jest tests/js/pages/analysis/ && venv/bin/pytest tests/python/test_sync_configs.py
```

### Step 6: Compounding Handoff

Prompt the user:

- Ask for acknowledgement before staging/committing the updated files.
- Suggest running `/anki-capture` to turn the newly validated thesis insights into permanent flashcards in the Anki 金融 deck.
