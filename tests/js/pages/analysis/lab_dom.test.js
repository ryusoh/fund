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

    it('marks every pane canvas with the pane-canvas viewport-fit class', () => {
        ['kellyCurveCanvas', 'monteCarloCanvas', 'monteCarloFanCanvas'].forEach((id) => {
            const canvas = document.getElementById(id);
            expect(canvas).not.toBeNull();
            expect(canvas.classList.contains('pane-canvas')).toBe(true);
        });
    });

    it('checkPaneViewportFit returns null when the stage has no measurable box', () => {
        // jsdom reports 0 for clientHeight/scrollHeight — the hidden-subtree
        // case must short-circuit to null instead of guessing.
        expect(lab.checkPaneViewportFit()).toBeNull();
    });

    it('checkPaneViewportFit reports the overflow in px when content exceeds the stage', async () => {
        const { logger } = await import('@utils/logger.js');
        const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        const stage = document.querySelector('.analysis-stage');
        Object.defineProperty(stage, 'clientHeight', { value: 400, configurable: true });
        Object.defineProperty(stage, 'scrollHeight', { value: 500, configurable: true });

        state.activeSection = 'mc';
        const report = lab.checkPaneViewportFit();

        expect(report).toEqual({ section: 'mc', overflow: 100 });
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('100px'));
        warnSpy.mockRestore();
    });

    it('checkPaneViewportFit reports zero overflow when the section fits the stage', () => {
        const stage = document.querySelector('.analysis-stage');
        Object.defineProperty(stage, 'clientHeight', { value: 450, configurable: true });
        Object.defineProperty(stage, 'scrollHeight', { value: 449, configurable: true });

        state.activeSection = 'kelly';
        expect(lab.checkPaneViewportFit()).toEqual({ section: 'kelly', overflow: 0 });
    });

    it('checkPaneViewportFit runs after a section switch', async () => {
        const { logger } = await import('@utils/logger.js');
        const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        const stage = document.querySelector('.analysis-stage');
        Object.defineProperty(stage, 'clientHeight', { value: 400, configurable: true });
        Object.defineProperty(stage, 'scrollHeight', { value: 430, configurable: true });

        lab.showAnalysisSection('belief');

        expect(state.activeSection).toBe('belief');
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('belief'));
        warnSpy.mockRestore();
    });
});

describe('analysis pane CSS viewport-fit contract', () => {
    const fs = require('fs');
    const path = require('path');
    const css = fs.readFileSync(path.resolve(process.cwd(), 'css/terminal/analysis.css'), 'utf8');
    const normalized = css.replace(/\s+/g, ' ');

    it('constrains pane canvases to the flex column instead of a fixed height', () => {
        expect(normalized).toContain('canvas.pane-canvas');
        expect(normalized).toContain('object-fit: contain');
        expect(normalized).toMatch(/\.analysis-pane canvas\.pane-canvas[^}]*flex: 1 1 0/);
        expect(normalized).toMatch(/\.analysis-pane canvas\.pane-canvas[^}]*min-height: 0/);
    });

    it('gives analysis sections full stage height with a zero min-height floor', () => {
        expect(normalized).toMatch(/section\[data-analysis-section\][^}]*height: 100%/);
        expect(normalized).toMatch(/section\[data-analysis-section\][^}]*min-height: 0/);
    });

    it('pins the lab wrapper and stage into the card flex column', () => {
        // Without this, the wrapper grows with content and the card's
        // overflow:hidden clips it silently — the detector has no scrollbar
        // to observe.
        expect(normalized).toMatch(/\.lab-container[^}]*flex: 1 1 auto/);
        expect(normalized).toMatch(/\.lab-container[^}]*min-height: 0/);
        expect(normalized).toMatch(/\.analysis-stage[^}]*flex: 1 1 auto/);
    });

    it('contains the overview and scenario lists in elastic scroll regions', () => {
        expect(normalized).toMatch(/\.overview-lists[^}]*overflow-y: auto/);
        expect(normalized).toMatch(/\.overview-lists[^}]*min-height: 0/);
        expect(normalized).toMatch(/\.scenario-block[^}]*height: 100%/);
        expect(normalized).toMatch(/\.scenario-block \.card-row[^}]*overflow-y: auto/);
    });

    it('lets the output grid absorb free stage height', () => {
        expect(normalized).toMatch(/\.output-grid[^}]*flex: 1 1 auto/);
    });
});
