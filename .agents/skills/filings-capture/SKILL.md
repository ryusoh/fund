---
name: filings-capture
description: Extract high-signal chunks from SEC filings via the vendored filings adapter, run the grounded confirm pass, and capture durable knowledge as flashcards in the Anki 金融 deck.
---

# Filings Capture Skill (/filings-capture)

The SEC-filing variant of `/anki-capture`: pull evidence from Item 1
(Business), Item 1A (Risk Factors), Item 7 (MD&A), and the financial
statements for **{{args}}**, confirm every number against the filing, then
card it through the `anki-capture` pipeline. Design context:
`docs/research/frontier-enhancements.md` (WO-6a).

## Source rules

- The citation target is a committed fund doc (`docs/thesis/<TICKER>.md` or
  `docs/research/*.md`); the filing is the evidence behind it. If the finding
  isn't in a committed doc yet, land it there first.
- Every quantitative claim passes the confirm pass at confidence ≥ 0.60;
  rewrite or drop the rest.
- Aim for 1–5 cards on structural variables, unit-economics drivers, customer
  concentration, and mechanism anchors.

## Steps

```bash
# 1. Export the SEC chunk manifest (ingest the ticker first if it is new —
#    docs/filings-adapter.md)
venv/bin/python -m scripts.analysis.filings_adapter export-manifest \
    --ticker {{args}} --out .agents/state/filings_chunks.json

# 2. Confirm pass, once per quantitative claim
venv/bin/python -m scripts.analysis.filings_adapter verify \
    --ticker {{args}} --claim "<claim to verify>"
```

Then author cards into `.agents/state/anki_cards.jsonl` per the
`anki-capture` format contract, with two differences:

- `chunk_id := "sec:{{args}}:<doc_id>:<ref>"`
- each card carries the filing in
  `"external_sources": [{"url": "<sec-url>", "retrieved": "<iso-date>", "claim": "<claim>"}]`

Finish with `anki-capture` from its step 2 (validator → density gate → judge
pass → human review → import).
