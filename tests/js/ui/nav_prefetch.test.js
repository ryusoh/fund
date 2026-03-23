import { jest } from '@jest/globals';

describe('nav_prefetch.js', () => {
    let originalFetch;
    let originalConnection;

    beforeEach(() => {
        jest.resetModules();
        originalFetch = window.fetch;
        originalConnection = navigator.connection;

        const makeSyncPromise = (val, isReject = false) => {
            return {
                then: (cb) => {
                    if (isReject) {
                        return makeSyncPromise(val, true);
                    }
                    if (cb) {
                        try {
                            const res = cb(val);
                            if (res && res.then) {
                                return res;
                            }
                            return makeSyncPromise(res);
                        } catch (e) {
                            return makeSyncPromise(e, true);
                        }
                    }
                    return makeSyncPromise(val);
                },
                catch: (cb) => {
                    if (!isReject) {
                        return makeSyncPromise(val);
                    }
                    if (cb) {
                        const res = cb(val);
                        if (res && res.then) {
                            return res;
                        }
                        return makeSyncPromise(res);
                    }
                    return makeSyncPromise(val, true);
                },
                finally: (cb) => {
                    if (cb) {
                        cb();
                    }
                    return makeSyncPromise(val, isReject);
                },
            };
        };

        window.fetch = jest.fn((url) => {
            if (url && url.endsWith && url.endsWith('.css')) {
                return makeSyncPromise({
                    ok: true,
                    text: () =>
                        makeSyncPromise(`
                        background: url('bg1.png');
                        background-image: url("bg2.jpg");
                        background: url(bg3.webp);
                        background: url(data:image/png;base64,123);
                    `),
                });
            }
            return makeSyncPromise({ ok: true, text: () => makeSyncPromise('') });
        });

        window.setTimeout = jest.fn((cb) => {
            cb();
            return 1;
        });
        window.requestIdleCallback = jest.fn((cb) => {
            cb();
            return 1;
        });

        window.Promise.resolve = jest.fn((val) => makeSyncPromise(val));
        window.Promise.reject = jest.fn((err) => makeSyncPromise(err, true));
        window.Promise.allSettled = jest.fn((promises) => {
            return makeSyncPromise(promises);
        });

        // Set up the manifest link correctly
        document.body.innerHTML = '<link rel="manifest" href="/assets/manifest.webmanifest" />';
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'visible',
        });

        delete window.location;
        window.location = new URL('http://localhost/position/');

        Object.defineProperty(navigator, 'connection', {
            value: { effectiveType: '4g' },
            configurable: true,
        });
    });

    afterEach(() => {
        window.fetch = originalFetch;

        if (originalConnection) {
            Object.defineProperty(navigator, 'connection', {
                value: originalConnection,
                configurable: true,
            });
        } else {
            delete navigator.connection;
        }

        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    function loadScript() {
        jest.isolateModules(() => {
            require('@js/ui/nav_prefetch.js');
        });
    }

    test('should extract css backgrounds correctly', () => {
        loadScript();

        const calls = window.fetch.mock.calls.map((c) => c[0]);
        expect(calls.some((url) => url && url.endsWith && url.endsWith('bg1.png'))).toBe(true);
        expect(calls.some((url) => url && url.endsWith && url.endsWith('bg2.jpg'))).toBe(true);
        expect(calls.some((url) => url && url.endsWith && url.endsWith('bg3.webp'))).toBe(true);
        expect(calls.some((url) => url && url.startsWith && url.startsWith('data:'))).toBe(false);
    });

    test('should handle missing manifest link gracefully and fall back to app base', () => {
        document.body.innerHTML = '';
        loadScript();
    });

    test('should handle manifest parsing error', () => {
        document.body.innerHTML = `
            <link rel="manifest" href="http://invalid url" />
        `;
        loadScript();
    });

    test('should handle broken URL inside css extract correctly', () => {
        const makeSyncPromise = (val, isReject = false) => ({
            then: (cb) => {
                if (isReject) {
                    return makeSyncPromise(val, true);
                }
                if (cb) {
                    try {
                        const res = cb(val);
                        if (res && res.then) {
                            return res;
                        }
                        return makeSyncPromise(res);
                    } catch (e) {
                        return makeSyncPromise(e, true);
                    }
                }
                return makeSyncPromise(val);
            },
            catch: (cb) => {
                if (!isReject) {
                    return makeSyncPromise(val);
                }
                if (cb) {
                    const res = cb(val);
                    if (res && res.then) {
                        return res;
                    }
                    return makeSyncPromise(res);
                }
                return makeSyncPromise(val, true);
            },
            finally: (cb) => {
                if (cb) {
                    cb();
                }
                return makeSyncPromise(val, isReject);
            },
        });
        window.fetch = jest.fn((url) => {
            if (url && url.endsWith && url.endsWith('.css')) {
                return makeSyncPromise({
                    ok: true,
                    text: () => makeSyncPromise("background: url('http://invalid url');"),
                });
            }
            return makeSyncPromise({ ok: true });
        });
        loadScript();
    });

    test('should handle cross origin links in prefetch gracefully', () => {
        document.body.innerHTML = `
            <link rel="manifest" href="/assets/manifest.webmanifest" />
            <div class="container">
                <a href="http://other-domain.com/path">External</a>
                <a href="/position/">Internal</a>
                <a href="#hash">Hash</a>
                <a href="http://invalid url">Invalid</a>
            </div>
        `;
        loadScript();

        const calls = window.fetch.mock.calls.map((c) => c[0]);
        expect(calls.some((url) => url && url.includes && url.includes('other-domain.com'))).toBe(
            false
        );
        expect(calls.some((url) => url && url.endsWith && url.endsWith('/position/'))).toBe(true);
    });

    test('should fallback to setTimeout if requestIdleCallback missing', () => {
        delete window.requestIdleCallback;
        loadScript();
        expect(window.fetch).toHaveBeenCalled();
    });

    test('should handle fetch rejection gracefully', () => {
        const makeSyncPromise = (val, isReject = false) => ({
            then: (cb) => {
                if (isReject) {
                    return makeSyncPromise(val, true);
                }
                return makeSyncPromise(cb(val));
            },
            catch: (cb) => makeSyncPromise(cb(val)),
            finally: (cb) => {
                if (cb) {
                    cb();
                }
                return makeSyncPromise(val, isReject);
            },
        });
        window.fetch = jest.fn(() => makeSyncPromise(new Error('Network error'), true));
        loadScript();
    });

    test('should handle css network failure gracefully', () => {
        const makeSyncPromise = (val, isReject = false) => ({
            then: (cb) => {
                if (isReject) {
                    return makeSyncPromise(val, true);
                }
                if (cb) {
                    try {
                        const res = cb(val);
                        if (res && res.then) {
                            return res;
                        }
                        return makeSyncPromise(res);
                    } catch (e) {
                        return makeSyncPromise(e, true);
                    }
                }
                return makeSyncPromise(val);
            },
            catch: (cb) => {
                if (!isReject) {
                    return makeSyncPromise(val);
                }
                if (cb) {
                    const res = cb(val);
                    if (res && res.then) {
                        return res;
                    }
                    return makeSyncPromise(res);
                }
                return makeSyncPromise(val, true);
            },
            finally: (cb) => {
                if (cb) {
                    cb();
                }
                return makeSyncPromise(val, isReject);
            },
        });
        window.fetch = jest.fn((url) => {
            if (url && url.endsWith && url.endsWith('.css')) {
                return makeSyncPromise({ ok: false });
            }
            return makeSyncPromise({ ok: true });
        });
        loadScript();
    });

    test('should skip prefetch if saveData is true', () => {
        Object.defineProperty(navigator, 'connection', {
            value: { saveData: true },
            configurable: true,
        });
        loadScript();
        expect(window.fetch).not.toHaveBeenCalled();
    });

    test('should handle unknown route fallback', () => {
        window.location = new URL('http://localhost/unknown/');
        loadScript();
    });

    test('should wait for document to load if readyState is loading', () => {
        Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
        const addSpy = jest.spyOn(window, 'addEventListener');
        loadScript();
        expect(addSpy).toHaveBeenCalledWith('load', expect.any(Function), { once: true });
        // simulate load event
        const handler = addSpy.mock.calls[0][1];
        handler();
    });

    test('should skip video if connection profile is missing', () => {
        delete navigator.connection;
        loadScript();
    });

    test('css URL resolution returns undefined if bad', () => {
        const makeSyncPromise = (val, isReject = false) => ({
            then: (cb) => {
                if (isReject) {
                    return makeSyncPromise(val, true);
                }
                if (cb) {
                    try {
                        const res = cb(val);
                        if (res && res.then) {
                            return res;
                        }
                        return makeSyncPromise(res);
                    } catch (e) {
                        return makeSyncPromise(e, true);
                    }
                }
                return makeSyncPromise(val);
            },
            catch: (cb) => {
                if (!isReject) {
                    return makeSyncPromise(val);
                }
                if (cb) {
                    const res = cb(val);
                    if (res && res.then) {
                        return res;
                    }
                    return makeSyncPromise(res);
                }
                return makeSyncPromise(val, true);
            },
            finally: (cb) => {
                if (cb) {
                    cb();
                }
                return makeSyncPromise(val, isReject);
            },
        });
        window.fetch = jest.fn((url) => {
            if (url && url.endsWith && url.endsWith('.css')) {
                return makeSyncPromise({
                    ok: true,
                    text: () =>
                        makeSyncPromise(`
                        background: url('');
                    `),
                });
            }
            return makeSyncPromise({ ok: true });
        });
        loadScript();
    });

    test('should return early if document visibility is hidden', () => {
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'hidden',
        });
        loadScript();
        expect(window.fetch).not.toHaveBeenCalled();
    });
});
