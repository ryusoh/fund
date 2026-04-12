import { jest } from '@jest/globals';

describe('service_worker_register.js', () => {
    const SCRIPT_PATH = '../../../js/ui/service_worker_register.js';

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
        jest.restoreAllMocks();
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

    test('ignores registration errors', async () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const registerMock = jest.fn().mockRejectedValue(new Error('boom'));
        Object.defineProperty(window.navigator, 'serviceWorker', {
            configurable: true,
            value: { register: registerMock },
        });
        triggerLoadImmediately();
        withCurrentScript({}, () => {
            loadScript();
        });

        // Wait for the .catch() on navigator.serviceWorker.register to happen
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(consoleWarnSpy).toHaveBeenCalledWith(
            'Service worker registration failed:',
            expect.any(Error)
        );
        consoleWarnSpy.mockRestore();
    });

    test('ignores sync exceptions thrown inside register callback', () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        Object.defineProperty(window.navigator, 'serviceWorker', {
            configurable: true,
            value: {
                get register() {
                    throw new Error('Sync boom');
                },
            },
        });
        triggerLoadImmediately();
        withCurrentScript({}, () => {
            loadScript();
        });
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            'Caught exception calling service worker register:',
            expect.any(Error)
        );
        consoleWarnSpy.mockRestore();
    });

    test('ignores errors thrown outside registration', () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        triggerLoadImmediately();
        withCurrentScript({}, () => {
            jest.isolateModules(() => {
                const originalHostname = window.__SW_FORCE_SW_HOSTNAME__;
                Object.defineProperty(window, '__SW_FORCE_SW_HOSTNAME__', {
                    get: () => {
                        throw new Error('Global IIFE error');
                    },
                    configurable: true,
                });

                try {
                    require(SCRIPT_PATH);
                } finally {
                    // Restore to prevent leaking the throwing getter
                    Object.defineProperty(window, '__SW_FORCE_SW_HOSTNAME__', {
                        value: originalHostname,
                        configurable: true,
                    });
                }
            });
        });
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            'Caught exception initializing service worker:',
            expect.any(Error)
        );
        consoleWarnSpy.mockRestore();
    });

    test('covers branch where update check fails', async () => {
        window.__SW_FORCE_SW_HOSTNAME__ = 'example.com';
        const mockUpdate = jest.fn().mockRejectedValue(new Error('Update failed'));
        const mockRegister = jest.fn().mockResolvedValue({ update: mockUpdate });
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        Object.defineProperty(navigator, 'serviceWorker', {
            value: { register: mockRegister },
            configurable: true,
        });

        triggerLoadImmediately();
        withCurrentScript({}, () => {
            loadScript();
        });

        // The .then() and .catch() on registration.update() happen asynchronously
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(consoleWarnSpy).toHaveBeenCalledWith(
            'Service worker update check failed:',
            expect.any(Error)
        );
        consoleWarnSpy.mockRestore();
    });

    test('covers branch where isLocalHostname returns true directly', () => {
        window.__SW_FORCE_SW_HOSTNAME__ = 'localhost';
        const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
        loadScript();
        expect(addEventListenerSpy).not.toHaveBeenCalled();
    });

    test('bails out early if serviceWorker is not supported in navigator', () => {
        window.__SW_FORCE_SW_HOSTNAME__ = 'example.com';
        const originalNavigator = global.navigator;
        Object.defineProperty(global, 'navigator', {
            value: { userAgent: 'node.js' },
            configurable: true,
        });

        const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
        loadScript();

        expect(addEventListenerSpy).not.toHaveBeenCalled();

        Object.defineProperty(global, 'navigator', {
            value: originalNavigator,
            configurable: true,
        });
    });

    test('uses default path and scope when document.currentScript is null', () => {
        triggerLoadImmediately();
        Object.defineProperty(document, 'currentScript', {
            configurable: true,
            get: () => null,
        });

        loadScript();

        expect(window.navigator.serviceWorker.register).toHaveBeenCalledWith('./sw.js', {
            scope: './',
            updateViaCache: 'none',
        });
    });

    test('uses window.location.hostname when window.__SW_FORCE_SW_HOSTNAME__ is not string', () => {
        delete window.__SW_FORCE_SW_HOSTNAME__;
        // jsdom default is 'localhost'
        const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
        loadScript();
        expect(addEventListenerSpy).not.toHaveBeenCalled();
    });
});
