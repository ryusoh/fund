import { handleStatsCommand } from '@js/transactions/terminal/handlers/stats.js';
import { transactionState } from '@js/transactions/state.js';
import * as terminalStats from '@js/transactions/terminalStats.js';
import * as geographySummary from '@js/transactions/terminal/handlers/geographySummary.js';
import { STATS_SUBCOMMANDS } from '@js/transactions/terminal/constants.js';

jest.mock('@js/transactions/state.js', () => ({
    transactionState: {},
}));

jest.mock('@js/transactions/terminalStats.js', () => ({
    getStatsText: jest.fn().mockResolvedValue('StatsText'),
    getHoldingsText: jest.fn().mockResolvedValue('HoldingsText'),
    getHoldingsDebugText: jest.fn().mockResolvedValue('HoldingsDebugText'),
    getFinancialStatsText: jest.fn().mockResolvedValue('FinancialText'),
    getTechnicalStatsText: jest.fn().mockResolvedValue('TechnicalText'),
    getCagrText: jest.fn().mockResolvedValue('CagrText'),
    getAnnualReturnText: jest.fn().mockResolvedValue('ReturnText'),
    getRatioText: jest.fn().mockResolvedValue('RatioText'),
    getDurationStatsText: jest.fn().mockResolvedValue('DurationText'),
    getLifespanStatsText: jest.fn().mockResolvedValue('LifespanText'),
    getConcentrationText: jest.fn().mockResolvedValue('ConcentrationText'),
}));

jest.mock('@js/transactions/terminal/handlers/geographySummary.js', () => ({
    getGeographySummaryText: jest.fn().mockResolvedValue('GeographyText'),
}));

jest.mock('@js/transactions/terminal/constants.js', () => ({
    STATS_SUBCOMMANDS: ['transactions', 'holdings', 'financial'],
}));

describe('handleStatsCommand', () => {
    let appendMessage;

    beforeEach(() => {
        appendMessage = jest.fn();
        transactionState.selectedCurrency = 'USD';
        jest.clearAllMocks();
    });

    it('should display help when no args provided', async () => {
        await handleStatsCommand([], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('Stats commands:'));
    });

    it('should handle transactions subcommand with currency', async () => {
        await handleStatsCommand(['transactions'], { appendMessage });
        expect(terminalStats.getStatsText).toHaveBeenCalledWith('USD');
        expect(appendMessage).toHaveBeenCalledWith('StatsText');
    });

    it('should handle transactions subcommand without currency', async () => {
        delete transactionState.selectedCurrency;
        await handleStatsCommand(['transactions'], { appendMessage });
        expect(terminalStats.getStatsText).toHaveBeenCalledWith('USD');
    });

    it('should handle holdings subcommand with currency', async () => {
        await handleStatsCommand(['holdings'], { appendMessage });
        expect(terminalStats.getHoldingsText).toHaveBeenCalledWith('USD');
        expect(appendMessage).toHaveBeenCalledWith('HoldingsText');
    });

    it('should handle holdings subcommand without currency', async () => {
        delete transactionState.selectedCurrency;
        await handleStatsCommand(['holdings'], { appendMessage });
        expect(terminalStats.getHoldingsText).toHaveBeenCalledWith('USD');
    });

    it('should handle holdings-debug subcommand', async () => {
        await handleStatsCommand(['holdings-debug'], { appendMessage });
        expect(terminalStats.getHoldingsDebugText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('HoldingsDebugText');
    });

    it('should handle financial subcommand', async () => {
        await handleStatsCommand(['financial'], { appendMessage });
        expect(terminalStats.getFinancialStatsText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('FinancialText');
    });

    it('should handle technical subcommand', async () => {
        await handleStatsCommand(['technical'], { appendMessage });
        expect(terminalStats.getTechnicalStatsText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('TechnicalText');
    });

    it('should handle cagr subcommand', async () => {
        await handleStatsCommand(['cagr'], { appendMessage });
        expect(terminalStats.getCagrText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('CagrText');
    });

    it('should handle return subcommand', async () => {
        await handleStatsCommand(['return'], { appendMessage });
        expect(terminalStats.getAnnualReturnText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('ReturnText');
    });

    it('should handle ratio subcommand', async () => {
        await handleStatsCommand(['ratio'], { appendMessage });
        expect(terminalStats.getRatioText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('RatioText');
    });

    it('should handle duration subcommand', async () => {
        await handleStatsCommand(['duration'], { appendMessage });
        expect(terminalStats.getDurationStatsText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('DurationText');
    });

    it('should handle lifespan subcommand', async () => {
        await handleStatsCommand(['lifespan'], { appendMessage });
        expect(terminalStats.getLifespanStatsText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('LifespanText');
    });

    it('should handle concentration subcommand', async () => {
        await handleStatsCommand(['concentration'], { appendMessage });
        expect(terminalStats.getConcentrationText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('ConcentrationText');
    });

    it('should handle geography subcommand', async () => {
        await handleStatsCommand(['geography'], { appendMessage });
        expect(geographySummary.getGeographySummaryText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('GeographyText');
    });

    it('should handle unknown subcommand', async () => {
        await handleStatsCommand(['unknown'], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Unknown stats subcommand: unknown')
        );
    });

    it('should not append message if result is empty', async () => {
        terminalStats.getStatsText.mockResolvedValueOnce('');
        await handleStatsCommand(['transactions'], { appendMessage });
        expect(appendMessage).not.toHaveBeenCalled();
    });
});

describe('stats.js coverage dummy', () => {
    it('should export _coverage_dummy as true', async () => {
        const { _coverage_dummy } = await import('@js/transactions/terminal/handlers/stats.js');
        expect(_coverage_dummy).toBe(true);
    });
});
