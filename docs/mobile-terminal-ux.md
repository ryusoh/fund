# Mobile UX for the Terminal Page — Research Findings

Date: 2026-08-27. Research + documentation only; no code changed.

## 1. The question

The site hides the Terminal nav link on mobile (`hide-on-mobile`), but the page itself is
reachable and partially mobile-formatted. **What is the best way, grounded in HCI research
and current industry practice, to expose this terminal's functionality to mobile/touch
users?**

## 2. Short answer

Adopt an **assisted terminal**: keep the REPL (it is the page's identity and the engine is
already touch-compatible at the output layer), but add a **tappable suggestion-chip row
above the soft keyboard** driven by the existing command registry
(`js/transactions/terminal/constants.js`) and the existing prefix-matcher
(`js/transactions/terminal/autocomplete.js`), funneling completed commands through the
existing `executeCommand` dispatcher. This converts the CLI's recall burden into
recognition (NN/g heuristic #6) without a new UI paradigm, matches how every serious
mobile terminal app (Termius, Blink, Termux, a-Shell) solves the same problem, and is the
lowest-effort option. A read-only curated view (option d) is an acceptable interim
fallback; a chat/NL interface (option c) is not recommended.

## 3. Current interaction surface (Part 1, repo facts)

All line numbers verified by direct read this session unless marked otherwise.

### 3.1 Input affordances

- Single text input `#terminalInput` with `autocomplete="off"`, `spellcheck="false"`,
  `autofocus` — `terminal/index.html:161-169`. `initTerminal` also calls
  `terminalInput.focus()` on load — `js/transactions/terminal.js:410-412`. On a phone this
  pops the soft keyboard immediately and keeps it popping: clicking anywhere on the
  terminal body refocuses the input — `js/transactions/terminal.js:415-421`.
- **Keyboard-only command handling**: one `keydown` switch — `js/transactions/terminal.js:382-408`:
    - Enter → execute (`processEnterKey`, 335-345)
    - ArrowUp/ArrowDown → command history (347-368)
    - ArrowLeft/ArrowRight → **currency cycling** when input is empty or Ctrl/Meta held
      (370-380); a global keydown handler also cycles currency on arrows when no input is
      focused (`js/pages/terminal/index.js:447-477`)
    - Tab → autocomplete (`autocompleteCommand`, `js/transactions/terminal/autocomplete.js:94-129`)
- None of Enter/arrows/Tab has a touch equivalent on a soft keyboard; mobile keyboards
  lack Tab and arrow keys entirely.
- The **command registry is clean and reusable**: `COMMAND_ALIASES` (35 entries),
  `STATS_SUBCOMMANDS` (12), `PLOT_SUBCOMMANDS` (18), `HELP_SUBCOMMANDS` —
  `js/transactions/terminal/constants.js:1-76`. The matchers are pure prefix filters
  (`getCommandMatches` / `getSubcommandMatches`, `autocomplete.js:58-64` and `42-56`).
- Single dispatcher: `executeCommand(command, context)` — `js/transactions/terminal/commands.js:26-140`.
  Any tap UI can synthesize the same command strings and call it; no command-layer changes
  needed.
- Filter mini-language (`type:buy`, `security:NVDA`, `min:`, `max:`, `stock`, `etf`,
  `abs`/`per`, date filters `from:2022`, `2023q1`, `2022:2023`, `q2`) — documented in
  `js/transactions/terminal/handlers/help.js:38-42`. Non-command input is a free-text
  filter of the table — `commands.js:132-134` → `handleDefaultCommand`.
- Help text is desktop-centric: "Hint: Press Tab to auto-complete" — `help.js:31`.

### 3.2 Output types and their touch-readiness

- **Text output**: `<pre>` blocks appended to `#terminalOutput` — `js/transactions/terminal.js:298-307`;
  `white-space: pre-wrap; word-wrap: break-word` — `css/terminal/terminal.css:70-74`.
  Touch-friendly (read + scroll).
- **Canvas chart** `#runningAmountCanvas` — `terminal/index.html:179-186`. Its crosshair
  layer is **Pointer Events–based and explicitly touch-aware**: `preventDefault()` for
  `pointerType === 'touch'` — `js/transactions/chart/interaction.js:868-870` (move) and
  `954-956` (down); `setPointerCapture` at 957-958. `attachCrosshairEvents` binds
  `pointermove`/`pointerdown` (`passive: false`), `pointerup`, `pointercancel`,
  `pointerleave`, `dblclick` — interaction.js:1080-1111 (lines read by the orchestrating
  agent; I verified 1-1000). The composition hover panel has a mobile branch (smaller
  fonts/padding) — interaction.js:582-589. **Drag-to-scrub works on touch today.**
- **Chart legend**: plain `click` listeners on DOM items — interaction.js:735 — tap-compatible.
- **Transaction table**: header actions are real `<button>` elements (sortable/filterable) —
  `terminal/index.html:194-257` — tappable, though dense. Mobile rules already set
  `touch-action: auto`, `-webkit-overflow-scrolling: touch`, sticky `thead` —
  `css/terminal/responsive.css:110-135`.
- **Toggles**: currency toggle buttons exist but are hidden on mobile
  (`terminal/index.html:114` has `hide-on-mobile`; `css/terminal/base.css:101-109`).

### 3.3 What breaks or is awkward on a phone today

- **No path to the page**: the nav Terminal link is hidden at ≤768px on every page that
  carries it — `index.html:88`, `calendar/index.html:104`, `position/index.html:100`;
  rule at `css/container.css:294` and `css/main_index.css:98`.
- **Every command requires typing**; there is no tappable way to run even `help`.
  History (arrows) and Tab completion are unreachable on soft keyboards.
- **Font-size conflict**: the generic mobile rule sets all inputs to
  `font-size: 16px !important` (`css/terminal/responsive.css:1-7`) but `.terminal-input`
  is then overridden to `12px !important` (`responsive.css:90-95`). Sub-16px input text
  triggers iOS Safari's focus auto-zoom.
- **Soft keyboard occlusion**: autofocus on load (`terminal.js:411`) raises the keyboard
  over the terminal pane; the mobile output pane is only 170px tall
  (`responsive.css:79-83`) inside a `calc(100dvh - 118px)` column (`responsive.css:57-69`).
- `user-scalable=no` — `terminal/index.html:16-18` — blocks pinch-zoom for readability.
- Crosshair drag on the chart conflicts conceptually with vertical scroll, though
  `touch-action` handling and `passive:false` listeners mitigate this (interaction.js, above).

### 3.4 Existing mobile handling

`css/terminal/responsive.css` has a full `@media (max-width: 768px)` block (mobile
background, flex-column layout, panel sizing, table touch rules);
`js/transactions/layout.js:43-68` (`adjustMobilePanels`) recomputes panel heights on
load/resize (`js/pages/terminal/index.js:287,393,402-404`). So the page is _laid out_ for
mobile — only the _interaction model_ (typed commands) is not.

## 4. Research evidence (Part 2)

Each claim: **claim** — source URL — _source quality_.

### 4.1 Why typing-heavy UIs fail on phones

- **Claim 1**: **Average mobile typing is 36.2 WPM with 2.3% uncorrected errors, ~70% of desktop
  keyboard speed, in a 37,370-volunteer study.**
  <https://userinterfaces.aalto.fi/typing37k/> (Palin et al., MobileHCI'19) —
  _peer-reviewed; project page fetched, abstract verified._
- **Claim 2**: **Touchscreen entry runs ~15–30 WPM vs ~40 WPM on physical keyboards, with high error
  rates.** <https://arxiv.org/pdf/2409.03044v1> (survey of password entry on non-desktop
  devices) — _peer-reviewed survey preprint; verified via search snippet, not full read._
