jest.mock('../../../../../js/pages/analysis/lab.js', () => ({
    initAnalysisPane: jest.fn(async () => {}),
    showAnalysisSection: jest.fn(),
    setActiveAnalysisSymbol: jest.fn(),
    getAnalysisSymbols: jest.fn(() => ['PORT', 'ANET']),
    getActiveAnalysisConfig: jest.fn(() => null),
    applyBayesSandbox: jest.fn(),
    runMonteCarloSimulation: jest.fn(),
}));

const labModule = require('../../../../../js/pages/analysis/lab.js');

const HANDLER_PATH = '../../../../../js/transactions/terminal/handlers/analysis.js';

function paneHtml() {
    return (
        '<div class="table-responsive-container"></div>' +
        '<section id="runningAmountSection"></section>' +
        '<section id="analysisSection" class="chart-card analysis-pane is-hidden">' +
        '<h2 id="analysisTitle" class="sr-only">Analysis Lab</h2>' +
        '</section>'
    );
}

describe('handleAnalysisCommand', () => {
    let handleAnalysisCommand;
    let appendMessage;

    beforeEach(() => {
        jest.isolateModules(() => {
            ({ handleAnalysisCommand } = require(HANDLER_PATH));
        });
        document.body.innerHTML = paneHtml();
        appendMessage = jest.fn();
        jest.clearAllMocks();
    });

    it('opens the pane on overview with no args and hides other panes', async () => {
        await handleAnalysisCommand([], { appendMessage });
        const section = document.getElementById('analysisSection');
        expect(section.classList.contains('is-hidden')).toBe(false);
        expect(
            document.querySelector('.table-responsive-container').classList.contains('is-hidden')
        ).toBe(true);
        expect(
            document.getElementById('runningAmountSection').classList.contains('is-hidden')
        ).toBe(true);
        expect(labModule.initAnalysisPane).toHaveBeenCalledWith(section);
        expect(labModule.showAnalysisSection).toHaveBeenCalledWith('overview');
        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('PORT, ANET'));
        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('Usage: analysis'));
    });

    it('initializes the pane only once across invocations', async () => {
        await handleAnalysisCommand([], { appendMessage });
        await handleAnalysisCommand(['kelly'], { appendMessage });
        expect(labModule.initAnalysisPane).toHaveBeenCalledTimes(1);
    });

    it('switches to the kelly section and prints a metric snapshot', async () => {
        labModule.getActiveAnalysisConfig.mockReturnValue({
            symbol: 'ANET',
            metrics: { price: 92.5, eps: 6.2, volatility: 0.28, horizon: 5 },
        });
        await handleAnalysisCommand(['kelly'], { appendMessage });
        expect(labModule.showAnalysisSection).toHaveBeenCalledWith('kelly');
        expect(appendMessage).toHaveBeenCalledWith(
            "Showing analysis 'kelly' — ANET, price $92.50, EPS $6.20, vol 28.0%, 5y horizon."
        );
    });

    it('maps scenarios and value to the overview section', async () => {
        labModule.getActiveAnalysisConfig.mockReturnValue({ symbol: 'PORT', metrics: null });
        await handleAnalysisCommand(['scenarios'], { appendMessage });
        expect(labModule.showAnalysisSection).toHaveBeenCalledWith('overview');
        expect(appendMessage).toHaveBeenCalledWith("Showing analysis 'scenarios'.");

        await handleAnalysisCommand(['value'], { appendMessage });
        expect(labModule.showAnalysisSection).toHaveBeenCalledWith('overview');
        expect(appendMessage).toHaveBeenCalledWith("Showing analysis 'value'.");
    });

    it('shows other function sections without metric details', async () => {
        for (const sub of ['belief', 'evidence', 'predictions', 'journal']) {
            await handleAnalysisCommand([sub], { appendMessage });
            expect(labModule.showAnalysisSection).toHaveBeenCalledWith(sub);
        }
        expect(appendMessage).toHaveBeenCalledWith("Showing analysis 'journal'.");
    });

    it('formats large prices with thousands separators', async () => {
        labModule.getActiveAnalysisConfig.mockReturnValue({
            symbol: 'ANET',
            metrics: { price: 12345.6, eps: 6.2, volatility: 0.28, horizon: 5 },
        });
        await handleAnalysisCommand(['kelly'], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('price $12,346'));
    });

    it('runs Monte Carlo with the default path count', async () => {
        labModule.runMonteCarloSimulation.mockResolvedValue({
            VaR_95: 61.02,
            CVaR_95: 48.11,
        });
        await handleAnalysisCommand(['mc'], { appendMessage });
        expect(labModule.showAnalysisSection).toHaveBeenCalledWith('mc');
        expect(labModule.runMonteCarloSimulation).toHaveBeenCalledWith(10000);
        expect(appendMessage).toHaveBeenCalledWith(
            'MC (10,000 paths) — VaR (95%): $61.02, CVaR (95%): $48.11.'
        );
    });

    it('runs Monte Carlo with a custom path count', async () => {
        labModule.runMonteCarloSimulation.mockResolvedValue({
            VaR_95: 61.02,
            CVaR_95: 48.11,
        });
        await handleAnalysisCommand(['mc', '500'], { appendMessage });
        expect(labModule.runMonteCarloSimulation).toHaveBeenCalledWith(500);
        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('MC (500 paths)'));
    });

    it('falls back to the default path count on invalid input', async () => {
        labModule.runMonteCarloSimulation.mockResolvedValue({
            VaR_95: 61.02,
            CVaR_95: 48.11,
        });
        await handleAnalysisCommand(['mc', 'abc'], { appendMessage });
        expect(labModule.runMonteCarloSimulation).toHaveBeenCalledWith(10000);
    });

    it('reports Monte Carlo failure when the result is null', async () => {
        labModule.runMonteCarloSimulation.mockResolvedValue(null);
        await handleAnalysisCommand(['mc'], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(
            'Monte Carlo simulation failed; see the analysis pane for details.'
        );
    });

    it('prints posteriors after a sandbox action', async () => {
        labModule.applyBayesSandbox.mockReturnValue([
            { name: 'base', prob: 0.72 },
            { name: 'bull', prob: 0.28 },
        ]);
        await handleAnalysisCommand(['bull'], { appendMessage });
        expect(labModule.applyBayesSandbox).toHaveBeenCalledWith('bull');
        expect(appendMessage).toHaveBeenCalledWith(
            'Belief sandbox (bull) — base: 72.0%, bull: 28.0%.'
        );
    });

    it('handles sandbox actions with no active engine', async () => {
        labModule.applyBayesSandbox.mockReturnValue(null);
        await handleAnalysisCommand(['reset'], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(
            'Belief sandbox unavailable — no active scenario config.'
        );
    });

    it('selects a security context from a lowercase ticker token', async () => {
        labModule.setActiveAnalysisSymbol.mockReturnValue(true);
        await handleAnalysisCommand(['anet'], { appendMessage });
        expect(labModule.setActiveAnalysisSymbol).toHaveBeenCalledWith('ANET');
        expect(appendMessage).toHaveBeenCalledWith('Analysis context: ANET.');
    });

    it('reports unknown symbols and subcommands', async () => {
        labModule.setActiveAnalysisSymbol.mockReturnValue(false);
        await handleAnalysisCommand(['zzzz'], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Unknown analysis symbol or subcommand: zzzz')
        );
        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('Available symbols'));
    });

    it('closes the pane without initializing the lab module', async () => {
        document.getElementById('analysisSection').classList.remove('is-hidden');
        await handleAnalysisCommand(['close'], { appendMessage });
        expect(document.getElementById('analysisSection').classList.contains('is-hidden')).toBe(
            true
        );
        expect(labModule.initAnalysisPane).not.toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Analysis pane closed.');
    });

    it('reports when the pane element is missing', async () => {
        document.body.innerHTML = '';
        await handleAnalysisCommand([], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith('Analysis pane is not available on this page.');
    });
});
