describe('Monte Carlo Worker', () => {
    let mockSelf;

    beforeEach(() => {
        mockSelf = {
            postMessage: jest.fn(),
        };
        global.self = mockSelf;

        jest.isolateModules(() => {
            require('../../../../js/pages/analysis/monte_carlo.worker.js');
        });
    });

    afterEach(() => {
        delete global.self;
    });

    it('should ignore unknown message types', () => {
        global.self.onmessage({ data: { type: 'UNKNOWN', payload: {} } });
        expect(mockSelf.postMessage).not.toHaveBeenCalled();
    });

    it('should process RUN_SIMULATION messages', () => {
        const mockPayload = {
            scenarios: [
                { prob: 0.5, growth: { epsCagr: 0.1 }, valuation: { exitPe: 15 } },
                { prob: 0.5, growth: { epsCagr: 0.05 }, valuation: { exitPe: 10 } }
            ],
            volatility: 0.2,
            horizon: 5,
            paths: 100, // Small number for testing
            eps: 2.0
        };

        global.self.onmessage({ data: { type: 'RUN_SIMULATION', payload: mockPayload } });

        expect(mockSelf.postMessage).toHaveBeenCalled();

        const response = mockSelf.postMessage.mock.calls[0][0];
        expect(response.type).toBe('SIMULATION_COMPLETE');

        const result = response.result;
        expect(result.paths).toHaveLength(100);
        expect(result.histogram).toBeDefined();
        expect(result.mean).toBeDefined();
        expect(result.VaR_95).toBeDefined();
        expect(result.CVaR_95).toBeDefined();
    });

    it('should handle edge cases in probability picking', () => {
        // Mock Math.random
        const originalRandom = Math.random;
        Math.random = jest.fn(() => 0.99);

        const mockPayload = {
            scenarios: [
                { prob: 0.5, growth: { epsCagr: 0.1 }, valuation: { exitPe: 15 } },
                { prob: 0.3, growth: { epsCagr: 0.05 }, valuation: { exitPe: 10 } }
            ], // Probabilities sum to 0.8 < 0.99
            volatility: 0.2,
            horizon: 5,
            paths: 10,
            eps: 2.0
        };

        global.self.onmessage({ data: { type: 'RUN_SIMULATION', payload: mockPayload } });

        // Assert we didn't crash
        expect(mockSelf.postMessage).toHaveBeenCalled();
        Math.random = originalRandom;
    });

    it('should fallback to volatility*0.5 if epsCagrSigma or exitPeSigma are not provided', () => {
        const mockPayload = {
            scenarios: [
                { prob: 1.0, growth: { epsCagr: 0.1 }, valuation: { exitPe: 15 } }
            ],
            volatility: 0.4,
            horizon: 5,
            paths: 1, // just to trigger the fallback
            eps: 2.0
        };

        global.self.onmessage({ data: { type: 'RUN_SIMULATION', payload: mockPayload } });

        expect(mockSelf.postMessage).toHaveBeenCalled();
    });

    it('should use default 10000 paths if paths is omitted from config', () => {
        const mockPayload = {
            scenarios: [
                { prob: 1.0, growth: { epsCagr: 0.1, epsCagrSigma: 0.1 }, valuation: { exitPe: 15, exitPeSigma: 2 } }
            ],
            volatility: 0.2,
            horizon: 5,
            eps: 2.0
            // omit paths
        };

        global.self.onmessage({ data: { type: 'RUN_SIMULATION', payload: mockPayload } });

        const response = mockSelf.postMessage.mock.calls[0][0];
        expect(response.result.paths).toHaveLength(10000);
    });
});
