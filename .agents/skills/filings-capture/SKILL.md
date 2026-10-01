---
name: filings-capture
description: Extract high-signal chunks from SEC filings via the vendored filings adapter, run the grounded confirm pass, and capture durable knowledge as flashcards in the Anki 金融 deck.
---

# Filings Capture Skill (/filings-capture)

Extracts high-signal SEC filing evidence (Item 1 Business, Item 1A Risk Factors,
Item 7 MD&A, and financial statements), verifies all quantitative claims against
the filings using the deterministic confirm pass, and stages verified flashcards into
the Anki **金融** deck via the networking repo's gated pipeline.

Design context: `docs/research/frontier-enhancements.md` (WO-6a) and
`docs/research/compounding-research-engine.md`.

## Core rules

- **Cards are downstream of committed docs.** Author cards only from an artifact that
  already exists in git (a thesis doc `docs/thesis/<TICKER>.md` or findings doc
  `docs/research/*.md`). Never import cards whose only anchor is the live filing —
  the committed doc is the citation target; the filing is the evidence.
- **Confirm pass is mandatory.** Every quantitative claim must be verified against
  the filing with confidence ≥ 0.60 via `filings_adapter.py verify`. Unconfirmed
  or low-confidence claims must be rewritten or dropped.
- **1–5 cards per session.** Focus strictly on structural variables, unit
  economics drivers, customer concentration, and mechanism anchors.

## Pipeline

All paths are repo-relative or absolute. The staging file is
`.agents/state/anki_cards.jsonl` in this repo.

```bash
# 1. Export SEC chunks manifest for target ticker
venv/bin/python scripts/analysis/filings_adapter.py export-manifest \
    --ticker {{args}} --out .agents/state/filings_chunks.json

# 2. Pick high-signal chunks from business, risk_factors, or financial_statements.
#    The adapter inspects Item 1, Item 1A, and Item 7 sections.

# 3. Confirm pass: verify each quantitative claim against the filing
venv/bin/python scripts/analysis/filings_adapter.py verify \
    --ticker {{args}} --claim "<claim to verify>"
#    Keep only claims with confidence >= 0.60; rewrite or drop the rest.

# 4. Author 1–5 cards to /Users/lz/dev/fund/.agents/state/anki_cards.jsonl
#    Use chunk_id := "sec:{{args}}:<doc_id>:<ref>"
#    Citation must link to a committed fund repo doc:
#    e.g. "[docs/thesis/ANET.md#L10-L20](file:///Users/lz/dev/fund/docs/thesis/ANET.md#L10-L20)"
#    Carry the SEC filing URL in the JSONL external_sources field:
#    "external_sources": [{"url": "<sec-url>", "retrieved": "<iso-date>", "claim": "<claim>"}]

# 5. Structural validation gate
python3 ~/dev/networking/tools/research/anki_card_validator.py \
    /Users/lz/dev/fund/.agents/state/anki_cards.jsonl

# 6. Density gate (against the pinned 金融 baseline)
python3 ~/dev/networking/tools/research/anki_density_gate.py \
    --cards /Users/lz/dev/fund/.agents/state/anki_cards.jsonl

# 7. LLM-as-judge pre-screen (you, the agent — no code):
#    Score 4-point rubric (accuracy, citation match, completeness, format).
#    Rewrite any failing card, then re-run gates 5-6.

# 8. Human review: show the user the JSONL diff before importing.

# 9. Import (validator re-runs internally; refuses on any issue)
python3 ~/dev/networking/tools/research/anki_generator.py --import --deck "金融" \
    --cards /Users/lz/dev/fund/.agents/state/anki_cards.jsonl --auto-launch
```

## Guardrails

- Never import cards whose only anchor is the live filing — the committed
  doc is the citation target; the filing is the evidence.
- Always include `external_sources` metadata in the JSONL for external filing references.
- Pass both structural validator and density gate before prompting for human review.
