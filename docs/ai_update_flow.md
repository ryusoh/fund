# Thesis Update Workflow (Patch-First Instruction)

When new source material arrives (e.g., an interview transcript or trade publication article), follow this workflow to keep each thesis clean while capturing raw evidence.

## TL;DR flow

1. **Capture** – paste the raw article/notes into the correct evidence or inbox file.
2. **Interpret** – ask the AI to classify (Bull/Base/Bear), summarize, and flag any scenario-number changes.
3. **Patch** – ask the AI for precise patches to `docs/thesis/<TICKER>.md` and `data/analysis/<TICKER>.json`, anchored to sections.
4. **Apply** – apply those patches (either let the AI edit or copy them manually) and clean up the temporary `<TICKER>-inbox.md`.
5. **Review** – run `git diff` on the thesis + JSON and skim the updated sections to ensure they match your intent.

## 1. File placement

1. Paste the raw content into the appropriate evidence workspace:
    - `docs/thesis/<TICKER>/<TICKER>-inbox.md` for rough clippings
    - or directly into `...-bull-evidence.md`, `...-base-evidence.md`, or `...-bear-evidence.md`
2. Keep `docs/thesis/<TICKER>.md` polished—never drop full articles into it.

## 2. Standard AI prompt

Use a consistent prompt whenever you want the assistant to digest new material. Update paths for the relevant ticker.

```text
Input:
• Thesis file: docs/thesis/<TICKER>.md
• Evidence file: docs/thesis/<TICKER>/<TICKER>-<bull|base|bear>-evidence.md
• New material: docs/thesis/<TICKER>/<TICKER>-inbox.md

Task:
1. Classify the new material: Bull / Base / Bear / Neutral.
2. Summarize the investment-relevant content in 3–5 bullets.
3. Propose concrete edits to docs/thesis/<TICKER>.md:
   • Which section(s) should change (e.g. 4.2.4, 8.2)?
   • Exact markdown snippets to insert or replace.
4. Propose updates (if any) to data/analysis/<TICKER>.json:
   • scenario probabilities, EPS CAGRs, exit P/Es, expected CAGR, Kelly, etc.
5. Output the result as a patch: “before → after” text blocks only.
```

## 3. Apply the patch

- Review the AI’s patch-style output.
- Either instruct the assistant to edit the files directly (“please apply these changes”) or copy/paste the patch yourself.
- Keep the evidence logs updated with any raw sources, and only promote concise takeaways into the main thesis file.
- Once the new material has been summarized, delete or archive the temporary `<TICKER>-inbox.md` snippet so the inbox doesn’t accumulate stale content.

**Key principle:** always request “patch-style output” from the AI, never a free-form essay. This keeps diffs explicit and easy to apply.

## 4. Split interpretation from editing

For larger updates, run two passes:

### Pass A – Interpretation

```text
Input: evidence file, new material clip
Task:
1. Summarize in 5 bullets (focused on the ticker).
2. State whether it affects
   • Moat / business quality
   • Scenario narratives
   • Scenario numbers (probabilities, EPS CAGRs, exit P/Es)
3. If numbers should change, give before/after values and rationale only.
```

This yields guidance such as “Bull prob 0.35→0.38, Bear 0.20→0.17” or “no changes.”

### Pass B – Edit

````text
Task:
• Generate the exact patch for docs/thesis/<TICKER>.md.
• Generate the exact patch for data/analysis/<TICKER>.json.
Output: only the affected blocks (before → after), no commentary.
```text

You then decide whether to apply those patches manually or via the assistant.

## 5. Anchor edits to sections

Avoid broad “rewrite the bull case” requests. Instead, specify anchors:

- “In section 4.2.4 add one bullet under Company.”
- “In 8.2 add a dated log entry.”

Small, surgical edits keep headings, numbering, and tone intact and make git diffs easy to review.

## 6. Keep JSON and thesis synchronized

- Treat `data/analysis/<TICKER>.json` as the single source of truth for scenario inputs.
- The thesis describes and references those numbers.

Workflow:

1. When data might change, first propose JSON adjustments (probabilities, growth, multiples, CAGR, Kelly).
2. After updating JSON, ask the AI to regenerate the thesis sections that reference those values (e.g., scenario blocks, quantitative summary) so they stay aligned.

## 7. Reusable “thesis-update” prompt snippet

Save a template (or text expander) like:

```text
Thesis Update Task – <TICKER>
Files:
• Thesis: docs/thesis/<TICKER>.md
• JSON: data/analysis/<TICKER>.json
• Evidence: docs/thesis/<TICKER>/<TICKER>-*.md
New material:
• [paste or summarize here]
Steps:
1. Classify the material (Bull/Base/Bear/Neutral).
2. Summarize incremental insight (≤5 bullets).
3. Recommend scenario number changes.
4. Propose JSON edits (before/after).
5. Propose specific thesis edits (sections + exact markdown).
6. Output patch-style snippets only.
````

