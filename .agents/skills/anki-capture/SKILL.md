---
name: anki-capture
description: Capture durable knowledge from a fund research or thesis session as Chinese-primary flashcards in the Anki 金融 deck, via the networking repo's gated card pipeline. Use after a findings doc or thesis update lands.
---

# Anki Capture Skill (/anki-capture)

Turn a committed fund artifact (`docs/research/` findings doc or
`docs/thesis/<TICKER>.md` update) into 1–5 high-density Chinese-primary
flashcards in the Anki **金融** deck. Design context:
`docs/research/compounding-research-engine.md`.

## Core contract

- **Downstream of committed docs:** author cards strictly from an artifact in
  git (or being committed this session) so every claim traces to persisted
  source lines.
- **LLM authors, code gates:** write JSONL to `.agents/state/anki_cards.jsonl`
  (gitignored; overwrite fresh each run) and let the networking repo's
  validator, density gate, dedup, and AnkiConnect importer control what enters
  Anki.
- **1–5 high-leverage cards per session:** focus on first-principles industry
  and company research — **industry mechanics** (supply chains, tech
  transitions, cost curves), **company structural variables** (concentration,
  product cycles, unit-economics drivers), and **quantitative anchors** with
  their derivation. Skip basic finance definitions and CFA-level theory
  already in the deck.

## Pipeline

Networking-repo scripts expect the repo root on `sys.path` and write
cwd-relative state (`research/anki_density_verdicts.jsonl`), so run every
command from `~/dev/networking`:

```bash
cd ~/dev/networking && export PYTHONPATH=~/dev/networking

# 0. Optional: reuse existing 金融 hub concept names verbatim (builds PageRank edges)
python3 ~/dev/anki/graph/analyze.py --deck F --top 20 --hubs
# 0b. Optional: prioritize high-PageRank retention-gap hubs (fails open if Anki is closed)
python3 ~/dev/networking/tools/research/anki_retention.py --gaps --top 10

# 1. Author JSONL → /Users/lz/dev/fund/.agents/state/anki_cards.jsonl
#    Schema: {chunk_id, front, back, tags, citation}
#    chunk_id := "fund/<relpath>:card-<n>"   citation := "<relpath>#L<start>-L<end>"

# 2. Structural validation (hard gate)
python3 ~/dev/networking/tools/research/anki_card_validator.py \
    /Users/lz/dev/fund/.agents/state/anki_cards.jsonl

# 3. Density gate (against pinned 金融 baseline; re-author any enrich/consolidate flags)
python3 ~/dev/networking/tools/research/anki_density_gate.py \
    --cards /Users/lz/dev/fund/.agents/state/anki_cards.jsonl

# 4. Judge pre-screen (you, in chat): re-read each cited line range and verify
#    (a) accuracy, (b) citation match against the persisted doc (not session memory),
#    (c) completeness, and (d) format. Rewrite failures and re-run steps 2–3.

# 5. Human review: show the JSONL diff to the user before importing.

# 6. Import (re-runs validator internally; --auto-launch starts Anki; dedupes by front hash)
python3 ~/dev/networking/tools/research/anki_generator.py --import --deck "金融" \
    --cards /Users/lz/dev/fund/.agents/state/anki_cards.jsonl --auto-launch
```

### Revising or one-shot cards

- **Update in place** (preserves review history and stays synced with source
  docs): edit the staged JSONL, re-run steps 2–3, then run `anki_generator.py`
  with `--update` instead of `--import`. It matches notes via the coverage
  ledger's `note_id`, skips unchanged cards, and re-adds deleted/new ones.
- **Single ad-hoc card:**

```bash
python3 ~/dev/networking/tools/research/anki_generator.py \
    --front "<strong>中文概念</strong>: 具体问题？" --back "<b>…</b>…" \
    --deck "金融" --tags "research finance" --auto-launch
```

## Format contract & validator quirks

Spec: `~/dev/networking/docs/research/anki-card-pipeline-spec.md` §8;
enforced by `anki_card_validator.py`:

- **Front:** `<strong>中文概念</strong>: 具体机制问题？` — Chinese concept
  name + concrete mechanism question. Allowed English in the front: acronyms
  and single-token names (`WLBI`, `backlog`). Multi-word or hyphenated terms
  (`burn-in`) fail the front tokenizer — keep the front pure Chinese and gloss
  on first mention in the back (`老化测试（burn-in）`), so the central concept
  always carries an English anchor for graph links.
- **Back:** ≥2 dense sections headed `<b>section name:</b>`, Chinese-primary
  prose, LaTeX `\(...\)` for formulas, mechanism/quantitative substance over
  definitions.
- **English annotations:** cap of 2 non-acronym parenthetical glosses per
  back. The counter checks any parenthetical containing an English word (even
  mostly-Chinese ones), so keep incidental English words outside parentheses.
- **Acronyms:** expand on first use with an English parenthetical whose
  initials subsequence-match (`DCF (Discounted Cash Flow)`). The scanner
  flags every uppercase token — including tickers (`AEHR`) and product names
  (`FOX`) — unless exempt in `COMMON_ACRONYMS` or
  `~/dev/networking/research/.anki_deck_acronyms.json` (built by
  `anki_deck_acronyms.py` for acronyms already taught in 金融). Pre-check
  candidate tokens against that JSON or paraphrase around tickers/units
  (`该公司`, `每秒 21 拍字节`).
- **Citation:** back ends with `源码与文档引用 (Source Citation):` linking to
  line ranges in this repo:
  `[docs/thesis/ANET.md#L10-L20](file:///Users/lz/dev/fund/docs/thesis/ANET.md#L10-L20)`.
- **Tags:** canonical vocabulary only — `research` + `finance`, plus 0–2 of
  `valuation`, `moat`, `earnings`, `industry`, `macro` (or networking concept
  tags for infra cards).

## Density metric debugging

`anki_density.py` scores
`0.4·compression + 0.2·MTLD + 0.2·concept + 0.2·domain`. On `enrich` flags:

- MTLD (lexical diversity) is usually the binding constraint for Chinese; cut
  repeated words rather than adding prose.
- `file://` citation links lower MTLD, so leave headroom before step 4 and
  re-run steps 2–3 after adding citations.
- Inspect per-component scores with:

```bash
python3 -c 'import json; from tools.research.anki_density import card_density; from tools.research.anki_density_baseline import compute_baseline, DEFAULT_BASELINE_CACHE_PATH; b=compute_baseline(deck="金融",k=10,cache_path=DEFAULT_BASELINE_CACHE_PATH); [print(c["chunk_id"], *(round(x,3) for x in (r.composite,r.d_comp,r.d_lex,r.d_concept,r.d_domain))) for l in open("/Users/lz/dev/fund/.agents/state/anki_cards.jsonl") for c in [json.loads(l)] for r in [card_density(c["front"],c["back"],b.lexicon)]]'
```

## After import

Report imported count and fronts. New cards enter the 金融 knowledge graph
automatically on the next `make precommit-fix YOLO=1` in `~/dev/anki`.
