1. **Unify the easing curve:**
   - I will use `sed` to replace easing curves in `css/calendar.css`, `css/terminal/base.css`, `css/toggle.css` with `cubic-bezier(0.65, 0.05, 0, 1)`.
   - I will use `sed` to replace easing curves in `js/ui/magnetic_nav.js`, `js/ui/tilt_effect.js` and their tests with `power3.out`.
2. **Implement dual-font system and typography emphasis:**
   - I will use `sed` to insert `<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap" rel="stylesheet" />` after `<head>` in `index.html`, `calendar/index.html`, `terminal/index.html`, `position/index.html`.
   - I will use `replace_with_git_merge_diff` on `css/marquee.css` to update `.marquee-content span` and `.mq-char` classes to use `font-family: 'Playfair Display', serif;`.
3. **Enhance UI to hide scaffolding:**
   - I will use `echo '::-webkit-scrollbar { display: none; } * { -ms-overflow-style: none; scrollbar-width: none; }' >> css/base.css` to add scrollbar hiding rules to `css/base.css`.
4. **Organic Shapes (Clip-path/Masking):**
   - I will use `echo '.marquee-container { clip-path: ellipse(150% 100% at 50% 100%); }' >> css/marquee.css` to apply the organic shape to the `.marquee-container` in `css/marquee.css`.
5. **Verify file modifications:**
   - I will run `git diff` to verify the changes made to `index.html`, `calendar/index.html`, `terminal/index.html`, `position/index.html`, `css/base.css`, `css/marquee.css`, `js/ui/magnetic_nav.js`, `js/ui/tilt_effect.js` and tests.
6. **Run test suite:**
   - I will run `pnpm run test` and `pnpm lint` to ensure no tests are broken and code standards are met.
7. Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
8. **Submit.**
