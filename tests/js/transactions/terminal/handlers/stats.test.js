import { handleStatsCommand, _coverage_dummy } from '@js/transactions/terminal/handlers/stats.js';
import * as terminalStats from '@js/transactions/terminalStats.js';
import * as geographySummary from '@js/transactions/terminal/handlers/geographySummary.js';

jest.mock('@js/transactions/state.js', () => ({
    transactionState: {
        selectedCurrency: 'USD'
    }
}));

jest.mock('@js/transactions/terminalStats.js', () => ({
    getStatsText: jest.fn().mockResolvedValue('Stats text'),
    getHoldingsText: jest.fn().mockResolvedValue('Holdings text'),
    getHoldingsDebugText: jest.fn().mockResolvedValue('Holdings debug text'),
    getCagrText: jest.fn().mockResolvedValue('CAGR text'),
    getAnnualReturnText: jest.fn().mockResolvedValue('Return text'),
    getRatioText: jest.fn().mockResolvedValue('Ratio text'),
    getDurationStatsText: jest.fn().mockResolvedValue('Duration text'),
    getLifespanStatsText: jest.fn().mockResolvedValue('Lifespan text'),
    getConcentrationText: jest.fn().mockResolvedValue('Concentration text'),
    getFinancialStatsText: jest.fn().mockResolvedValue('Financial text'),
    getTechnicalStatsText: jest.fn().mockResolvedValue('Technical text')
}));

jest.mock('@js/transactions/terminal/handlers/geographySummary.js', () => ({
    getGeographySummaryText: jest.fn().mockResolvedValue('Geography text')
}));

describe('stats handler', () => {
    let appendMessageMock;

    beforeEach(() => {
        appendMessageMock = jest.fn();
        jest.clearAllMocks();
    });

    it('should export _coverage_dummy as true', () => {
        expect(_coverage_dummy).toBe(true);
    });

    it('should handle empty args by showing help', async () => {
        await handleStatsCommand([], { appendMessage: appendMessageMock });
        expect(appendMessageMock).toHaveBeenCalledWith(expect.stringContaining('Stats commands:'));
    });

    it('should handle transactions subcommand', async () => {
        await handleStatsCommand(['transactions'], { appendMessage: appendMessageMock });
        expect(terminalStats.getStatsText).toHaveBeenCalledWith('USD');
        expect(appendMessageMock).toHaveBeenCalledWith('Stats text');
    });

    it('should handle holdings subcommand', async () => {
        await handleStatsCommand(['holdings'], { appendMessage: appendMessageMock });
        expect(terminalStats.getHoldingsText).toHaveBeenCalledWith('USD');
        expect(appendMessageMock).toHaveBeenCalledWith('Holdings text');
    });

    it('should handle holdings-debug subcommand', async () => {
        await handleStatsCommand(['holdings-debug'], { appendMessage: appendMessageMock });
        expect(terminalStats.getHoldingsDebugText).toHaveBeenCalled();
        expect(appendMessageMock).toHaveBeenCalledWith('Holdings debug text');
    });

    it('should handle financial subcommand', async () => {
        await handleStatsCommand(['financial'], { appendMessage: appendMessageMock });
        expect(terminalStats.getFinancialStatsText).toHaveBeenCalled();
        expect(appendMessageMock).toHaveBeenCalledWith('Financial text');
    });

    it('should handle technical subcommand', async () => {
        await handleStatsCommand(['technical'], { appendMessage: appendMessageMock });
        expect(terminalStats.getTechnicalStatsText).toHaveBeenCalled();
        expect(appendMessageMock).toHaveBeenCalledWith('Technical text');
    });

    it('should handle cagr subcommand', async () => {
        await handleStatsCommand(['cagr'], { appendMessage: appendMessageMock });
        expect(terminalStats.getCagrText).toHaveBeenCalled();
        expect(appendMessageMock).toHaveBeenCalledWith('CAGR text');
    });

    it('should handle return subcommand', async () => {
        await handleStatsCommand(['return'], { appendMessage: appendMessageMock });
        expect(terminalStats.getAnnualReturnText).toHaveBeenCalled();
        expect(appendMessageMock).toHaveBeenCalledWith('Return text');
    });

    it('should handle ratio subcommand', async () => {
        await handleStatsCommand(['ratio'], { appendMessage: appendMessageMock });
        expect(terminalStats.getRatioText).toHaveBeenCalled();
        expect(appendMessageMock).toHaveBeenCalledWith('Ratio text');
    });

    it('should handle duration subcommand', async () => {
        await handleStatsCommand(['duration'], { appendMessage: appendMessageMock });
        expect(terminalStats.getDurationStatsText).toHaveBeenCalled();
        expect(appendMessageMock).toHaveBeenCalledWith('Duration text');
    });

    it('should handle lifespan subcommand', async () => {
        await handleStatsCommand(['lifespan'], { appendMessage: appendMessageMock });
        expect(terminalStats.getLifespanStatsText).toHaveBeenCalled();
        expect(appendMessageMock).toHaveBeenCalledWith('Lifespan text');
    });

    it('should handle concentration subcommand', async () => {
        await handleStatsCommand(['concentration'], { appendMessage: appendMessageMock });
        expect(terminalStats.getConcentrationText).toHaveBeenCalled();
        expect(appendMessageMock).toHaveBeenCalledWith('Concentration text');
    });

    it('should handle geography subcommand', async () => {
        await handleStatsCommand(['geography'], { appendMessage: appendMessageMock });
        expect(geographySummary.getGeographySummaryText).toHaveBeenCalled();
        expect(appendMessageMock).toHaveBeenCalledWith('Geography text');
    });

    it('should handle unknown subcommand', async () => {
        await handleStatsCommand(['unknown'], { appendMessage: appendMessageMock });
        expect(appendMessageMock).toHaveBeenCalledWith(expect.stringContaining('Unknown stats subcommand: unknown'));
    });
});