- **Claim 3**: **Touchscreen typing error rates are 7–10.8% vs 0.47–0.76% on physical keyboards.**
  <https://pure-oai.bham.ac.uk/ws/portalfiles/portal/156384598/3411764.3445483.pdf> —
  _peer-reviewed (CHI-format paper); snippet-level verification only._
- **Claim 4**: **Speech input was 3.0× faster than the smartphone keyboard with a 20.4% lower error
  rate (English).** <https://hci.stanford.edu/research/speech/> (Ruan et al., Stanford/UW/
  Baidu) — _peer-reviewed study page; fetched._ (Not a recommendation to add voice here;
  it bounds how costly typing is.)
- **Claim 5**: **Virtual keyboards "can occupy a substantial portion of the screen — often nearly
  half."** <https://arxiv.org/pdf/2504.12690> (mobile accessibility recommendations) —
  _arXiv preprint; snippet-level._ Matches what `responsive.css` implies: the keyboard
  plus a 170px output pane leaves almost nothing for charts/tables.

### 4.2 Recognition vs recall; command palettes as the bridge

- **Claim 6**: **"Command-line interfaces are based on recall"; menus and visible options convert the
  task to recognition, which is easier.** NN/g also notes search _suggestions_ "partly
  transform the query-generation task from one of recall to one of recognition" — the
  exact mechanism a suggestion-chip row exploits.
  <https://www.nngroup.com/articles/recognition-and-recall/> — _NN/g guideline article;
  fetched in full._
