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

    it('correlates growth and exit-PE shocks with rho = 0.4', () => {
        global.self.crypto.getRandomValues.mockImplementation((array) => {
            array[0] = 2147483648; // secureRandom() === 0.5 exactly
            return array;
        });

        const payload = {
            scenarios: [
                {
                    prob: 1,
                    growth: { epsCagr: 0.1, epsCagrSigma: 0.05 },
                    valuation: { exitPe: 15, exitPeSigma: 2 },
                },
            ],
            volatility: 0.2,
            horizon: 1,
            paths: 50,
            eps: 10,
        };

        global.self.onmessage({ data: { type: 'RUN_SIMULATION', payload } });

        const result = mockPostMessage.mock.calls[0][0].result;
        // z1 = sqrt(-2 ln 0.5)·cos(pi) = -1.177410; z2 = z1·(0.4 + sqrt(0.84)) = -1.550078
        // sampledCagr = 0.1 + z1·0.05 = 0.0411295; sampledPe = 15 + z2·2 = 11.8998438
        expect(result.mean).toBeCloseTo(123.8928, 3);
    });

    it('simulates bridged annual paths with drawdown stats', () => {
        const queue = [];
        for (let p = 0; p < 10; p++) {
            queue.push(0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0, 0.5, 0.5);
        }
        let call = 0;
        global.self.crypto.getRandomValues.mockImplementation((array) => {
            array[0] = Math.floor(queue[call % queue.length] * (0xffffffff + 1));
            call++;
            return array;
        });

        const payload = {
            scenarios: [
                {
                    prob: 1,
                    growth: { epsCagr: 0.1, epsCagrSigma: 0.05 },
                    valuation: { exitPe: 15, exitPeSigma: 2 },
                },
            ],
            volatility: 0.2,
            horizon: 2,
            paths: 10,
            eps: 10,
            price: 100,
            riskFreeRate: 0,
            fGrid: [0, 1, 2],
            maxDrawdown: 0.05,
        };

        global.self.onmessage({ data: { type: 'RUN_PATH_SIMULATION', payload } });

        const msg = mockPostMessage.mock.calls[0][0];
        expect(msg.type).toBe('PATH_SIMULATION_COMPLETE');
        const result = msg.result;
        // All paths identical: bridge lands on the perturbed terminal price.
        expect(result.terminalValues[0]).toBeCloseTo(133.2963, 3);
        expect(result.annualFan[0].median).toBeCloseTo(146.1092, 3);
        expect(result.annualFan[1].median).toBeCloseTo(133.2963, 3);
        expect(result.maxDrawdown.mean).toBeCloseTo(0.087694, 4);
        expect(result.exceedance).toEqual([
            { f: 0, prob: 0 },
            { f: 1, prob: 1 },
            { f: 2, prob: 1 },
        ]);
    });

    it('returns an error for scenarios missing growth/valuation blocks (PORT view)', () => {
        const payload = {
            scenarios: [{ prob: 1.0, precomputedCagr: 0.1 }],
            volatility: 0.2,
            horizon: 5,
            paths: 100,
            eps: 10,
        };
        global.self.onmessage({ data: { type: 'RUN_SIMULATION', payload } });
        const arg = mockPostMessage.mock.calls[0][0];
        expect(arg.type).toBe('SIMULATION_COMPLETE');
        expect(arg.result.error).toMatch(/lacks growth\/valuation/);
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
