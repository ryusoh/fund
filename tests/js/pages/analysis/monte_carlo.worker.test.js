import { jest } from '@jest/globals';
import * as workerModule from '@pages/analysis/monte_carlo.worker.js';

describe('monte_carlo.worker', () => {
    let mockPostMessage;

    beforeEach(() => {
        mockPostMessage = jest.fn();
        global.self = {
            postMessage: mockPostMessage,
            crypto: {
                getRandomValues: jest.fn(),
            },
        };
        // Re-assign self.onmessage
        workerModule.initWorker(global.self);
    });

    it('processes RUN_SIMULATION message correctly', () => {
        // mock crypto.getRandomValues to make output predictable and hit all scenario branches
        let callCount = 0;
        global.self.crypto.getRandomValues.mockImplementation((array) => {
            callCount++;
            // alternate between scenarios
            // 0.2 * (0xffffffff + 1) = 858993459.2
            // 0.8 * (0xffffffff + 1) = 3435973836.8
            array[0] = callCount % 2 === 0 ? 858993459 : 3435973836;
            return array;
        });

        const payload = {
            scenarios: [
                {
                    prob: 0.5,
                    growth: { epsCagr: 0.1, epsCagrSigma: 0.05 },
                    valuation: { exitPe: 15, exitPeSigma: 2 },
                },
                { prob: 0.5, growth: { epsCagr: -0.05 }, valuation: { exitPe: 10 } }, // test missing sigmas fallback
            ],
            volatility: 0.2,
            horizon: 5,
            paths: 100,
            eps: 10,
        };

        global.self.onmessage({
            data: {
                type: 'RUN_SIMULATION',
                payload,
            },
        });

        expect(mockPostMessage).toHaveBeenCalledTimes(1);
        const arg = mockPostMessage.mock.calls[0][0];
        expect(arg.type).toBe('SIMULATION_COMPLETE');
        expect(arg.result).toBeDefined();

        // Check properties returned
        expect(arg.result.paths).toBeDefined();
        expect(arg.result.paths.length).toBe(100);
        expect(typeof arg.result.mean).toBe('number');
        expect(typeof arg.result.VaR_95).toBe('number');
        expect(typeof arg.result.CVaR_95).toBe('number');

        // Check histogram
        expect(arg.result.histogram).toBeDefined();
        expect(arg.result.histogram.counts.length).toBe(50);
        expect(typeof arg.result.histogram.min).toBe('number');
        expect(typeof arg.result.histogram.max).toBe('number');
        expect(typeof arg.result.histogram.binSize).toBe('number');
    });

    it('ignores unsupported message types', () => {
        global.self.onmessage({
            data: {
                type: 'UNKNOWN_MESSAGE',
                payload: {},
            },
        });

        expect(mockPostMessage).not.toHaveBeenCalled();
    });

    it('picks the last scenario if random > sum of probabilities due to floating point', () => {
        global.self.crypto.getRandomValues.mockImplementation((array) => {
            // 0.9999 * (0xffffffff + 1)
            array[0] = 4294537616;
            return array;
        });

        const payload = {
            scenarios: [
                { prob: 0.5, growth: { epsCagr: 0.1 }, valuation: { exitPe: 15 } },
                { prob: 0.4, growth: { epsCagr: -0.05 }, valuation: { exitPe: 10 } },
            ], // sums to 0.9, rand is 0.9999 -> should pick the last one
            volatility: 0.2,
            horizon: 5,
            paths: 10,
            eps: 10,
        };

        global.self.onmessage({
            data: {
                type: 'RUN_SIMULATION',
                payload,
            },
        });

        expect(mockPostMessage).toHaveBeenCalledTimes(1);
    });

    it('throws error if crypto is not available', () => {
        global.self.crypto = undefined;

        const payload = {
            scenarios: [{ prob: 1.0, growth: { epsCagr: 0.1 }, valuation: { exitPe: 15 } }],
            volatility: 0.2,
            horizon: 5,
            paths: 10,
            eps: 10,
        };

        expect(() => {
            global.self.onmessage({
                data: {
                    type: 'RUN_SIMULATION',
                    payload,
                },
            });
        }).toThrow('Secure random number generation is not supported in this environment');
    });
});
