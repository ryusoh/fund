import { handleStatsCommand } from '../../../../../js/transactions/terminal/handlers/stats.js';
import { transactionState } from '../../../../../js/transactions/state.js';
import { STATS_SUBCOMMANDS } from '../../../../../js/transactions/terminal/constants.js';
import * as terminalStats from '../../../../../js/transactions/terminalStats.js';
import * as geographySummary from '../../../../../js/transactions/terminal/handlers/geographySummary.js';

jest.mock('../../../../../js/transactions/state.js', () => ({
    transactionState: {
        selectedCurrency: 'USD',
    },
}));

jest.mock('../../../../../js/transactions/terminalStats.js', () => ({
    getStatsText: jest.fn(),
    getHoldingsText: jest.fn(),
    getHoldingsDebugText: jest.fn(),
    getCagrText: jest.fn(),
    getAnnualReturnText: jest.fn(),
    getRatioText: jest.fn(),
    getDurationStatsText: jest.fn(),
    getLifespanStatsText: jest.fn(),
    getConcentrationText: jest.fn(),
    getFinancialStatsText: jest.fn(),
    getTechnicalStatsText: jest.fn(),
}));

jest.mock('../../../../../js/transactions/terminal/handlers/geographySummary.js', () => ({
    getGeographySummaryText: jest.fn(),
}));

describe('handleStatsCommand', () => {
    let mockContext;

    beforeEach(() => {
        mockContext = { appendMessage: jest.fn() };
        jest.clearAllMocks();
    });

    it('shows help when no args provided', async () => {
        await handleStatsCommand([], mockContext);
        expect(mockContext.appendMessage).toHaveBeenCalledWith(expect.stringContaining('Stats commands:'));
    });

    it('handles transactions subcommand', async () => {
        terminalStats.getStatsText.mockResolvedValue('transactions stats');
        await handleStatsCommand(['transactions'], mockContext);
        expect(terminalStats.getStatsText).toHaveBeenCalledWith('USD');
        expect(mockContext.appendMessage).toHaveBeenCalledWith('transactions stats');
    });

    it('handles holdings subcommand', async () => {
        terminalStats.getHoldingsText.mockResolvedValue('holdings stats');
        await handleStatsCommand(['holdings'], mockContext);
        expect(terminalStats.getHoldingsText).toHaveBeenCalledWith('USD');
        expect(mockContext.appendMessage).toHaveBeenCalledWith('holdings stats');
    });

    it('handles holdings-debug subcommand', async () => {
        terminalStats.getHoldingsDebugText.mockResolvedValue('holdings debug stats');
        await handleStatsCommand(['holdings-debug'], mockContext);
        expect(terminalStats.getHoldingsDebugText).toHaveBeenCalled();
        expect(mockContext.appendMessage).toHaveBeenCalledWith('holdings debug stats');
    });

    it('handles financial subcommand', async () => {
        terminalStats.getFinancialStatsText.mockResolvedValue('financial stats');
        await handleStatsCommand(['financial'], mockContext);
        expect(terminalStats.getFinancialStatsText).toHaveBeenCalled();
        expect(mockContext.appendMessage).toHaveBeenCalledWith('financial stats');
    });

    it('handles technical subcommand', async () => {
        terminalStats.getTechnicalStatsText.mockResolvedValue('technical stats');
        await handleStatsCommand(['technical'], mockContext);
        expect(terminalStats.getTechnicalStatsText).toHaveBeenCalled();
        expect(mockContext.appendMessage).toHaveBeenCalledWith('technical stats');
    });

    it('handles cagr subcommand', async () => {
        terminalStats.getCagrText.mockResolvedValue('cagr stats');
        await handleStatsCommand(['cagr'], mockContext);
        expect(terminalStats.getCagrText).toHaveBeenCalled();
        expect(mockContext.appendMessage).toHaveBeenCalledWith('cagr stats');
    });

    it('handles return subcommand', async () => {
        terminalStats.getAnnualReturnText.mockResolvedValue('return stats');
        await handleStatsCommand(['return'], mockContext);
        expect(terminalStats.getAnnualReturnText).toHaveBeenCalled();
        expect(mockContext.appendMessage).toHaveBeenCalledWith('return stats');
    });

    it('handles ratio subcommand', async () => {
        terminalStats.getRatioText.mockResolvedValue('ratio stats');
        await handleStatsCommand(['ratio'], mockContext);
        expect(terminalStats.getRatioText).toHaveBeenCalled();
        expect(mockContext.appendMessage).toHaveBeenCalledWith('ratio stats');
    });

    it('handles duration subcommand', async () => {
        terminalStats.getDurationStatsText.mockResolvedValue('duration stats');
        await handleStatsCommand(['duration'], mockContext);
        expect(terminalStats.getDurationStatsText).toHaveBeenCalled();
        expect(mockContext.appendMessage).toHaveBeenCalledWith('duration stats');
    });

    it('handles lifespan subcommand', async () => {
        terminalStats.getLifespanStatsText.mockResolvedValue('lifespan stats');
        await handleStatsCommand(['lifespan'], mockContext);
        expect(terminalStats.getLifespanStatsText).toHaveBeenCalled();
        expect(mockContext.appendMessage).toHaveBeenCalledWith('lifespan stats');
    });

    it('handles concentration subcommand', async () => {
        terminalStats.getConcentrationText.mockResolvedValue('concentration stats');
        await handleStatsCommand(['concentration'], mockContext);
        expect(terminalStats.getConcentrationText).toHaveBeenCalled();
        expect(mockContext.appendMessage).toHaveBeenCalledWith('concentration stats');
    });

    it('handles geography subcommand', async () => {
        geographySummary.getGeographySummaryText.mockResolvedValue('geography stats');
        await handleStatsCommand(['geography'], mockContext);
        expect(geographySummary.getGeographySummaryText).toHaveBeenCalled();
        expect(mockContext.appendMessage).toHaveBeenCalledWith('geography stats');
    });

    it('handles unknown subcommand', async () => {
        await handleStatsCommand(['unknown'], mockContext);
        expect(mockContext.appendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Unknown stats subcommand: unknown')
        );
    });

    it('handles missing selectedCurrency', async () => {
        transactionState.selectedCurrency = null;
        terminalStats.getStatsText.mockResolvedValue('transactions stats usd default');
        await handleStatsCommand(['transactions'], mockContext);
        expect(terminalStats.getStatsText).toHaveBeenCalledWith('USD');
        expect(mockContext.appendMessage).toHaveBeenCalledWith('transactions stats usd default');
        transactionState.selectedCurrency = 'USD'; // reset
    });

    it('handles holdings subcommand with missing selectedCurrency', async () => {
        transactionState.selectedCurrency = null;
        terminalStats.getHoldingsText.mockResolvedValue('holdings stats usd default');
        await handleStatsCommand(['holdings'], mockContext);
        expect(terminalStats.getHoldingsText).toHaveBeenCalledWith('USD');
        expect(mockContext.appendMessage).toHaveBeenCalledWith('holdings stats usd default');
        transactionState.selectedCurrency = 'USD'; // reset
    });

    it('does not call appendMessage if result is falsy', async () => {
        terminalStats.getRatioText.mockResolvedValue('');
        await handleStatsCommand(['ratio'], mockContext);
        expect(mockContext.appendMessage).not.toHaveBeenCalled();
    });
});
