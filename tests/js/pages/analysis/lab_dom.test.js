global.Worker = class {
    constructor(stringUrl) {
        this.url = stringUrl;
        this.onmessage = () => {};
    }
    postMessage(msg) {
        this.onmessage({ data: msg });
    }
};

const FLAG = '__SKIP_ANALYSIS_AUTO_INIT__';
global[FLAG] = true;

// Mock the DOM elements expected by lab.js
document.body.innerHTML = `
    <div id="bayesOutput"></div>
    <button id="btnBayesBull"></button>
    <button id="btnBayesNeutral"></button>
    <button id="btnBayesBear"></button>
    <button id="btnBayesReset"></button>
    <button id="btnRunMonteCarlo"></button>
`;

const { __analysisLabTesting } = require('../../../../js/pages/analysis/lab.js');

describe('lab.js DOM event coverage', () => {
    let mockBayesEngine;

    beforeEach(() => {
        mockBayesEngine = {
            update: jest.fn(),
            reset: jest.fn(),
            priors: [
                { name: 'Bull', prob: 0.5 },
                { name: 'Bear', prob: 0.5 },
            ],
        };
        __analysisLabTesting.state.bayesEngine = mockBayesEngine;
        __analysisLabTesting.state.configs = [
            {
                symbol: 'TEST',
                scenarios: [],
                metrics: { price: 100, eps: 5, volatility: 0.2, horizon: 5 },
            },
        ];
        __analysisLabTesting.state.activeSymbol = 'TEST';
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('btnBayesBull click updates engine and renders', () => {
        const btn = document.getElementById('btnBayesBull');
        btn.click();
        expect(mockBayesEngine.update).toHaveBeenCalledWith('bullish', 0.6);
        // Checking if render was called by verifying the DOM output
        const output = document.getElementById('bayesOutput');
        expect(output.textContent).toContain('Bull50.0%');
    });

    it('btnBayesBear click updates engine and renders', () => {
        const btn = document.getElementById('btnBayesBear');
        btn.click();
        expect(mockBayesEngine.update).toHaveBeenCalledWith('bearish', 0.6);
        const output = document.getElementById('bayesOutput');
        expect(output.textContent).toContain('Bear50.0%');
    });

    it('btnBayesReset click resets engine and renders', () => {
        const btn = document.getElementById('btnBayesReset');
        btn.click();
        expect(mockBayesEngine.reset).toHaveBeenCalledWith([]);
        const output = document.getElementById('bayesOutput');
        expect(output.textContent).toContain('Bull50.0%');
    });

    it('btnRunMonteCarlo click posts message to worker', () => {
        const btn = document.getElementById('btnRunMonteCarlo');
        const postMessageSpy = jest.spyOn(
            __analysisLabTesting.state.monteCarloWorker,
            'postMessage'
        );

        btn.click();

        expect(btn.disabled).toBe(true);
        expect(btn.textContent).toContain('Running...');
        expect(postMessageSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'RUN_SIMULATION',
            })
        );
    });
});
