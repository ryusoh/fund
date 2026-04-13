import { handleStatsCommand } from '@js/transactions/terminal/handlers/stats.js';
import { transactionState } from '@js/transactions/state.js';
import {
    getStatsText,
    getHoldingsText,
    getHoldingsDebugText,
    getCagrText,
    getAnnualReturnText,
    getRatioText,
    getDurationStatsText,
    getLifespanStatsText,
    getConcentrationText,
    getFinancialStatsText,
    getTechnicalStatsText,
} from '@js/transactions/terminalStats.js';
import { getGeographySummaryText } from '@js/transactions/terminal/handlers/geographySummary.js';

jest.mock('@js/transactions/state.js', () => ({
    transactionState: {
        selectedCurrency: 'USD',
    },
}));

jest.mock('@js/transactions/terminalStats.js', () => ({
    getStatsText: jest.fn(() => Promise.resolve('Stats Text')),
    getHoldingsText: jest.fn(() => Promise.resolve('Holdings Text')),
    getHoldingsDebugText: jest.fn(() => Promise.resolve('Holdings Debug Text')),
    getCagrText: jest.fn(() => Promise.resolve('CAGR Text')),
    getAnnualReturnText: jest.fn(() => Promise.resolve('Annual Return Text')),
    getRatioText: jest.fn(() => Promise.resolve('Ratio Text')),
    getDurationStatsText: jest.fn(() => Promise.resolve('Duration Stats Text')),
    getLifespanStatsText: jest.fn(() => Promise.resolve('Lifespan Stats Text')),
    getConcentrationText: jest.fn(() => Promise.resolve('Concentration Text')),
    getFinancialStatsText: jest.fn(() => Promise.resolve('Financial Stats Text')),
    getTechnicalStatsText: jest.fn(() => Promise.resolve('Technical Stats Text')),
}));

jest.mock('@js/transactions/terminal/handlers/geographySummary.js', () => ({
    getGeographySummaryText: jest.fn(() => Promise.resolve('Geography Summary Text')),
}));

jest.mock('@js/transactions/terminal/constants.js', () => ({
    STATS_SUBCOMMANDS: ['transactions', 'holdings'],
}));

describe('handleStatsCommand', () => {
    let appendMessage;

    beforeEach(() => {
        jest.clearAllMocks();
        appendMessage = jest.fn();
    });

    it('should show help if no args are provided', async () => {
        await handleStatsCommand([], { appendMessage });
        expect(appendMessage).toHaveBeenCalled();
        expect(appendMessage.mock.calls[0][0]).toContain('Stats commands:');
    });

    it('should handle transactions subcommand', async () => {
        await handleStatsCommand(['transactions'], { appendMessage });
        expect(getStatsText).toHaveBeenCalledWith('USD');
        expect(appendMessage).toHaveBeenCalledWith('Stats Text');
    });

    it('should handle holdings subcommand', async () => {
        await handleStatsCommand(['holdings'], { appendMessage });
        expect(getHoldingsText).toHaveBeenCalledWith('USD');
        expect(appendMessage).toHaveBeenCalledWith('Holdings Text');
    });

    it('should handle holdings-debug subcommand', async () => {
        await handleStatsCommand(['holdings-debug'], { appendMessage });
        expect(getHoldingsDebugText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Holdings Debug Text');
    });

    it('should handle financial subcommand', async () => {
        await handleStatsCommand(['financial'], { appendMessage });
        expect(getFinancialStatsText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Financial Stats Text');
    });

    it('should handle technical subcommand', async () => {
        await handleStatsCommand(['technical'], { appendMessage });
        expect(getTechnicalStatsText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Technical Stats Text');
    });

    it('should handle cagr subcommand', async () => {
        await handleStatsCommand(['cagr'], { appendMessage });
        expect(getCagrText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('CAGR Text');
    });

    it('should handle return subcommand', async () => {
        await handleStatsCommand(['return'], { appendMessage });
        expect(getAnnualReturnText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Annual Return Text');
    });

    it('should handle ratio subcommand', async () => {
        await handleStatsCommand(['ratio'], { appendMessage });
        expect(getRatioText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Ratio Text');
    });

    it('should handle duration subcommand', async () => {
        await handleStatsCommand(['duration'], { appendMessage });
        expect(getDurationStatsText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Duration Stats Text');
    });

    it('should handle lifespan subcommand', async () => {
        await handleStatsCommand(['lifespan'], { appendMessage });
        expect(getLifespanStatsText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Lifespan Stats Text');
    });

    it('should handle concentration subcommand', async () => {
        await handleStatsCommand(['concentration'], { appendMessage });
        expect(getConcentrationText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Concentration Text');
    });

    it('should handle geography subcommand', async () => {
        await handleStatsCommand(['geography'], { appendMessage });
        expect(getGeographySummaryText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('Geography Summary Text');
    });

    it('should handle unknown subcommand', async () => {
        await handleStatsCommand(['unknown'], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Unknown stats subcommand: unknown')
        );
    });

    it('should handle transactions subcommand without selectedCurrency', async () => {
        transactionState.selectedCurrency = undefined;
        const appendMessage = jest.fn();
        await handleStatsCommand(['transactions'], { appendMessage });
        expect(getStatsText).toHaveBeenCalledWith('USD');
        expect(appendMessage).toHaveBeenCalledWith('Stats Text');
    });

    it('should handle holdings subcommand without selectedCurrency', async () => {
        transactionState.selectedCurrency = undefined;
        const appendMessage = jest.fn();
        await handleStatsCommand(['holdings'], { appendMessage });
        expect(getHoldingsText).toHaveBeenCalledWith('USD');
        expect(appendMessage).toHaveBeenCalledWith('Holdings Text');
    });

    it('should handle falsy result', async () => {
        getStatsText.mockResolvedValueOnce('');
        const appendMessage = jest.fn();
        await handleStatsCommand(['transactions'], { appendMessage });
        expect(appendMessage).not.toHaveBeenCalled();
    });
});
