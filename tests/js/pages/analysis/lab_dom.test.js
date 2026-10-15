const mockCtx = {
    clearRect: jest.fn(),
    fillRect: jest.fn(),
};

HTMLCanvasElement.prototype.getContext = jest.fn(() => mockCtx);

global.Worker = class {
    constructor(stringUrl) {
        this.url = stringUrl;
        this.onmessage = () => {};
        this.onerror = () => {};
        this.postMessage = jest.fn();
    }
    terminate() {}
};

describe('analysis lab pane controller', () => {
    let lab;
    let state;

    beforeEach(async () => {
        jest.resetModules();
        document.body.innerHTML = '';
        lab = await import('@pages/analysis/lab.js');
        const container = document.createElement('div');
        document.body.appendChild(container);
        await lab.initAnalysisPane(container, { autoLoad: false });

        state = lab.__analysisLabTesting.state;
        state.bayesEngine = {
            update: jest.fn(),
            reset: jest.fn(),
            priors: [
                { name: 'Bull', prob: 0.5 },
                { name: 'Bear', prob: 0.5 },
            ],
        };
        state.configs = [
            {
                symbol: 'TEST',
                scenarios: [],
                metrics: { price: 100, eps: 5, volatility: 0.2, horizon: 5 },
            },
        ];
        state.activeSymbol = 'TEST';
    });

    afterEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';
    });

    it('applyBayesSandbox bull updates the engine and renders posteriors', () => {
        const priors = lab.applyBayesSandbox('bull');
        expect(state.bayesEngine.update).toHaveBeenCalledWith('bullish', 0.6);
        expect(priors).toEqual([
            { name: 'Bull', prob: 0.5 },
            { name: 'Bear', prob: 0.5 },
        ]);
        expect(document.getElementById('bayesOutput').textContent).toContain('Bull50.0%');
    });

    it('applyBayesSandbox bear updates the engine and renders posteriors', () => {
        lab.applyBayesSandbox('bear');
        expect(state.bayesEngine.update).toHaveBeenCalledWith('bearish', 0.6);
        expect(document.getElementById('bayesOutput').textContent).toContain('Bear50.0%');
    });

    it('applyBayesSandbox reset resets the engine from the active config', () => {
        lab.applyBayesSandbox('reset');
        expect(state.bayesEngine.reset).toHaveBeenCalledWith([]);
        expect(document.getElementById('bayesOutput').textContent).toContain('Bull50.0%');
    });

    it('applyBayesSandbox returns null for unknown actions or a missing engine', () => {
        expect(lab.applyBayesSandbox('nope')).toBeNull();
        state.bayesEngine = null;
        expect(lab.applyBayesSandbox('bull')).toBeNull();
    });

    it('runMonteCarloSimulation lazily creates the worker and posts the payload', async () => {
        expect(state.monteCarloWorker).toBeNull();

        const promise = lab.runMonteCarloSimulation(5000);

        expect(state.monteCarloWorker).not.toBeNull();
        expect(state.monteCarloWorker.url).toContain('monte_carlo.worker.js');
        expect(state.monteCarloWorker.postMessage).toHaveBeenCalledWith({
            type: 'RUN_PATH_SIMULATION',
            payload: expect.objectContaining({ paths: 5000, price: 100, eps: 5 }),
        });

        state.monteCarloWorker.onmessage({
            data: {
                type: 'SIMULATION_COMPLETE',
                result: { mean: 120, VaR_95: 10, CVaR_95: 15, histogram: { counts: [5, 15, 30] } },
            },
        });
        const result = await promise;
        expect(result.mean).toBe(120);

        const textContent = document.getElementById('riskMetrics').textContent;
        expect(textContent).toContain('Mean Terminal Price$120.00');
        expect(textContent).toContain('VaR (95%)$10.00');
        expect(textContent).toContain('CVaR (95%)$15.00');
        expect(mockCtx.clearRect).toHaveBeenCalled();
        expect(mockCtx.fillRect).toHaveBeenCalledTimes(3);
    });

    it('runMonteCarloSimulation renders worker-reported errors as pane text', async () => {
        const promise = lab.runMonteCarloSimulation();
        state.monteCarloWorker.onmessage({
            data: { type: 'SIMULATION_COMPLETE', result: { error: 'boom' } },
        });
        expect(await promise).toBeNull();
        expect(document.getElementById('riskMetrics').textContent).toContain('boom');
    });

    it('runMonteCarloSimulation resolves null without an active config', async () => {
        state.configs = [];
        await expect(lab.runMonteCarloSimulation()).resolves.toBeNull();
        expect(state.monteCarloWorker).toBeNull();
    });

    it('shows a pending state while the simulation worker runs', () => {
        const fan = document.getElementById('monteCarloFanCanvas');
        expect(fan).not.toBeNull();
        expect(fan.getAttribute('role')).toBe('img');

        // The mock worker never posts back — the pending line must stay.
        lab.runMonteCarloSimulation(5000);
        const status = document.querySelector('#riskMetrics .mc-status');
        expect(status).not.toBeNull();
        expect(status.textContent).toContain('Running 5,000 paths');

        // A completion message replaces the pending line.
        state.monteCarloWorker.onmessage({
            data: {
                type: 'SIMULATION_COMPLETE',
                result: { mean: 120, VaR_95: 10, CVaR_95: 15, histogram: { counts: [5, 15, 30] } },
            },
        });
        expect(document.querySelector('#riskMetrics .mc-status')).toBeNull();
        expect(document.getElementById('riskMetrics').textContent).toContain('Mean Terminal Price');
        expect(fan.getAttribute('aria-label')).toContain('fan envelope');
    });

    it('marks the pane scroll regions as keyboard-focusable', () => {
        expect(document.querySelector('.analysis-stage').getAttribute('tabindex')).toBe('0');
        expect(document.getElementById('evidenceTimeline').getAttribute('tabindex')).toBe('0');
    });

    it('showAnalysisSection toggles section visibility and state', () => {
        lab.showAnalysisSection('kelly');
        expect(state.activeSection).toBe('kelly');
        const kelly = document.querySelector('[data-analysis-section="kelly"]');
        const overview = document.querySelector('[data-analysis-section="overview"]');
        expect(kelly.classList.contains('is-hidden')).toBe(false);
        expect(overview.classList.contains('is-hidden')).toBe(true);

        lab.showAnalysisSection('unknown-section');
        expect(state.activeSection).toBe('overview');
        expect(overview.classList.contains('is-hidden')).toBe(false);
    });

    it('setActiveAnalysisSymbol switches context and rejects unknown symbols', () => {
        expect(lab.setActiveAnalysisSymbol('NOPE')).toBe(false);
        expect(lab.setActiveAnalysisSymbol('TEST')).toBe(true);
        expect(state.activeSymbol).toBe('TEST');
    });

    it('getAnalysisSymbols and getActiveAnalysisConfig expose the loaded context', () => {
        expect(lab.getAnalysisSymbols()).toEqual(['TEST']);
        expect(lab.getActiveAnalysisConfig().symbol).toBe('TEST');
    });

    it('exposes canvases at 2× backing resolution with img roles and dynamic aria-labels', () => {
        const kelly = document.getElementById('kellyCurveCanvas');
        const mc = document.getElementById('monteCarloCanvas');
        expect(kelly.width).toBe(1200);
        expect(kelly.height).toBe(400);
        expect(kelly.getAttribute('role')).toBe('img');
        expect(mc.width).toBe(1200);
        expect(mc.height).toBe(240);
        expect(mc.getAttribute('role')).toBe('img');

        lab.setActiveAnalysisSymbol('TEST');
        expect(kelly.getAttribute('aria-label')).toContain('Kelly curve');

        lab.__analysisLabTesting.renderMonteCarloResults({
            mean: 120,
            VaR_95: 10,
            CVaR_95: 15,
            histogram: { counts: [5, 15, 30] },
        });
        expect(mc.getAttribute('aria-label')).toContain('Terminal price histogram');
    });

    it('re-renders the active section when currencyChangedGlobal fires', async () => {
        lab.setActiveAnalysisSymbol('TEST');
        const summary = document.getElementById('summaryStats');
        expect(summary.textContent).toContain('$100.00');

        state.configs[0].metrics.price = 200;
        document.dispatchEvent(
            new CustomEvent('currencyChangedGlobal', { detail: { currency: 'EUR' } })
        );
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(summary.textContent).toContain('$200.00');
    });
});
