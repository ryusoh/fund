jest.mock('../../../../../js/pages/analysis/lab.js', () => ({
    initAnalysisPane: jest.fn(async () => {}),
    showAnalysisSection: jest.fn(),
    setActiveAnalysisSymbol: jest.fn(),
    getAnalysisSymbols: jest.fn(() => ['PORT', 'ANET']),
    getActiveAnalysisConfig: jest.fn(() => null),
    buildAnalysisSnapshot: jest.fn(),
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

    it('switches to the kelly section and prints the function-specific snapshot', async () => {
        labModule.buildAnalysisSnapshot.mockReturnValue(
            'Kelly (ANET) — full +22.10%, scaled ½K +11.00%, current weight +34.20%.'
        );
        await handleAnalysisCommand(['kelly'], { appendMessage });
        expect(labModule.showAnalysisSection).toHaveBeenCalledWith('kelly');
        expect(labModule.buildAnalysisSnapshot).toHaveBeenCalledWith('kelly');
        expect(appendMessage).toHaveBeenCalledWith(
            'Kelly (ANET) — full +22.10%, scaled ½K +11.00%, current weight +34.20%.'
        );
    });

    it('maps scenarios and value to their own sections', async () => {
        labModule.buildAnalysisSnapshot.mockImplementation((func) => `Showing analysis '${func}'.`);
        await handleAnalysisCommand(['scenarios'], { appendMessage });
        expect(labModule.showAnalysisSection).toHaveBeenCalledWith('scenarios');
        expect(appendMessage).toHaveBeenCalledWith("Showing analysis 'scenarios'.");

        await handleAnalysisCommand(['value'], { appendMessage });
        expect(labModule.showAnalysisSection).toHaveBeenCalledWith('value');
        expect(appendMessage).toHaveBeenCalledWith("Showing analysis 'value'.");
    });

    it('shows other function sections without metric details', async () => {
        labModule.buildAnalysisSnapshot.mockImplementation((func) => `Showing analysis '${func}'.`);
        for (const sub of ['belief', 'evidence', 'predictions', 'journal']) {
            await handleAnalysisCommand([sub], { appendMessage });
            expect(labModule.showAnalysisSection).toHaveBeenCalledWith(sub);
        }
        expect(appendMessage).toHaveBeenCalledWith("Showing analysis 'journal'.");
    });

    it('reports retired Monte Carlo and sandbox subcommands cleanly', async () => {
        await handleAnalysisCommand(['mc'], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(
            'Monte Carlo view retired; use "analysis" or "analysis <TICKER>".'
        );
        await handleAnalysisCommand(['bull'], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(
            'Belief sandbox retired; use "analysis" or "analysis <TICKER>".'
        );
    });

    it('selects a security context from a lowercase ticker token', async () => {
        labModule.setActiveAnalysisSymbol.mockReturnValue(true);
        labModule.getActiveAnalysisConfig.mockReturnValue({
            symbol: 'ANET',
            name: 'Arista Networks',
            weight: 0.342,
        });
        await handleAnalysisCommand(['anet'], { appendMessage });
        expect(labModule.setActiveAnalysisSymbol).toHaveBeenCalledWith('ANET');
        expect(appendMessage).toHaveBeenCalledWith(
            'Analysis context: ANET (Arista Networks · 34.2%).'
        );
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
