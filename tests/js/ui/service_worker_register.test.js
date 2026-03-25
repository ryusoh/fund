describe('service_worker_register.js', () => {
    const SCRIPT_PATH = '@ui/service_worker_register.js';

    let originalAddEventListener;
    let hostnameOverride;

    beforeEach(() => {
        jest.resetModules();
        hostnameOverride = 'example.com';
        window.__SW_FORCE_SW_HOSTNAME__ = hostnameOverride;
        originalAddEventListener = window.addEventListener;
        Object.defineProperty(window.navigator, 'serviceWorker', {
            configurable: true,
            value: {
                register: jest
                    .fn()
                    .mockResolvedValue({ update: jest.fn().mockResolvedValue(undefined) }),
            },
        });
    });

    afterEach(() => {
        window.addEventListener = originalAddEventListener;
        jest.resetModules();
        delete document.currentScript;
        delete window.navigator.serviceWorker;
        delete window.__SW_FORCE_SW_HOSTNAME__;
    });

    function withCurrentScript(attributes, callback) {
        const scriptStub = {
            getAttribute: (name) => attributes[name] || null,
        };
        Object.defineProperty(document, 'currentScript', {
            configurable: true,
            get: () => scriptStub,
        });
        callback();
    }

    function loadScript() {
        jest.isolateModules(() => {
            require(SCRIPT_PATH);
        });
    }

    function triggerLoadImmediately() {
        window.addEventListener = jest.fn().mockImplementation((event, handler) => {
            if (event === 'load') {
                handler();
            }
        });
    }

    test('registers service worker with provided attributes', () => {
        triggerLoadImmediately();
        withCurrentScript(
            {
                'data-sw-path': '../sw.js',
                'data-sw-scope': '../',
            },
            () => {
                loadScript();
            }
        );

        expect(window.navigator.serviceWorker.register).toHaveBeenCalledWith('../sw.js', {
            scope: '../',
            updateViaCache: 'none',
        });
    });

    test('falls back to defaults when attributes missing', () => {
        triggerLoadImmediately();
        withCurrentScript({}, () => {
            loadScript();
        });

        expect(window.navigator.serviceWorker.register).toHaveBeenCalledWith('./sw.js', {
            scope: './',
            updateViaCache: 'none',
        });
    });

    test('does nothing when service workers are unsupported', () => {
        delete window.navigator.serviceWorker;
        triggerLoadImmediately();
        withCurrentScript({}, () => {
            loadScript();
        });

        expect(window.addEventListener).not.toHaveBeenCalled();
    });

    test('ignores registration errors', () => {
        const registerMock = jest.fn().mockRejectedValue(new Error('boom'));
        Object.defineProperty(window.navigator, 'serviceWorker', {
            configurable: true,
            value: { register: registerMock },
        });
        triggerLoadImmediately();
        withCurrentScript({}, () => {
            expect(loadScript).not.toThrow();
        });
    });

    test('ignores sync exceptions thrown inside register callback', () => {
        // Line 40: catch inside window.addEventListener load event handler
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        Object.defineProperty(window.navigator, 'serviceWorker', {
            configurable: true,
            value: {
                get register() {
                    throw new Error('Sync boom');
                }
            },
        });
        triggerLoadImmediately();
        withCurrentScript({}, () => {
            loadScript();
        });
        expect(consoleWarnSpy).toHaveBeenCalledWith('Caught exception calling service worker register:', expect.any(Error));
        consoleWarnSpy.mockRestore();
    });

    test('ignores errors thrown outside registration', () => {
        // Line 63: catch around entire IIFE
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        triggerLoadImmediately();
        withCurrentScript({}, () => {
            expect(() => {
                jest.isolateModules(() => {
                    // Mock isLocalHostname to throw, which is called at the top of the IIFE
                    const originalHostname = window.__SW_FORCE_SW_HOSTNAME__;
                    Object.defineProperty(window, '__SW_FORCE_SW_HOSTNAME__', {
                        get: () => { throw new Error('Global IIFE error'); },
                        configurable: true
                    });

                    require(SCRIPT_PATH);

                    Object.defineProperty(window, '__SW_FORCE_SW_HOSTNAME__', {
                        value: originalHostname,
                        configurable: true
                    });
                });
            }).not.toThrow();
        });
        expect(consoleWarnSpy).toHaveBeenCalledWith('Caught exception initializing service worker:', expect.any(Error));
        consoleWarnSpy.mockRestore();
    });
});
