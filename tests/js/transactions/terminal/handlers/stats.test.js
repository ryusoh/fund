import { jest } from '@jest/globals';
import { handleStatsCommand } from '../../../../../js/transactions/terminal/handlers/stats.js';

// Setup global fetch and mocks
const mockAppendMessage = jest.fn();

// Mock dependencies directly using jest.mock
jest.mock('../../../../../js/transactions/state.js', () => ({
    transactionState: { selectedCurrency: 'USD' },
}));

jest.mock('../../../../../js/transactions/terminalStats.js', () => ({
    getStatsText: jest.fn(() => Promise.resolve('stats text')),
    getHoldingsText: jest.fn(() => Promise.resolve('holdings text')),
    getHoldingsDebugText: jest.fn(() => Promise.resolve('holdings debug text')),
    getFinancialStatsText: jest.fn(() => Promise.resolve('financial text')),
    getTechnicalStatsText: jest.fn(() => Promise.resolve('technical text')),
    getCagrText: jest.fn(() => Promise.resolve('cagr text')),
    getAnnualReturnText: jest.fn(() => Promise.resolve('return text')),
    getRatioText: jest.fn(() => Promise.resolve('ratio text')),
    getDurationStatsText: jest.fn(() => Promise.resolve('duration text')),
    getLifespanStatsText: jest.fn(() => Promise.resolve('lifespan text')),
    getConcentrationText: jest.fn(() => Promise.resolve('concentration text')),
}));

jest.mock('../../../../../js/transactions/terminal/handlers/geographySummary.js', () => ({
    getGeographySummaryText: jest.fn(() => Promise.resolve('geography text')),
}));

// Need to import the mocked modules to set their implementations correctly per test
import { transactionState } from '../../../../../js/transactions/state.js';
import * as terminalStats from '../../../../../js/transactions/terminalStats.js';
import { getGeographySummaryText } from '../../../../../js/transactions/terminal/handlers/geographySummary.js';

describe('handleStatsCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        transactionState.selectedCurrency = 'USD';
    });

    it('should show help when no args provided', async () => {
        await handleStatsCommand([], { appendMessage: mockAppendMessage });

        expect(mockAppendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Stats commands:\n')
        );
        expect(mockAppendMessage).toHaveBeenCalledWith(
            expect.stringContaining('stats transactions')
        );
    });

    it('should handle transactions subcommand', async () => {
        await handleStatsCommand(['transactions'], { appendMessage: mockAppendMessage });

        expect(terminalStats.getStatsText).toHaveBeenCalledWith('USD');
        expect(mockAppendMessage).toHaveBeenCalledWith('stats text');
    });

    it('should handle transactions and holdings subcommands with fallback currency', async () => {
        transactionState.selectedCurrency = null;

        await handleStatsCommand(['transactions'], { appendMessage: mockAppendMessage });
        expect(terminalStats.getStatsText).toHaveBeenCalledWith('USD');
        expect(mockAppendMessage).toHaveBeenCalledWith('stats text');

        await handleStatsCommand(['holdings'], { appendMessage: mockAppendMessage });
        expect(terminalStats.getHoldingsText).toHaveBeenCalledWith('USD');
        expect(mockAppendMessage).toHaveBeenCalledWith('holdings text');
    });

    it('should handle holdings-debug subcommand', async () => {
        await handleStatsCommand(['holdings-debug'], { appendMessage: mockAppendMessage });

        expect(terminalStats.getHoldingsDebugText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('holdings debug text');
    });

    it('should handle financial subcommand', async () => {
        await handleStatsCommand(['financial'], { appendMessage: mockAppendMessage });

        expect(terminalStats.getFinancialStatsText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('financial text');
    });

    it('should handle technical subcommand', async () => {
        await handleStatsCommand(['technical'], { appendMessage: mockAppendMessage });

        expect(terminalStats.getTechnicalStatsText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('technical text');
    });

    it('should handle cagr subcommand', async () => {
        await handleStatsCommand(['cagr'], { appendMessage: mockAppendMessage });

        expect(terminalStats.getCagrText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('cagr text');
    });

    it('should handle return subcommand', async () => {
        await handleStatsCommand(['return'], { appendMessage: mockAppendMessage });

        expect(terminalStats.getAnnualReturnText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('return text');
    });

    it('should handle ratio subcommand', async () => {
        await handleStatsCommand(['ratio'], { appendMessage: mockAppendMessage });

        expect(terminalStats.getRatioText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('ratio text');
    });

    it('should handle duration subcommand', async () => {
        await handleStatsCommand(['duration'], { appendMessage: mockAppendMessage });

        expect(terminalStats.getDurationStatsText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('duration text');
    });

    it('should handle lifespan subcommand', async () => {
        await handleStatsCommand(['lifespan'], { appendMessage: mockAppendMessage });

        expect(terminalStats.getLifespanStatsText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('lifespan text');
    });

    it('should handle concentration subcommand', async () => {
        await handleStatsCommand(['concentration'], { appendMessage: mockAppendMessage });

        expect(terminalStats.getConcentrationText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('concentration text');
    });

    it('should handle geography subcommand', async () => {
        await handleStatsCommand(['geography'], { appendMessage: mockAppendMessage });

        expect(getGeographySummaryText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('geography text');
    });

    it('should handle unknown subcommand and list available ones', async () => {
        await handleStatsCommand(['unknown'], { appendMessage: mockAppendMessage });

        expect(mockAppendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Unknown stats subcommand: unknown')
        );
        expect(mockAppendMessage).toHaveBeenCalledWith(
            expect.stringContaining(
                'Available: transactions, holdings, holdings-debug, financial, technical, duration, lifespan, concentration, cagr, return, ratio, geography'
            )
        );
    });

    it('should be case insensitive', async () => {
        await handleStatsCommand(['CAGR'], { appendMessage: mockAppendMessage });
        expect(terminalStats.getCagrText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('cagr text');
    });

    it('should handle empty result gracefully', async () => {
        terminalStats.getStatsText.mockResolvedValueOnce('');
        await handleStatsCommand(['transactions'], { appendMessage: mockAppendMessage });

        expect(mockAppendMessage).not.toHaveBeenCalled();
    });
});
