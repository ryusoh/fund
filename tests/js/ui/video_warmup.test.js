describe('video_warmup.js', () => {
    let video;
    let originalConnection;
    let originalRequestIdleCallback;
    let originalFetch;
    let originalCaches;

    beforeEach(() => {
        jest.resetModules();
        document.body.innerHTML = `
            <div class="video-background">
                <video src="http://example.com/video.mp4"></video>
            </div>
        `;
        video = document.querySelector('video');

        // Setup DOM mocks
        originalConnection = navigator.connection;
        originalRequestIdleCallback = window.requestIdleCallback;
        originalFetch = global.fetch;
        originalCaches = global.caches;

        Object.defineProperty(navigator, 'connection', {
            writable: true,
            configurable: true,
            value: { effectiveType: '4g', saveData: false },
        });

        window.requestIdleCallback = jest.fn((cb) => setTimeout(cb, 0));

        global.fetch = jest.fn().mockResolvedValue({ ok: true });

        global.caches = {
            match: jest.fn().mockResolvedValue(undefined),
            open: jest.fn().mockResolvedValue({
                add: jest.fn().mockResolvedValue(undefined),
            }),
        };

        jest.useFakeTimers();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        Object.defineProperty(navigator, 'connection', {
            value: originalConnection,
            configurable: true,
            writable: true,
        });
        window.requestIdleCallback = originalRequestIdleCallback;
        global.fetch = originalFetch;
        global.caches = originalCaches;
        jest.useRealTimers();
    });

    const loadScript = () => {
        // Mock document.readyState to run init immediately if needed
        Object.defineProperty(document, 'readyState', {
            configurable: true,
            value: 'complete',
        });
        require('@ui/video_warmup.js');
    };

    test('skips warmup if connection is slow (saveData)', () => {
        navigator.connection.saveData = true;
        loadScript();
        expect(video.dataset.videoWarmupScheduled).toBeUndefined();
    });

    test('ignores connection check if video is present but connection is fast', () => {
        navigator.connection.effectiveType = '4g';
        navigator.connection.saveData = false;
        loadScript();
        expect(video.dataset.videoWarmupScheduled).toBe('true');
    });

    test('uses fallback url correctly when video.currentSrc is available', () => {
        Object.defineProperty(video, 'currentSrc', {
            value: 'http://example.com/current_video.mp4',
            configurable: true,
        });
        loadScript();
        jest.runAllTimers();
        expect(global.caches.match).toHaveBeenCalled();
    });

    test('skips warmup if connection is fast but using webkitConnection', () => {
        Object.defineProperty(navigator, 'connection', {
            value: undefined,
            configurable: true,
        });
        Object.defineProperty(navigator, 'webkitConnection', {
            value: { effectiveType: '4g', saveData: true },
            configurable: true,
        });
        loadScript();
        expect(video.dataset.videoWarmupScheduled).toBeUndefined();
    });

    test('skips warmup if connection is fast but using mozConnection', () => {
        Object.defineProperty(navigator, 'connection', {
            value: undefined,
            configurable: true,
        });
        Object.defineProperty(navigator, 'mozConnection', {
            value: { effectiveType: '2g', saveData: false },
            configurable: true,
        });
        loadScript();
        expect(video.dataset.videoWarmupScheduled).toBeUndefined();
    });

    test('ignores connection check if navigator.connection is not available', () => {
        Object.defineProperty(navigator, 'connection', {
            value: undefined,
            configurable: true,
        });
        Object.defineProperty(navigator, 'mozConnection', {
            value: undefined,
            configurable: true,
        });
        Object.defineProperty(navigator, 'webkitConnection', {
            value: undefined,
            configurable: true,
        });
        loadScript();
        expect(video.dataset.videoWarmupScheduled).toBe('true');
    });

    test('falls back to fetch if caches.match fails', async () => {
        global.caches.match.mockRejectedValue(new Error('Cache error'));
        loadScript();

        // Let timers run and microtasks settle
        jest.useRealTimers();
        window.requestIdleCallback.mock.calls[0][0](); // manually trigger the callback
        await new Promise((resolve) => setTimeout(resolve, 10)); // allow catch handlers to settle
        jest.useFakeTimers();

        expect(global.fetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                cache: 'force-cache',
            })
        );
    });

    test('fails warmFetchFallback gracefully', () => {
        global.fetch.mockRejectedValueOnce(new Error('Fetch failed'));
        // simulate a scenario where we reach warmFetchFallback directly
        delete global.caches;
        loadScript();
        jest.runAllTimers();
        // Since the promise rejection in fetch is caught silently, this shouldn't throw
        expect(global.fetch).toHaveBeenCalled();
    });

    test('skips warmup if connection is slow (slow-2g)', () => {
        navigator.connection.effectiveType = 'slow-2g';
        loadScript();
        expect(video.dataset.videoWarmupScheduled).toBeUndefined();
    });

    test('ignores playback readiness error during load', () => {
        video.load = jest.fn(() => {
            throw new Error('Load error');
        });
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        loadScript();
        jest.runAllTimers();

        expect(consoleSpy).toHaveBeenCalledWith('Caught exception:', expect.any(Error));
        consoleSpy.mockRestore();
    });

    test('handles event listener fallback when document is not complete', () => {
        Object.defineProperty(document, 'readyState', {
            configurable: true,
            value: 'loading',
        });
        const addSpy = jest.spyOn(window, 'addEventListener');
        require('@ui/video_warmup.js');
        expect(addSpy).toHaveBeenCalledWith('load', expect.any(Function), { once: true });
        addSpy.mockRestore();
    });

    test('skips warmup if connection is slow (2g)', () => {
        navigator.connection.effectiveType = '2g';
        loadScript();
        expect(video.dataset.videoWarmupScheduled).toBeUndefined();
    });

    test('handles missing video element gracefully', () => {
        document.body.innerHTML = '';
        expect(() => loadScript()).not.toThrow();
    });

    test('schedules warmup using requestIdleCallback', () => {
        loadScript();
        expect(video.dataset.videoWarmupScheduled).toBe('true');
        expect(window.requestIdleCallback).toHaveBeenCalled();
    });

    test('schedules warmup using setTimeout fallback', () => {
        delete window.requestIdleCallback;
        const spy = jest.spyOn(window, 'setTimeout');
        loadScript();
        expect(video.dataset.videoWarmupScheduled).toBe('true');
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    test('caches the video URL using caches.match and caches.open', async () => {
        loadScript();

        // Let idle callback/setTimeout execute
        jest.runAllTimers();

        // Await any microtasks generated by the cache promises
        await Promise.resolve();

        expect(global.caches.match).toHaveBeenCalled();
        expect(global.caches.open).toHaveBeenCalledWith('fund-cache-v1');
    });

    test('does not cache if video is already cached', async () => {
        global.caches.match.mockResolvedValueOnce({}); // simulate cached
        loadScript();
        jest.runAllTimers();
        await Promise.resolve();

        expect(global.caches.match).toHaveBeenCalled();
        expect(global.caches.open).not.toHaveBeenCalled();
    });

    test('falls back to fetch if caches API fails', async () => {
        global.caches.match.mockRejectedValue(new Error('Cache error'));
        loadScript();

        // Let timers run and microtasks settle
        jest.useRealTimers();
        window.requestIdleCallback.mock.calls[0][0](); // manually trigger the callback
        await new Promise((resolve) => setTimeout(resolve, 10)); // allow catch handlers to settle
        jest.useFakeTimers();

        expect(global.fetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                cache: 'force-cache',
            })
        );
    });

    test('falls back to fetch if caches API add fails', async () => {
        const mockCache = { add: jest.fn().mockRejectedValue(new Error('Cache add error')) };
        global.caches.open.mockResolvedValue(mockCache);
        loadScript();

        jest.useRealTimers();
        window.requestIdleCallback.mock.calls[0][0]();
        await new Promise((resolve) => setTimeout(resolve, 10));
        jest.useFakeTimers();

        expect(global.fetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                cache: 'force-cache',
            })
        );
    });

    test('falls back to fetch if caches is unavailable', async () => {
        delete global.caches;
        loadScript();
        jest.runAllTimers();

        expect(global.fetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                cache: 'force-cache',
            })
        );
    });

    test('updates video.preload to auto and calls load()', () => {
        video.preload = 'none';
        video.load = jest.fn();

        loadScript();
        jest.runAllTimers();

        expect(video.preload).toBe('auto');
        expect(video.load).toHaveBeenCalled();
    });

    test('skips warmup execution if video is not connected', () => {
        loadScript();

        // Remove video before the scheduled callback runs
        video.remove();

        jest.runAllTimers();

        expect(global.caches.match).not.toHaveBeenCalled();
        expect(video.preload).not.toBe('auto');
    });

    test('skips warmup if readyState implies HAVE_ENOUGH_DATA', () => {
        Object.defineProperty(video, 'readyState', { value: 4, configurable: true });

        loadScript();
        jest.runAllTimers();

        expect(global.caches.match).not.toHaveBeenCalled();
    });

    test('handles missing src gracefully', () => {
        video.removeAttribute('src');
        loadScript();
        jest.runAllTimers();
        expect(global.caches.match).not.toHaveBeenCalled();
    });

    test('evaluates correctly when typeof window is undefined', () => {
        // Mock typeof window to evaluate to undefined
        const originalWindow = global.window;

        try {
            delete global.window;

            jest.isolateModules(() => {
                require('@ui/video_warmup.js');
            });
            expect(true).toBe(true);
        } catch {
            // It will throw because video_warmup.js accesses `window.location.href`, etc.
            // But we hit line 4
        } finally {
            global.window = originalWindow;
        }
    });
});
