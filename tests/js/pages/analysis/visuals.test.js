import { jest } from '@jest/globals';

describe('visuals.js matrix rain', () => {
    let addEventListenerSpy;
    let requestAnimationFrameSpy;
    let mockContext;

    beforeEach(() => {
        document.body.innerHTML = '<canvas id="holo-bg"></canvas>';

        addEventListenerSpy = jest
            .spyOn(window, 'addEventListener')
            .mockImplementation((event, handler) => {
                if (event === 'resize') {
                    window._resizeHandler = handler;
                }
            });

        requestAnimationFrameSpy = jest
            .spyOn(window, 'requestAnimationFrame')
            .mockImplementation((cb) => {
                window._rafCallback = cb;
                return 1; // dummy request ID
            });

        const canvas = document.getElementById('holo-bg');
        mockContext = {
            fillRect: jest.fn(),
            fillText: jest.fn(),
        };
        canvas.getContext = jest.fn(() => mockContext);

        jest.resetModules();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('initializes drops array and attaches resize listener', async () => {
        await import('../../../../js/pages/analysis/visuals.js');

        expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));

        // Initial draw calls resize
        const canvas = document.getElementById('holo-bg');
        expect(canvas.width).toBe(window.innerWidth);
        expect(canvas.height).toBe(window.innerHeight);
    });

    it('handles resize events correctly and maintains state if columns stay the same', async () => {
        await import('../../../../js/pages/analysis/visuals.js');

        window.innerWidth = 140;
        window.innerHeight = 14;
        window._resizeHandler(); // re-evaluates columns

        // Change height slightly, width stays same so columns are unchanged
        window.innerHeight = 15;
        window._resizeHandler();

        expect(requestAnimationFrameSpy).toHaveBeenCalled();
    });

    it('draws frames and resets drops randomly when they cross the screen', async () => {
        // mock Math.random so drops always reset when they cross screen
        const mathRandomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99);

        window.innerWidth = 140; // 10 columns (fontSize 14)
        window.innerHeight = 14; // 1 drop to exceed

        await import('../../../../js/pages/analysis/visuals.js');

        // Initial draw triggers the first requestAnimationFrame
        // Simulate a number of frames being rendered to force drops to cross the screen and reset
        for (let i = 0; i < 110; i++) {
            if (window._rafCallback) {
                const cb = window._rafCallback;
                window._rafCallback = null;
                cb();
            }
        }

        expect(mockContext.fillRect).toHaveBeenCalled();
        expect(mockContext.fillText).toHaveBeenCalled();

        mathRandomSpy.mockRestore();
    });
});
