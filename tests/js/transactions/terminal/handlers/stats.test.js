import { handleStatsCommand } from '@js/transactions/terminal/handlers/stats.js';
import { transactionState } from '@js/transactions/state.js';
import * as terminalStats from '@js/transactions/terminalStats.js';
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
    getFinancialStatsText: jest.fn(() => Promise.resolve('Financial Stats Text')),
    getTechnicalStatsText: jest.fn(() => Promise.resolve('Technical Stats Text')),
    getCagrText: jest.fn(() => Promise.resolve('CAGR Text')),
    getAnnualReturnText: jest.fn(() => Promise.resolve('Annual Return Text')),
    getRatioText: jest.fn(() => Promise.resolve('Ratio Text')),
    getDurationStatsText: jest.fn(() => Promise.resolve('Duration Text')),
    getLifespanStatsText: jest.fn(() => Promise.resolve('Lifespan Text')),
    getConcentrationText: jest.fn(() => Promise.resolve('Concentration Text')),
}));

jest.mock('@js/transactions/terminal/handlers/geographySummary.js', () => ({
    getGeographySummaryText: jest.fn(() => Promise.resolve('Geography Summary Text')),
}));

jest.mock('@js/transactions/terminal/constants.js', () => ({
    STATS_SUBCOMMANDS: [
        'transactions',
        'holdings',
        'financial',
        'technical',
        'duration',
        'lifespan',
        'concentration',
        'cagr',
        'return',
        'ratio',
        'geography',
    ],
}));

describe('stats command handler', () => {
    let appendMessage;

    beforeEach(() => {
        jest.clearAllMocks();
        appendMessage = jest.fn();
    });

    it('shows help when no subcommand is provided', async () => {
        await handleStatsCommand([], { appendMessage });
        expect(appendMessage).toHaveBeenCalled();
        expect(appendMessage.mock.calls[0][0]).toContain('Stats commands:');
    });

    const commandTests = [
        ['transactions', terminalStats.getStatsText, 'Stats Text'],
        ['holdings', terminalStats.getHoldingsText, 'Holdings Text'],
        ['holdings-debug', terminalStats.getHoldingsDebugText, 'Holdings Debug Text'],
        ['financial', terminalStats.getFinancialStatsText, 'Financial Stats Text'],
        ['technical', terminalStats.getTechnicalStatsText, 'Technical Stats Text'],
        ['cagr', terminalStats.getCagrText, 'CAGR Text'],
        ['return', terminalStats.getAnnualReturnText, 'Annual Return Text'],
        ['ratio', terminalStats.getRatioText, 'Ratio Text'],
        ['duration', terminalStats.getDurationStatsText, 'Duration Text'],
        ['lifespan', terminalStats.getLifespanStatsText, 'Lifespan Text'],
        ['concentration', terminalStats.getConcentrationText, 'Concentration Text'],
        ['geography', getGeographySummaryText, 'Geography Summary Text'],
    ];

    commandTests.forEach(([subcommand, mockFn, expectedText]) => {
        it(`handles ${subcommand} subcommand`, async () => {
            await handleStatsCommand([subcommand], { appendMessage });
            expect(mockFn).toHaveBeenCalled();
            expect(appendMessage).toHaveBeenCalledWith(expectedText);
        });
    });

    it('handles unknown subcommand', async () => {
        await handleStatsCommand(['unknown'], { appendMessage });
        expect(appendMessage).toHaveBeenCalled();
        expect(appendMessage.mock.calls[0][0]).toContain('Unknown stats subcommand: unknown');
    });

    it('uses USD as fallback currency when transactionState.selectedCurrency is null', async () => {
        transactionState.selectedCurrency = null;
        await handleStatsCommand(['transactions'], { appendMessage });
        expect(terminalStats.getStatsText).toHaveBeenCalledWith('USD');
    });

    it('uses USD as fallback currency for holdings when transactionState.selectedCurrency is null', async () => {
        transactionState.selectedCurrency = null;
        await handleStatsCommand(['holdings'], { appendMessage });
        expect(terminalStats.getHoldingsText).toHaveBeenCalledWith('USD');
    });

    it('does not append message if result is empty', async () => {
        terminalStats.getStatsText.mockResolvedValueOnce('');
        await handleStatsCommand(['transactions'], { appendMessage });
        expect(appendMessage).not.toHaveBeenCalled();
    });
});
