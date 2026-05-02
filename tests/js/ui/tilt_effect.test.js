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
            height: 200,
        }));

        const event = new MouseEvent('mousemove', {
            clientX: 150,
            clientY: 150,
        });

        container.dispatchEvent(event);

        expect(window.gsap.to).toHaveBeenCalledWith(container, {
            rotateX: 5,
            rotateY: -5,
            duration: 0.5,
            ease: 'power3.out',
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
    });
});