Reuse this whenever you ingest new inputs (earnings calls, articles, etc.).

## 8. Git and diffs as the safety net

- Keep the repository under version control.
- After applying AI-generated patches, run `git diff docs/thesis/<TICKER>.md data/analysis/<TICKER>.json`.

This quick check ensures no hidden changes landed (e.g., hurdles, horizons, headings). If something looks off, revert the offending hunk.

## 9. Unified thesis-update prompt

When new source material arrives (earnings, trade articles, whitepapers, interviews, etc.), use a **single, reusable prompt** to keep each thesis clean while capturing raw evidence and keeping JSON + MD in sync.

### 9.1 TL;DR

1. **Capture** – paste raw material into the correct evidence/inbox file.
2. **Run the unified prompt** – ask the AI to classify, summarize, decide if numbers change, and (optionally) generate patches.
3. **Apply** – let the AI edit files directly or apply the diff manually.
4. **Review** – use `git diff` to sanity‑check the thesis + JSON.

### 9.2 File placement

1. Paste raw content into the appropriate workspace:
    - `docs/thesis/<TICKER>/<TICKER>-inbox.md` for rough clippings, transcripts, and links.
    - Or directly into:
        - `docs/thesis/<TICKER>/<TICKER>-bull-evidence.md`
        - `docs/thesis/<TICKER>/<TICKER>-base-evidence.md`
        - `docs/thesis/<TICKER>/<TICKER>-bear-evidence.md`

2. Keep `docs/thesis/<TICKER>.md` **polished** — never dump long raw articles into it.

3. Treat `data/analysis/<TICKER>.json` as the **single source of truth** for scenario inputs (probabilities, growth, multiples, expected CAGR, Kelly, etc.).

### 9.3 Prompt template

Save this prompt (or a variant) somewhere easy to copy, e.g. `docs/ai/ThesisUpdatePrompt.md`.

When you have new material, fill in `<TICKER>`, `mode`, and the concrete paths, then send it to the AI:

````markdown
Thesis Update Task – <TICKER>

Mode:

- mode: one of
    - "interpret" # only analyze & recommend
    - "patch" # analyze + generate patches
    - "auto" # do both; only generate patches if changes are warranted

Files:

- Thesis: docs/thesis/<TICKER>.md
- JSON: data/analysis/<TICKER>.json
- Evidence: one or more of
    - docs/thesis/<TICKER>/<TICKER>-bull-evidence.md
    - docs/thesis/<TICKER>/<TICKER>-base-evidence.md
    - docs/thesis/<TICKER>/<TICKER>-bear-evidence.md
    - docs/thesis/<TICKER>/<TICKER>-inbox.md
- New material:
    - docs/thesis/<TICKER>/<TICKER>-inbox.md # or the specific evidence file containing the new text

### TASK

Given the files above and the selected `mode`, do the following:

1.  Classification (always)
    - Classify the new material as: Bull / Base / Bear / Neutral for <TICKER>.
    - If mixed, explain briefly and pick the dominant category.

2.  Incremental insight (always)
    - Summarize only the _investment-relevant_ content in 3–5 bullets:
        - moat / business quality
        - growth drivers
        - risks / competitive dynamics
        - capital allocation / valuation

3.  Scenario impact (always)
    - Say explicitly whether the new material affects:
        - Moat / business quality narrative
        - Scenario narratives (Bull/Base/Bear story text)
        - Scenario numbers in data/analysis/<TICKER>.json:
            - scenario probabilities
            - EPS CAGRs
            - exit P/Es
            - derived expected CAGR
            - Kelly weights
    - If you believe numbers SHOULD change, list:
        - BEFORE → AFTER values
        - 1‑line rationale per change
    - If not, say: “no numeric changes recommended”.

