---
name: anki-capture
description: Capture durable knowledge from a fund research or thesis session as Chinese-primary flashcards in the Anki 金融 deck, via the networking repo's gated card pipeline. Use after a findings doc or thesis update lands.
---

# Anki Capture Skill (/anki-capture)

Turns a fund chat session's durable artifact (a `docs/research/` findings doc
or a `docs/thesis/<TICKER>.md` update) into high-density flashcards in the
Anki **金融** deck. Design context: `docs/research/compounding-research-engine.md`.

## Core rules

- **Cards are downstream of docs.** Author cards only from an artifact that
  already exists in git (or is about to be committed this session). Never
  card-ify chat text that was not persisted.
- **Code gates, LLM authors.** You write card prose as JSONL; the networking
  repo's validator, density gate, dedup, and AnkiConnect import decide what
  enters the deck. Never write to Anki any other way (never raw-SQLite
  `collection.anki2`; never hand-edit `~/dev/networking/research/.anki_coverage.json`).
- **1–5 cards per session.** If everything seems card-worthy, you are
  card-ifying trivia. Pick what a future you must not forget.

## What is card-worthy here (read this first)

The user's financial fundamentals are strong — the marginal card is almost
never a finance concept (the legacy CFA-style theory cards already cover
those). The user's research is **first-principles industry and company
research**, so card-worthy material is:

- **Industry mechanics**: how a supply chain / technology transition / cost
  curve actually works (e.g. LPO vs. CPO trade-offs, who captures margin in
  the AI data-center networking stack).
- **Company structural variables**: the specific numbers, dependencies, and
  causal links a thesis hinges on (customer concentration, a product cycle's
  timing, a unit-economics driver).
- **Quantitative anchors**: TAM/share/margin figures with their derivation,
  so the number is recallable with its reasoning, not as bare trivia.

Not card-worthy: dictionary definitions of financial terms, generic valuation
theory, anything already in the deck's theory base.

## Pipeline

All pipeline paths are absolute (the tools anchor their state to their own
repo, so any cwd works). The staging file is
`.agents/state/anki_cards.jsonl` **in this repo** (gitignored; overwrite —
never append — each run; stale lines re-import as duplicates).

```bash
# 0. Optional but recommended: list current 金融 hub concepts so card fronts
#    can reuse their names verbatim (creates PageRank edges on the next
#    graph rebuild).
python3 ~/dev/anki/graph/analyze.py --deck F --top 20 --hubs

# 1. Author cards (you, the agent) → /Users/lz/dev/fund/.agents/state/anki_cards.jsonl
#    One JSON object per line: {chunk_id, front, back, tags, citation}
#    chunk_id := "fund/<relpath>:card-<n>"   (e.g. "fund/docs/thesis/ANET.md:card-1")
#    citation := "<relpath>#L<start>-L<end>"  (lines of the source passage in THIS repo)

# 2. Structural validation (hard gate)
python3 ~/dev/networking/tools/research/anki_card_validator.py \
    /Users/lz/dev/fund/.agents/state/anki_cards.jsonl

# 3. Density gate (against the pinned 金融 baseline)
python3 ~/dev/networking/tools/research/anki_density_gate.py \
    --cards /Users/lz/dev/fund/.agents/state/anki_cards.jsonl
#    Re-author any card flagged enrich/consolidate, then re-run 2 and 3.

# 3.5. LLM-as-judge pre-screen (you, the agent — no code): for each staged
#    card, re-read the source lines its citation points to and score a
#    4-point rubric: accuracy (claim matches source), citation match (those
#    lines actually support it), completeness (no load-bearing omission),
#    format (contract below). Rewrite any failing card, then re-run gates
#    2-3. (~1 hallucination per 21 LLM-authored cards is measured in the
#    literature; this pass catches them before human review.)

# 4. Human review: show the user the JSONL diff before importing.

# 5. Import (validator re-runs internally; refuses on any issue)
python3 ~/dev/networking/tools/research/anki_generator.py --import --deck "金融" \
    --cards /Users/lz/dev/fund/.agents/state/anki_cards.jsonl --auto-launch
```

`--auto-launch` starts Anki if it is not running. Import is deduped by
normalized-front content hash, but never re-import the same file twice.

For a single ad-hoc card (no batch worth staging), the one-shot path is:

```bash
python3 ~/dev/networking/tools/research/anki_generator.py \
    --front "<strong>中文概念</strong>: 具体问题？" --back "<b>…</b>…" \
    --deck "金融" --tags "research finance" --auto-launch
```

## Card format contract (machine-enforced; violations are hard rejects)

Authoritative spec: `~/dev/networking/docs/research/anki-card-pipeline-spec.md`
§8. The validator (`~/dev/networking/tools/research/anki_card_validator.py`)
enforces:

- **Front:** `<strong>中文概念</strong>: 具体机制问题？` — a Chinese concept
  name plus a concrete question (never a topic label). English in the title is
  limited to acronyms / single-token standard names (`DCF`, `LPO`);
  multi-word English glosses are machine-banned.
- **Back:** ≥2 dense sections, each headed `<b>section name:</b>`;
  Chinese-primary prose; LaTeX `\(...\)` for formulas. Prefer mechanism and
  quantitative content (formula, driver, threshold, trade-off) over
  definitional fluff.
- **English annotations:** cap of 2 non-acronym parenthetical glosses per
  back; when in doubt, do not annotate.
- **Acronyms:** expand every acronym on first use as an English parenthetical
  whose word initials subsequence-match (`DCF (Discounted Cash Flow)`); a
  Chinese gloss does not count. Only `COMMON_ACRONYMS` in the validator are
  exempt.
- **Citation:** the back must end with a `源码与文档引用 (Source Citation):`
  section containing a line-anchored link into the fund repo:
  `[docs/thesis/ANET.md#L10-L20](file:///Users/lz/dev/fund/docs/thesis/ANET.md#L10-L20)`.
- **Tags (canonical vocabulary only):** every card carries `research` +
  `finance`, optionally one or two of `valuation`, `moat`, `earnings`,
  `industry`, `macro` (or networking concept tags when the card is
  infrastructure-domain). Invented tags are rejected.

## After import

- Report what was imported (count, fronts).
- The new cards join the 金融 knowledge graph on the next
  `make precommit-fix YOLO=1` run in `~/dev/anki` (graph export is backgrounded
  there); no manual rebuild needed.
