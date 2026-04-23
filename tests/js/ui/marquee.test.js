import { initMarquee } from '../../../js/ui/marquee.js';
import { MARQUEE_CONFIG } from '../../../js/config.js';

jest.mock('../../../js/config.js', () => ({
    MARQUEE_CONFIG: {
        enabled: true,
        direction: 1,
        animationDuration: 20,
        sizeMultiplier: 1,
    },
}));

describe('Marquee', () => {
    let originalGsap;
    let originalWindowOntouchstart;
    let originalNavigatorMaxTouchPoints;

    beforeEach(() => {
        document.body.innerHTML = '';
        originalGsap = window.gsap;
        originalWindowOntouchstart = window.ontouchstart;
        originalNavigatorMaxTouchPoints = navigator.maxTouchPoints;

        window.gsap = {
            to: jest.fn(),
            utils: {
                wrap: jest.fn(),
            },
            ticker: {
                add: jest.fn(),
            },
        };
        delete window.ontouchstart;
        Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
    });

    afterEach(() => {
        window.gsap = originalGsap;
        if (originalWindowOntouchstart !== undefined) {
            window.ontouchstart = originalWindowOntouchstart;
        } else {
            delete window.ontouchstart;
        }
        Object.defineProperty(navigator, 'maxTouchPoints', {
            value: originalNavigatorMaxTouchPoints,
            configurable: true,
        });
        jest.clearAllMocks();
    });

    it('should do nothing if gsaps is not defined', () => {
        delete window.gsap;
        initMarquee();
        expect(document.querySelectorAll('.marquee-container').length).toBe(0); // Nothing changed
    });

    it('should do nothing if touch device', () => {
        window.ontouchstart = true;
        initMarquee();
        expect(window.gsap.to).not.toHaveBeenCalled();
    });

    it('should do nothing if MARQUEE_CONFIG is not enabled', () => {
        MARQUEE_CONFIG.enabled = false;
        initMarquee();
        expect(window.gsap.to).not.toHaveBeenCalled();
        MARQUEE_CONFIG.enabled = true;
    });

    it('should initialize marquee without widget', () => {
        document.body.innerHTML = `
            <div class="marquee-container marquee-right">
                <div class="marquee-content">
                    <span>Test</span>
                </div>
            </div>
        `;
        initMarquee();
        expect(window.gsap.to).toHaveBeenCalled();
        const wrapper = document.querySelector('.marquee-container');
        expect(wrapper.children.length).toBe(2); // Cloned content
    });

    it('should handle undefined config options', () => {
        const oldSize = MARQUEE_CONFIG.sizeMultiplier;
        const oldDir = MARQUEE_CONFIG.direction;
        const oldDur = MARQUEE_CONFIG.animationDuration;

        MARQUEE_CONFIG.sizeMultiplier = undefined;
        MARQUEE_CONFIG.direction = undefined;
        MARQUEE_CONFIG.animationDuration = undefined;

        // Force reading from updated MARQUEE_CONFIG config by triggering inside isolateModules
        let marqueeModule;
        jest.isolateModules(() => {
            require('../../../js/config.js').MARQUEE_CONFIG.sizeMultiplier = undefined;
            require('../../../js/config.js').MARQUEE_CONFIG.direction = undefined;
            require('../../../js/config.js').MARQUEE_CONFIG.animationDuration = undefined;

            global.window = {
                gsap: {
                    to: jest.fn(),
                    utils: { wrap: jest.fn() },
                    ticker: { add: jest.fn() },
                },
            };

            marqueeModule = require('../../../js/ui/marquee.js');
        });

        document.body.innerHTML = `
            <div class="marquee-container marquee-right">
                <div class="marquee-content">
                    <span>Test</span>
                </div>
            </div>
        `;

        marqueeModule.initMarquee();

        expect(global.window.gsap.to).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                duration: 20,
            })
        );

        MARQUEE_CONFIG.sizeMultiplier = oldSize;
        MARQUEE_CONFIG.direction = oldDir;
        MARQUEE_CONFIG.animationDuration = oldDur;
    });

    it('should split into chars and init gravity with widget', () => {
        document.body.innerHTML = `
            <div class="quantum-widget" style="width: 100px; height: 100px;"></div>
            <div class="marquee-container marquee-right">
                <div class="marquee-content">
                    <span>A B</span>
                </div>
            </div>
            <div class="marquee-container">
                <div class="marquee-content">
                    <span>C D</span>
                </div>
            </div>
        `;

        // Mock getBoundingClientRect
        Element.prototype.getBoundingClientRect = jest.fn(() => ({
            width: 100,
            height: 100,
            top: 0,
            left: 0,
            bottom: 100,
            right: 100,
        }));

        initMarquee();
        expect(window.gsap.ticker.add).toHaveBeenCalled();

        // trigger ticker
        const tickerCallback = window.gsap.ticker.add.mock.calls[0][0];
        tickerCallback();
    });

    it('should handle multiplier', () => {
        MARQUEE_CONFIG.sizeMultiplier = 1.5;
        document.body.innerHTML = `
            <div class="marquee-container">
                <div class="marquee-content">
                    <span>Test</span>
                </div>
            </div>
        `;
        initMarquee();
        const content = document.querySelector('.marquee-content');
        expect(content.style.fontSize).toBe('150%');
        MARQUEE_CONFIG.sizeMultiplier = 1;
    });

    it('should trigger gravity loop with zero width widget', () => {
        document.body.innerHTML = `
            <div class="quantum-widget" style="width: 0px; height: 0px;"></div>
            <div class="marquee-container">
                <div class="marquee-content">
                    <span>A B</span>
                </div>
            </div>
        `;

        Element.prototype.getBoundingClientRect = jest.fn(() => ({
            width: 0,
            height: 0,
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
        }));

        initMarquee();
        expect(window.gsap.ticker.add).toHaveBeenCalled();

        const tickerCallback = window.gsap.ticker.add.mock.calls[0][0];
        tickerCallback();
    });

    it('should skip chars that are far away from widget', () => {
        document.body.innerHTML = `
            <div class="quantum-widget" style="width: 10px; height: 10px;"></div>
            <div class="marquee-container">
                <div class="marquee-content">
                    <span>A</span>
                </div>
            </div>
        `;

        let callCount = 0;
        Element.prototype.getBoundingClientRect = jest.fn(() => {
            callCount++;
            if (callCount === 1) {
                // widget
                return { width: 10, height: 10, top: 0, left: 0 };
            }
            // span
            return { width: 10, height: 10, top: 1000, left: 1000 };
        });

        initMarquee();
        const tickerCallback = window.gsap.ticker.add.mock.calls[0][0];
        tickerCallback();

        const span = document.querySelector('.mq-char');
        // Setting style first to see if it clears
        span.style.transform = 'scale(2)';
        span.style.marginLeft = '10px';
        span.style.marginRight = '10px';

        // Reset call count for the next ticker tick
        callCount = 0;
        tickerCallback();

        expect(span.style.transform).toBe('');
        expect(span.style.marginLeft).toBe('');
        expect(span.style.marginRight).toBe('');
    });
});

