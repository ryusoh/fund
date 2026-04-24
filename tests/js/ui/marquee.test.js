import { initMarquee } from '@ui/marquee.js';
import { MARQUEE_CONFIG } from '@js/config.js';

describe('Marquee', () => {
    let originalGsap;
    let originalTouch;

    beforeEach(() => {
        originalGsap = window.gsap;
        window.gsap = {
            to: jest.fn(),
            utils: { wrap: jest.fn() },
            ticker: { add: jest.fn() },
        };
        originalTouch = window.ontouchstart;
        delete window.ontouchstart;
        MARQUEE_CONFIG.enabled = true;

        document.body.innerHTML = `
            <div class="quantum-widget" style="width: 100px; height: 100px;"></div>
            <div class="marquee-container">
                <div class="marquee-content"><span>Test</span></div>
            </div>
            <div class="marquee-container marquee-right">
                <div class="marquee-content"><span>Test2</span></div>
            </div>
        `;
    });

    afterEach(() => {
        window.gsap = originalGsap;
        if (originalTouch !== undefined) {
            window.ontouchstart = originalTouch;
        }
        document.body.innerHTML = '';
        jest.restoreAllMocks();
    });

    it('should initialize correctly when conditions are met', () => {
        initMarquee();
        expect(window.gsap.to).toHaveBeenCalledTimes(2);
    });

    it('should not initialize if gsap is missing', () => {
        delete window.gsap;
        initMarquee();
        expect(document.querySelector('.mq-char')).toBeNull();
    });

    it('should not initialize if disabled in config', () => {
        MARQUEE_CONFIG.enabled = false;
        initMarquee();
        expect(window.gsap.to).not.toHaveBeenCalled();
    });

    it('should not initialize on touch devices', () => {
        window.ontouchstart = null; // simulate touch device
        initMarquee();
        expect(window.gsap.to).not.toHaveBeenCalled();
    });

    it('should calculate transforms in ticker correctly', () => {
        initMarquee();
        expect(window.gsap.ticker.add).toHaveBeenCalled();
        const tickerFn = window.gsap.ticker.add.mock.calls[0][0];

        // Mock getBoundingClientRect
        const widget = document.querySelector('.quantum-widget');
        widget.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });

        const chars = document.querySelectorAll('.mq-char');
        chars.forEach((char) => {
            char.getBoundingClientRect = () => ({ left: 50, top: 50, width: 10, height: 10 });
            char.style.transform = 'test'; // set an initial transform
        });

        chars.forEach((char) => {
            char.getBoundingClientRect = () => ({ left: 1000, top: 1000, width: 10, height: 10 });
        });

        tickerFn();

        // Now it should be reset
        chars.forEach((char) => {
            expect(char.style.transform).toBe('');
        });
    });

    it('should handle zero width widget', () => {
        initMarquee();
        const tickerFn = window.gsap.ticker.add.mock.calls[0][0];

        const widget = document.querySelector('.quantum-widget');
        widget.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 100 });

        const chars = document.querySelectorAll('.mq-char');
        chars.forEach((char) => {
            char.style.transform = 'should-not-change';
        });

        tickerFn();

        chars.forEach((char) => {
            expect(char.style.transform).toBe('should-not-change');
        });
    });
});