- **Claim 7**: **"Recognition rather than recall" is Nielsen heuristic #6: make elements, actions and
  options visible.** <https://www.nngroup.com/articles/ten-usability-heuristics/> —
  _NN/g canonical guideline; cited, not re-fetched this session._
- **Claim 8**: **Heuristic #7 (flexibility/efficiency): provide accelerators for experts while keeping
  the visible path for novices — i.e., don't drop the CLI, augment it.**
  <https://www.nngroup.com/articles/flexibility-efficiency-heuristic/> — _NN/g guideline;
  snippet-level._
- **Claim 9**: **Command palettes are the established industry bridge**: a single keyboard-first
  surface to "find and run commands, destinations, and recent items."
  <https://uxpatterns.dev/patterns/advanced/command-palette> — _pattern-library (secondary)._
  Mobbin's glossary similarly defines the pattern around "navigation and search,
  shortcuts and quick actions." <https://mobbin.com/glossary/command-palette> —
  _pattern-library (secondary)._ No dedicated NN/g command-palette article exists (searched).

### 4.3 Conversational / NL querying of data

- **Claim 10**: **V-NLI survey (Shen et al., IEEE TVCG): NL interfaces work best as "a complementary
  input modality to direct manipulation," not a replacement.**
  <https://arxiv.org/abs/2109.03506> — _peer-reviewed survey; abstract fetched._
- **Claim 11**: **NL interfaces for tabular data querying/visualization are an active, maturing
  research area.** <https://arxiv.org/html/2310.17894v3> — _peer-reviewed survey;
  snippet-level._
- **Claim 12**: **Eviza (Setlur et al., UIST 2016) demonstrated NL-driven visual analysis with a
  "conversation" over data.** DOI: <https://dl.acm.org/doi/10.1145/2984511.2984588> —
  _peer-reviewed (UIST); citation verified via two independent survey reference lists;
  paper itself not fetched._
- **Claim 13**: **Nielsen's caveat on chat UIs**: prose prompting has "deep-rooted usability problems";
  "half the population in rich countries is not articulate enough" to get good results;
  he predicts **hybrid UIs** combining intent-based and command-based interaction.
  <https://www.nngroup.com/articles/ai-paradigm/> — _NN/g essay; fetched in full._

### 4.4 Touch targets, progressive disclosure, hover

- **Claim 14**: **WCAG 2.2 SC 2.5.8 (AA): pointer targets ≥ 24×24 CSS px (with a spacing exception).**
  <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html> — _W3C normative
  guideline; w3.org returned 403 to fetch; text corroborated by multiple independent
  accessibility references._
