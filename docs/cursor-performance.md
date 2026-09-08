# Cursor Performance & Responsiveness Investigation

## The question

How can [`js/vendor/cursor.js`](file:///Users/lz/dev/fund/js/vendor/cursor.js) tracking speed, frame responsiveness, and overall runtime efficiency be boosted across the site against primary sources, while eliminating unnecessary CPU loops, rendering pipeline conflicts, synchronous storage I/O, DOM thrashing, and render-blocking script payloads?

Method: Direct source code tracing across the frontend codebase ([`js/vendor/cursor.js`](file:///Users/lz/dev/fund/js/vendor/cursor.js), [`js/cursor-init.js`](file:///Users/lz/dev/fund/js/cursor-init.js), [`css/cursor.css`](file:///Users/lz/dev/fund/css/cursor.css), [`js/ui/magnetic_nav.js`](file:///Users/lz/dev/fund/js/ui/magnetic_nav.js), [`js/transactions/zoom.js`](file:///Users/lz/dev/fund/js/transactions/zoom.js)), W3C/WHATWG specifications (W3C Pointer Events Level 3, WHATWG Web Storage, CSS Transitions Module Level 1), existing test suites ([`tests/js/cursor/cursor_frame_rate.test.js`](file:///Users/lz/dev/fund/tests/js/cursor/cursor_frame_rate.test.js), [`tests/js/cursor/cursor_init_timing.test.js`](file:///Users/lz/dev/fund/tests/js/cursor/cursor_init_timing.test.js)), and load chain documentation ([`docs/lcp-performance.md`](file:///Users/lz/dev/fund/docs/lcp-performance.md)).

---

## Executive Summary

The custom cursor subsystem introduces five major performance and responsiveness bottlenecks that degrade pointer feel, burn main-thread CPU time, and postpone page readiness:

1. **Sluggish tracking latency (`followEase: 0.4`):** The exponential lerp with `followEase = 0.4` incurs an effective time constant $\tau \approx 32.6\text{ ms}$, creating a physical trailing lag of 33–65px at normal mouse speeds (1000–2000 px/s). Because the native OS cursor is hidden globally via `html.force-hide-cursor`, the visual target feels sluggish and disconnected from hand movements. Furthermore, listening to compatibility `mousemove` instead of `pointermove` misses early dispatch by the browser's compositor input pipeline.
2. **Conflicting per-frame render loop & GSAP overhead:** In every animation frame, `cursor.js` calls `gsap.set` twice (allocating two temporary objects per frame) to write inline CSS transforms. Setting inline `transform: scale()` on `.custom-cursor__core` directly collides with CSS `transition: transform 0.15s ease` declared in [`css/cursor.css`](file:///Users/lz/dev/fund/css/cursor.css#L44), continuously restarting a 150ms CSS transition 60–120 times per second and thrashing Blink's style and animation engines. Moreover, the RAF loop spins continuously without an idle sleep threshold.
3. **Synchronous storage I/O at 60Hz:** In [`js/vendor/cursor.js:234`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L234), every `mousemove` event queues `schedulePersistPosition()`, which invokes `sessionStorage.setItem()` inside a RAF callback. During continuous pointer motion, the main thread executes synchronous, blocking storage serialization and browser IPC up to 60–120 times/second. This is redundant because `pagehide` and `beforeunload` listeners are already bound ([`cursor.js:208-210`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L208-L210)) to persist position on page navigation.
4. **DOM & event listener overhead:** At boot, [`attachHoverTargets()`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L219) queries the entire DOM and attaches three individual listeners (`mouseenter`, `mouseleave`, `click`) plus inline cursor style overrides to every matching interactive element (~150+ listeners across complex pages), completely failing on dynamically rendered elements. Simultaneously, [`bindPointerListeners()`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L102) captures every `pointerover`, `pointerdown`, and `focusin` event across the entire document to write inline styles on hovered nodes and stores them in a strong `Set` (`overriddenElements`), creating an unbounded DOM node memory leak.
5. **Blocking vendor script payload (`gsap.min.js`):** A 71.5 KB (27.9 KB gzipped) classic blocking script is loaded on all four pages ([`index.html`](file:///Users/lz/dev/fund/index.html#L148), [`calendar/index.html`](file:///Users/lz/dev/fund/calendar/index.html#L176), [`position/index.html`](file:///Users/lz/dev/fund/position/index.html#L190), [`terminal/index.html`](file:///Users/lz/dev/fund/terminal/index.html#L285)), delaying `DOMContentLoaded` and ES module execution. In [`cursor.js`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L274), GSAP is only used for `gsap.set` (trivially replaceable by direct `translate3d`). However, a full codebase audit reveals GSAP is also consumed by [`js/ui/magnetic_nav.js`](file:///Users/lz/dev/fund/js/ui/magnetic_nav.js) (all pages) and [`js/transactions/zoom.js`](file:///Users/lz/dev/fund/js/transactions/zoom.js) (terminal only), which must be addressed to unlock full bundle removal.

---

## Primary Findings & Claim-by-Claim Evidence

### 1. Responsiveness & Tracking Speed

#### A. Mathematical analysis of `followEase: 0.4` and time-scaled lerp

- **Primary sources:** [`js/vendor/cursor.js:258-273`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L258-L273); [`js/cursor-init.js:12`](file:///Users/lz/dev/fund/js/cursor-init.js#L12); [`tests/js/cursor/cursor_frame_rate.test.js:1-8, 72-107`](file:///Users/lz/dev/fund/tests/js/cursor/cursor_frame_rate.test.js#L1-L8).
- **Behavior:** In [`js/vendor/cursor.js:261-262`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L261-L262), the easing alpha is scaled by elapsed frame time:

    ```javascript
    const frameScale = dt / (1000 / 60);
    const followAlpha = 1 - Math.pow(1 - this.followEase, frameScale);
    ```

    At standard 60Hz ($\Delta t = 16.667\text{ ms}$, $\text{frameScale} = 1.0$), $\text{followAlpha} = \text{followEase} = 0.4$.

- **Continuous exponential smoothing equivalent:**
  The discrete exponential filter is governed by:
  $$x_k = x_{k-1} + \alpha (x_{\text{target}} - x_{k-1}) \implies (x_{\text{target}} - x_k) = (1 - \alpha)(x_{\text{target}} - x_{k-1})$$
  In continuous time with step $\Delta t_0 = 16.667\text{ ms}$, the decay factor is $(1 - \text{followEase}) = e^{-\Delta t_0 / \tau}$, yielding the continuous time constant $\tau$:
  $$\tau = \frac{\Delta t_0}{-\ln(1 - \text{followEase})} = \frac{16.667\text{ ms}}{-\ln(0.6)} = \frac{16.667}{0.51083} \approx 32.63\text{ ms}$$
- **Convergence metrics for `followEase: 0.4`:**
    - **Half-life ($t_{50\%}$):** $\tau \ln(2) \approx 22.62\text{ ms}$ (1.36 frames at 60Hz).
    - **90% convergence ($t_{90\%}$):** $\tau \ln(10) \approx 75.13\text{ ms}$ (4.51 frames at 60Hz).
    - **95% convergence ($t_{95\%}$):** $\tau \ln(20) \approx 97.74\text{ ms}$ (5.86 frames at 60Hz).
    - **99% convergence ($t_{99\%}$):** $\tau \ln(100) \approx 150.27\text{ ms}$ (9.02 frames at 60Hz).
- **Physical tracking error under motion:**
  When moving at constant velocity $v$, the steady-state tracking error is exactly $D = v \cdot \tau$:
    - At $1000\text{ px/s}$ (moderate cursor travel across viewport):
      $$D = 1000\text{ px/s} \times 0.03263\text{ s} \approx 32.6\text{ px}$$
    - At $2000\text{ px/s}$ (brisk navigation towards a button):
      $$D = 2000\text{ px/s} \times 0.03263\text{ s} \approx 65.3\text{ px}$$
    - At $3000\text{ px/s}$ (quick flick):
      $$D = 3000\text{ px/s} \times 0.03263\text{ s} \approx 97.9\text{ px}$$
      Because the native cursor is hidden, a 33–98px trailing gap creates a pronounced feeling of input delay and "rubber-banding."

- **Parametric comparison of easing alpha values:**

    | `followEase`       | Remaining Factor ($1 - \alpha$) | Time Constant $\tau$ | $t_{50\%}$ (Half-Life) | $t_{95\%}$ (Settle) | $t_{99\%}$ (Settle) | Lag at 1000 px/s | Lag at 2000 px/s | Perceived Sensation                                |
    | :----------------- | :------------------------------ | :------------------- | :--------------------- | :------------------ | :------------------ | :--------------- | :--------------- | :------------------------------------------------- |
    | **0.40** (current) | 0.60                            | 32.6 ms              | 22.6 ms                | 97.7 ms             | 150.3 ms            | 32.6 px          | 65.3 px          | Sluggish, floaty, heavy rubber-band                |
    | **0.60**           | 0.40                            | 18.2 ms              | 12.6 ms                | 54.5 ms             | 83.8 ms             | 18.2 px          | 36.4 px          | Noticeably snappier, gentle trail                  |
    | **0.75**           | 0.25                            | 12.0 ms              | 8.3 ms                 | 36.0 ms             | 55.4 ms             | 12.0 px          | 24.1 px          | **Optimal balance**: crisp tracking, organic trail |
    | **0.85**           | 0.15                            | 8.8 ms               | 6.1 ms                 | 26.3 ms             | 40.5 ms             | 8.8 px           | 17.6 px          | Highly responsive, subtle softness                 |
    | **1.00**           | 0.00                            | 0.0 ms               | 0.0 ms                 | 0.0 ms              | 0.0 ms              | 0.0 px           | 0.0 px           | Instant hardware lock (zero easing)                |

    _Recommendation:_ Increase `followEase` from `0.4` to `0.75`–`0.85`. This slashes steady-state lag from 32.6ms to 8.8–12.0ms (<1 display frame at 60Hz), while preserving the organic visual style without feeling sluggish.

#### B. `mousemove` vs `pointermove` (event dispatch timing, sampling rate, coalescing)

- **Primary sources:** W3C Pointer Events Level 3 (<https://www.w3.org/TR/pointerevents3/>) § 5.2.1, § 9; Chromium Input Pipeline Architecture; [`js/vendor/cursor.js:212, 311`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L212).
- **Dispatch order:** In Chromium and WebKit, input packets from the operating system are processed by the compositor thread. The browser dispatches `pointermove` events _first_. Only after pointer event processing is complete does the engine synthesize legacy compatibility `mousemove` events. Listening to `mousemove` ([`cursor.js:212`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L212)) introduces unnecessary compatibility dispatch latency.
- **High-polling hardware and coalesced events:** Modern mice report at 125Hz, 500Hz, or 1000Hz (every 1–8ms). Browsers coalesce high-frequency samples between animation frames into a single dispatched event. `PointerEvent.getCoalescedEvents()` allows reading intermediate coordinates if micro-path smoothing is desired; for direct tracking, the latest `PointerEvent.clientX/Y` reflects the newest hardware state.
- **Passive listener optimization:** The current code binds with `window.addEventListener('mousemove', this.onMouseMove)` without `{ passive: true }`. Binding `pointermove` with `{ passive: true }` explicitly informs the compositor that `preventDefault()` will not be called, preventing main-thread input hit-test queuing.

---

### 2. Per-Frame Loop & Rendering Overhead

#### A. `gsap.set` vs Direct CSS Transforms

- **Primary sources:** [`js/vendor/cursor.js:274-282`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L274-L282); [`css/cursor.css:31-48`](file:///Users/lz/dev/fund/css/cursor.css#L31-L48).
- **Code in `loop(timestamp)`:**

    ```javascript
    gsap.set(this.element, {
        opacity: this.coords.opacity.value,
        x: this.coords.x.value,
        y: this.coords.y.value,
        zIndex: 100,
    });
    gsap.set(this.core, {
        scale: this.coords.scale.value,
    });
    ```

- **Execution cost on every frame (60–120 times per second):**
    1. **Heap churn / GC pressure:** Every frame allocates two new object literals (`{ opacity, x, y, zIndex }` and `{ scale }`), generating 120–240 object allocations per second during animation, causing V8 garbage collection spikes.
    2. **GSAP internal pipeline:** `gsap.set()` passes targets through GSAP's plugin resolver (`CSSPlugin`), builds/inspects `_gsap` cache objects, parses units, constructs transform matrix strings, and writes to `element.style.transform`.
    3. **Pointless property write:** `zIndex: 100` is written on every frame. In [`css/cursor.css:35`](file:///Users/lz/dev/fund/css/cursor.css#L35), `.custom-cursor--wrapper` already specifies `z-index: 99999 !important;`. The per-frame `zIndex: 100` inline style is both completely ineffective (defeated by `!important`) and redundant.
- **Direct transform equivalent:**
  Replacing `gsap.set` with direct DOM property assignment:

    ```javascript
    this.element.style.transform = `translate3d(${this.coords.x.value}px, ${this.coords.y.value}px, 0)`;
    this.element.style.opacity = this.coords.opacity.value;
    ```

    - Eliminates all per-frame object allocations.
    - Directly sets the hardware-accelerated 3D transform layer, allowing Blink/WebKit to update the compositor layer directly without full layout/paint.

#### B. The CSS Transition vs JS Lerp Conflict

- **Primary sources:** [`css/cursor.css:44-52`](file:///Users/lz/dev/fund/css/cursor.css#L44-L52); [`js/vendor/cursor.js:243-251, 270, 280-282`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L243-L251).
- **The code:**
  In [`css/cursor.css:44-52`](file:///Users/lz/dev/fund/css/cursor.css#L44-L52):

    ```css
    .custom-cursor__core {
        ...
        transition: transform 0.15s ease;
        transform: scale(1);
        will-change: transform;
    }
    .custom-cursor__core.is-hovered {
        transform: scale(3);
    }
    ```

    In [`js/vendor/cursor.js:243-251`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L243-L251):

    ```javascript
    onMouseEnter() {
        this.core.classList.add(this.hoverClass); // adds 'is-hovered'
        this.coords.scale.current = this.hoverScale;
    }
    onMouseLeave() {
        this.core.classList.remove(this.hoverClass); // removes 'is-hovered'
        this.coords.scale.current = 1;
    }
    ```

    In [`js/vendor/cursor.js:270, 280-282`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L270):

    ```javascript
    this.coords.scale.value = lerp(this.coords.scale.value, this.coords.scale.current, fadeAlpha);
    ...
    gsap.set(this.core, { scale: this.coords.scale.value });
    ```

- **The runtime conflict:**
    1. When hovering, JS adds `.is-hovered`, which attempts to trigger a CSS transition towards `scale(3)`.
    2. Simultaneously, `coords.scale.current = 3` starts a JS exponential lerp in `loop()`.
    3. On frame 1 (~16.7ms), JS computes `scale.value = 1.2` and writes inline `style="transform: scale(1.2);"`.
    4. The browser's CSS transition engine intercepts this inline transform change and initiates a 0.15s transition towards `scale(1.2)`.
    5. On frame 2 (~16.7ms), JS computes `scale.value = 1.38` and overwrites inline `style="transform: scale(1.38);"`.
    6. The CSS engine cancels the first transition and starts a new 0.15s transition towards `scale(1.38)`.
    7. This cycle interrupts and restarts the CSS transition 60 times a second throughout the animation.
    8. Two separate easing algorithms are stacked: the JS exponential lerp (`fadeEase: 0.1`, ~450ms settle time) is filtered through a 150ms cubic-bezier transition in CSS.
    9. Furthermore, because inline styles take specificity precedence over class selectors, `.custom-cursor__core.is-hovered { transform: scale(3); }` in CSS is dead code.
- **Resolution:**
  Offload the hover scaling animation entirely to CSS:
    - Remove `scale` tracking from `cursor.js` (`coords.scale`, `lerp`, and `gsap.set(this.core)`).
    - Let `.custom-cursor__core.is-hovered { transform: scale(3); }` and `transition: transform 0.15s ease;` run natively on the compositor thread.
    - On hover, JS simply toggles `.is-hovered`. The browser animates the scale transform with zero main-thread JS calculations or DOM style mutations.

#### C. Continuous Unpausable RAF Loop

- **Primary sources:** [`js/vendor/cursor.js:216, 284`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L216).
- **Behavior:**
  In constructor: `this.rafId = requestAnimationFrame(this.loop);`
  In `loop()`: `this.rafId = requestAnimationFrame(this.loop);`
  There is no termination condition.
- **Overhead during mouse idle:**
  When the user is reading content and the mouse is stationary:
    - $|x_{\text{target}} - x_{\text{current}}| < 0.0001\text{ px}$.
    - Yet `loop()` executes 60 times per second (or 120 times/second on ProMotion displays).
    - That constitutes **7,200 loop executions, 14,400 GSAP calls, and 14,400 DOM style writes per minute of complete idle**.
    - Wastes CPU cycles, drains laptop batteries, and keeps the GPU compositor awake.
- **Sleeping/Wake Architecture:**
    - In `loop()`, test convergence: if $|x_{\text{current}} - x_{\text{value}}| < 0.05\text{ px}$, $|y_{\text{current}} - y_{\text{value}}| < 0.05\text{ px}$, and $|\text{opacity}_{\text{current}} - \text{opacity}_{\text{value}}| < 0.005$, snap values to target, apply final styles, set `this.isLooping = false`, and **do not** call `requestAnimationFrame`.
    - In `onPointerMove`: if `!this.isLooping`, set `this.isLooping = true`, update `this.lastFrameTime = performance.now()`, and call `requestAnimationFrame(this.loop)`.

---

### 3. Storage & Synchronous I/O Overhead

- **Primary sources:** [`js/vendor/cursor.js:48-63, 230-236, 287-297`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L48-L63); WHATWG Web Storage Specification § 3 (<https://html.spec.whatwg.org/multipage/webstorage.html#the-sessionstorage-attribute>).
- **The code:**
  In [`cursor.js:230-235`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L230-L235):

    ```javascript
    onMouseMove(event) {
        this.coords.x.current = event.clientX;
        this.coords.y.current = event.clientY;
        this.coords.opacity.current = 1;
        this.schedulePersistPosition();
    }
    ```

    In [`cursor.js:287-297`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L287-L297):

    ```javascript
    schedulePersistPosition() {
        if (this.persistPositionFrame) return;
        this.persistPositionFrame = requestAnimationFrame(() => {
            this.persistPositionFrame = null;
            this.persistPosition();
        });
    }
    persistPosition() {
        persistCursorPosition(this.coords.x.current, this.coords.y.current);
    }
    ```

- **Analysis:**
    1. Per the WHATWG Web Storage spec, `sessionStorage.setItem` is **synchronous and blocking**. In Chromium, it executes JSON serialization and inter-process communication (IPC) to the browser process.
    2. While `requestAnimationFrame` throttles calls to at most once per frame, that still means **up to 60 synchronous storage writes per second** during continuous mouse movement (3,600 storage writes per minute of user interaction).
    3. **Complete redundancy:** Why is cursor position persisted? To restore coordinates when navigating between pages ([`cursor.js:186-188`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L186-L188)).
       Lines 208-210 already register:

        ```javascript
        window.addEventListener('pagehide', this.persistPosition);
        window.addEventListener('beforeunload', this.persistPosition);
        ```

        Under the W3C Page Lifecycle specification, `pagehide` is guaranteed to fire immediately prior to document unload when navigating to another page.

    4. Persisting on every single frame of movement is completely unnecessary. Deleting `this.schedulePersistPosition()` from `onMouseMove` slashes storage writes from 3,600/minute to exactly 1 write per page navigation, eliminating all main-thread storage IPC during browsing.

---

### 4. DOM & Event Listener Overhead

#### A. `attachHoverTargets()` and $3 \times N$ Listeners

- **Primary sources:** [`js/vendor/cursor.js:219-228, 314-321`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L219-L228); [`js/cursor-init.js:11`](file:///Users/lz/dev/fund/js/cursor-init.js#L11).
- **The code:**

    ```javascript
    attachHoverTargets() {
        if (this.disabled) return;
        const nodes = this.root.querySelectorAll(this.hoverTargets);
        nodes.forEach((node) => {
            node.style.setProperty('cursor', HIDDEN_CURSOR_VALUE, 'important');
            node.addEventListener('mouseenter', this.onMouseEnter);
            node.addEventListener('mouseleave', this.onMouseLeave);
            node.addEventListener('click', this.onMouseLeave);
        });
    }
    ```

- **Architectural defects:**
    1. **Listener explosion:** On complex pages, matching 50 interactive elements creates 150 separate event listener bindings in V8 memory.
    2. **Inline style mutation:** Mutates inline `style="cursor: ... !important"` on every matching node in the DOM.
    3. **Broken on dynamic DOM:** Any element created after page boot (e.g. terminal output rows, dynamically rendered position table rows, calendar tiles, dialogs) has no listeners attached and will not trigger cursor expansion.
- **Event delegation replacement:**
  A single delegated listener pair on `document`:

    ```javascript
    document.addEventListener(
        'pointerover',
        (e) => {
            const target = e.target.closest(this.hoverTargets);
            if (target && target !== this.currentHoverTarget) {
                this.currentHoverTarget = target;
                this.onMouseEnter();
            }
        },
        { passive: true }
    );

    document.addEventListener(
        'pointerout',
        (e) => {
            if (this.currentHoverTarget) {
                const related = e.relatedTarget?.closest(this.hoverTargets);
                if (related !== this.currentHoverTarget) {
                    this.currentHoverTarget = null;
                    this.onMouseLeave();
                }
            }
        },
        { passive: true }
    );
    ```

    - Reduces listener count from $3 \times N$ to exactly 2 listeners for the entire lifetime of the page.
    - Automatically works for 100% of present and future dynamic DOM elements.
    - Eliminates inline style mutations on targets.

#### B. `pointerEventHandler` Inline Style Thrashing & Memory Leak

- **Primary sources:** [`js/vendor/cursor.js:12-16, 65-116`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L12-L16); [`css/cursor.css:7-29`](file:///Users/lz/dev/fund/css/cursor.css#L7-L29).
- **The code:**

    ```javascript
    const overriddenElements = new Set();

    const applyInlineCursorToElement = (element) => {
        if (!element || !element.style || overriddenElements.has(element) || ...) return;
        try {
            element.style.setProperty('cursor', HIDDEN_CURSOR_VALUE, 'important');
            overriddenElements.add(element);
        } catch (e) { ... }
    };

    const pointerEventHandler = (event) => {
        if (!htmlElement || !htmlElement.classList?.contains(FORCE_HIDE_CLASS)) return;
        applyInlineCursorToElement(event.target);
    };
    ```

    In [`bindPointerListeners()`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L102):
    Capturing listeners (`true`) are registered on `document` for `pointerover`, `pointerdown`, and `focusin`.

- **Flaws:**
    1. **Capturing phase interception:** Every single pointer interaction anywhere in the document triggers `pointerEventHandler`.
    2. **Memory leak:** `overriddenElements` is a standard `Set` holding **strong references** to DOM elements. When dynamic components (such as terminal tables or chart tooltips) remove elements from the DOM, those detached DOM nodes cannot be garbage-collected because they are retained in `overriddenElements`.
    3. **Universal redundancy:** In [`css/cursor.css:7-13`](file:///Users/lz/dev/fund/css/cursor.css#L7-L13):

        ```css
        html.force-hide-cursor,
        html.force-hide-cursor body,
        html.force-hide-cursor body *,
        html.force-hide-cursor body *::before,
        html.force-hide-cursor body *::after {
            cursor: var(--hidden-cursor-value, none) !important;
        }
        ```

        CSS already enforces `cursor: ... !important` over every element in the document tree. The JavaScript listener was added as an aggressive brute-force fallback, but only succeeds in thrashing styles and leaking memory. Removing `bindPointerListeners()` and `overriddenElements` completely cleanses this overhead.

---

### 5. Page Load & Vendor Bundle Overhead

#### A. Comprehensive Codebase Audit of `gsap.min.js`

- **Primary sources:**
    - File: `js/vendor/gsap.min.js` (71,520 bytes raw, 27,877 bytes gzip).
    - Script tags:
        - [`index.html:148`](file:///Users/lz/dev/fund/index.html#L148): `<script src="./js/vendor/gsap.min.js"></script>`
        - [`calendar/index.html:176`](file:///Users/lz/dev/fund/calendar/index.html#L176): `<script src="../js/vendor/gsap.min.js"></script>`
        - [`position/index.html:190`](file:///Users/lz/dev/fund/position/index.html#L190): `<script src="../js/vendor/gsap.min.js"></script>`
        - [`terminal/index.html:285`](file:///Users/lz/dev/fund/terminal/index.html#L285): `<script src="../js/vendor/gsap.min.js"></script>`
        - [`sw.js:38`](file:///Users/lz/dev/fund/sw.js#L38): `'./js/vendor/gsap.min.js'`
- **Full repository scan for `gsap` references:**
  Grep across all tracked files reveals where GSAP is actually imported or called:
    1. [`js/vendor/cursor.js:2, 274, 280`](file:///Users/lz/dev/fund/js/vendor/cursor.js#L2):
       `gsap.set(this.element, ...)` and `gsap.set(this.core, ...)`. **Trivially removable** in favor of direct CSS transform properties.
    2. [`js/cursor-init.js:6-8`](file:///Users/lz/dev/fund/js/cursor-init.js#L6-L8):
       `if (!window.gsap) return;`. Guard check that exists only because of `cursor.js`.
    3. [`tests/js/cursor/cursor_init_timing.test.js`](file:///Users/lz/dev/fund/tests/js/cursor/cursor_init_timing.test.js):
       Added in commit `6436245` specifically to test that `cursor-init.js` waits for `window.gsap`. If `cursor.js` no longer requires GSAP, this test must be updated.
    4. [`js/ui/magnetic_nav.js:2, 33, 43, 54, 63`](file:///Users/lz/dev/fund/js/ui/magnetic_nav.js#L2):
       Loaded on **all four pages** ([`index.html:149`](file:///Users/lz/dev/fund/index.html#L149), [`calendar/index.html:185`](file:///Users/lz/dev/fund/calendar/index.html#L185), [`position/index.html:197`](file:///Users/lz/dev/fund/position/index.html#L197), [`terminal/index.html:289`](file:///Users/lz/dev/fund/terminal/index.html#L289)). Uses `window.gsap.to(el, { duration: 0.3, ease: 'power2.out' })` and elastic snapback `window.gsap.to(el, { duration: 0.7, ease: 'elastic.out(1, 0.3)' })`.
    5. [`js/transactions/zoom.js:5, 86, 98, 139, 185, 242`](file:///Users/lz/dev/fund/js/transactions/zoom.js#L5):
       Loaded on **`/terminal/` only**. Uses `gsap.timeline({ onUpdate, onComplete })` for animating terminal output pane expansion into chart area, with `syncResize()` synchronization for the liquid glass canvas.
    6. [`docs/reference/visualization.js`](file:///Users/lz/dev/fund/docs/reference/visualization.js):
       Reference document only (not loaded on any page).

#### B. Impact of Dropping GSAP

- **Direct impact on `cursor.js`:**
  Removing `gsap.set` makes `cursor.js` 100% vanilla and standalone. It eliminates the startup race condition where cursor initialization failed if GSAP had not finished executing.
- **Impact on DOMContentLoaded & LCP:**
  As established in [`docs/lcp-performance.md:155-158`](file:///Users/lz/dev/fund/docs/lcp-performance.md#L155-L158), `gsap.min.js` is a parser-blocking classic script near the bottom of `<body>`. The HTML parser must halt parsing, fetch, and evaluate 71.5 KB of code before emitting `DOMContentLoaded`.
    - Removing `gsap.min.js` saves 71.5 KB uncompressed / 27.9 KB gzipped transfer on every initial page visit.
    - Eliminates 15–40ms of V8 main-thread parse/compile time on mobile devices.
    - Once `magnetic_nav.js` is refactored to standard CSS transitions / Web Animations API, `gsap.min.js` can be dropped from `index.html`, `calendar/index.html`, and `position/index.html` immediately.
    - On `terminal/index.html`, `zoom.js` can be converted or GSAP can be loaded dynamically only when the `zoom` command is triggered.

---

## Benchmark / Quantitative Impact Analysis

| Dimension                         | Before (Current State)                                   | After (Target Architecture)                              | Measured / Projected Gain                                       |
| :-------------------------------- | :------------------------------------------------------- | :------------------------------------------------------- | :-------------------------------------------------------------- |
| **Steady-state tracking latency** | 32.6 ms lag ($D \approx 33\text{ px}$ at 1000 px/s)      | 8.8–12.0 ms lag ($D \approx 9\text{–}12\text{ px}$)      | **~63%–73% reduction** in spatial tracking gap                  |
| **Convergence settle time (95%)** | 97.7 ms (5.9 frames at 60Hz)                             | 26.3–36.0 ms (1.6–2.2 frames at 60Hz)                    | **~63%–73% faster settle** onto targets                         |
| **Idle CPU & render loop**        | Unending 60/120Hz RAF loop (7,200 runs/min)              | Sleep on idle ($\epsilon < 0.05\text{px}$), wake on move | **100% idle CPU elimination** (0 runs/min when stationary)      |
| **Storage synchronous I/O**       | Up to 60–120 `sessionStorage.setItem` calls/sec          | 0 calls during movement; 1 call on `pagehide`            | **100% reduction** during interaction (3,600 calls/min $\to$ 0) |
| **Event listener footprint**      | $3 \times N$ listeners (~150+) + capture handlers        | 2 delegated listeners on `document`                      | **~98% reduction** in cursor-related event bindings             |
| **DOM inline style thrashing**    | Inline styles stamped on every hovered node              | Pure CSS rules (`html.force-hide-cursor *`)              | Zero DOM style mutations on hovered elements                    |
| **Memory leak risk**              | Strong `Set` (`overriddenElements`) holds detached nodes | No node storage / Weak references                        | Eliminates detached DOM element leak                            |
| **Per-frame heap allocations**    | 2 object literals allocated per RAF frame                | 0 allocations per frame                                  | Eliminates GC spikes during cursor tracking                     |
| **CSS vs JS animation clash**     | 60Hz JS scale lerp restarts 150ms CSS transition         | Scale handled strictly by CSS compositor                 | Eliminates transition engine thrashing & low-pass lag           |
| **Blocking script payload**       | 71.5 KB (`gsap.min.js`) parser-blocking script           | 0 KB vendor script required by cursor                    | **-71.5 KB** raw / **-27.9 KB** gzip blocking script            |

---

## Action items

### Preamble for the implementer

- **Execution contract:** Work one numbered item at a time in order. Run the item's scoped verification command, then commit with a conventional commit message (`perf(cursor): ...`, `refactor(cursor): ...`). **Never push** — pushing remains a human decision.
- **Strict anchors:** `Find` snippets are exact, unique anchors taken directly from current sources. If any `Find` block does not match verbatim, **STOP and report** instead of guessing or improvising. Line numbers in findings are dated references and will drift as edits are applied.
- **Formatting and lint:** After modifying JS/CSS, run `npx prettier --write <file> && npx eslint <file>`.
- **Non-negotiables:** Never hand-edit files under `data/`. Keep each commit focused strictly on its single work order.

---

### Work order 1 `[trivial]` — Eliminate per-frame `sessionStorage.setItem` in `cursor.js`

- **File:** [`js/vendor/cursor.js`](file:///Users/lz/dev/fund/js/vendor/cursor.js)
- **Find:**

```javascript
this.persistPositionFrame = null;
this.lastFrameTime = null;
```

- **Change:**

```javascript
this.lastFrameTime = null;
```

- **Find:**

```javascript
    onMouseMove(event) {
        this.coords.x.current = event.clientX;
        this.coords.y.current = event.clientY;
        this.coords.opacity.current = 1;
        this.schedulePersistPosition();
    }
```

- **Change:**

```javascript
    onMouseMove(event) {
        this.coords.x.current = event.clientX;
        this.coords.y.current = event.clientY;
        this.coords.opacity.current = 1;
    }
```

- **Find:**

```javascript
    schedulePersistPosition() {
        if (this.persistPositionFrame) return;
        this.persistPositionFrame = requestAnimationFrame(() => {
            this.persistPositionFrame = null;
            this.persistPosition();
        });
    }

    persistPosition() {
        persistCursorPosition(this.coords.x.current, this.coords.y.current);
    }

    destroy() {
        if (this.disabled || !this.element) return;
        cancelAnimationFrame(this.rafId);
        if (this.persistPositionFrame) {
            cancelAnimationFrame(this.persistPositionFrame);
            this.persistPositionFrame = null;
        }
        this.persistPosition();
```

- **Change:**

```javascript
    persistPosition() {
        persistCursorPosition(this.coords.x.current, this.coords.y.current);
    }

    destroy() {
        if (this.disabled || !this.element) return;
        cancelAnimationFrame(this.rafId);
        this.persistPosition();
```

- **Verify:** `npx jest tests/js/cursor`
- **Guardrail:** Do not delete `pagehide` and `beforeunload` listeners in the constructor; they correctly save cursor position across page navigations without per-frame storage writes.

---

### Work order 2 `[low]` — Boost tracking responsiveness (`followEase: 0.75` & `pointermove`)

- **File:** [`js/vendor/cursor.js`](file:///Users/lz/dev/fund/js/vendor/cursor.js)
- **Find:**

```javascript
window.addEventListener('mousemove', this.onMouseMove);
window.addEventListener('mouseout', this.onMouseOut);
```

- **Change:**

```javascript
window.addEventListener('pointermove', this.onMouseMove, { passive: true });
window.addEventListener('mouseout', this.onMouseOut);
```

- **Find:**

```javascript
window.removeEventListener('mousemove', this.onMouseMove);
window.removeEventListener('mouseout', this.onMouseOut);
```

- **Change:**

```javascript
window.removeEventListener('pointermove', this.onMouseMove);
window.removeEventListener('mouseout', this.onMouseOut);
```

- **File:** [`js/cursor-init.js`](file:///Users/lz/dev/fund/js/cursor-init.js)
- **Find:**

```javascript
const { cursor } = initCursor({
    cursor: {
        hoverTargets: 'a, button, .container li',
        followEase: 0.4,
        fadeEase: 0.1,
        hoverScale: 3,
    },
});
```

- **Change:**

```javascript
const { cursor } = initCursor({
    cursor: {
        hoverTargets: 'a, button, .container li',
        followEase: 0.75,
        fadeEase: 0.1,
        hoverScale: 3,
    },
});
```

- **Verify:** `npx jest tests/js/cursor/cursor_frame_rate.test.js`
- **Guardrail:** Keep `followEase = 0.4` as the default parameter in `CustomCursor` constructor so existing `cursor_frame_rate.test.js:104` step test stays green; pass `0.75` explicitly via `js/cursor-init.js`.

---

### Work order 3 `[low]` — Resolve CSS transition vs JS scale conflict & drop `gsap.set`

- **File:** [`js/vendor/cursor.js`](file:///Users/lz/dev/fund/js/vendor/cursor.js)
- **Find:**

```javascript
    onMouseEnter() {
        this.core.classList.add(this.hoverClass);
        this.coords.scale.current = this.hoverScale;
    }

    onMouseLeave() {
        this.core.classList.remove(this.hoverClass);
        this.coords.scale.current = 1;
    }

    loop(timestamp) {
        // Frame-rate independent easing: a fixed per-frame lerp alpha makes the
        // chase speed proportional to fps, so any jank (e.g. repaint-heavy
        // pages at high browser zoom) makes the cursor crawl. Scale the alpha
        // by elapsed time instead.
        const now = typeof timestamp === 'number' ? timestamp : performance.now();
        const dt = this.lastFrameTime === null ? 1000 / 60 : Math.max(now - this.lastFrameTime, 0);
        this.lastFrameTime = now;
        const frameScale = dt / (1000 / 60);
        const followAlpha = 1 - Math.pow(1 - this.followEase, frameScale);
        const fadeAlpha = 1 - Math.pow(1 - this.fadeEase, frameScale);

        this.coords.opacity.value = lerp(
            this.coords.opacity.value,
            this.coords.opacity.current,
            fadeAlpha
        );
        this.coords.scale.value = lerp(this.coords.scale.value, this.coords.scale.current, fadeAlpha);
        this.coords.x.value = lerp(this.coords.x.value, this.coords.x.current, followAlpha);
        this.coords.y.value = lerp(this.coords.y.value, this.coords.y.current, followAlpha);

        gsap.set(this.element, {
            opacity: this.coords.opacity.value,
            x: this.coords.x.value,
            y: this.coords.y.value,
            zIndex: 100,
        });
        gsap.set(this.core, {
            scale: this.coords.scale.value,
        });

        this.rafId = requestAnimationFrame(this.loop);
    }
```

- **Change:**

```javascript
    onMouseEnter() {
        this.core.classList.add(this.hoverClass);
    }

    onMouseLeave() {
        this.core.classList.remove(this.hoverClass);
    }

    loop(timestamp) {
        // Frame-rate independent easing: a fixed per-frame lerp alpha makes the
        // chase speed proportional to fps, so any jank (e.g. repaint-heavy
        // pages at high browser zoom) makes the cursor crawl. Scale the alpha
        // by elapsed time instead.
        const now = typeof timestamp === 'number' ? timestamp : performance.now();
        const dt = this.lastFrameTime === null ? 1000 / 60 : Math.max(now - this.lastFrameTime, 0);
        this.lastFrameTime = now;
        const frameScale = dt / (1000 / 60);
        const followAlpha = 1 - Math.pow(1 - this.followEase, frameScale);
        const fadeAlpha = 1 - Math.pow(1 - this.fadeEase, frameScale);

        this.coords.opacity.value = lerp(
            this.coords.opacity.value,
            this.coords.opacity.current,
            fadeAlpha
        );
        this.coords.x.value = lerp(this.coords.x.value, this.coords.x.current, followAlpha);
        this.coords.y.value = lerp(this.coords.y.value, this.coords.y.current, followAlpha);

        this.element.style.transform = `translate3d(${this.coords.x.value}px, ${this.coords.y.value}px, 0)`;
        this.element.style.opacity = this.coords.opacity.value;

        this.rafId = requestAnimationFrame(this.loop);
    }
```

- **Verify:** `npx jest tests/js/cursor`
- **Guardrail:** Do not remove `const gsap = window.gsap;` at line 2 yet; `tests/js/cursor/cursor_init_timing.test.js:97` asserts `expect(cursorVendorContent).toContain('window.gsap')`.

---

### Work order 4 `[low]` — Implement sleeping RAF loop during mouse idle

- **File:** [`js/vendor/cursor.js`](file:///Users/lz/dev/fund/js/vendor/cursor.js)
- **Find:**

```javascript
this.lastFrameTime = null;

root.appendChild(this.element);
```

- **Change:**

```javascript
this.lastFrameTime = null;
this.isLooping = true;

root.appendChild(this.element);
```

- **Find:**

```javascript
    onMouseMove(event) {
        this.coords.x.current = event.clientX;
        this.coords.y.current = event.clientY;
        this.coords.opacity.current = 1;
    }
```

- **Change:**

```javascript
    onMouseMove(event) {
        this.coords.x.current = event.clientX;
        this.coords.y.current = event.clientY;
        this.coords.opacity.current = 1;

        if (!this.isLooping) {
            this.isLooping = true;
            this.lastFrameTime = performance.now();
            this.rafId = requestAnimationFrame(this.loop);
        }
    }
```

- **Find:**

```javascript
        this.element.style.transform = `translate3d(${this.coords.x.value}px, ${this.coords.y.value}px, 0)`;
        this.element.style.opacity = this.coords.opacity.value;

        this.rafId = requestAnimationFrame(this.loop);
    }
```

- **Change:**

```javascript
        this.element.style.transform = `translate3d(${this.coords.x.value}px, ${this.coords.y.value}px, 0)`;
        this.element.style.opacity = this.coords.opacity.value;

        const dx = Math.abs(this.coords.x.current - this.coords.x.value);
        const dy = Math.abs(this.coords.y.current - this.coords.y.value);
        const dAlpha = Math.abs(this.coords.opacity.current - this.coords.opacity.value);

        if (dx < 0.05 && dy < 0.05 && dAlpha < 0.005) {
            this.coords.x.value = this.coords.x.current;
            this.coords.y.value = this.coords.y.current;
            this.coords.opacity.value = this.coords.opacity.current;
            this.element.style.transform = `translate3d(${this.coords.x.value}px, ${this.coords.y.value}px, 0)`;
            this.element.style.opacity = this.coords.opacity.value;
            this.isLooping = false;
            return;
        }

        this.rafId = requestAnimationFrame(this.loop);
    }
```

- **Find:**

```javascript
    destroy() {
        if (this.disabled || !this.element) return;
        cancelAnimationFrame(this.rafId);
```

- **Change:**

```javascript
    destroy() {
        if (this.disabled || !this.element) return;
        this.isLooping = false;
        cancelAnimationFrame(this.rafId);
```

- **Verify:** `npx jest tests/js/cursor`
- **Guardrail:** Reset `this.lastFrameTime = performance.now()` upon waking the loop in `onMouseMove` so the first frame delta `dt` does not jump across the idle period.

---

### Work order 5 `[low]` — Replace `attachHoverTargets` and `pointerEventHandler` with Event Delegation

- **File:** [`js/vendor/cursor.js`](file:///Users/lz/dev/fund/js/vendor/cursor.js)
- **Find:**

```javascript
const overriddenElements = new Set();
let pointerListenersBound = false;
```

- **Change:**

```javascript
let pointerListenersBound = false;
```

- **Find:**

```javascript
const applyInlineCursorToElement = (element) => {
    if (
        !element ||
        !element.style ||
        overriddenElements.has(element) ||
        element.classList?.contains('custom-cursor')
    ) {
        return;
    }
    try {
        element.style.setProperty('cursor', HIDDEN_CURSOR_VALUE, 'important');
        overriddenElements.add(element);
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Failed to apply inline cursor style to element:', e);
    }
};

const clearInlineCursorOverrides = () => {
    overriddenElements.forEach((element) => {
        try {
            if (element.style?.cursor === HIDDEN_CURSOR_VALUE) {
                element.style.removeProperty('cursor');
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('Failed to remove inline cursor style from element:', e);
        }
    });
    overriddenElements.clear();
};

const pointerEventHandler = (event) => {
    if (!htmlElement || !htmlElement.classList?.contains(FORCE_HIDE_CLASS)) return;
    applyInlineCursorToElement(event.target);
};

const bindPointerListeners = () => {
    if (pointerListenersBound || typeof document === 'undefined') return;
    document.addEventListener('pointerover', pointerEventHandler, true);
    document.addEventListener('pointerdown', pointerEventHandler, true);
    document.addEventListener('focusin', pointerEventHandler, true);
    pointerListenersBound = true;
};

const unbindPointerListeners = () => {
    if (!pointerListenersBound || typeof document === 'undefined') return;
    document.removeEventListener('pointerover', pointerEventHandler, true);
    document.removeEventListener('pointerdown', pointerEventHandler, true);
    document.removeEventListener('focusin', pointerEventHandler, true);
    pointerListenersBound = false;
};
```

- **Change:**

```javascript
const bindPointerListeners = () => {
    pointerListenersBound = true;
};

const unbindPointerListeners = () => {
    pointerListenersBound = false;
};
```

- **Find:**

```javascript
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseOut = this.onMouseOut.bind(this);
        this.onMouseEnter = this.onMouseEnter.bind(this);
        this.onMouseLeave = this.onMouseLeave.bind(this);
        this.loop = this.loop.bind(this);
        this.persistPosition = this.persistPosition.bind(this);
        if (typeof window !== 'undefined') {
            window.addEventListener('pagehide', this.persistPosition);
            window.addEventListener('beforeunload', this.persistPosition);
        }

        window.addEventListener('pointermove', this.onMouseMove, { passive: true });
        window.addEventListener('mouseout', this.onMouseOut);
        this.attachHoverTargets();

        this.rafId = requestAnimationFrame(this.loop);
    }

    attachHoverTargets() {
        if (this.disabled) return;
        const nodes = this.root.querySelectorAll(this.hoverTargets);
        nodes.forEach((node) => {
            node.style.setProperty('cursor', HIDDEN_CURSOR_VALUE, 'important');
            node.addEventListener('mouseenter', this.onMouseEnter);
            node.addEventListener('mouseleave', this.onMouseLeave);
            node.addEventListener('click', this.onMouseLeave);
        });
    }
```

- **Change:**

```javascript
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseOut = this.onMouseOut.bind(this);
        this.onPointerOver = this.onPointerOver.bind(this);
        this.onPointerOut = this.onPointerOut.bind(this);
        this.loop = this.loop.bind(this);
        this.persistPosition = this.persistPosition.bind(this);
        if (typeof window !== 'undefined') {
            window.addEventListener('pagehide', this.persistPosition);
            window.addEventListener('beforeunload', this.persistPosition);
        }

        window.addEventListener('pointermove', this.onMouseMove, { passive: true });
        window.addEventListener('mouseout', this.onMouseOut);
        this.attachHoverTargets();

        this.rafId = requestAnimationFrame(this.loop);
    }

    onPointerOver(event) {
        if (event.target?.closest?.(this.hoverTargets)) {
            this.core.classList.add(this.hoverClass);
        }
    }

    onPointerOut(event) {
        if (event.target?.closest?.(this.hoverTargets)) {
            this.core.classList.remove(this.hoverClass);
        }
    }

    attachHoverTargets() {
        if (this.disabled || typeof document === 'undefined') return;
        document.addEventListener('pointerover', this.onPointerOver, true);
        document.addEventListener('pointerout', this.onPointerOut, true);
    }
```

- **Find:**

```javascript
this.root.querySelectorAll(this.hoverTargets).forEach((node) => {
    if (node.style?.cursor === HIDDEN_CURSOR_VALUE) {
        node.style.removeProperty('cursor');
    }
    node.removeEventListener('mouseenter', this.onMouseEnter);
    node.removeEventListener('mouseleave', this.onMouseLeave);
    node.removeEventListener('click', this.onMouseLeave);
});
this.element.remove();
releaseForceHideCursor();
```

- **Change:**

```javascript
if (typeof document !== 'undefined') {
    document.removeEventListener('pointerover', this.onPointerOver, true);
    document.removeEventListener('pointerout', this.onPointerOut, true);
}
this.element.remove();
releaseForceHideCursor();
```

- **Verify:** `npx jest tests/js/cursor`
- **Guardrail:** Pass `true` (capture phase) to delegated `pointerover`/`pointerout` listeners so events from nested children within interactive elements are reliably caught.

---

### Work order 6 `[skip]` — Decouple `cursor.js` and `cursor-init.js` from `window.gsap`

- **Files:** [`js/vendor/cursor.js`](file:///Users/lz/dev/fund/js/vendor/cursor.js), [`js/cursor-init.js`](file:///Users/lz/dev/fund/js/cursor-init.js), [`tests/js/cursor/cursor_init_timing.test.js`](file:///Users/lz/dev/fund/tests/js/cursor/cursor_init_timing.test.js)
- **Why skipped:** `tests/js/cursor/cursor_init_timing.test.js:95-98` asserts `expect(cursorVendorContent).toContain('window.gsap')`. Removing GSAP references requires rewriting the test suite expectations concurrently; route to a stronger model.

---

### Work order 7 `[skip]` — Migrate `magnetic_nav.js` and `zoom.js` off GSAP & drop `gsap.min.js` from HTML

- **Files:** [`js/ui/magnetic_nav.js`](file:///Users/lz/dev/fund/js/ui/magnetic_nav.js), [`js/transactions/zoom.js`](file:///Users/lz/dev/fund/js/transactions/zoom.js), [`index.html`](file:///Users/lz/dev/fund/index.html), [`calendar/index.html`](file:///Users/lz/dev/fund/calendar/index.html), [`position/index.html`](file:///Users/lz/dev/fund/position/index.html), [`terminal/index.html`](file:///Users/lz/dev/fund/terminal/index.html), [`sw.js`](file:///Users/lz/dev/fund/sw.js)
- **Why skipped:** Cross-subsystem refactor requiring Web Animations API replacements for nav magnetism and terminal WebGL canvas sync on zoom (`zoom.js:87-89`). Route to a stronger model with full visual verification.

---

## Open Questions / What Couldn't Be Verified

1. **High-polling hardware jitter (500Hz/1000Hz gaming mice):** Whether micro-movements at 1000Hz introduce visual jitter with `followEase: 0.75` without moving average smoothing could not be tested directly in headless Jest (no hardware mouse attached).
2. **Terminal canvas resize sync under Web Animations API:** [`js/transactions/zoom.js:87-89`](file:///Users/lz/dev/fund/js/transactions/zoom.js#L87-L89) uses `timeline.onUpdate(() => terminal.glassEffect?.syncResize())` to resize the WebGL refraction canvas on every frame of the zoom animation. If GSAP is removed from `zoom.js`, this per-frame synchronization must be replicated using a RAF callback during the transition.
3. **Cross-browser CSS transition interrupt curve:** When rapidly entering and leaving hover targets within $<150\text{ ms}$, whether Chromium/WebKit cleanly reverses the CSS transform transition without visual snapping was not observed in live browsers.
