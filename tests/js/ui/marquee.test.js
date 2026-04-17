import { initMarquee } from '@js/ui/marquee.js';
import { MARQUEE_CONFIG } from '@js/config.js';

describe('marquee.js', () => {
    let originalWindow;
    let container;

    beforeEach(() => {
        jest.useFakeTimers();
        originalWindow = global.window;

        // Mock gsap
        global.window.gsap = {
            to: jest.fn(),
            ticker: {
                add: jest.fn()
            },
            utils: {
                wrap: jest.fn()
            }
        };

        // Create DOM
        document.body.innerHTML = `
            <div class="quantum-widget">
                <div class="marquee-container marquee-right">
                    <div class="marquee-content">
                        <span>TEST</span>
                    </div>
                </div>
            </div>
        `;
        container = document.querySelector('.quantum-widget');
    });

    afterEach(() => {
        global.window = originalWindow;
        document.body.innerHTML = '';
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    test('initMarquee does nothing if window is undefined', () => {
        const tempWindow = global.window;
        delete global.window;
        initMarquee();
        expect(tempWindow.gsap.to).not.toHaveBeenCalled();
        global.window = tempWindow;
    });

    test('initMarquee does nothing if gsap is missing', () => {
        delete global.window.gsap;
        initMarquee();
    });

    test('initMarquee does nothing if MARQUEE_CONFIG is disabled', () => {
        const originalEnabled = MARQUEE_CONFIG.enabled;
        MARQUEE_CONFIG.enabled = false;
        initMarquee();
        expect(global.window.gsap.to).not.toHaveBeenCalled();
        MARQUEE_CONFIG.enabled = originalEnabled;
    });

    test('initMarquee does nothing on touch devices', () => {
        global.window.ontouchstart = null;
        initMarquee();
        expect(global.window.gsap.to).not.toHaveBeenCalled();
        delete global.window.ontouchstart;
    });

    test('initMarquee splits text into chars, sets up animation and gravity', () => {
        const originalEnabled = MARQUEE_CONFIG.enabled;
        MARQUEE_CONFIG.enabled = true;

        initMarquee();

        expect(global.window.gsap.to).toHaveBeenCalled();
        expect(global.window.gsap.ticker.add).toHaveBeenCalled();

        const wrapper = document.querySelector('.marquee-container');
        expect(wrapper.children.length).toBe(2); // original content + clone

        const firstContent = wrapper.children[0];
        const chars = firstContent.querySelectorAll('.mq-char');
        expect(chars.length).toBe(4); // T, E, S, T
        expect(chars[0].textContent).toBe('T');

        MARQUEE_CONFIG.enabled = originalEnabled;
    });

    test('initMarquee handles missing marquee-content gracefully', () => {
        const originalEnabled = MARQUEE_CONFIG.enabled;
        MARQUEE_CONFIG.enabled = true;

        const wrapper = document.querySelector('.marquee-container');
        wrapper.innerHTML = ''; // Remove content

        initMarquee();

        expect(global.window.gsap.to).not.toHaveBeenCalled();

        MARQUEE_CONFIG.enabled = originalEnabled;
    });

    test('initMarquee handles missing original span inside marquee-content gracefully', () => {
        const originalEnabled = MARQUEE_CONFIG.enabled;
        MARQUEE_CONFIG.enabled = true;

        const wrapper = document.querySelector('.marquee-container');
        wrapper.innerHTML = '<div class="marquee-content"></div>'; // Remove span

        initMarquee();

        // it shouldn't throw error
        expect(global.window.gsap.to).toHaveBeenCalled();

        MARQUEE_CONFIG.enabled = originalEnabled;
    });

    test('initMarquee handles sizeMultiplier and spaces correctly', () => {
        const originalEnabled = MARQUEE_CONFIG.enabled;
        MARQUEE_CONFIG.enabled = true;
        MARQUEE_CONFIG.sizeMultiplier = 2;

        document.body.innerHTML = `
            <div class="quantum-widget">
                <div class="marquee-container marquee-right">
                    <div class="marquee-content">
                        <span>A B</span>
                    </div>
                </div>
            </div>
        `;

        initMarquee();

        const wrapper = document.querySelector('.marquee-container');
        const firstContent = wrapper.children[0];
        expect(firstContent.style.fontSize).toBe('200%');

        const chars = firstContent.querySelectorAll('.mq-char');
        expect(chars.length).toBe(3); // A, space, B
        expect(chars[1].classList.contains('mq-space')).toBe(true);
        expect(chars[1].textContent).toBe('\u00A0');

        MARQUEE_CONFIG.enabled = originalEnabled;
        MARQUEE_CONFIG.sizeMultiplier = 1;
    });

    test('gravitational distortion ticker sets properties correctly', () => {
        const originalEnabled = MARQUEE_CONFIG.enabled;
        MARQUEE_CONFIG.enabled = true;

        initMarquee();

        expect(global.window.gsap.ticker.add).toHaveBeenCalled();

        // Get the added ticker callback
        const tickerCallback = global.window.gsap.ticker.add.mock.calls[0][0];

        // Mock getBoundingClientRect for widget and spans
        const widget = document.querySelector('.quantum-widget');
        widget.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 });

        const chars = document.querySelectorAll('.mq-char');
        // Let's mock the first char to be inside the influence radius
        // Center of widget is (500, 500)
        chars[0].getBoundingClientRect = () => ({ left: 450, top: 450, width: 10, height: 10 });

        // Second char outside radius
        chars[1].getBoundingClientRect = () => ({ left: 10, top: 10, width: 10, height: 10 });
        chars[1].style.transform = 'some-transform';

        tickerCallback();

        // Check if transform was set on the first char
        expect(chars[0].style.transform).toContain('translate(');
        expect(chars[0].style.marginLeft).toContain('em');

        // Check if transform was removed on the second char
        expect(chars[1].style.transform).toBe('');

        MARQUEE_CONFIG.enabled = originalEnabled;
    });

    test('gravitational distortion ticker early return if widget width is 0', () => {
        const originalEnabled = MARQUEE_CONFIG.enabled;
        MARQUEE_CONFIG.enabled = true;

        initMarquee();

        const tickerCallback = global.window.gsap.ticker.add.mock.calls[0][0];

        const widget = document.querySelector('.quantum-widget');
        widget.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 });

        // It shouldn't crash
        tickerCallback();

        MARQUEE_CONFIG.enabled = originalEnabled;
    });

    test('handles marquee-left direction configuration correctly', () => {
        const originalEnabled = MARQUEE_CONFIG.enabled;
        MARQUEE_CONFIG.enabled = true;
        MARQUEE_CONFIG.direction = -1;

        document.body.innerHTML = `
            <div class="quantum-widget">
                <div class="marquee-container">
                    <div class="marquee-content">
                        <span>TEST</span>
                    </div>
                </div>
            </div>
        `;

        initMarquee();

        expect(global.window.gsap.to).toHaveBeenCalled();
        const callArgs = global.window.gsap.to.mock.calls[0][1];
        expect(callArgs.xPercent).toBe(-100);

        MARQUEE_CONFIG.enabled = originalEnabled;
    });

    test('initMarquee runs immediately if document is not loading', () => {
        const originalReadyState = Object.getOwnPropertyDescriptor(Document.prototype, 'readyState');
        Object.defineProperty(Document.prototype, 'readyState', { get: () => 'complete', configurable: true });

        const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

        jest.isolateModules(() => {
            const { initMarquee } = require('@js/ui/marquee.js');
            initMarquee();
        });

        expect(addEventListenerSpy).not.toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function));

        if (originalReadyState) {
            Object.defineProperty(Document.prototype, 'readyState', originalReadyState);
        } else {
            delete Document.prototype.readyState;
        }
        addEventListenerSpy.mockRestore();
    });

    test('gravitational distortion ticker computes force appropriately when moving right', () => {
        const originalEnabled = MARQUEE_CONFIG.enabled;
        MARQUEE_CONFIG.enabled = true;

        // Direction config is -1 (default in config.js).
        // No marquee-right class -> elementDirection is -1.
        // direction = configDirection * elementDirection = (-1) * (-1) = 1 (moving left).
        // Let's make it moving right, we want direction < 0.
        // MARQUEE_CONFIG.direction = 1 (right-to-left config direction)
        // elementDirection = -1
        // direction = 1 * -1 = -1 (moving right)
        MARQUEE_CONFIG.direction = 1;
        document.body.innerHTML = `
            <div class="quantum-widget">
                <div class="marquee-container">
                    <div class="marquee-content">
                        <span>T</span>
                    </div>
                </div>
            </div>
        `;
        initMarquee();

        const tickerCallback = global.window.gsap.ticker.add.mock.calls[0][0];

        const widget = document.querySelector('.quantum-widget');
        widget.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 }); // Center: 500, 500

        const chars = document.querySelectorAll('.mq-char');

        chars[0].getBoundingClientRect = () => ({ left: 400, top: 450, width: 10, height: 10 });

        tickerCallback();

        expect(chars[0].style.transform).toContain('translate(');

        MARQUEE_CONFIG.enabled = originalEnabled;
    });

    test('gravitational distortion ticker computes force appropriately when moving left and dx < 0', () => {
        const originalEnabled = MARQUEE_CONFIG.enabled;
        MARQUEE_CONFIG.enabled = true;

        // MARQUEE_CONFIG.direction = -1 (default config)
        // class has marquee-right -> elementDirection = 1
        // direction = -1 * 1 = -1 (Wait, -1 is moving right. We want moving left: direction > 0)
        // So MARQUEE_CONFIG.direction = 1
        MARQUEE_CONFIG.direction = 1;

        document.body.innerHTML = `
            <div class="quantum-widget">
                <div class="marquee-container marquee-right">
                    <div class="marquee-content">
                        <span>T</span>
                    </div>
                </div>
            </div>
        `;
        initMarquee();

        const tickerCallback = global.window.gsap.ticker.add.mock.calls[0][0];
        const widget = document.querySelector('.quantum-widget');
        widget.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 }); // Center: 500, 500

        const chars = document.querySelectorAll('.mq-char');
        chars[0].getBoundingClientRect = () => ({ left: 600, top: 450, width: 10, height: 10 }); // dx = 500 - 605 = -105 < 0

        tickerCallback();

        expect(chars[0].style.transform).toContain('translate(');

        MARQUEE_CONFIG.enabled = originalEnabled;
    });
});
