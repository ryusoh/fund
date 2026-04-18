/* global document */
import { jest } from '@jest/globals';
import { transactionState, setZoomed, isZoomed } from '@js/transactions/state.js';

// Mock GSAP
const timelineMock = {
    to: jest.fn().mockReturnThis(),
    onComplete: null,
};

global.gsap = {
    timeline: jest.fn((opts) => {
        timelineMock.onComplete = opts?.onComplete || null;
        return timelineMock;
    }),
    to: jest.fn(),
    set: jest.fn(),
};

function setupDom() {
    document.body.innerHTML = `
        <div id="terminal">
            <div id="terminalOutput" style="height: 270px; margin-bottom: 20px;"></div>
            <div class="terminal-prompt">
                <input type="text" id="terminalInput" />
            </div>
        </div>
        <section id="runningAmountSection" class="chart-card">
            <canvas id="runningAmountCanvas"></canvas>
        </section>
        <div class="table-responsive-container is-hidden">
            <table></table>
        </div>
    `;

    // Mock getBoundingClientRect
    const terminal = document.getElementById('terminal');
    terminal.getBoundingClientRect = () => ({
        top: 100,
        bottom: 300,
        height: 200,
    });

    // Mock getComputedStyle for margin
    window.getComputedStyle = jest.fn((el) => {
        if (el === terminal) {
            return { marginBottom: '20px' };
        }
        return {};
    });

    const output = document.getElementById('terminalOutput');
    output.getBoundingClientRect = () => ({
        height: 270,
    });

    const chart = document.getElementById('runningAmountSection');
    chart.getBoundingClientRect = () => ({
        top: 320,
        bottom: 600,
        height: 280,
    });

    const table = document.querySelector('.table-responsive-container');
    table.getBoundingClientRect = () => ({
        top: 320,
        bottom: 700,
        height: 380,
    });
}

function resetState() {
    transactionState.isZoomed = false;
}

describe('zoom state management', () => {
    beforeEach(() => {
        resetState();
    });

    test('initial state is not zoomed', () => {
        expect(isZoomed()).toBe(false);
    });

    test('setZoomed(true) sets isZoomed to true', () => {
        setZoomed(true);
        expect(isZoomed()).toBe(true);
    });

    test('setZoomed(false) sets isZoomed to false', () => {
        setZoomed(true);
        expect(isZoomed()).toBe(true);
        setZoomed(false);
        expect(isZoomed()).toBe(false);
    });

    test('setZoomed coerces values to boolean', () => {
        setZoomed(1);
        expect(isZoomed()).toBe(true);
        setZoomed(0);
        expect(isZoomed()).toBe(false);
        setZoomed('truthy');
        expect(isZoomed()).toBe(true);
        setZoomed(null);
        expect(isZoomed()).toBe(false);
    });
});

