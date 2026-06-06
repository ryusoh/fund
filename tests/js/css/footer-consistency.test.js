/**
 * Footer CSS Consistency Test
 *
 * Ensures visual consistency of the GitHub icon footer across all pages.
 * This prevents regression of footer alignment issues.
 *
 * Related issue: Terminal footer appeared higher than other pages due to
 * inherited line-height from body element.
 */

import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT_DIR = resolve(process.cwd());

// Helper to read CSS file content
const readCssFile = (relativePath) => {
    const fullPath = join(ROOT_DIR, relativePath);
    return readFileSync(fullPath, 'utf-8');
};

// Helper to extract CSS property value from a rule
const extractCssProperty = (cssContent, selector, property) => {
    const selectorRegex = new RegExp(
        `${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]+)\\}`,
        's'
    );
    const match = cssContent.match(selectorRegex);
    if (!match) {
        return null;
    }

    const blockContent = match[1];
    const propertyRegex = new RegExp(`${property}\\s*:\\s*([^;]+);`, 'i');
    const propertyMatch = blockContent.match(propertyRegex);
    return propertyMatch ? propertyMatch[1].trim() : null;
};

// Helper to check if CSS has @supports rule with specific content
const hasSupportsRule = (cssContent, condition, innerSelector, property) => {
    const supportsRegex = new RegExp(
        `@supports\\s*\\(${condition}\\)\\s*\\{([^}]+\\{[^}]+\\}[^}]*)\\}`,
        's'
    );
    const match = cssContent.match(supportsRegex);
    if (!match) {
        return false;
    }

    const supportsContent = match[1];
    const propertyRegex = new RegExp(`${innerSelector}[^{]*\\{[^}]*${property}[^}]*\\}`, 's');
    return propertyRegex.test(supportsContent);
};

