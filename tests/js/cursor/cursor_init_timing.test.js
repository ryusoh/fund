/**
 * Test to prevent cursor initialization timing regressions.
 *
 * Background: Commit 6436245 removed DOMContentLoaded wait from cursor-init.js,
 * which could cause cursor initialization to run before GSAP is loaded,
 * resulting in slow or failed cursor initialization on pages like /terminal/.
 *
 * This test ensures the cursor-init.js file properly waits for DOMContentLoaded.
 */

/* eslint no-undef: "off" */

const fs = require('fs');
const path = require('path');

const CURSOR_INIT_PATH = path.join(__dirname, '../../../js/cursor-init.js');
const CURSOR_VENDOR_PATH = path.join(__dirname, '../../../js/vendor/cursor.js');

describe('Cursor Initialization Timing', () => {
    let cursorInitContent;
    let cursorVendorContent;

    beforeAll(() => {
        cursorInitContent = fs.readFileSync(CURSOR_INIT_PATH, 'utf-8');
        cursorVendorContent = fs.readFileSync(CURSOR_VENDOR_PATH, 'utf-8');
    });

    describe('cursor-init.js', () => {
        test('should wait for DOMContentLoaded before initializing', () => {
            // The file must listen for DOMContentLoaded to ensure GSAP is loaded
            expect(cursorInitContent).toContain('DOMContentLoaded');
        });

        test('should check document.readyState before adding listener', () => {
            // Handle both cases: DOM already loaded or still loading
            expect(cursorInitContent).toContain('document.readyState');
        });

        test('should check for window.gsap availability', () => {
            // GSAP is required for cursor functionality
            expect(cursorInitContent).toContain('window.gsap');
        });

        test('should not initialize cursor at module evaluation time', () => {
            // The initCursor call should be inside a function, not at top level
            // This prevents race conditions with GSAP loading
            const lines = cursorInitContent.split('\n');
            let foundInitCursorCall = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.includes('initCursor({')) {
                    // Check if there's a function declaration before this line
                    const precedingLines = lines.slice(0, i);
                    const hasFunctionBefore = precedingLines.some((l) => l.includes('function'));
                    foundInitCursorCall = hasFunctionBefore;
                    break;
                }
            }

            expect(foundInitCursorCall).toBe(true);
        });

        test('should have initCursorOnce or similar wrapped function', () => {
            // The initialization should be wrapped in a function for deferred execution
            expect(cursorInitContent).toMatch(/function\s+\w*init\w*\s*\(/);
        });

        test('should handle both loading and complete readyState', () => {
            // Must handle both cases properly
            expect(cursorInitContent).toContain("=== 'loading'");
            expect(cursorInitContent).toContain('addEventListener');
            expect(cursorInitContent).toMatch(/else\s*\{/);
        });

        test('should call initCursorOnce in both branches', () => {
            // Both the DOMContentLoaded listener and the else branch should call initCursorOnce
            const initOnceCalls = (cursorInitContent.match(/initCursorOnce\(\)/g) || []).length;
            expect(initOnceCalls).toBeGreaterThanOrEqual(2);
        });
    });

    describe('cursor vendor module', () => {
        test('initCursor should be exported', () => {
            expect(cursorVendorContent).toContain('export function initCursor');
        });

        test('initCursor should handle missing GSAP gracefully', () => {
            // Should check for gsap availability
            expect(cursorVendorContent).toContain('window.gsap');
        });

        test('CustomCursor should check for touch devices', () => {
            // Should disable cursor on touch devices
            expect(cursorVendorContent).toContain('isTouchDevice');
        });
    });
});
