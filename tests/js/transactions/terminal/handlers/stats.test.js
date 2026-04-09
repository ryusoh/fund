import { jest } from '@jest/globals';

jest.mock('@js/transactions/state.js', () => ({
    transactionState: {
        selectedCurrency: 'USD',
    },
}));

jest.mock('@js/transactions/terminalStats.js', () => ({
    getStatsText: jest.fn(() => 'transactions stats'),
    getHoldingsText: jest.fn(() => 'holdings stats'),
    getHoldingsDebugText: jest.fn(() => 'holdings debug stats'),
    getCagrText: jest.fn(() => 'cagr stats'),
    getAnnualReturnText: jest.fn(() => 'annual return stats'),
    getRatioText: jest.fn(() => 'ratio stats'),
    getDurationStatsText: jest.fn(() => 'duration stats'),
    getLifespanStatsText: jest.fn(() => 'lifespan stats'),
    getConcentrationText: jest.fn(() => 'concentration stats'),
    getFinancialStatsText: jest.fn(() => 'financial stats'),
    getTechnicalStatsText: jest.fn(() => 'technical stats'),
}));

jest.mock('@js/transactions/terminal/handlers/geographySummary.js', () => ({
    getGeographySummaryText: jest.fn(() => 'geography stats'),
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

describe('handleStatsCommand', () => {
    let appendMessageMock;
    let handleStatsCommand;

    beforeEach(async () => {
        jest.clearAllMocks();
        appendMessageMock = jest.fn();
        const module = await import('@js/transactions/terminal/handlers/stats.js');
        handleStatsCommand = module.handleStatsCommand;
    });

    test('prints help text when no arguments are provided', async () => {
        await handleStatsCommand([], { appendMessage: appendMessageMock });

        expect(appendMessageMock).toHaveBeenCalledTimes(1);
        const arg = appendMessageMock.mock.calls[0][0];
        expect(arg).toContain('Stats commands:');
        expect(arg).toContain('Usage: stats <subcommand> or s <subcommand>');
    });

    test('handles "transactions" subcommand', async () => {
        await handleStatsCommand(['transactions'], { appendMessage: appendMessageMock });
        expect(appendMessageMock).toHaveBeenCalledWith('transactions stats');
    });

    test('handles "holdings" subcommand', async () => {
        await handleStatsCommand(['holdings'], { appendMessage: appendMessageMock });
        expect(appendMessageMock).toHaveBeenCalledWith('holdings stats');
    });

    test('handles "holdings-debug" subcommand', async () => {
        await handleStatsCommand(['holdings-debug'], { appendMessage: appendMessageMock });
        expect(appendMessageMock).toHaveBeenCalledWith('holdings debug stats');
    });

    test('handles "financial" subcommand', async () => {
        await handleStatsCommand(['financial'], { appendMessage: appendMessageMock });
        expect(appendMessageMock).toHaveBeenCalledWith('financial stats');
    });

    test('handles "technical" subcommand', async () => {
        await handleStatsCommand(['technical'], { appendMessage: appendMessageMock });
        expect(appendMessageMock).toHaveBeenCalledWith('technical stats');
    });

    test('handles "cagr" subcommand', async () => {
        await handleStatsCommand(['cagr'], { appendMessage: appendMessageMock });
        expect(appendMessageMock).toHaveBeenCalledWith('cagr stats');
    });

    test('handles "return" subcommand', async () => {
        await handleStatsCommand(['return'], { appendMessage: appendMessageMock });
        expect(appendMessageMock).toHaveBeenCalledWith('annual return stats');
    });

    test('handles "ratio" subcommand', async () => {
        await handleStatsCommand(['ratio'], { appendMessage: appendMessageMock });
        expect(appendMessageMock).toHaveBeenCalledWith('ratio stats');
    });

    test('handles "duration" subcommand', async () => {
        await handleStatsCommand(['duration'], { appendMessage: appendMessageMock });
        expect(appendMessageMock).toHaveBeenCalledWith('duration stats');
    });

    test('handles "lifespan" subcommand', async () => {
        await handleStatsCommand(['lifespan'], { appendMessage: appendMessageMock });
        expect(appendMessageMock).toHaveBeenCalledWith('lifespan stats');
    });

    test('handles "concentration" subcommand', async () => {
        await handleStatsCommand(['concentration'], { appendMessage: appendMessageMock });
        expect(appendMessageMock).toHaveBeenCalledWith('concentration stats');
    });

    test('handles "geography" subcommand', async () => {
        await handleStatsCommand(['geography'], { appendMessage: appendMessageMock });
        expect(appendMessageMock).toHaveBeenCalledWith('geography stats');
    });

    test('handles unknown subcommands and lists available subcommands', async () => {
        await handleStatsCommand(['invalid_command'], { appendMessage: appendMessageMock });

        expect(appendMessageMock).toHaveBeenCalledTimes(1);
        const arg = appendMessageMock.mock.calls[0][0];
        expect(arg).toContain('Unknown stats subcommand: invalid_command');
        expect(arg).toContain('Available: transactions, holdings, financial');
    });

    test('is case insensitive', async () => {
        await handleStatsCommand(['CAGR'], { appendMessage: appendMessageMock });
        expect(appendMessageMock).toHaveBeenCalledWith('cagr stats');
    });
});
