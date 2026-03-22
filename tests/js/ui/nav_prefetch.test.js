describe('Nav Prefetch', () => {
    let originalFetch;
    let fetchMock;
    let mockConnection;

    beforeEach(() => {
        jest.useFakeTimers();

        fetchMock = jest.fn((url) => {
            if (url && url.endsWith('.css')) {
                return Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve('body { background-image: url("assets/bg.jpg"); }')
                });
            }
            return Promise.resolve({
                ok: true,
                text: () => Promise.resolve('')
            });
        });
        originalFetch = window.fetch;
        window.fetch = fetchMock;

        // Ensure 'requestIdleCallback' in window is false so it falls back to setTimeout
        // which FakeTimers controls easily
        delete window.requestIdleCallback;

        mockConnection = { effectiveType: '4g', saveData: false };
        Object.defineProperty(navigator, 'connection', {
            writable: true,
            configurable: true,
            value: mockConnection
        });

        document.body.innerHTML = `
            <div class="nav-container">
                <a href="/position/">Position</a>
                <a href="/calendar/">Calendar</a>
            </div>
            <div class="container">
                <a href="/terminal/">Terminal</a>
                <a href="#skip-me">Skip</a>
                <a href="https://external.com/link">External</a>
            </div>
            <link rel="manifest" href="/assets/manifest.webmanifest">
        `;

        Object.defineProperty(document, 'visibilityState', {
            value: 'visible',
            configurable: true
        });

        // Use history API to set JSDOM location safely per memory rules
        window.history.pushState({}, '', '/');
    });

    afterEach(() => {
        jest.useRealTimers();
        window.fetch = originalFetch;
        jest.resetModules();
        document.body.innerHTML = '';
    });

    const loadPrefetchScript = async () => {
        // Reset script module cache so it executes again
        jest.isolateModules(() => {
            require('../../../js/ui/nav_prefetch.js');
        });

        // Let the event listener or direct invocation run
        await Promise.resolve(); // trigger the scheduling (it calls schedulePrefetch)

        // Wait for CSS background fetching promises (Promise.allSettled)
        for (let i = 0; i < 20; i++) {
            await Promise.resolve();
            jest.advanceTimersByTime(10);
        }

        // Advance timers to trigger `drainQueue` via PREFETCH_DELAY
        jest.advanceTimersByTime(1800); // PREFETCH_DELAY is 1800
        await Promise.resolve();

        // Drain loop with IDLE_TIMEOUT (2000)
        for (let i = 0; i < 150; i++) { // Increase loop to ensure all fetched items get resolved
            jest.advanceTimersByTime(2000);
            await Promise.resolve();
        }
    };

    it('should fetch links and assets for the current page', async () => {
        await loadPrefetchScript();

        expect(fetchMock).toHaveBeenCalled();

        const calls = fetchMock.mock.calls.map(call => call[0]);
        // The script crawls all .nav-container a[href] and queues them
        // Let's check if the mock actually got them
        expect(calls).toContain('http://localhost/position/');
        expect(calls).toContain('http://localhost/calendar/');
        expect(calls).toContain('http://localhost/terminal/');
    });

    it('should not prefetch if saveData is true', async () => {
        mockConnection.saveData = true;
        await loadPrefetchScript();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should not prefetch if visibilityState is hidden', async () => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        await loadPrefetchScript();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should skip video assets on slow connection', async () => {
        mockConnection.slow = true;
        mockConnection.effectiveType = '2g';

        await loadPrefetchScript();

        const calls = fetchMock.mock.calls.map(call => call[0]);
        // mobile_bg.mp4 should not be in the fetch list
        expect(calls).not.toContain('http://localhost/assets/mobile_bg.mp4');
    });

    it('should fallback to document.location when no manifest', async () => {
        document.querySelector('link[rel="manifest"]').remove();
        await loadPrefetchScript();
        expect(fetchMock).toHaveBeenCalled();
    });

    it('should handle background image extraction', async () => {
        await loadPrefetchScript();

        const calls = fetchMock.mock.calls.map(call => call[0]);
        // URL is relative to the CSS file
        expect(calls).toContain('http://localhost/css/assets/bg.jpg');
    });
});
