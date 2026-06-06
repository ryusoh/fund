/**
 * @jest-environment jsdom
 */

describe('Image Fallback Loader', () => {
    let originalConsoleWarn;

    beforeEach(() => {
        // Mock console.warn to suppress expected warnings in output
        originalConsoleWarn = console.warn;
        console.warn = jest.fn();

        // Clear the DOM and reset modules to allow IIFE to re-evaluate
        document.body.innerHTML = '';
        jest.resetModules();
    });

    afterEach(() => {
        console.warn = originalConsoleWarn;
    });

    const loadScript = () => {
        require('../../../js/loader/imageFallback.js');
    };

    it('should ignore elements without data-fallbacks', () => {
        const img = document.createElement('img');
        img.src = 'test.jpg';
        document.body.appendChild(img);

        loadScript();

        expect(img.src).toContain('test.jpg');
        expect(img.classList.contains('is-fallback-ready')).toBe(false);
    });

    it('should handle invalid JSON gracefully and warn', () => {
        const img = document.createElement('img');
        img.setAttribute('data-fallbacks', 'invalid json');
        document.body.appendChild(img);

        loadScript();

        expect(console.warn).toHaveBeenCalledWith(
            'Image fallback handling failed:',
            expect.any(SyntaxError)
        );
        expect(img.classList.contains('is-fallback-ready')).toBe(false);
    });

    it('should do nothing if parsed list is not an array or is empty', () => {
        const img1 = document.createElement('img');
        img1.setAttribute('data-fallbacks', '{}'); // Not an array
        const img2 = document.createElement('img');
        img2.setAttribute('data-fallbacks', '[]'); // Empty array
        document.body.appendChild(img1);
        document.body.appendChild(img2);

        loadScript();

        expect(img1.classList.contains('is-fallback-ready')).toBe(false);
        expect(img2.classList.contains('is-fallback-ready')).toBe(false);
        expect(img1.src).toBe('');
        expect(img2.src).toBe('');
    });

    it('should set src to the first fallback URL if src is empty', () => {
        const img = document.createElement('img');
        img.setAttribute('data-fallbacks', '["fallback.jpg"]');
        document.body.appendChild(img);

        loadScript();

        expect(img.src).toContain('fallback.jpg');
    });

    it('should set src to the first fallback URL if src is different', () => {
        const img = document.createElement('img');
        img.src = 'other.jpg';
        img.setAttribute('data-fallbacks', '["fallback.jpg"]');
        document.body.appendChild(img);

        loadScript();

        expect(img.src).toContain('fallback.jpg');
    });

    it('should add is-fallback-ready class immediately if already complete', () => {
        const img = document.createElement('img');
        // Include the full location origin that JSDOM resolves relative paths to
        const fullPath = `${window.location.origin}/fallback.jpg`;
        img.setAttribute('data-fallbacks', `["${fullPath}"]`);

        // Define properties to simulate a completely loaded image
        Object.defineProperty(img, 'complete', { value: true, configurable: true });
        Object.defineProperty(img, 'naturalWidth', { value: 100, configurable: true });
        img.src = fullPath; // Match first URL so it doesn't overwrite src
        document.body.appendChild(img);

        loadScript();

        expect(img.classList.contains('is-fallback-ready')).toBe(true);
    });

    it('should add is-fallback-ready class on successful load', () => {
        const img = document.createElement('img');
        img.setAttribute('data-fallbacks', '["fallback.jpg"]');
        document.body.appendChild(img);

        loadScript();

        // Simulate load event
        img.dispatchEvent(new Event('load'));

        expect(img.classList.contains('is-fallback-ready')).toBe(true);
    });

    it('should advance to next URL on error', () => {
        const img = document.createElement('img');
        // The script sets el.src to list[i++] via `tryNext`, which will override whatever is there
        const fail1 = `${window.location.origin}/fail1.jpg`;
        const fail2 = `${window.location.origin}/fail2.jpg`;
        const success = `${window.location.origin}/success.jpg`;
        img.setAttribute('data-fallbacks', `["${fail1}", "${fail2}", "${success}"]`);
        document.body.appendChild(img);

        loadScript();

        // The first URL is assigned during initial load: `el.src = list[0]`
        // This advances the iterator 'i' for tryNext? No, the iterator is 0.
        // When tryNext() is called on error, it sets `el.src = list[i++]` (i=0 -> fail1.jpg).

        expect(img.src).toContain('fail1.jpg');

        // Trigger error. tryNext() called. i=0, sets src to fail1.jpg, i becomes 1.
        img.dispatchEvent(new Event('error'));
        expect(img.src).toContain('fail1.jpg');

        // Trigger error again. tryNext() called. i=1, sets src to fail2.jpg, i becomes 2.
        img.dispatchEvent(new Event('error'));
        expect(img.src).toContain('fail2.jpg');

        // Trigger error again. tryNext() called. i=2, sets src to success.jpg, i becomes 3.
        img.dispatchEvent(new Event('error'));
        expect(img.src).toContain('success.jpg');

        // Trigger error again. i=3 >= list.length. returns without changing src.
        img.dispatchEvent(new Event('error'));
        expect(img.src).toContain('success.jpg');
    });

    it('should catch global execution errors and warn', () => {
        // Mock querySelectorAll to throw an error to trigger the global try-catch
        const originalQuerySelectorAll = document.querySelectorAll;
        document.querySelectorAll = jest.fn(() => {
            throw new Error('Test execution error');
        });

        loadScript();

        expect(console.warn).toHaveBeenCalledWith(
            'Image fallback handling failed:',
            expect.any(Error)
        );

        // Restore querySelectorAll
        document.querySelectorAll = originalQuerySelectorAll;
    });
});
