1. **Create Cinematic UX Stylesheet (`css/cinematic_ux.css`)**
   - Add styles for the SVG fractal noise overlay to create a textured, film-like aesthetic.
   - Add styles for the staggered column transition container and columns.
   - Add styles for the mobile landscape orientation overlay (prompting users to rotate their device for the optimal experience, mimicking the vertical drive concept).

2. **Create Cinematic UX Script (`js/ui/cinematic_ux.js`)**
   - Dynamically inject the noise overlay into the DOM.
   - Dynamically inject the mobile landscape blocker into the DOM with an animated rotate-phone icon.
   - Setup GSAP-powered staggered column page transitions that intercept internal `<a>` link clicks, animating out before navigating, and animating in upon page load.

3. **Integrate into all HTML entry points**
   - Add `<link rel="stylesheet" href="./css/cinematic_ux.css" />` to `index.html`, `position/index.html`, `calendar/index.html`, and `terminal/index.html`.
   - Add `<script type="module" src="./js/ui/cinematic_ux.js"></script>` (with correct relative paths) to `index.html`, `position/index.html`, `calendar/index.html`, and `terminal/index.html`.

4. **Verify Implementation**
   - Ensure the noise overlay appears.
   - Ensure transitions trigger on click and load.
   - Run `npm run verify:all` or individual linters/tests if available to ensure everything passes.

5. **Complete pre-commit steps**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

6. **Submit PR**
   - Push branch and create PR with an appropriate description highlighting the cinematic UX improvements without referencing the inspiration source.
