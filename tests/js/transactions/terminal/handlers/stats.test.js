import { handleStatsCommand } from '../../../../../js/transactions/terminal/handlers/stats.js';
import { transactionState } from '../../../../../js/transactions/state.js';
import * as terminalStats from '../../../../../js/transactions/terminalStats.js';
import { getGeographySummaryText } from '../../../../../js/transactions/terminal/handlers/geographySummary.js';


jest.mock('../../../../../js/transactions/state.js', () => ({
    transactionState: {
        selectedCurrency: 'USD',
    },
}));

jest.mock('../../../../../js/transactions/terminalStats.js', () => ({
    getStatsText: jest.fn(),
    getHoldingsText: jest.fn(),
    getHoldingsDebugText: jest.fn(),
    getFinancialStatsText: jest.fn(),
    getTechnicalStatsText: jest.fn(),
    getCagrText: jest.fn(),
    getAnnualReturnText: jest.fn(),
    getRatioText: jest.fn(),
    getDurationStatsText: jest.fn(),
    getLifespanStatsText: jest.fn(),
    getConcentrationText: jest.fn(),
}));

jest.mock('../../../../../js/transactions/terminal/handlers/geographySummary.js', () => ({
    getGeographySummaryText: jest.fn(),
}));

jest.mock('../../../../../js/transactions/terminal/constants.js', () => ({
    STATS_SUBCOMMANDS: [
        'transactions',
        'holdings',
        'financial',
        'technical',
        'cagr',
        'return',
        'ratio',
        'duration',
        'lifespan',
        'concentration',
        'geography',
    ],
}));

describe('handleStatsCommand', () => {
    let appendMessage;

    beforeEach(() => {
        appendMessage = jest.fn();
        jest.clearAllMocks();
    });

    it('displays help when no arguments are provided', async () => {
        await handleStatsCommand([], { appendMessage });

        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('Stats commands:\n'));
        expect(terminalStats.getStatsText).not.toHaveBeenCalled();
    });

    it('handles "transactions" subcommand', async () => {
        terminalStats.getStatsText.mockResolvedValue('Mocked Transactions Stats');
        await handleStatsCommand(['transactions'], { appendMessage });

        expect(terminalStats.getStatsText).toHaveBeenCalledWith('USD');
        expect(appendMessage).toHaveBeenCalledWith('Mocked Transactions Stats');
    });

    it('handles "transactions" subcommand with fallback currency', async () => {
        transactionState.selectedCurrency = null;
        terminalStats.getStatsText.mockResolvedValue('Mocked Transactions Stats');
        await handleStatsCommand(['transactions'], { appendMessage });

        expect(terminalStats.getStatsText).toHaveBeenCalledWith('USD');
        expect(appendMessage).toHaveBeenCalledWith('Mocked Transactions Stats');
        transactionState.selectedCurrency = 'USD';
    });

    it('handles "holdings" subcommand', async () => {
        terminalStats.getHoldingsText.mockResolvedValue('Mocked Holdings Stats');
        await handleStatsCommand(['holdings'], { appendMessage });

        expect(terminalStats.getHoldingsText).toHaveBeenCalledWith('USD');
        expect(appendMessage).toHaveBeenCalledWith('Mocked Holdings Stats');
    });

    it('handles "holdings" subcommand with fallback currency', async () => {
        transactionState.selectedCurrency = undefined;
        terminalStats.getHoldingsText.mockResolvedValue('Mocked Holdings Stats');
        await handleStatsCommand(['holdings'], { appendMessage });

        expect(terminalStats.getHoldingsText).toHaveBeenCalledWith('USD');
        expect(appendMessage).toHaveBeenCalledWith('Mocked Holdings Stats');
        transactionState.selectedCurrency = 'USD';
    });

    it('handles "holdings-debug" subcommand', async () => {
        terminalStats.getHoldingsDebugText.mockResolvedValue('Mocked Debug Holdings');
        await handleStatsCommand(['holdings-debug'], { appendMessage });

        expect(terminalStats.getHoldingsDebugText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Mocked Debug Holdings');
    });

    it('handles "financial" subcommand', async () => {
        terminalStats.getFinancialStatsText.mockResolvedValue('Mocked Financial Stats');
        await handleStatsCommand(['financial'], { appendMessage });

        expect(terminalStats.getFinancialStatsText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Mocked Financial Stats');
    });

    it('handles "technical" subcommand', async () => {
        terminalStats.getTechnicalStatsText.mockResolvedValue('Mocked Technical Stats');
        await handleStatsCommand(['technical'], { appendMessage });

        expect(terminalStats.getTechnicalStatsText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Mocked Technical Stats');
    });

    it('handles "cagr" subcommand', async () => {
        terminalStats.getCagrText.mockResolvedValue('Mocked CAGR Stats');
        await handleStatsCommand(['cagr'], { appendMessage });

        expect(terminalStats.getCagrText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Mocked CAGR Stats');
    });

    it('handles "return" subcommand', async () => {
        terminalStats.getAnnualReturnText.mockResolvedValue('Mocked Return Stats');
        await handleStatsCommand(['return'], { appendMessage });

        expect(terminalStats.getAnnualReturnText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Mocked Return Stats');
    });

    it('handles "ratio" subcommand', async () => {
        terminalStats.getRatioText.mockResolvedValue('Mocked Ratio Stats');
        await handleStatsCommand(['ratio'], { appendMessage });

        expect(terminalStats.getRatioText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Mocked Ratio Stats');
    });

    it('handles "duration" subcommand', async () => {
        terminalStats.getDurationStatsText.mockResolvedValue('Mocked Duration Stats');
        await handleStatsCommand(['duration'], { appendMessage });

        expect(terminalStats.getDurationStatsText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Mocked Duration Stats');
    });

    it('handles "lifespan" subcommand', async () => {
        terminalStats.getLifespanStatsText.mockResolvedValue('Mocked Lifespan Stats');
        await handleStatsCommand(['lifespan'], { appendMessage });

        expect(terminalStats.getLifespanStatsText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Mocked Lifespan Stats');
    });

    it('handles "concentration" subcommand', async () => {
        terminalStats.getConcentrationText.mockResolvedValue('Mocked Concentration Stats');
        await handleStatsCommand(['concentration'], { appendMessage });

        expect(terminalStats.getConcentrationText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Mocked Concentration Stats');
    });

    it('handles "geography" subcommand', async () => {
        getGeographySummaryText.mockResolvedValue('Mocked Geography Stats');
        await handleStatsCommand(['geography'], { appendMessage });

        expect(getGeographySummaryText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Mocked Geography Stats');
    });

    it('handles unknown subcommands', async () => {
        await handleStatsCommand(['unknown_command'], { appendMessage });

        expect(appendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Unknown stats subcommand: unknown_command\nAvailable: ')
        );
    });

    it('does not append message if result is empty', async () => {
        terminalStats.getStatsText.mockResolvedValue('');
        await handleStatsCommand(['transactions'], { appendMessage });

        expect(appendMessage).not.toHaveBeenCalled();
    });
});