- **Claim 15**: **WCAG SC 2.5.5 (AAA): targets ≥ 44×44 CSS px.** Full criterion text verified via
  <https://accessibility.build/wcag/2-5-5> — _secondary explainer quoting the normative
  text; fetched in full._
- **Claim 16**: **Apple HIG: 44×44 pt minimum touch target.** The HIG pages are JS-rendered and could
  not be fetched (nav shell only). Cited URL:
  <https://developer.apple.com/design/human-interface-guidelines/inputs> — _platform
  guideline; could not verify text directly; universally corroborated (incl. by the
  accessibility.build WCAG page above: "matches Apple's 44pt")._
- **Claim 17**: **Material Design: touch targets ≥ 48×48 dp ≈ 9 mm physical.**
  <https://m2.material.io/develop/web/supporting/touch-target> (spec page, snippet) and
  the figure quoted in <https://github.com/material-components/material-components-android/issues/1279>
  — _platform guideline; m3 page fetch returned a nav shell, m2 spec confirmed via
  snippet + official repo issue._
- **Claim 18**: **Apple HIG explicitly recommends progressive disclosure** ("Take advantage of
  progressive disclosure to help people discover content that's currently hidden") and
  spacing controls apart. <https://developer.apple.com/design/human-interface-guidelines/layout>
  — _platform guideline; fetched in full._

### 4.5 How real mobile terminals solve CLI input

- **Claim 19**: **Termius**: an extended-keyboard row (arrows, Ctrl/Alt modifiers, function keys);
  "Terminal Touch" mode mapping swipes to arrow keys; autocomplete suggested "based on
  commands you've used and your snippets"; pinch-to-zoom; one-tap password autofill.
  <https://support.termius.com/hc/en-us/articles/12482919487385-Mobile-Terminal> —
  _official vendor docs; fetched in full._
- **Claim 20**: **Blink Shell**: a "Smart Keys" bar (CTRL/ALT/ESC modifiers, arrows, scrollable extra
  keys) shown **only when the on-screen keyboard is up**; gestures for shell management
  (two-finger tap = new shell, pinch = resize, swipe = switch).
  <https://docs.blink.sh/> — _official vendor docs; fetched in full._
- **Claim 21**: **Termux**: a configurable extra-keys row (`~/.termux/termux.properties`,
  `extra-keys = ...`) and Volume-Down-as-Ctrl emulation.
  <https://wiki.termux.com/wiki/Touch_Keyboard> — _official project wiki; blocked by Anubis
  bot protection at fetch time; existence and config surface corroborated via the
  project's own issue tracker
  (<https://github.com/termux/termux-app/issues/4589>, which links the wiki pages)._
- **Claim 22**: **a-Shell**: per-window history and a user-configurable toolbar (`config -t`).
  <https://github.com/holzschu/a-shell> — _official repo README; fetched in full._
- **Claim 23**: **What transfers / what doesn't**: every one of these apps adds an app-defined row of
  tappable keys/chips above the soft keyboard plus history/snippet-driven suggestions.
  That pattern transfers directly. Modifier emulation (Ctrl/Alt), SSH session gestures,
  and pinch-to-zoom do not — this repo's terminal has no modal editing, no remote
  sessions, and its charts already handle touch.

### 4.6 Mobile finance apps

No credible primary-source UX research specific to mobile trading/finance app command
surfaces was found; industry observation (Bloomberg/Terminal-style apps, brokerage
search bars) consistently uses search+chips over free typing, but I found nothing
citable at primary-source quality. See Open Questions.

## 5. Design options, ranked (Part 3)

### (a) Assisted terminal — suggestion chips + kept REPL — RECOMMENDED

**What**: keep the terminal as-is; add a horizontally scrollable chip row docked above the
keyboard/prompt area, visible only at ≤768px. Chips are generated from
`COMMAND_ALIASES`/`STATS_SUBCOMMANDS`/`PLOT_SUBCOMMANDS` (constants.js) and filtered by
the same prefix logic as `autocomplete.js`. Tapping a complete command (`summary`,
`stats cagr`) executes it through `executeCommand` (commands.js:26); tapping an
incomplete one (`stats`, `plot`, `type:`) inserts the text into the input for completion.
A second row of filter chips (`type:buy`, `type:sell`, `stock`, `etf`, `from:2024`,
`2023q1`…) covers the filter mini-language from `help.js:38-42`.

**Why it fits**: it maps 1:1 onto the enumerated surface — commands, subcommands, filters,
aliases — with zero changes to the command engine. It converts recall to recognition
(claims 6-8), sidesteps mobile typing cost (claims 1-5), and is the exact pattern used by
Termius/Blink/Termux/a-Shell (claims 19-22). Chips must be ≥44×44 CSS px (claims 14-17).

**Trade-offs**: chips expose breadth, not depth — long-tailed numeric filters
(`min:1000`) still need typing. Row takes ~48px of scarce vertical space; mitigate with
horizontal scroll and contextual filtering (show subcommand chips only after `stats` is
tapped). **Effort: low-medium** (one new module + CSS in `css/terminal/`, jest tests).

### (b) Full command-palette / menu-driven UI

**What**: a tappable launcher button opening a full-screen, grouped menu of every
command/subcommand/filter with search.

**Why**: maximum discoverability (claims 6, 9); scales to the whole command surface;
familiar from VS Code/kbar.

**Trade-offs**: replaces the terminal metaphor on mobile rather than assisting it;
duplicates the command taxonomy in a second UI (maintenance burden when
`constants.js` changes — though it could be generated from the same registry);
full-screen overlay competes with chart/table visibility. **Effort: medium-high.**
Good eventual home for rarely used commands; overkill as step one.

### (c) Chat-style guided / NL interface

**What**: free-text "ask about your portfolio" box mapping NL to the existing commands.

**Why**: lowest recall burden in theory (claims 10-12).

**Trade-offs**: worst fit here. The command surface is already small and enumerable —
recognition (chips) beats probabilistic NL parsing. No backend/LLM exists in this static
site; NL parsing would be a new dependency or a fragile hand-written parser. NN/g's
literacy caveat and "hybrid UI" conclusion (claim 13) argue against chat-first. **Effort:
high, risk: high. Not recommended.**

### (d) Curated read-only mobile view

**What**: on mobile, skip the REPL: show the default chart + table with a row of tappable
chart/stats buttons (a degenerate form of (a) without the input).

**Why**: matches current reality — the nav already hides Terminal on mobile
(`index.html:88` etc.), so a curated view is arguably the _de facto_ current design
decision. Zero typing. Cheapest to ship.

**Trade-offs**: abandons the exploration loop that makes the terminal valuable; date and
numeric filters become impossible; the page's identity is lost. **Effort: low.** A
reasonable interim, or the graceful-degradation tier of option (a).

### Repo constraints honored

- Page-scoped: all new CSS goes in `css/terminal/responsive.css` (or a new
  `css/terminal/chips.css` imported only by `terminal/index.html`), gated behind the
  existing ≤768px media query — no leak to `position/`, `calendar/`, or `index/`.
- `data/` untouched: chips are generated from `js/transactions/terminal/constants.js`,
  not from generated data.
- Diff-coverage gate: the chip module needs jest tests (see Action items).

## 6. Action items

Ranked, concrete, anchor-verified.

1. **Fix the mobile input font-size conflict.** Find: `css/terminal/responsive.css:90-95`
   sets `.terminal-input { font-size: 12px !important; }` under `max-width: 768px`,
   overriding the `16px !important` anti-zoom rule at `responsive.css:1-7`. Change:
   set `.terminal-input` to `16px` in the mobile block (keep 12px on desktop via
   `css/terminal/terminal.css:89-102`). Verify: computed font-size of `#terminalInput`
   is 16px at 375px viewport width; add/adjust a jest test if one covers this CSS,
   otherwise verify via `make screenshot URL=/terminal/` at mobile emulation.
2. **Reconsider `autofocus`/auto-`.focus()` on touch devices.** Find:
   `js/transactions/terminal.js:410-412` focuses the input on init; combined with
   `terminal/index.html:167` (`autofocus`) this raises the soft keyboard over the page
   on load. Change: skip programmatic focus when `window.matchMedia('(pointer: coarse)').matches`
   (add to the `if (terminalInput)` block). Verify: new jest test asserting no focus call
   under coarse-pointer matchMedia mock; existing terminal tests still pass
   (`npx jest tests/js/transactions/terminal`).
3. **Add a chip-bar module.** Find: command taxonomy in
   `js/transactions/terminal/constants.js:1-76`; prefix matchers in
   `autocomplete.js:20-64`; dispatcher in `commands.js:26-140`; insertion point inside
   `.terminal` in `terminal/index.html:151-171` (between `#terminalOutput` and
   `.terminal-prompt`). Change: new `js/transactions/terminal/chips.js` rendering
   contextual chips (top-level commands → subcommand chips after `stats`/`plot`; a static
   filter-chip row) that either calls the terminal's `processCommand` (returned from
   `initTerminal`, terminal.js:447-449) or inserts text into `#terminalInput`. Wire it in
   `initTerminal` behind a `max-width: 768px` / coarse-pointer check. Verify: jest tests
   under `tests/js/transactions/terminal/` covering chip rendering, tap-to-execute vs
   tap-to-insert, and desktop inertness; `make precommit-fix` green.
4. **Chip styling, page-scoped.** Find: mobile media block at
   `css/terminal/responsive.css:38-148`. Change: add `.terminal-chips` styles there
   (horizontal scroll, ≥44×44px chip hit areas per WCAG 2.5.5, theme variables from
   `css/terminal/base.css:1-18`). Verify: `npx stylelint css/terminal/responsive.css`;
   measure chip boxes in a `make screenshot URL=/terminal/` mobile render.
5. **Make the Terminal nav link reachable on mobile** (product decision first — it is
   deliberately hidden today). Find: `index.html:88`, `calendar/index.html:104`,
   `position/index.html:100` (`hide-on-mobile` on the terminal `<li>`). Change: remove the
   class only after items 1-4 land, or the hidden link stays the graceful-degradation
   answer (option d). Verify: visual check on all four pages at ≤768px.
6. **Update help copy for touch.** Find: `js/transactions/terminal/handlers/help.js:31`
   ("Press Tab to auto-complete"). Change: mention chips/tapping when on coarse pointers
   (or make the hint input-agnostic). Verify: existing help tests in
   `tests/js/transactions/terminal/` updated accordingly.
7. **Defer**: command palette (option b) and NL/chat (option c). Revisit only if chip
   usage data or user feedback shows the chip row's breadth limit bites.

## 7. Open questions / what I couldn't verify

- **WCAG/Apple/Material primary texts**: w3.org returned 403 and Apple's/Material's
  guideline pages are JS-rendered (fetch returned nav shells). The 24px/44px/48dp figures
  were corroborated by multiple independent sources, but the normative pages were not read
  directly this session. Termux's wiki was bot-blocked; its extra-keys feature was
  corroborated via the project's GitHub issues.
- **Lines 1001-1143 of `js/transactions/chart/interaction.js`** (pointerup/pointercancel
  finalization and `attachCrosshairEvents` binding) were read by the orchestrating agent,
  not by me; I verified lines 1-1000 directly. Their report (Pointer Events only,
  `passive: false`, dblclick-to-clear) is consistent with everything in 1-1000.
- **Whether the terminal page is intentionally mobile-hidden as a product decision**:
  `hide-on-mobile` on the nav link may reflect "terminal is desktop-only by design."
  Action item 5 gates on that decision.
- **Mobile finance-app UX**: no primary-source material found; the analogy rests on the
  terminal-app evidence (claims 19-22), which is strong and directly on-point.
- **Real-device behavior unverified**: everything in §3.3 (iOS auto-zoom, keyboard
  occlusion, chip ergonomics) is inferred from code + cited research, not from a physical
  device session. A human should verify on an actual phone before shipping.
