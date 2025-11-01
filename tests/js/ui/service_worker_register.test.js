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
                register: jest.fn().mockResolvedValue(undefined),
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
        });
    });

    test('falls back to defaults when attributes missing', () => {
        triggerLoadImmediately();
        withCurrentScript({}, () => {
            loadScript();
        });

        expect(window.navigator.serviceWorker.register).toHaveBeenCalledWith('./sw.js', {
            scope: './',
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

    test('ignores errors thrown outside registration', () => {
        triggerLoadImmediately();
        withCurrentScript({}, () => {
            expect(() => {
                jest.isolateModules(() => {
                    const original = window.addEventListener;
                    window.addEventListener = () => {
                        throw new Error('listener failure');
                    };
                    require(SCRIPT_PATH);
                    window.addEventListener = original;
                });
            }).not.toThrow();
        });
    });
});