describe('toggleZoom function', () => {
    let toggleZoom;
    let stateModule;

    beforeEach(async () => {
        jest.resetModules();
        setupDom();

        // Re-mock gsap for each test
        global.gsap = {
            timeline: jest.fn((opts) => ({
                to: jest.fn().mockReturnThis(),
                onComplete: opts?.onComplete,
            })),
            to: jest.fn(),
            set: jest.fn(),
        };

        // Import state and zoom from the same module cache
        stateModule = await import('@js/transactions/state.js');
        stateModule.transactionState.isZoomed = false;

        // Dynamic import after mocks are set up
        const zoomModule = await import('@js/transactions/zoom.js');
        toggleZoom = zoomModule.toggleZoom;
    });

    test('returns error message when terminal element not found', async () => {
        document.body.innerHTML = '';

        const result = await toggleZoom();

        expect(result.message).toContain('Unable to toggle zoom');
    });

    test('returns zoomed: true message when zooming in', async () => {
        // Simulate the animation completing
        const mockTimeline = {
            to: jest.fn().mockReturnThis(),
        };
        let completionCallback;
        global.gsap.timeline = jest.fn((opts) => {
            completionCallback = opts?.onComplete;
            return mockTimeline;
        });

        const resultPromise = toggleZoom();

        // Trigger the completion callback
        if (completionCallback) {
            completionCallback();
        }

        const result = await resultPromise;

        expect(result.zoomed).toBe(true);
        expect(result.message).toBe('Terminal zoomed in.');
    });

    test('returns zoomed: false message when zooming out', async () => {
        // First set state to zoomed using the same module instance
        stateModule.setZoomed(true);

        const mockTimeline = {
            to: jest.fn().mockReturnThis(),
        };
        let completionCallback;
        global.gsap.timeline = jest.fn((opts) => {
            completionCallback = opts?.onComplete;
            return mockTimeline;
        });

        const resultPromise = toggleZoom();

        // Trigger the completion callback
        if (completionCallback) {
            completionCallback();
        }

        const result = await resultPromise;

        expect(result.zoomed).toBe(false);
        expect(result.message).toBe('Terminal zoomed out.');
    });

    test('hides table when zooming in if table is visible', async () => {
        const table = document.querySelector('.table-responsive-container');
        table.classList.remove('is-hidden');
        document.getElementById('runningAmountSection').classList.add('is-hidden');

        const animationTargets = [];
        let completionCallback;

        global.gsap.timeline = jest.fn((opts) => {
            completionCallback = opts?.onComplete;
            return {
                to: jest.fn((target) => {
                    animationTargets.push(target);
                    return { to: jest.fn().mockReturnThis() }; // Needed for chaining
                }),
            };
        });

        const togglePromise = toggleZoom();

        // Trigger completion to resolve the promise
        if (completionCallback) {
            completionCallback();
        }

        await togglePromise;

        expect(animationTargets).toContain(table);
        expect(table.classList.contains('chart-zoomed-out')).toBe(true);
    });
});

describe('zoom CSS classes', () => {
    let toggleZoom;
    let stateModule;

    beforeEach(async () => {
        jest.resetModules();
        setupDom();

        let completionCallback;
        global.gsap = {
            timeline: jest.fn((opts) => {
                completionCallback = opts?.onComplete;
                // Immediately call the completion callback to test class application
                setTimeout(() => completionCallback?.(), 0);
                return {
                    to: jest.fn().mockReturnThis(),
                };
            }),
            to: jest.fn(),
            set: jest.fn(),
        };

        stateModule = await import('@js/transactions/state.js');
        stateModule.transactionState.isZoomed = false;

        const zoomModule = await import('@js/transactions/zoom.js');
        toggleZoom = zoomModule.toggleZoom;
    });

    test('adds terminal-zoomed class when zooming in', async () => {
        const terminal = document.getElementById('terminal');

        await toggleZoom();

        expect(terminal.classList.contains('terminal-zoomed')).toBe(true);
    });

    test('adds chart-zoomed-out class when zooming in', async () => {
        const chart = document.getElementById('runningAmountSection');

        await toggleZoom();

        expect(chart.classList.contains('chart-zoomed-out')).toBe(true);
    });

    test('removes terminal-zoomed class when zooming out', async () => {
        const terminal = document.getElementById('terminal');
        terminal.classList.add('terminal-zoomed');
        stateModule.setZoomed(true);

        await toggleZoom();

        expect(terminal.classList.contains('terminal-zoomed')).toBe(false);
    });

    test('removes chart-zoomed-out class when zooming out', async () => {
        const chart = document.getElementById('runningAmountSection');
        chart.classList.add('chart-zoomed-out');
        stateModule.setZoomed(true);

        await toggleZoom();

        expect(chart.classList.contains('chart-zoomed-out')).toBe(false);
    });
});

describe('getZoomState function', () => {
    let getZoomState;
    let stateModule;

    beforeEach(async () => {
        jest.resetModules();

        stateModule = await import('@js/transactions/state.js');
        stateModule.transactionState.isZoomed = false;

        const zoomModule = await import('@js/transactions/zoom.js');
        getZoomState = zoomModule.getZoomState;
    });

    test('returns current zoom state', () => {
        expect(getZoomState()).toBe(false);

        stateModule.setZoomed(true);
        expect(getZoomState()).toBe(true);

        stateModule.setZoomed(false);
        expect(getZoomState()).toBe(false);
    });
});
