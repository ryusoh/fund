const fs = require('fs');
const path = require('path');

describe('icon_font_ready', () => {
    let originalFonts;

    beforeEach(() => {
        // Reset the DOM
        document.body.className = '';
        document.body.innerHTML = '';

        // Mock timers
        jest.useFakeTimers();

        // Reset modules so the IIFE runs again on require
        jest.resetModules();

        // Save original document.fonts
        originalFonts = document.fonts;
    });

    afterEach(() => {
        // Restore timers
        jest.useRealTimers();

        // Restore original fonts
        Object.defineProperty(document, 'fonts', {
            value: originalFonts,
            writable: true,
            configurable: true
        });
    });

    const loadIconFontReady = () => {
        require('../../../js/ui/icon_font_ready.js');
    };

    const mockDocumentFonts = (mockValue) => {
        Object.defineProperty(document, 'fonts', {
            value: mockValue,
            writable: true,
            configurable: true
        });
    };

    test('adds ready class immediately if font is already checked and loaded', () => {
        mockDocumentFonts({
            check: jest.fn().mockReturnValue(true),
            load: jest.fn(),
            ready: Promise.resolve()
        });

        loadIconFontReady();

        expect(document.body.classList.contains('icon-font-ready')).toBe(true);
    });

    test('waits for font load and adds ready class', async () => {
        const loadPromise = Promise.resolve([]);
        const readyPromise = Promise.resolve();
        mockDocumentFonts({
            check: jest.fn().mockReturnValue(false),
            load: jest.fn().mockReturnValue(loadPromise),
            ready: readyPromise
        });

        loadIconFontReady();

        expect(document.body.classList.contains('icon-font-ready')).toBe(false);

        // Await the promises created by mockDocumentFonts so microtasks flush fully
        await loadPromise;
        await readyPromise;

        // Use jest to run pending microtasks and promises if still not flushed
        jest.runAllTimers();

        expect(document.body.classList.contains('icon-font-ready')).toBe(true);
    });

    test('adds ready class if font load fails', async () => {
        const loadPromise = Promise.reject(new Error('Font load failed'));
        const readyPromise = Promise.resolve();
        mockDocumentFonts({
            check: jest.fn().mockReturnValue(false),
            load: jest.fn().mockReturnValue(loadPromise),
            ready: readyPromise
        });

        loadIconFontReady();

        expect(document.body.classList.contains('icon-font-ready')).toBe(false);

        // Catch to prevent unhandled rejection
        try {
            await loadPromise;
        } catch { /* ignore */ }

        await readyPromise;

        // Use jest to run pending microtasks and promises if still not flushed
        jest.runAllTimers();

        expect(document.body.classList.contains('icon-font-ready')).toBe(true);
    });

    test('adds ready class via fallback timer if fonts API is unavailable', () => {
        mockDocumentFonts(undefined);

        loadIconFontReady();

        expect(document.body.classList.contains('icon-font-ready')).toBe(true);
    });

    test('does not throw if document.body is not present', () => {
        // Remove document.body
        const originalBody = document.body;
        Object.defineProperty(document, 'body', {
            value: null,
            writable: true,
            configurable: true
        });

        expect(() => {
            loadIconFontReady();
        }).not.toThrow();

        // Restore document.body
        Object.defineProperty(document, 'body', {
            value: originalBody,
            writable: true,
            configurable: true
        });
    });

    test('uses fallback timer if font loading takes too long', () => {
        mockDocumentFonts({
            check: jest.fn().mockReturnValue(false),
            // Unresolving promises
            load: jest.fn().mockReturnValue(new Promise(() => {})),
            ready: new Promise(() => {})
        });

        loadIconFontReady();

        expect(document.body.classList.contains('icon-font-ready')).toBe(false);

        // Fast-forward 4 seconds
        jest.advanceTimersByTime(4000);

        expect(document.body.classList.contains('icon-font-ready')).toBe(true);
    });

    test('adds ready class when document.readyState is loading', () => {
        const originalReadyState = document.readyState;

        Object.defineProperty(document, 'readyState', {
            value: 'loading',
            writable: true,
            configurable: true
        });

        mockDocumentFonts({
            check: jest.fn().mockReturnValue(true)
        });

        loadIconFontReady();

        expect(document.body.classList.contains('icon-font-ready')).toBe(false);

        // Dispatch DOMContentLoaded
        document.dispatchEvent(new Event('DOMContentLoaded'));

        expect(document.body.classList.contains('icon-font-ready')).toBe(true);

        Object.defineProperty(document, 'readyState', {
            value: originalReadyState,
            writable: true,
            configurable: true
        });
    });
});
