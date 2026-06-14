# `js/vendor/bundle.min.js` overview

## High-level purpose

- Replaces the static `.app` shell with a SPA controlled by the `Kp` controller, wiring history navigation, resize handling, and a perpetual RAF render loop.
- Couples a WebGL scene (built with Three.js + custom shaders) with DOM-based UI components that use GSAP timelines for all entrance/exit animations.
- Centralizes project data (`$h`) so the preloader, work carousel, and project detail page all share the same metadata/images.

## Core architecture

| Layer                                               | Responsibilities                                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `oi` base class                                     | Provides `show/hide` lifecycles, DOM mounting, and event emitters for UI widgets.                                                             |
| Elements (`logo`, `menu`, `player`, `cursor`, etc.) | Extend `oi`, inject their markup, register GSAP timelines, and react to `onRoute` changes.                                                    |
| Pages (`Cf`, `Zh`, `Kf`, `cf`)                      | Represent routeable sections (`/`, `/about`, `/work`, `/project/*`), each exposing `show`, `hide`, and `update` methods the controller calls. |
| Three.js scene                                      | Built once during bootstrap; contains the background plane, visualization particles, and the work carousel’s mesh hierarchy.                  |
| Services (`fi`, `pf`, helpers)                      | Detect device capabilities, gate features (e.g., custom cursor, noise shaders), and supply audio frequency data for visuals.                  |

## Notable systems

### Application bootstrap (`Kp`)

- Removes `.app`, instantiates every element/page, and stores them in `this.elements`/`this.pages`.
- `onPreloaded` shows landing UI, activates the work carousel, and routes to the current `window.location.pathname`.
- `onChange` throttles navigation, hides outgoing pages, pushes a new `history` entry for whitelisted routes, and re-enables UI once animations finish.
- The RAF `render` loop renders the Three.js scene, updates background/visualization/work meshes, and keeps stats (when enabled).

### Device detection (`fi`)

- Uses `ua-parser-js` to categorize the visitor and expose `isMobile`, `isTablet`, and `isSupported`.
- Guards features such as the animated cursor, menu hover randomizer, and shader intensity so touch devices get simplified visuals/perf.

### Asset preloader (`Jp`)

- Renders an SVG outline animation whose stroke dash offsets shrink as images load.
- Collects every project hero from `$h`, loads them into `<img>` tags, and emits `preloaded` when all have fired `onload`.

### Cursor & logo/menu polish

- `fp` draws a custom cursor `<div>` that lerps toward real pointer coordinates, changes scale/opacities, and rebinds hover handlers to every anchor/button.
- `wp` (logo button) morphs between logo/close glyphs via Morpheus + GSAP, relocating between center/top positions depending on route.
- `zp` (menu) wraps each label with SplitText spans, animates them in/out, and temporarily scrambles letters during desktop hover.

### WebGL background + visualization

- Renderer/camera/lights live for the app’s lifetime; custom shaders import Stefan Gustavson’s GLSL noise to displace planes/points.
- `cp` background plane shifts rotation/velocity and noise multiplier when navigating `/about` vs. `/`. A readable extraction of this plane now lives in `.gemini/perlin-plane.js`.
- Cursor/Logo/Menu behaviours (custom cursor follower, animated logo button, and scramble-text menu) are extracted in `.gemini/cursor-logo-menu.js` for reuse.
- The visualization particle system (100 GSAP-animated triangles responding to audio frequencies) lives in `.gemini/visualization.js`, exposing a `VisualizationLayer` that mirrors `Cf`/`wf`.
- `Cf` creates 100 `wf` triangle primitives; each can `appear`, `disappear`, and `update` based on audio frequencies supplied by `pf`.

### Work carousel (`Kf`)

- Consumes `$h` to instantiate `Ff` cards, each with media plane, noisy overlay shader, hover plane, and optional 3D title mesh.
- Supports drag (mouse/touch) and wheel scrolling with clamped bounds, auto-snaps to card widths, and uses a Three.js `Raycaster` (`Wf`) to detect clicks.
- Emits `change` events (`/project/{slug}`) that `Kp` turns into route transitions; `activate` lazily builds title meshes once the scene is ready.

### Content pages

- `Zh` (About) hydrates precompiled markup, splits paragraphs into span arrays, and reveals title/body/social links with GSAP `expo` tweens.
- `cf` (Project detail) renders every case upfront, toggles the `.wrapper--active` class for the matching slug, lazily sets `src` on images, and listens for `load` to flip loader placeholders.

### Audio service + player

- `ff` wraps an `Audio` element pointing to Peggy Gou’s “Han Jan”, spins up an `AudioContext` analyser on first user interaction, and exposes `getFrequency()` for visuals.
- `pf` is the singleton instance; the `Player` UI (only shown on `/`) mirrors its state, toggling icons and wiring play/pause/next/previous buttons.

## External libraries & notable helpers

- GSAP (`Kr`) drives every timeline, stagger, and easing; also powers quick property sets (e.g., cursor transform updates).
- Three.js is imported via the bundled modules (`Ys`, `vs`, `Pa`, etc.), with custom shaders embedded as template strings.
- Lodash utilities (map, each, debounce, clamp, etc.) simplify dataset iteration and input handling.
- `CanvasRenderingContext2D.renderText` polyfill is added so older browsers can render character-by-character headings when building title meshes.