describe('Marquee Initialization', () => {
    it('should bind DOMContentLoaded if readyState is loading', () => {
        Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
        document.addEventListener = jest.fn();

        // We have to re-evaluate the script to test the top-level if statement
        jest.isolateModules(() => {
            // Setup global inside isolated module
            global.window = {
                gsap: {
                    to: jest.fn(),
                    utils: { wrap: jest.fn() },
                    ticker: { add: jest.fn() },
                },
            };
            require('../../../js/ui/marquee.js');
        });

        expect(document.addEventListener).toHaveBeenCalledWith(
            'DOMContentLoaded',
            expect.any(Function)
        );
    });
});

describe('Marquee Gravity Edge Cases', () => {
    it('should revert transform when distance is < 1', () => {
        let callback;
        document.body.innerHTML = `
            <div class="quantum-widget" style="width: 10px; height: 10px;"></div>
            <div class="marquee-container">
                <div class="marquee-content">
                    <span>A</span>
                </div>
            </div>
        `;

        let callCount = 0;
        Element.prototype.getBoundingClientRect = jest.fn(() => {
            callCount++;
            if (callCount === 1) {
                // widget
                return { width: 10, height: 10, top: 0, left: 0 };
            }
            // span
            // Set span right exactly in the center to make distance < 1
            return { width: 10, height: 10, top: 0, left: 0 };
        });

        const winGsap = {
            to: jest.fn(),
            utils: { wrap: jest.fn() },
            ticker: {
                add: jest.fn((cb) => {
                    callback = cb;
                }),
            },
        };
        Object.defineProperty(window, 'gsap', { value: winGsap, configurable: true });

        // Let's rely on the mock config at the top.
        // Wait, why was `callback` not defined? `gsap.ticker.add` must not have been called!
        // Why? Because initMarquee probably saw `isTouchDevice` or `!MARQUEE_CONFIG.enabled`.
        // Let's reset the touch checks.
        Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
        delete window.ontouchstart;
        MARQUEE_CONFIG.enabled = true;

        let marqueeModule;
        jest.isolateModules(() => {
            marqueeModule = require('../../../js/ui/marquee.js');
        });

        marqueeModule.initMarquee();
        callback();

        const span = document.querySelector('.mq-char');
        // Setting style first to see if it clears
        span.style.transform = 'scale(2)';
        span.style.marginLeft = '10px';
        span.style.marginRight = '10px';

        // Reset call count for the next ticker tick
        callCount = 0;
        callback();

        expect(span.style.transform).toBe('');
        expect(span.style.marginLeft).toBe('');
        expect(span.style.marginRight).toBe('');
    });
});

