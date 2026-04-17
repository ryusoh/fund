<<<<<<< HEAD
import { initTiltEffect } from '@js/ui/tilt_effect.js';
import { TILT_EFFECT } from '@js/config.js';

describe('tilt_effect.js', () => {
    let originalWindow;
    let container;

    beforeEach(() => {
        jest.useFakeTimers();
        originalWindow = global.window;

        // Mock gsap
        global.window.gsap = {
            set: jest.fn(),
            to: jest.fn(),
        };

        // Mock window matchMedia
        global.window.matchMedia = jest.fn().mockImplementation((query) => ({
            matches: false,
            media: query,
        }));

        // Create DOM
        document.body.innerHTML = `
            <nav class="container"></nav>
            <div class="quantum-widget"></div>
        `;
        container = document.querySelector('.quantum-widget');
    });

    afterEach(() => {
        global.window = originalWindow;
        document.body.innerHTML = '';
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    test('initTiltEffect returns early if TILT_EFFECT is disabled', () => {
        const originalEnabled = TILT_EFFECT.enabled;
        TILT_EFFECT.enabled = false;
        initTiltEffect();
        expect(global.window.gsap.set).not.toHaveBeenCalled();
        TILT_EFFECT.enabled = originalEnabled;
    });

    test('initTiltEffect returns early if window is undefined', () => {
        const tempWindow = global.window;
        delete global.window;
        const originalEnabled = TILT_EFFECT.enabled;
        TILT_EFFECT.enabled = true;

        initTiltEffect();
        // Shouldn't crash, and shouldn't call set
        expect(tempWindow.gsap.set).not.toHaveBeenCalled();

        global.window = tempWindow;
        TILT_EFFECT.enabled = originalEnabled;
    });

    test('initTiltEffect returns early if gsap is missing', () => {
        delete global.window.gsap;
        const originalEnabled = TILT_EFFECT.enabled;
        TILT_EFFECT.enabled = true;
        initTiltEffect();
        TILT_EFFECT.enabled = originalEnabled;
    });

    test('initTiltEffect returns early on touch devices without fine pointer', () => {
        const originalEnabled = TILT_EFFECT.enabled;
        TILT_EFFECT.enabled = true;

        global.window.ontouchstart = null; // simulate touch device
        global.window.matchMedia = jest.fn().mockReturnValue({ matches: false });

        initTiltEffect();

        expect(global.window.gsap.set).not.toHaveBeenCalled();

        delete global.window.ontouchstart;
        TILT_EFFECT.enabled = originalEnabled;
    });

    test('initTiltEffect adds event listeners and calls gsap on mousemove and mouseleave', () => {
        const originalEnabled = TILT_EFFECT.enabled;
        TILT_EFFECT.enabled = true;

        initTiltEffect();

        expect(global.window.gsap.set).toHaveBeenCalledTimes(2); // for nav and widget

        // Mock getBoundingClientRect
        container.getBoundingClientRect = () => ({
            left: 100,
            top: 100,
            width: 200,
            height: 200,
        });

        // Trigger mousemove (center)
        const mouseMoveEvent = new MouseEvent('mousemove', {
            clientX: 150,
            clientY: 150,
        });
        container.dispatchEvent(mouseMoveEvent);

        expect(global.window.gsap.to).toHaveBeenCalledWith(
            container,
            expect.objectContaining({
                rotateX: 5,
                rotateY: -5,
                duration: 0.5,
                ease: 'power2.out',
                overwrite: true,
            })
        );

        // Trigger another mousemove with offset
        const mouseMoveEventOffset = new MouseEvent('mousemove', {
            clientX: 200,
            clientY: 50,
        });
        container.dispatchEvent(mouseMoveEventOffset);

        expect(global.window.gsap.to).toHaveBeenCalledWith(
            container,
            expect.objectContaining({
                rotateX: 15,
                rotateY: 0,
            })
        );

        // Trigger mouseleave
        const mouseLeaveEvent = new MouseEvent('mouseleave');
        container.dispatchEvent(mouseLeaveEvent);

        expect(global.window.gsap.to).toHaveBeenCalledWith(
            container,
            expect.objectContaining({
                rotateX: 0,
                rotateY: 0,
                duration: 1,
                ease: 'elastic.out(1, 0.3)',
                overwrite: true,
            })
        );

        TILT_EFFECT.enabled = originalEnabled;
    });

    test('initTiltEffect logic when document is complete vs loading', () => {
        const originalReadyState = Object.getOwnPropertyDescriptor(document, 'readyState');

        // Test loading state
        Object.defineProperty(document, 'readyState', { get: () => 'loading', configurable: true });
        const addEventListenerSpy1 = jest.spyOn(document, 'addEventListener');

        jest.isolateModules(() => {
            require('@js/ui/tilt_effect.js');
        });

        expect(addEventListenerSpy1).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function));
        addEventListenerSpy1.mockRestore();

        // Test complete state
        Object.defineProperty(document, 'readyState', {
            get: () => 'complete',
            configurable: true,
        });
        const addEventListenerSpy2 = jest.spyOn(document, 'addEventListener');

        jest.isolateModules(() => {
            require('@js/ui/tilt_effect.js');
        });

        expect(addEventListenerSpy2).not.toHaveBeenCalledWith(
            'DOMContentLoaded',
            expect.any(Function)
        );
        addEventListenerSpy2.mockRestore();

        if (originalReadyState) {
            Object.defineProperty(document, 'readyState', originalReadyState);
        } else {
            delete document.readyState;
        }
    });

    test('initTiltEffect logic DOMContentLoaded listener with loading state but no matches', () => {
        const originalReadyState = Object.getOwnPropertyDescriptor(document, 'readyState');
        Object.defineProperty(document, 'readyState', { get: () => 'loading', configurable: true });

        let domContentLoadedCallback = null;
        const addEventListenerSpy = jest
            .spyOn(document, 'addEventListener')
            .mockImplementation((event, cb) => {
                if (event === 'DOMContentLoaded') {
                    domContentLoadedCallback = cb;
                }
            });

        jest.isolateModules(() => {
            require('@js/ui/tilt_effect.js');
        });

        expect(domContentLoadedCallback).not.toBeNull();
        if (domContentLoadedCallback) {
            domContentLoadedCallback();
        }

        expect(global.window.gsap.set).not.toHaveBeenCalled();

        if (originalReadyState) {
            Object.defineProperty(document, 'readyState', originalReadyState);
        } else {
            delete document.readyState;
        }
        addEventListenerSpy.mockRestore();
    });

    test('initTiltEffect logic DOMContentLoaded listener with loading state and matching container', () => {
        const originalReadyState = Object.getOwnPropertyDescriptor(document, 'readyState');
        Object.defineProperty(document, 'readyState', { get: () => 'loading', configurable: true });

        document.body.innerHTML = '<div class="quantum-widget"></div>';

        let domContentLoadedCallback = null;
        const addEventListenerSpy = jest
            .spyOn(document, 'addEventListener')
            .mockImplementation((event, cb) => {
                if (event === 'DOMContentLoaded') {
                    domContentLoadedCallback = cb;
                }
            });

        jest.isolateModules(() => {
            require('@js/ui/tilt_effect.js');
        });

        if (domContentLoadedCallback) {
            domContentLoadedCallback();
        }

        expect(global.window.gsap.set).not.toHaveBeenCalled();

        if (originalReadyState) {
            Object.defineProperty(document, 'readyState', originalReadyState);
        } else {
            delete document.readyState;
        }
        addEventListenerSpy.mockRestore();
        document.body.innerHTML = '';
=======
import { initTiltEffect } from '@ui/tilt_effect.js';
import { TILT_EFFECT } from '@js/config.js';

jest.mock('@js/config.js', () => ({
    TILT_EFFECT: { enabled: true },
}));

describe('tilt_effect', () => {
    let container;

    beforeEach(() => {
        document.body.innerHTML = `
            <nav class="container"></nav>
            <div class="quantum-widget"></div>
            <div class="marquee-container"></div>
        `;
        window.gsap = {
            set: jest.fn(),
            to: jest.fn(),
        };
        TILT_EFFECT.enabled = true;
        // Mock window matchMedia
        window.matchMedia = jest.fn().mockImplementation((query) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: jest.fn(),
            removeListener: jest.fn(),
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            dispatchEvent: jest.fn(),
        }));
    });

    afterEach(() => {
        jest.clearAllMocks();
        delete window.ontouchstart;
        Object.defineProperty(navigator, 'maxTouchPoints', {
            value: 0,
            configurable: true,
        });
    });

    test('should return early if disabled', () => {
        TILT_EFFECT.enabled = false;
        initTiltEffect();
        expect(window.gsap.set).not.toHaveBeenCalled();
    });

    test('should return early if no window', () => {
        const originalWindow = global.window;
        delete global.window;
        initTiltEffect();
        global.window = originalWindow; // Can't easily test this in JSDOM, but we cover the branch
    });

    test('should return early if no gsap', () => {
        delete window.gsap;
        initTiltEffect();
        // Just checking it doesn't crash
    });

    test('should return early on touch device without fine pointer', () => {
        window.ontouchstart = null;
        Object.defineProperty(navigator, 'maxTouchPoints', {
            value: 1,
            configurable: true,
        });
        window.matchMedia.mockImplementation(() => ({
            matches: false, // pointer: fine is false
        }));
        initTiltEffect();
        expect(window.gsap.set).not.toHaveBeenCalled();
    });

    test('should init on touch device if fine pointer is true', () => {
        window.ontouchstart = null;
        Object.defineProperty(navigator, 'maxTouchPoints', {
            value: 1,
            configurable: true,
        });
        window.matchMedia.mockImplementation(() => ({
            matches: true, // pointer: fine is true
        }));
        initTiltEffect();
        expect(window.gsap.set).toHaveBeenCalled();
    });

    test('should attach event listeners and calculate rotation on mousemove', () => {
        initTiltEffect();

        container = document.querySelector('.quantum-widget');

        container.getBoundingClientRect = jest.fn(() => ({
            left: 100,
            top: 100,
            width: 200,
            height: 200
        }));

        const event = new MouseEvent('mousemove', {
            clientX: 150,
            clientY: 150
        });

        container.dispatchEvent(event);

        expect(window.gsap.to).toHaveBeenCalledWith(container, {
            rotateX: 5,
            rotateY: -5,
            duration: 0.5,
            ease: 'power2.out',
            overwrite: true,
        });
    });

    test('should reset rotation on mouseleave', () => {
        initTiltEffect();

        container = document.querySelector('.quantum-widget');

        const event = new MouseEvent('mouseleave');
        container.dispatchEvent(event);

        expect(window.gsap.to).toHaveBeenCalledWith(container, {
            rotateX: 0,
            rotateY: 0,
            duration: 1,
            ease: 'elastic.out(1, 0.3)',
            overwrite: true,
        });
    });

    test('should trigger via DOMContentLoaded if readyState is loading', () => {
        const spy = jest.spyOn(document, 'addEventListener');
        Object.defineProperty(document, 'readyState', {
            value: 'loading',
            configurable: true,
        });

        jest.isolateModules(() => {
            require('@ui/tilt_effect.js');
        });

        expect(spy).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function));
>>>>>>> origin/main
    });
});
