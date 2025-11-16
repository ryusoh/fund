# Thesis Update Task – `<TICKER>`

## Mode

- Pick one:
    - `"interpret"` – only analyze and recommend
    - `"patch"` – analyze and generate patches
    - `"auto"` – do both; only emit patches if you conclude changes are needed

## Files

- Thesis: `docs/thesis/<TICKER>.md`
- JSON: `data/analysis/<TICKER>.json`
- Evidence (one or more):
    - `docs/thesis/<TICKER>/<TICKER>-bull-evidence.md`
    - `docs/thesis/<TICKER>/<TICKER>-base-evidence.md`
    - `docs/thesis/<TICKER>/<TICKER>-bear-evidence.md`
    - `docs/thesis/<TICKER>/<TICKER>-inbox.md`
- New material (raw article / transcript / notes):
    - `docs/thesis/<TICKER>/<TICKER>-input.md`

## Task

Given the files above and the selected `mode`, do the following:

1.  **Classification (always do this)**
    - Classify the new material as: Bull / Base / Bear / Neutral for `<TICKER>`.
    - If it mixes categories, explain briefly and pick the dominant one.

2.  **Summarize incremental insight (always)**
    - Summarize ONLY the _investment-relevant_ content in 3–5 bullets.
    - Focus on:
        - moat / business quality
        - growth drivers
        - risks / competitive dynamics
        - capital allocation / valuation

3.  **Scenario impact (always)**
    - State explicitly whether the new material affects:
        - Moat / business quality narrative
        - Scenario narratives (Bull/Base/Bear story text)
        - Scenario numbers in `data/analysis/<TICKER>.json`:
            - scenario probabilities
            - EPS CAGRs
            - exit P/Es
            - derived expected CAGR
            - Kelly weights
    - If you believe numbers SHOULD change, give:
        - BEFORE → AFTER values
        - 1-line rationale per change
    - If not, say “no numeric changes recommended”.

4.  **Patch generation (only if `mode` is "patch" or "auto" with changes)**
    - If `mode == "interpret"`:
        - Stop after step 3. Do not generate patches.
    - If `mode == "patch"`:
        - Always generate patches based on your recommendations in step 3.
    - If `mode == "auto"`:
        - Only generate patches if you recommended at least one change in step 3.
        - Otherwise, omit the patch sections and say “no patch needed”.

    When generating patches:

    4a. **Thesis patch (`docs/thesis/<TICKER>.md`)** - Anchor edits to specific sections (e.g. 4.2.4, 8.2), not the whole file. - Only modify: - scenario descriptions / mapping blocks - quantitative summary sections - evidence / log sections (e.g. 4.2.4, 8.2) - Output as a fenced diff block:

        ```diff
        --- a/docs/thesis/<TICKER>.md
        +++ b/docs/thesis/<TICKER>.md
        @@
        -<old lines>
        +<new lines>
        ```

    4b. **JSON patch (`data/analysis/<TICKER>.json`)** - Only touch the fields you recommended changing in step 3: - `scenarios[*].prob` - `scenarios[*].growth.epsCagr` - `scenarios[*].valuation.exitPe` - `derived.expectedCagr` - `derived.expectedMultiple` - `derived.kelly.fullKelly` - `derived.kelly.scaledKelly` - `position.maxKellyWeight` (if applicable) - Output as a fenced diff block:

        ```diff
        --- a/data/analysis/<TICKER>.json
        +++ b/data/analysis/<TICKER>.json
        @@
        -    "prob": 0.35,
        +    "prob": 0.38,
        ```

## Output Format

Always structure your answer like this:

1. `### Classification`
    - One line: Bull / Base / Bear / Neutral (+ 1–2 sentences).

2. `### Summary`
    - 3–5 bullets with incremental insights.

3. `### ScenarioImpact`
    - Bullets for:
        - Moat / business quality: [changed? how?]
        - Scenario narratives: [changed? how?]
        - Scenario numbers: [list BEFORE → AFTER or “no numeric changes recommended”]

4. `### ThesisPatch`
    - If no patch (mode="interpret" or auto/no changes):
        - Write: `No thesis patch generated.`
    - If patch is needed:
        - One `diff` block with ONLY the changed hunks for `docs/thesis/<TICKER>.md`.

5. `### JsonPatch`
    - If no JSON change:
        - Write: `No JSON patch generated.`
    - If patch is needed:
        - One `diff` block with ONLY the changed hunks for `data/analysis/<TICKER>.json`.
