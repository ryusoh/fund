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
        // Line 63: catch around entire IIFE
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        triggerLoadImmediately();
        withCurrentScript({}, () => {
            expect(() => {
                jest.isolateModules(() => {
                    // Mock isLocalHostname to throw, which is called at the top of the IIFE
                    const originalHostname = window.__SW_FORCE_SW_HOSTNAME__;
                    Object.defineProperty(window, '__SW_FORCE_SW_HOSTNAME__', {
                        get: () => {
                            throw new Error('Global IIFE error');
                        },
                        configurable: true,
                    });

                    require(SCRIPT_PATH);

                    Object.defineProperty(window, '__SW_FORCE_SW_HOSTNAME__', {
                        value: originalHostname,
                        configurable: true,
                    });
                });
            }).not.toThrow();
        });
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            'Caught exception initializing service worker:',
            expect.any(Error)
        );
        consoleWarnSpy.mockRestore();
    });

    it('bails out early if serviceWorker is not supported in navigator', () => {
        // Force the host to NOT be local so the check can proceed
        window.__SW_FORCE_SW_HOSTNAME__ = 'example.com';

        // Save original properties
        const originalLocation = window.location;
        const originalNavigator = global.navigator;

        // Mock `navigator` without `serviceWorker`
        Object.defineProperty(global, 'navigator', {
            value: {
                userAgent: 'node.js',
                // serviceWorker missing intentionally
            },
            configurable: true,
        });

        const script = document.createElement('script');
        script.setAttribute('data-sw-path', '/sw.js');
        document.body.appendChild(script);

        jest.spyOn(document, 'currentScript', 'get').mockReturnValue(script);
        jest.spyOn(window, 'addEventListener');

        // Reload module to execute IIFE
        jest.isolateModules(() => {
            require('../../../js/ui/service_worker_register');
        });

        // We should bail out early before attaching an event listener
        expect(window.addEventListener).not.toHaveBeenCalled();

        // Restore everything
        Object.defineProperty(global, 'navigator', {
            value: originalNavigator,
            configurable: true,
        });
        document.body.removeChild(script);
        jest.restoreAllMocks();
    });

    it('handles exception when navigator.serviceWorker.register throws synchronously', () => {
        window.__SW_FORCE_SW_HOSTNAME__ = 'example.com';
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        Object.defineProperty(navigator, 'serviceWorker', {
            value: {
                register: jest.fn(() => {
                    throw new Error('Synchronous error');
                }),
            },
            configurable: true,
        });

        const script = document.createElement('script');
        document.body.appendChild(script);
        jest.spyOn(document, 'currentScript', 'get').mockReturnValue(script);

        jest.isolateModules(() => {
            require('../../../js/ui/service_worker_register');
        });

        // Trigger load to run the listener
        window.dispatchEvent(new Event('load'));

        expect(consoleWarnSpy).toHaveBeenCalledWith(
            'Caught exception calling service worker register:',
            expect.any(Error)
        );

        consoleWarnSpy.mockRestore();
        document.body.removeChild(script);
    });

    it('handles exception when outer IIFE try/catch fires', () => {
        // window.__SW_FORCE_SW_HOSTNAME__ is retrieved inside `getHostname()`.
        // We can define it as an object with a toString that throws
        // to cause `typeof window.__SW_FORCE_SW_HOSTNAME__ === 'string'` check to be bypassed,
        // Wait, if it's bypassed, it uses window.location.hostname.
        // We can throw from window.__SW_FORCE_SW_HOSTNAME__ getter directly.
        const originalLocation = window.location;

        Object.defineProperty(window, '__SW_FORCE_SW_HOSTNAME__', {
            get: () => {
                throw new Error('Outer sync error');
            },
            configurable: true
        });

        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        jest.isolateModules(() => {
            require('../../../js/ui/service_worker_register');
        });

        expect(consoleWarnSpy).toHaveBeenCalledWith(
            'Caught exception initializing service worker:',
            expect.any(Error)
        );

        consoleWarnSpy.mockRestore();
        delete window.__SW_FORCE_SW_HOSTNAME__;
    });

    it('logs warning when update check fails', async () => {
        window.__SW_FORCE_SW_HOSTNAME__ = 'example.com';
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        let rejectUpdate;
        const updatePromise = new Promise((_, reject) => {
            rejectUpdate = reject;
        });

        const mockRegistration = {
            update: jest.fn(() => updatePromise)
        };

        Object.defineProperty(navigator, 'serviceWorker', {
            value: {
                register: jest.fn().mockResolvedValue(mockRegistration)
            },
            configurable: true,
        });

        const script = document.createElement('script');
        document.body.appendChild(script);
        jest.spyOn(document, 'currentScript', 'get').mockReturnValue(script);

        jest.isolateModules(() => {
            require('../../../js/ui/service_worker_register');
        });

        // Trigger load
        window.dispatchEvent(new Event('load'));

        // Wait a tick for register promise
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(mockRegistration.update).toHaveBeenCalled();

        // Reject the update
        rejectUpdate(new Error('Update failed'));

        // Wait a tick for catch
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Note: the catch for update() is empty in the implementation!
        // `registration.update().catch(function () {});`
        // So no console warn should happen for the update failure specifically.
        expect(consoleWarnSpy).not.toHaveBeenCalled();

        consoleWarnSpy.mockRestore();
        document.body.removeChild(script);
    });

    it('handles exception thrown inside the load event listener', () => {
        window.__SW_FORCE_SW_HOSTNAME__ = 'example.com';
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        // By removing register, calling navigator.serviceWorker.register will throw a TypeError inside the event listener
        Object.defineProperty(navigator, 'serviceWorker', {
            value: {},
            configurable: true,
        });

        const script = document.createElement('script');
        document.body.appendChild(script);
        jest.spyOn(document, 'currentScript', 'get').mockReturnValue(script);

        jest.isolateModules(() => {
            require('../../../js/ui/service_worker_register');
        });

        // Trigger load
        window.dispatchEvent(new Event('load'));

        expect(consoleWarnSpy).toHaveBeenCalledWith(
            'Caught exception calling service worker register:',
            expect.any(TypeError)
        );

        consoleWarnSpy.mockRestore();
        document.body.removeChild(script);
    });

    it('handles successful update when sw update is resolved', async () => {
        window.__SW_FORCE_SW_HOSTNAME__ = 'example.com';
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        let resolveUpdate;
        const updatePromise = new Promise((resolve) => {
            resolveUpdate = resolve;
        });

        const mockRegistration = {
            update: jest.fn(() => updatePromise)
        };

        Object.defineProperty(navigator, 'serviceWorker', {
            value: {
                register: jest.fn().mockResolvedValue(mockRegistration)
            },
            configurable: true,
        });

        const script = document.createElement('script');
        document.body.appendChild(script);
        jest.spyOn(document, 'currentScript', 'get').mockReturnValue(script);

        jest.isolateModules(() => {
            require('../../../js/ui/service_worker_register');
        });

        // Trigger load
        window.dispatchEvent(new Event('load'));

        // Wait a tick for register promise
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(mockRegistration.update).toHaveBeenCalled();

        // Resolve the update
        resolveUpdate();

        // Wait a tick for catch
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(consoleWarnSpy).not.toHaveBeenCalled();

        consoleWarnSpy.mockRestore();
        document.body.removeChild(script);
    });

    it('uses default path and scope when document.currentScript is null', async () => {
        window.__SW_FORCE_SW_HOSTNAME__ = 'example.com';

        const mockRegistration = {
            update: jest.fn(() => Promise.resolve())
        };

        const registerSpy = jest.fn().mockResolvedValue(mockRegistration);

        Object.defineProperty(navigator, 'serviceWorker', {
            value: {
                register: registerSpy
            },
            configurable: true,
        });

        // Mock currentScript as null
        jest.spyOn(document, 'currentScript', 'get').mockReturnValue(null);

        jest.isolateModules(() => {
            require('../../../js/ui/service_worker_register');
        });

        // Trigger load
        window.dispatchEvent(new Event('load'));

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(registerSpy).toHaveBeenCalledWith('./sw.js', {
            scope: './',
            updateViaCache: 'none'
        });
    });

    it('uses default path and scope when attributes are missing', async () => {
        window.__SW_FORCE_SW_HOSTNAME__ = 'example.com';

        const mockRegistration = {
            update: jest.fn(() => Promise.resolve())
        };

        const registerSpy = jest.fn().mockResolvedValue(mockRegistration);

        Object.defineProperty(navigator, 'serviceWorker', {
            value: {
                register: registerSpy
            },
            configurable: true,
        });

        const script = document.createElement('script');
        // Do not set attributes
        document.body.appendChild(script);
        jest.spyOn(document, 'currentScript', 'get').mockReturnValue(script);

        jest.isolateModules(() => {
            require('../../../js/ui/service_worker_register');
        });

        // Trigger load
        window.dispatchEvent(new Event('load'));

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(registerSpy).toHaveBeenCalledWith('./sw.js', {
            scope: './',
            updateViaCache: 'none'
        });

        document.body.removeChild(script);
    });

    it('uses window.location.hostname when window.__SW_FORCE_SW_HOSTNAME__ is not string', () => {
        window.__SW_FORCE_SW_HOSTNAME__ = 123; // Not a string

        // Default JSDOM window.location.hostname is usually 'localhost'
        // We don't need to defineProperty on it if it's already 'localhost'

        jest.spyOn(window, 'addEventListener');

        jest.isolateModules(() => {
            require('../../../js/ui/service_worker_register');
        });

        // Since it's 'localhost', it should return early and not add an event listener
        expect(window.addEventListener).not.toHaveBeenCalled();

        delete window.__SW_FORCE_SW_HOSTNAME__;
    });
});