describe('Footer CSS Consistency', () => {
    describe('Footer base styles', () => {
        it('layout.css footer should have correct bottom position', () => {
            const css = readCssFile('css/layout.css');
            const bottom = extractCssProperty(css, 'footer', 'bottom');
            expect(bottom).toBe('10px');
        });

        it('layout.css footer should have correct z-index', () => {
            const css = readCssFile('css/layout.css');
            const zIndex = extractCssProperty(css, 'footer', 'z-index');
            expect(zIndex).toBe('1001');
        });

        it('layout.css footer should have correct font-size', () => {
            const css = readCssFile('css/layout.css');
            const fontSize = extractCssProperty(css, 'footer', 'font-size');
            expect(fontSize).toBe('12px');
        });

        it('layout.css footer should have line-height 1 or inheritable to 1', () => {
            const css = readCssFile('css/layout.css');
            const lineHeight = extractCssProperty(css, 'footer', 'line-height');
            expect(lineHeight).toBeNull();
        });

        it('terminal/base.css footer should have correct bottom position', () => {
            const css = readCssFile('css/terminal/base.css');
            const bottom = extractCssProperty(css, 'footer', 'bottom');
            expect(bottom).toBe('10px');
        });

        it('terminal/base.css footer should have correct z-index', () => {
            const css = readCssFile('css/terminal/base.css');
            const zIndex = extractCssProperty(css, 'footer', 'z-index');
            expect(zIndex).toBe('1001');
        });

        it('terminal/base.css footer should have correct font-size', () => {
            const css = readCssFile('css/terminal/base.css');
            const fontSize = extractCssProperty(css, 'footer', 'font-size');
            expect(fontSize).toBe('12px');
        });

        it('terminal/base.css footer should have line-height 1 to prevent inheritance', () => {
            const css = readCssFile('css/terminal/base.css');
            const lineHeight = extractCssProperty(css, 'footer', 'line-height');
            expect(lineHeight).toBe('1');
        });

        it('terminal/base.css footer should have correct text-align', () => {
            const css = readCssFile('css/terminal/base.css');
            const textAlign = extractCssProperty(css, 'footer', 'text-align');
            expect(textAlign).toBe('center');
        });

        it('terminal/base.css footer should have correct color', () => {
            const css = readCssFile('css/terminal/base.css');
            const color = extractCssProperty(css, 'footer', 'color');
            expect(color).toBe('rgba(255, 255, 255, 0.5)');
        });

        it('terminal/base.css footer should have correct font-weight', () => {
            const css = readCssFile('css/terminal/base.css');
            const fontWeight = extractCssProperty(css, 'footer', 'font-weight');
            expect(fontWeight).toBe('100');
        });

        it('terminal/base.css footer should have correct letter-spacing', () => {
            const css = readCssFile('css/terminal/base.css');
            const letterSpacing = extractCssProperty(css, 'footer', 'letter-spacing');
            expect(letterSpacing).toBe('1px');
        });
    });

    describe('Footer width consistency', () => {
        it('layout.css footer should have 85% width on desktop', () => {
            const css = readCssFile('css/layout.css');
            const width = extractCssProperty(css, 'footer', 'width');
            expect(width).toBe('85%');
        });

        it('layout.css footer should have 900px max-width', () => {
            const css = readCssFile('css/layout.css');
            const maxWidth = extractCssProperty(css, 'footer', 'max-width');
            expect(maxWidth).toBe('900px');
        });

        it('terminal/base.css footer should have 85% width on desktop', () => {
            const css = readCssFile('css/terminal/base.css');
            const width = extractCssProperty(css, 'footer', 'width');
            expect(width).toBe('85%');
        });

        it('terminal/base.css footer should have 900px max-width', () => {
            const css = readCssFile('css/terminal/base.css');
            const maxWidth = extractCssProperty(css, 'footer', 'max-width');
            expect(maxWidth).toBe('900px');
        });
    });

    describe('Safe area inset handling', () => {
        it('main_index.css should have safe-area-inset-bottom for body-main footer', () => {
            const css = readCssFile('css/main_index.css');
            const hasSupports = hasSupportsRule(
                css,
                'bottom: env\\(safe-area-inset-bottom\\)',
                'body\\.body-main footer',
                'bottom'
            );
            expect(hasSupports).toBe(true);
        });

        it('main_index.css safe-area-inset should add to 10px base', () => {
            const css = readCssFile('css/main_index.css');
            const supportsMatch = css.match(
                /@supports\s*\([^)]*bottom:\s*env\(safe-area-inset-bottom\)[^)]*\)\s*\{[^}]*body\.body-main\s+footer\s*\{[^}]*bottom:\s*calc\(10px\s*\+\s*env\(safe-area-inset-bottom\)\)/s
            );
            expect(supportsMatch).not.toBeNull();
        });
    });

    describe('Mobile footer width consistency', () => {
        it('layout.css should have 95% footer width on mobile', () => {
            const css = readCssFile('css/layout.css');
            const mobileMatch = css.match(
                /@media\s*\([^)]*max-width:\s*768px[^)]*\)\s*\{[\s\S]*?footer\s*\{[\s\S]*?width:\s*95%/
            );
            expect(mobileMatch).not.toBeNull();
        });

        it('terminal/responsive.css should have 95% footer width on mobile', () => {
            const css = readCssFile('css/terminal/responsive.css');
            const mobileMatch = css.match(
                /@media\s*\([^)]*max-width:\s*768px[^)]*\)\s*\{[^}]*footer\s*\{[^}]*width:\s*95%/s
            );
            expect(mobileMatch).not.toBeNull();
        });
    });

    describe('Body line-height should not interfere with footer', () => {
        it('terminal/base.css body line-height should not affect footer (footer has its own line-height)', () => {
            const css = readCssFile('css/terminal/base.css');
            const bodyMatch = css.match(/(?:^|\n)\s*body\s*\{([^}]*line-height[^}]+)\}/);
            const bodyContent = bodyMatch ? bodyMatch[1] : '';
            const bodyLineHeightMatch = bodyContent.match(/line-height\s*:\s*([^;]+);/);
            const bodyLineHeight = bodyLineHeightMatch ? bodyLineHeightMatch[1].trim() : null;
            const footerLineHeight = extractCssProperty(css, 'footer', 'line-height');

            expect(bodyLineHeight).toBe('1.6');
            expect(footerLineHeight).toBe('1');
        });
    });

    describe('Calendar heatmap highlight border', () => {
        it('calendar.css #cal-heatmap svg should have overflow visible to prevent today border clipping', () => {
            const css = readCssFile('css/calendar.css');
            const overflow = extractCssProperty(css, '#cal-heatmap svg', 'overflow');
            expect(overflow).toBe('visible');
        });
    });

    describe('HTML pages reference correct CSS', () => {
        it('index.html should include main_index.css', () => {
            const html = readCssFile('index.html');
            expect(html).toContain('css/base.css');
            expect(html).toContain('css/layout.css');
            expect(html).toContain('css/main_index.css');
        });

        it('calendar/index.html should include layout.css', () => {
            const html = readCssFile('calendar/index.html');
            expect(html).toContain('../css/layout.css');
        });

        it('position/index.html should include layout.css', () => {
            const html = readCssFile('position/index.html');
            expect(html).toContain('../css/layout.css');
        });

        it('terminal/index.html should include terminal/base.css', () => {
            const html = readCssFile('terminal/index.html');
            expect(html).toContain('../css/terminal/base.css');
        });
    });
});
