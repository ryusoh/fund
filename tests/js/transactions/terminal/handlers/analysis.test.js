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
    getActiveAnalysisHorizonMode: jest.fn(() => '2y'),
}));

const labModule = require('../../../../../js/pages/analysis/lab.js');

const HANDLER_PATH = '../../../../../js/transactions/terminal/handlers/analysis.js';
const PLOT_HANDLER_PATH = '../../../../../js/transactions/terminal/handlers/plot.js';
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

describe('handleAnalysisCommand (via plot valuation / p val)', () => {
    let handleAnalysisCommand;
    let handleActiveValuationShortcut;
    let handlePlotCommand;
    let getAnalysisAutocompleteSymbols;
    let appendMessage;

    beforeEach(() => {
        jest.isolateModules(() => {
            ({ handleAnalysisCommand, handleActiveValuationShortcut } = require(HANDLER_PATH));
            ({ handlePlotCommand } = require(PLOT_HANDLER_PATH));
            ({ getAnalysisAutocompleteSymbols } = require(AUTOCOMPLETE_PATH));
        });
        document.body.innerHTML = paneHtml();
        appendMessage = jest.fn();
        jest.clearAllMocks();
        labModule.getActiveAnalysisConfig.mockReturnValue(null);
        labModule.getActiveAnalysisHorizonMode.mockReturnValue('2y');
    });

    it('opens the Decision Board via plot valuation, hides other panes, and seeds ticker autocomplete', async () => {
        await handlePlotCommand(['valuation'], { appendMessage });
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
            expect.stringContaining(
                'Usage: plot valuation | plot valuation <TICKER> [all] (alias: p val)'
            )
        );
    });

    it('toggles the board closed when invoked again on the board, and switches back from ticker to board', async () => {
        await handlePlotCommand(['val'], { appendMessage });
        const section = document.getElementById('analysisSection');
        expect(section.classList.contains('is-hidden')).toBe(false);

        // Repeat on board -> toggles hidden
        await handlePlotCommand(['valuation'], { appendMessage });
        expect(section.classList.contains('is-hidden')).toBe(true);
        expect(appendMessage).toHaveBeenLastCalledWith('Hidden valuation board.');

        // Re-open on ticker, then `p val` returns to board instead of closing
        labModule.showTickerDecision.mockReturnValue({ text: 'GOOG: ADD · Mean 13.7%' });
        await handlePlotCommand(['val', 'goog'], { appendMessage });
        expect(section.classList.contains('is-hidden')).toBe(false);
        labModule.getActiveAnalysisConfig.mockReturnValue({ symbol: 'GOOG' });

        await handlePlotCommand(['val'], { appendMessage });
        expect(section.classList.contains('is-hidden')).toBe(false);
        expect(labModule.showDecisionBoard).toHaveBeenCalledTimes(2);
    });

    it('initializes the pane only once across invocations', async () => {
        labModule.showTickerDecision.mockReturnValue({ text: 'GOOG: ADD · Mean 13.7%' });
        await handleAnalysisCommand([], { appendMessage });
        await handleAnalysisCommand(['goog'], { appendMessage });
        expect(labModule.initAnalysisPane).toHaveBeenCalledTimes(1);
    });

    it('opens a single ticker in 2y/all modes and toggles closed on repeat with identical ticker+horizon', async () => {
        labModule.showTickerDecision.mockReturnValue({
            text: 'GOOG: ADD (+5.3% to cap) · Mean 13.7% · Fair > $306.2 (+11.4%)',
        });

        await handlePlotCommand(['val', 'goog'], { appendMessage });
        const section = document.getElementById('analysisSection');
        expect(section.classList.contains('is-hidden')).toBe(false);
        expect(labModule.showTickerDecision).toHaveBeenCalledWith('GOOG', { horizonMode: '2y' });
        expect(appendMessage).toHaveBeenCalledWith(
            'GOOG: ADD (+5.3% to cap) · Mean 13.7% · Fair > $306.2 (+11.4%)'
        );

        // Switching to `all` updates horizon instead of hiding
        labModule.getActiveAnalysisConfig.mockReturnValue({ symbol: 'GOOG' });
        labModule.getActiveAnalysisHorizonMode.mockReturnValue('2y');
        await handlePlotCommand(['valuation', 'goog', 'ALL'], { appendMessage });
        expect(section.classList.contains('is-hidden')).toBe(false);
        expect(labModule.showTickerDecision).toHaveBeenCalledWith('GOOG', { horizonMode: 'full' });

        // Repeating the same ticker + horizon toggles hidden
        labModule.getActiveAnalysisHorizonMode.mockReturnValue('full');
        await handlePlotCommand(['val', 'goog', 'all'], { appendMessage });
        expect(section.classList.contains('is-hidden')).toBe(true);
        expect(appendMessage).toHaveBeenLastCalledWith('Hidden GOOG valuation chart.');
    });

    it('rejects unknown symbols (including retired close) and invalid horizon flags', async () => {
        labModule.showTickerDecision.mockReturnValue(null);
        await handlePlotCommand(['valuation', 'close'], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Unknown valuation symbol: close')
        );
        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('Available symbols'));

        await handlePlotCommand(['val', 'goog', 'kelly'], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Unknown valuation option: kelly')
        );
    });

    it('handles missing #analysisSection cleanly', async () => {
        document.body.innerHTML = '';
        await handleAnalysisCommand([], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith('Valuation pane is not available on this page.');
    });

    it('supports contextual ticker and all shortcuts while the valuation pane is open', async () => {
        // Hidden pane -> shortcuts do not intercept
        expect(await handleActiveValuationShortcut('anet', [], { appendMessage })).toBe(false);
        expect(await handleActiveValuationShortcut('all', [], { appendMessage })).toBe(false);

        // Open board via plot valuation
        await handlePlotCommand(['valuation'], { appendMessage });

        // `all` on the board does not intercept (only applies on a ticker chart)
        expect(await handleActiveValuationShortcut('all', [], { appendMessage })).toBe(false);

        // Typing `anet` switches to ANET valuation chart
        labModule.showTickerDecision.mockReturnValue({
            text: 'ANET: TRIM (-25.3%) · Mean 11.5% · Buy < $174.0 (-2.2%)',
        });
        expect(await handleActiveValuationShortcut('anet', [], { appendMessage })).toBe(true);
        expect(labModule.showTickerDecision).toHaveBeenCalledWith('ANET', { horizonMode: '2y' });

        // Typing `all` on ANET valuation chart expands horizon to full
        labModule.getActiveAnalysisConfig.mockReturnValue({ symbol: 'ANET' });
        expect(await handleActiveValuationShortcut('all', [], { appendMessage })).toBe(true);
        expect(labModule.showTickerDecision).toHaveBeenCalledWith('ANET', { horizonMode: 'full' });

        // Unknown word while open falls through
        expect(await handleActiveValuationShortcut('zzzz', [], { appendMessage })).toBe(false);
    });

    it('verifies real export contract on @pages/analysis/lab.js', () => {
        const realLab = jest.requireActual('@pages/analysis/lab.js');
        expect(typeof realLab.initAnalysisPane).toBe('function');
        expect(typeof realLab.showDecisionBoard).toBe('function');
        expect(typeof realLab.showTickerDecision).toBe('function');
        expect(typeof realLab.getAnalysisSymbols).toBe('function');
        expect(typeof realLab.getActiveAnalysisConfig).toBe('function');
        expect(typeof realLab.getActiveAnalysisHorizonMode).toBe('function');
        expect(realLab.showAnalysisSection).toBeUndefined();
        expect(realLab.setActiveAnalysisSymbol).toBeUndefined();
        expect(realLab.buildAnalysisSnapshot).toBeUndefined();
    });
});