describe('Marquee Edge Cases', () => {
    it('should ignore wrapper if .marquee-content is missing', () => {
        document.body.innerHTML = `
            <div class="marquee-container">
            </div>
        `;

        const winGsap = {
            to: jest.fn(),
            utils: { wrap: jest.fn() },
            ticker: { add: jest.fn() },
        };
        Object.defineProperty(window, 'gsap', { value: winGsap, configurable: true });

        let marqueeModule;
        jest.isolateModules(() => {
            require('../../../js/config.js').MARQUEE_CONFIG.enabled = true;
            marqueeModule = require('../../../js/ui/marquee.js');
        });

        marqueeModule.initMarquee();
        expect(document.querySelector('.marquee-container').children.length).toBe(0);
    });

    it('should skip splitIntoChars if span is missing', () => {
        document.body.innerHTML = `
            <div class="quantum-widget" style="width: 10px; height: 10px;"></div>
            <div class="marquee-container">
                <div class="marquee-content">
                </div>
            </div>
        `;

        const winGsap = {
            to: jest.fn(),
            utils: { wrap: jest.fn() },
            ticker: { add: jest.fn() },
        };
        Object.defineProperty(window, 'gsap', { value: winGsap, configurable: true });

        let marqueeModule;
        jest.isolateModules(() => {
            require('../../../js/config.js').MARQUEE_CONFIG.enabled = true;
            marqueeModule = require('../../../js/ui/marquee.js');
        });

        marqueeModule.initMarquee();
        expect(document.querySelectorAll('.mq-char').length).toBe(0);
    });

    it('should apply gravity transforms when chars approach the widget', () => {
        let callback;
        const winGsap = {
            to: jest.fn(),
            utils: { wrap: jest.fn() },
            ticker: {
                add: jest.fn((cb) => {
                    callback = cb;
                }),
            },
        };
        Object.defineProperty(window, 'gsap', { value: winGsap, configurable: true });

        document.body.innerHTML = `
            <div class="quantum-widget" style="width: 10px; height: 10px;"></div>
            <div class="marquee-container marquee-right">
                <div class="marquee-content">
                    <span>A</span>
                </div>
            </div>
        `;

        let callCount = 0;
        Element.prototype.getBoundingClientRect = jest.fn(() => {
            callCount++;
            if (callCount === 1) {
                // widget at 0,0
                return { width: 10, height: 10, top: 0, left: 0 };
            }
            // span approaching
            return { width: 10, height: 10, top: 0, left: -50 }; // distance < influenceRadius (350), direction > 0 and dx < 0
        });

        let marqueeModule;
        jest.isolateModules(() => {
            require('../../../js/config.js').MARQUEE_CONFIG.enabled = true;
            marqueeModule = require('../../../js/ui/marquee.js');
        });

        marqueeModule.initMarquee();
        callback();

        const span = document.querySelector('.mq-char');
        expect(span.style.transform).not.toBe('');
        expect(span.style.marginLeft).not.toBe('');
    });

    it('should apply gravity transforms with reverse direction', () => {
        let callback;
        const winGsap = {
            to: jest.fn(),
            utils: { wrap: jest.fn() },
            ticker: {
                add: jest.fn((cb) => {
                    callback = cb;
                }),
            },
        };
        Object.defineProperty(window, 'gsap', { value: winGsap, configurable: true });

        document.body.innerHTML = `
            <div class="quantum-widget" style="width: 10px; height: 10px;"></div>
            <div class="marquee-container"> <!-- NOT marquee-right, so direction is -1 -->
                <div class="marquee-content">
                    <span>A</span>
                </div>
            </div>
        `;

        let callCount = 0;
        Element.prototype.getBoundingClientRect = jest.fn(() => {
            callCount++;
            if (callCount === 1) {
                // widget at 0,0
                return { width: 10, height: 10, top: 0, left: 0 };
            }
            // span receding
            return { width: 10, height: 10, top: 0, left: 50 }; // distance < influenceRadius (350), direction < 0 and dx < 0
        });

        let marqueeModule;
        jest.isolateModules(() => {
            require('../../../js/config.js').MARQUEE_CONFIG.enabled = true;
            marqueeModule = require('../../../js/ui/marquee.js');
        });

        marqueeModule.initMarquee();
        callback();

        const span = document.querySelector('.mq-char');
        expect(span.style.transform).not.toBe('');
        expect(span.style.marginLeft).not.toBe('');
    });

    it('should apply gravity transforms when chars recede from the widget', () => {
        let callback;
        const winGsap = {
            to: jest.fn(),
            utils: { wrap: jest.fn() },
            ticker: {
                add: jest.fn((cb) => {
                    callback = cb;
                }),
            },
        };
        Object.defineProperty(window, 'gsap', { value: winGsap, configurable: true });

        document.body.innerHTML = `
            <div class="quantum-widget" style="width: 10px; height: 10px;"></div>
            <div class="marquee-container marquee-right">
                <div class="marquee-content">
                    <span>A</span>
                </div>
            </div>
        `;

        let callCount = 0;
        Element.prototype.getBoundingClientRect = jest.fn(() => {
            callCount++;
            if (callCount === 1) {
                // widget at 0,0
                return { width: 10, height: 10, top: 0, left: 0 };
            }
            // span receding
            return { width: 10, height: 10, top: 0, left: 50 }; // distance < influenceRadius (350), direction > 0 and dx > 0
        });

        let marqueeModule;
        jest.isolateModules(() => {
            require('../../../js/config.js').MARQUEE_CONFIG.enabled = true;
            marqueeModule = require('../../../js/ui/marquee.js');
        });

        marqueeModule.initMarquee();
        callback();

        const span = document.querySelector('.mq-char');
        expect(span.style.transform).not.toBe('');
        expect(span.style.marginLeft).not.toBe('');
    });
});
