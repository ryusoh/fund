jest.mock('../../../../../js/pages/analysis/lab.js', () => ({
    initAnalysisPane: jest.fn(async () => {}),
    showDecisionBoard: jest.fn(() => ({
        rows: [
            { symbol: 'CBRS', decision: { verdictDisplay: 'AVOID · THESIS BROKEN' } },
            { symbol: 'GOOG', decision: { verdictDisplay: 'ADD (+5.3% to cap)' } },
        ],
        totalCurrentWeight: 1.0,
        totalRecommendedWeight: 0.689,
        residualTargetCash: 0.311,
    })),
    showTickerDecision: jest.fn(),
    getAnalysisSymbols: jest.fn(() => ['AEHR', 'ANET', 'CBRS', 'GOOG', 'PDD', 'VT']),
    getActiveAnalysisConfig: jest.fn(() => null),
}));

const labModule = require('../../../../../js/pages/analysis/lab.js');

const HANDLER_PATH = '../../../../../js/transactions/terminal/handlers/analysis.js';
const AUTOCOMPLETE_PATH = '../../../../../js/transactions/terminal/autocomplete.js';

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
    let getAnalysisAutocompleteSymbols;
    let appendMessage;

    beforeEach(() => {
        jest.isolateModules(() => {
            ({ handleAnalysisCommand } = require(HANDLER_PATH));
            ({ getAnalysisAutocompleteSymbols } = require(AUTOCOMPLETE_PATH));
        });
        document.body.innerHTML = paneHtml();
        appendMessage = jest.fn();
        jest.clearAllMocks();
    });

    it('opens the Decision Board with no args, hides other panes, and seeds ticker autocomplete', async () => {
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
        expect(labModule.showDecisionBoard).toHaveBeenCalledTimes(1);
        expect(getAnalysisAutocompleteSymbols()).toEqual([
            'AEHR',
            'ANET',
            'CBRS',
            'GOOG',
            'PDD',
            'VT',
        ]);
        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('PORT Decision Board'));
        expect(appendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Residual Target Cash 31.1%')
        );
        expect(appendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Usage: analysis | analysis <TICKER> [all] | analysis close')
        );
    });

    it('initializes the pane only once across invocations', async () => {
        labModule.showTickerDecision.mockReturnValue({ text: 'GOOG: ADD · Mean 13.7%' });
        await handleAnalysisCommand([], { appendMessage });
        await handleAnalysisCommand(['goog'], { appendMessage });
        expect(labModule.initAnalysisPane).toHaveBeenCalledTimes(1);
    });

    it('opens a single ticker in default 2y mode and all-horizon mode', async () => {
        labModule.showTickerDecision.mockReturnValue({
            text: 'GOOG: ADD (+5.3% to cap) · Mean 13.7% · Fair > $306.2 (+11.4%)',
        });

        await handleAnalysisCommand(['goog'], { appendMessage });
        expect(labModule.showTickerDecision).toHaveBeenCalledWith('GOOG', { horizonMode: '2y' });
        expect(appendMessage).toHaveBeenCalledWith(
            'GOOG: ADD (+5.3% to cap) · Mean 13.7% · Fair > $306.2 (+11.4%)'
        );

        await handleAnalysisCommand(['goog', 'ALL'], { appendMessage });
        expect(labModule.showTickerDecision).toHaveBeenCalledWith('GOOG', { horizonMode: 'full' });
    });

    it('closes the pane with close without loading lab module', async () => {
        const section = document.getElementById('analysisSection');
        section.classList.remove('is-hidden');
        await handleAnalysisCommand(['close'], { appendMessage });
        expect(section.classList.contains('is-hidden')).toBe(true);
        expect(labModule.initAnalysisPane).not.toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Analysis pane closed.');
    });

    it('rejects unknown symbols and invalid horizon flags', async () => {
        labModule.showTickerDecision.mockReturnValue(null);
        await handleAnalysisCommand(['zzzz'], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Unknown analysis symbol or subcommand: zzzz')
        );
        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('Available symbols'));

        await handleAnalysisCommand(['goog', 'kelly'], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Unknown analysis option: kelly')
        );
    });

    it('handles missing #analysisSection cleanly', async () => {
        document.body.innerHTML = '';
        await handleAnalysisCommand([], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith('Analysis pane is not available on this page.');
    });

    it('verifies real export contract on @pages/analysis/lab.js', () => {
        const realLab = jest.requireActual('@pages/analysis/lab.js');
        expect(typeof realLab.initAnalysisPane).toBe('function');
        expect(typeof realLab.showDecisionBoard).toBe('function');
        expect(typeof realLab.showTickerDecision).toBe('function');
        expect(typeof realLab.getAnalysisSymbols).toBe('function');
        expect(typeof realLab.getActiveAnalysisConfig).toBe('function');
        expect(realLab.showAnalysisSection).toBeUndefined();
        expect(realLab.setActiveAnalysisSymbol).toBeUndefined();
        expect(realLab.buildAnalysisSnapshot).toBeUndefined();
    });
});
