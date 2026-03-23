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

    beforeEach(() => {
        // Clean up global state before each test
        delete window.gsap;
        delete window.cursorInstances;
        jest.clearAllMocks();
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

    describe('cursor-init.js execution', () => {
        beforeEach(() => {
            // Reset modules to allow re-importing cursor-init.js
            jest.resetModules();
        });

        test('should initialize cursor when GSAP is available and DOM is ready', async () => {
            // Mock GSAP
            window.gsap = {
                registerPlugin: jest.fn(),
                to: jest.fn(),
                timeline: jest.fn(),
                utils: { clamp: jest.fn(), mapRange: jest.fn() },
            };

            // Mock document.readyState to simulate DOM already loaded
            Object.defineProperty(document, 'readyState', {
                value: 'complete',
                configurable: true,
            });

            // Import the module - this will execute the code
            await import('../../../js/cursor-init.js');

            // Give it time to initialize
            await new Promise((resolve) => setTimeout(resolve, 10));

            // Verify cursor was initialized
            expect(window.cursorInstances).toBeDefined();
            expect(window.cursorInstances.cursor).toBeDefined();
        });

        test('should wait for DOMContentLoaded when document is still loading', async () => {
            // Reset modules first
            jest.resetModules();

            // Mock GSAP
            window.gsap = {
                registerPlugin: jest.fn(),
                to: jest.fn(),
                timeline: jest.fn(),
                utils: { clamp: jest.fn(), mapRange: jest.fn() },
            };

            // Mock document.readyState to simulate loading state
            Object.defineProperty(document, 'readyState', {
                value: 'loading',
                configurable: true,
            });

            // Import the module
            await import('../../../js/cursor-init.js');

            // Cursor should NOT be initialized yet
            expect(window.cursorInstances).toBeUndefined();

            // Trigger DOMContentLoaded event
            document.dispatchEvent(new Event('DOMContentLoaded'));

            // Give it time to initialize
            await new Promise((resolve) => setTimeout(resolve, 10));

            // Now cursor should be initialized
            expect(window.cursorInstances).toBeDefined();
            expect(window.cursorInstances.cursor).toBeDefined();
        });

        test('should not initialize when GSAP is not available', async () => {
            // Reset modules first
            jest.resetModules();

            // Ensure GSAP is NOT available
            delete window.gsap;

            // Mock document.readyState to simulate DOM already loaded
            Object.defineProperty(document, 'readyState', {
                value: 'complete',
                configurable: true,
            });

            // Import the module
            await import('../../../js/cursor-init.js');

            // Give it time to potentially initialize
            await new Promise((resolve) => setTimeout(resolve, 10));

            // Cursor should NOT be initialized because GSAP is missing
            expect(window.cursorInstances).toBeUndefined();
        });
    });
});
