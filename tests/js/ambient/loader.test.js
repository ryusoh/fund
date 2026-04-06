describe('Ambient Loader', () => {
    let originalWindowMatchMedia;
    let originalInnerWidth;
    let appendChildSpy;
    let originalConsoleWarn;

    beforeEach(() => {
        jest.resetModules();

        originalWindowMatchMedia = window.matchMedia;
        originalInnerWidth = window.innerWidth;
        originalConsoleWarn = console.warn;
        console.warn = jest.fn();

        window.matchMedia = jest.fn().mockImplementation(query => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: jest.fn(), // Deprecated
            removeListener: jest.fn(), // Deprecated
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            dispatchEvent: jest.fn(),
        }));

        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: 1024,
        });

        appendChildSpy = jest.spyOn(document.head, 'appendChild').mockImplementation(() => {});
    });

    afterEach(() => {
        window.matchMedia = originalWindowMatchMedia;
        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: originalInnerWidth,
        });
        appendChildSpy.mockRestore();
        console.warn = originalConsoleWarn;
    });

    it('should abort if prefers-reduced-motion is true', () => {
        window.matchMedia.mockImplementation(query => ({
            matches: query === '(prefers-reduced-motion: reduce)',
        }));

        require('../../../js/ambient/loader.js');

        expect(appendChildSpy).not.toHaveBeenCalled();
    });

    it('should abort if window innerWidth is less than 1024', () => {
        window.innerWidth = 800;

        require('../../../js/ambient/loader.js');

        expect(appendChildSpy).not.toHaveBeenCalled();
    });

    it('should load CSS and scripts if conditions are met', () => {
        require('../../../js/ambient/loader.js');

        expect(appendChildSpy).toHaveBeenCalled();

        // Find appended link
        const linkCall = appendChildSpy.mock.calls.find(call => call[0].tagName === 'LINK');
        expect(linkCall).toBeTruthy();
        expect(linkCall[0].href).toContain('/css/ambient/ambient.css');

        // Find appended scripts
        const scriptCalls = appendChildSpy.mock.calls.filter(call => call[0].tagName === 'SCRIPT');
        expect(scriptCalls.length).toBeGreaterThan(0);
        expect(scriptCalls[0][0].src).toContain('/js/ambient/sketch.js');
    });

    it('should handle document head append error', () => {
        appendChildSpy.mockImplementation(() => {
            throw new Error('mock DOM error');
        });

        require('../../../js/ambient/loader.js');

        expect(console.warn).toHaveBeenCalledWith(
            'Caught exception initializing ambient loader:',
            expect.any(Error)
        );
    });
});
