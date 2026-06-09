/* global __dirname */
import fs from 'fs';
import path from 'path';

/**
 * Test for the "blue rectangle remains" bug on the position page.
 *
 * Root cause: `.content-block` sets `display: table` in layout.css, which
 * is loaded AFTER base.css where `.hidden { display: none }` is defined.
 * Both selectors have the same specificity (0,1,0), so the later rule wins
 * and the content-block is never truly hidden — its background, box-shadow,
 * and backdrop-filter remain visible as a blue rectangle.
 *
 * Fix: `.content-block.hidden` must override with `display: none !important`
 * or use a higher-specificity selector.
 */
describe('Content-block hidden visibility bug', () => {
    describe('CSS specificity: .hidden must override .content-block display', () => {
        let baseCssContent;
        let layoutCssContent;

        beforeAll(() => {
            const baseCssPath = path.resolve(__dirname, '../../../css/base.css');
            const layoutCssPath = path.resolve(__dirname, '../../../css/layout.css');
            baseCssContent = fs.readFileSync(baseCssPath, 'utf8');
            layoutCssContent = fs.readFileSync(layoutCssPath, 'utf8');
        });

        it('should have .hidden rule that can override .content-block display', () => {
            // The fix can be either:
            // 1. `.hidden` uses `!important` in base.css
            // 2. `.content-block.hidden` selector in layout.css
            // 3. Any compound selector like `.content-block.hidden` anywhere

            const hasImportantHidden = baseCssContent.match(
                /\.hidden\s*\{[^}]*display:\s*none\s*!important/s
            );
            const hasCompoundSelector = layoutCssContent.match(
                /\.content-block\.hidden\s*\{[^}]*display:\s*none/s
            );

            const isFixed = hasImportantHidden || hasCompoundSelector;
            expect(isFixed).toBeTruthy();
        });

        it('.content-block should not use !important on its display property', () => {
            // Ensure .content-block doesn't fight back with its own !important
            const contentBlockDisplay = layoutCssContent.match(
                /\.content-block\s*\{[^}]*display:\s*table\s*!important/s
            );
            expect(contentBlockDisplay).toBeNull();
        });

        it('mobile .content-block should not use !important on its display property', () => {
            // Check that mobile override doesn't use !important either
            const mobileContentBlockDisplay = layoutCssContent.match(
                /\.content-block\s*\{[^}]*display:\s*block\s*!important/s
            );
            expect(mobileContentBlockDisplay).toBeNull();
        });
    });

    describe('CSS cascade resolution: .hidden wins over .content-block', () => {
        let baseCssContent;
        let layoutCssContent;

        beforeAll(() => {
            const baseCssPath = path.resolve(__dirname, '../../../css/base.css');
            const layoutCssPath = path.resolve(__dirname, '../../../css/layout.css');
            baseCssContent = fs.readFileSync(baseCssPath, 'utf8');
            layoutCssContent = fs.readFileSync(layoutCssPath, 'utf8');
        });

        it('.hidden display:none should use !important to beat any same-specificity rule', () => {
            // Since .content-block (0,1,0) comes after .hidden (0,1,0) in cascade,
            // .hidden MUST use !important to win
            const hiddenRule = baseCssContent.match(/\.hidden\s*\{([^}]*)\}/s);
            expect(hiddenRule).toBeTruthy();
            const ruleBody = hiddenRule[1];
            expect(ruleBody).toMatch(/display:\s*none\s*!important/);
        });

        it('.content-block display:table should NOT use !important (would defeat .hidden)', () => {
            // Extract the first .content-block rule (before any @media)
            const match = layoutCssContent.match(/\.content-block\s*\{([^}]*)\}/s);
            expect(match).toBeTruthy();
            const ruleBody = match[1];
            // It should contain display: table but NOT with !important
            expect(ruleBody).toMatch(/display:\s*table/);
            expect(ruleBody).not.toMatch(/display:\s*table\s*!important/);
        });

        it('base.css .hidden is loaded in position/index.html', () => {
            const indexHtmlPath = path.resolve(__dirname, '../../../position/index.html');
            const html = fs.readFileSync(indexHtmlPath, 'utf8');
            // base.css should be linked
            expect(html).toMatch(/base\.css/);
        });

        it('layout.css is loaded in position/index.html', () => {
            const indexHtmlPath = path.resolve(__dirname, '../../../position/index.html');
            const html = fs.readFileSync(indexHtmlPath, 'utf8');
            // layout.css should be linked
            expect(html).toMatch(/layout\.css/);
        });

        it('base.css loads before layout.css in position/index.html', () => {
            const indexHtmlPath = path.resolve(__dirname, '../../../position/index.html');
            const html = fs.readFileSync(indexHtmlPath, 'utf8');
            const baseIndex = html.indexOf('base.css');
            const layoutIndex = html.indexOf('layout.css');
            expect(baseIndex).toBeGreaterThan(-1);
            expect(layoutIndex).toBeGreaterThan(-1);
            // base.css must come BEFORE layout.css (this is part of the bug condition)
            expect(baseIndex).toBeLessThan(layoutIndex);
        });
    });
});
