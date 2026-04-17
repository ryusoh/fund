# Palette Journal

## 2025-02-17 - Accessible Currency Toggles and Navigation

**Learning:** Icon-only and symbol-only buttons, specifically currency toggles using `¥` for both CNY and JPY, cause visual ambiguity for sighted users and accessibility issues for screen readers. Navigation links containing only FontAwesome icons also lack context for assistive technologies. However, adding `title` attributes for hover labels compromises the app's minimalist design philosophy.

**Action:** Always add `aria-label` attributes for screen readers when using icon-only or ambiguous symbol-based interactive elements, ensuring assistive tech can announce the elements correctly. To preserve UI minimalism, avoid using `title` attributes (hover labels) unless explicitly requested. Ensure decorative icons have `aria-hidden="true"`.

## 2025-02-17 - Missing Focus Indicators for Keyboard Users

**Learning:** The application explicitly stripped focus outlines (`outline: none;`) from interactive elements like currency toggles, calendar navigation buttons, and main navigation links without providing an alternative focus state. This creates a severe accessibility issue for keyboard users navigating via Tab.

**Action:** Always provide a `:focus-visible` state when removing default `outline`. A 2px semi-transparent white outline with a small offset (`rgba(255, 255, 255, 0.5)`) works beautifully across dark UI elements without compromising the mouse/touch user experience.

## 2026-03-10 - Dynamic Async Results Need aria-live Updates

**Learning:** When injecting dynamic output asynchronously via JavaScript (like Monte Carlo risk outputs or Bayesian text updates), the screen reader will remain completely silent because the new DOM nodes don't automatically trigger an announcement. Additionally, a `<canvas>` element without a `role="img"` and `aria-label` acts as a complete black box, making visual simulation feedback entirely inaccessible to non-sighted users.

**Action:** Always add `aria-live="polite"` to parent containers that will be dynamically populated with important async results so that screen readers announce the changes naturally. Furthermore, give every meaningful `<canvas>` a semantic `role="img"` with a descriptive `aria-label`.

## 2026-03-11 - Interactive Table Headers Accessibility Pitfall

**Learning:** When making table headers (`<th>`) interactive for sorting or filtering, adding `role="button"` and `tabindex="0"` directly to the `<th>` tag is a severe accessibility anti-pattern. It overrides the implicit `columnheader` role, breaks table navigation for screen readers, and invalidates `aria-sort` attributes.

**Action:** Always wrap the contents of the `<th>` in a semantic native `<button type="button">` element. Move the visual padding from the `<th>` to the `<button>` so that focus outlines (`:focus-visible`) wrap the text nicely without breaking native table semantics.

## 2026-03-15 - Currency Toggle Accessibility

**Learning:** When using custom elements for grouped toggles like currency selectors, purely relying on an 'active' CSS class creates an accessibility gap where screen reader users cannot perceive the active state. 'aria-pressed' attribute works effectively to distinguish true/false states in a custom toggle group.

**Action:** Always complement visual 'active' classes on toggle buttons with 'aria-pressed' logic to ensure parity between visual and assistive technologies.

## 2026-03-24 - Table Horizontal Scrolling Accessibility

**Learning:** Containers with `overflow-x: auto` (like `.table-responsive-container` used across `position/index.html` and `terminal/index.html`) must be explicitly focusable so keyboard-only users can scroll through wide tables. Without `tabindex="0"` and a `:focus-visible` ring, horizontal scrolling is impossible or invisible for keyboard navigation.
**Action:** Always add `tabindex="0"` and an appropriate `:focus-visible` styling (e.g., `outline: 2px solid rgba(255, 255, 255, 0.5)`) to scrollable table containers. Ensure any `border-radius` visually matches the layout.

## 2026-03-25 - Focus Ring Border Radius Polish

**Learning:** Adding a `:focus-visible` outline to a container with rounded corners (`border-radius`, like 8px or 16px) results in a harsh, squared-off focus box that ignores the container's curved edges. This breaks the visual polish and fluidity of the UX during keyboard navigation.

**Action:** Always explicitly set a matching `border-radius` on the `:focus-visible` state of rounded containers so the focus ring smoothly aligns with the container's curved edges.

## 2026-03-26 - Scrollable Text Containers Need tabindex

**Learning:** Text containers with `overflow-y: auto` (like the terminal output window) must be explicitly focusable so keyboard-only users can scroll through the content history. Without `tabindex="0"`, arrow keys will scroll the whole page instead of the specific container, making long logs inaccessible.

**Action:** Always add `tabindex="0"` and an appropriate `:focus-visible` styling (e.g., `outline: 2px solid rgba(255, 255, 255, 0.5)`) to internally scrollable text areas or log outputs to enable keyboard scrolling.

## 2026-04-11 - Footer Navigation Focus Accessibility

**Learning:** The application explicitly stripped custom cursor attributes (`cursor: none !important;`) from footer links (`footer a`) to override default pointer styling, but simultaneously forgot to provide keyboard focus states (`:focus-visible`). This makes the GitHub profile link in the footer inaccessible for keyboard-only users who cannot perceive their tab position.

**Action:** Always complement navigational footer links with explicit `:focus-visible` styling (`outline: 2px solid rgba(255, 255, 255, 0.5); outline-offset: 4px;`) whenever interfering with default browser interactive styling, ensuring the links remain identifiable for keyboard navigation.

## 2026-04-12 - Disabled Interactive Elements Hover Polish

**Learning:** When adding hover states (`:hover`) to interactive elements like buttons, failing to scope the selector can result in disabled buttons continuing to show hover effects (like background color or shadow changes). This provides misleading visual cues to users, implying the element is interactive when it is not.

**Action:** Always append `:not(:disabled)` to `:hover` pseudo-classes on interactive elements (e.g., `.btn:hover:not(:disabled)`) to ensure hover styling is only applied when the element is actually usable.

## 2026-04-18 - Nested Grid Layout Scrollable Columns Accessibility

**Learning:** When using CSS Grid or Flexbox to create complex dashboard layouts with independently scrollable columns (e.g., `overflow-y: auto` on `.left-col` or `.right-col`), these containers must be explicitly focusable. Otherwise, keyboard users cannot scroll their contents if the content exceeds the viewport height.

**Action:** Always add `tabindex="0"` and an appropriate `:focus-visible` styling (e.g., `outline: 2px solid rgba(255, 255, 255, 0.5)`) to structurally scrollable column containers in complex layouts to enable keyboard scrolling.