4.  Patch generation (controlled by `mode`)
    - If `mode == "interpret"`:
        - STOP after step 3. Do NOT generate patches.
    - If `mode == "patch"`:
        - Always generate patches based on your recommendations in step 3.
    - If `mode == "auto"`:
        - Only generate patches if you recommended at least one change in step 3.
        - Otherwise, skip the patch sections and say “no patch needed”.

    When generating patches:

    4a. Thesis patch (docs/thesis/<TICKER>.md) - Anchor edits to specific sections (e.g. 4.2.4, 5, 8.2), not the whole file. - Only touch: - scenario description / mapping blocks - quantitative summary sections - evidence / log sections (e.g. 4.2.4, 8.2) - Output as a fenced diff block:

        ```diff
        --- a/docs/thesis/<TICKER>.md
        +++ b/docs/thesis/<TICKER>.md
        @@
        -<old lines>
        +<new lines>
        ```

    4b. JSON patch (data/analysis/<TICKER>.json) - Only touch the fields you recommended changing in step 3: - `scenarios[*].prob` - `scenarios[*].growth.epsCagr` - `scenarios[*].valuation.exitPe` - `derived.expectedCagr` - `derived.expectedMultiple` - `derived.kelly.fullKelly` - `derived.kelly.scaledKelly` - `position.maxKellyWeight` (if applicable) - Output as a fenced diff block:

        ```diff
        --- a/data/analysis/<TICKER>.json
        +++ b/data/analysis/<TICKER>.json
        @@
        -    "prob": 0.35,
        +    "prob": 0.38,
        ```

### OUTPUT FORMAT

Respond in **five sections**:

1. ### Classification
    - One line: Bull / Base / Bear / Neutral (+ 1–2 sentences).

2. ### Summary
    - 3–5 bullets with incremental insights.

3. ### ScenarioImpact
    - Bullets for:
        - Moat / business quality: [changed? how?]
        - Scenario narratives: [changed? how?]
        - Scenario numbers: [list BEFORE → AFTER or “no numeric changes recommended”]

4. ### ThesisPatch
    - If no thesis patch (e.g. mode="interpret" or no change needed):
        - Write: `No thesis patch generated.`
    - If a patch is needed:
        - Provide ONE `diff` block with ONLY the changed hunks for docs/thesis/<TICKER>.md.

5. ### JsonPatch
    - If no JSON change:
        - Write: `No JSON patch generated.`
    - If a patch is needed:
        - Provide ONE `diff` block with ONLY the changed hunks for data/analysis/<TICKER>.json.
````

---

### 9.4 How to use the modes

- **interpret**
    - Use when you only want to know “what does this mean?” and whether numbers should move.
    - Good for quick reads, sanity checks, or when you’ll edit files manually.

- **patch**
    - Use when you already know you want the thesis + JSON updated if warranted.
    - The AI will always propose diff blocks for MD + JSON.

- **auto**
    - Use when you’re okay with the AI deciding whether a patch is needed.
    - If it concludes “no numeric or textual changes,” it will only give you Classification / Summary / ScenarioImpact and explicitly say “no patch needed”.

---

### 9.5 Apply the patch

1. Review the `### Classification`, `### Summary`, and `### ScenarioImpact` sections.
2. If the recommendations look reasonable:
    - Either instruct the assistant: “apply these patches to my files”, **or**
    - Copy the `diff` blocks into a patch / your editor and apply manually.
3. After applying, clean up any temporary `<TICKER>-inbox.md` you used for the new material.

---

### 9.6 Keep JSON and thesis synchronized

- Always update `data/analysis/<TICKER>.json` **first** if scenario numbers change.
- Then let the AI regenerate or patch the thesis sections that reference those numbers (scenario blocks, quantitative summary).
- Avoid hand-editing numbers in the MD that diverge from JSON; treat JSON as the canonical source.

---

### 9.7 Git and diffs as the safety net

- Keep the repo in git.
- After applying AI-generated patches, run:

    ```bash
    git diff docs/thesis/<TICKER>.md data/analysis/<TICKER>.json
    ```

- Skim for:
    - Unexpected changes to horizon, hurdle rate, benchmark, Kelly scale, section headings.
- If something looks off, revert the offending hunk and re-run the update with a tighter prompt (e.g., “do not touch preferences.horizon or preferences.benchmark”).
