import { handleStatsCommand } from '../../../../../js/transactions/terminal/handlers/stats.js';
import * as terminalStats from '../../../../../js/transactions/terminalStats.js';
import * as geographySummary from '../../../../../js/transactions/terminal/handlers/geographySummary.js';
import { transactionState } from '../../../../../js/transactions/state.js';

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

jest.mock('../../../../../js/transactions/terminal/constants.js', () => ({
    STATS_SUBCOMMANDS: ['transactions', 'holdings'], // mocked for fallback
}));

describe('handleStatsCommand', () => {
    let mockAppendMessage;

    beforeEach(() => {
        mockAppendMessage = jest.fn();
        jest.clearAllMocks();
    });

    it('displays help when no arguments provided', async () => {
        await handleStatsCommand([], { appendMessage: mockAppendMessage });
        expect(mockAppendMessage).toHaveBeenCalledWith(expect.stringContaining('Stats commands:'));
    });

    it('handles transactions subcommand', async () => {
        terminalStats.getStatsText.mockResolvedValue('Mock Stats');
        await handleStatsCommand(['transactions'], { appendMessage: mockAppendMessage });
        expect(terminalStats.getStatsText).toHaveBeenCalledWith('USD');
        expect(mockAppendMessage).toHaveBeenCalledWith('Mock Stats');
    });

    it('handles transactions subcommand falling back to USD', async () => {
        const originalCurrency = transactionState.selectedCurrency;
        transactionState.selectedCurrency = undefined;
        terminalStats.getStatsText.mockResolvedValue('Mock Stats');
        await handleStatsCommand(['transactions'], { appendMessage: mockAppendMessage });
        expect(terminalStats.getStatsText).toHaveBeenCalledWith('USD');
        expect(mockAppendMessage).toHaveBeenCalledWith('Mock Stats');
        transactionState.selectedCurrency = originalCurrency;
    });

    it('handles holdings subcommand', async () => {
        terminalStats.getHoldingsText.mockResolvedValue('Mock Holdings');
        await handleStatsCommand(['holdings'], { appendMessage: mockAppendMessage });
        expect(terminalStats.getHoldingsText).toHaveBeenCalledWith('USD');
        expect(mockAppendMessage).toHaveBeenCalledWith('Mock Holdings');
    });

    it('handles holdings subcommand falling back to USD', async () => {
        const originalCurrency = transactionState.selectedCurrency;
        transactionState.selectedCurrency = null;
        terminalStats.getHoldingsText.mockResolvedValue('Mock Holdings');
        await handleStatsCommand(['holdings'], { appendMessage: mockAppendMessage });
        expect(terminalStats.getHoldingsText).toHaveBeenCalledWith('USD');
        expect(mockAppendMessage).toHaveBeenCalledWith('Mock Holdings');
        transactionState.selectedCurrency = originalCurrency;
    });

    it('handles holdings-debug subcommand', async () => {
        terminalStats.getHoldingsDebugText.mockResolvedValue('Mock Debug');
        await handleStatsCommand(['holdings-debug'], { appendMessage: mockAppendMessage });
        expect(terminalStats.getHoldingsDebugText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('Mock Debug');
    });

    it('handles financial subcommand', async () => {
        terminalStats.getFinancialStatsText.mockResolvedValue('Mock Fin');
        await handleStatsCommand(['financial'], { appendMessage: mockAppendMessage });
        expect(terminalStats.getFinancialStatsText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('Mock Fin');
    });

    it('handles technical subcommand', async () => {
        terminalStats.getTechnicalStatsText.mockResolvedValue('Mock Tech');
        await handleStatsCommand(['technical'], { appendMessage: mockAppendMessage });
        expect(terminalStats.getTechnicalStatsText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('Mock Tech');
    });

    it('handles cagr subcommand', async () => {
        terminalStats.getCagrText.mockResolvedValue('Mock Cagr');
        await handleStatsCommand(['cagr'], { appendMessage: mockAppendMessage });
        expect(terminalStats.getCagrText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('Mock Cagr');
    });

    it('handles return subcommand', async () => {
        terminalStats.getAnnualReturnText.mockResolvedValue('Mock Ret');
        await handleStatsCommand(['return'], { appendMessage: mockAppendMessage });
        expect(terminalStats.getAnnualReturnText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('Mock Ret');
    });

    it('handles ratio subcommand', async () => {
        terminalStats.getRatioText.mockResolvedValue('Mock Ratio');
        await handleStatsCommand(['ratio'], { appendMessage: mockAppendMessage });
        expect(terminalStats.getRatioText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('Mock Ratio');
    });

    it('handles duration subcommand', async () => {
        terminalStats.getDurationStatsText.mockResolvedValue('Mock Dur');
        await handleStatsCommand(['duration'], { appendMessage: mockAppendMessage });
        expect(terminalStats.getDurationStatsText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('Mock Dur');
    });

    it('handles lifespan subcommand', async () => {
        terminalStats.getLifespanStatsText.mockResolvedValue('Mock Life');
        await handleStatsCommand(['lifespan'], { appendMessage: mockAppendMessage });
        expect(terminalStats.getLifespanStatsText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('Mock Life');
    });

    it('handles concentration subcommand', async () => {
        terminalStats.getConcentrationText.mockResolvedValue('Mock Conc');
        await handleStatsCommand(['concentration'], { appendMessage: mockAppendMessage });
        expect(terminalStats.getConcentrationText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('Mock Conc');
    });

    it('handles geography subcommand', async () => {
        geographySummary.getGeographySummaryText.mockResolvedValue('Mock Geo');
        await handleStatsCommand(['geography'], { appendMessage: mockAppendMessage });
        expect(geographySummary.getGeographySummaryText).toHaveBeenCalled();
        expect(mockAppendMessage).toHaveBeenCalledWith('Mock Geo');
    });

    it('handles unknown subcommand', async () => {
        await handleStatsCommand(['unknown_cmd'], { appendMessage: mockAppendMessage });
        expect(mockAppendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Unknown stats subcommand: unknown_cmd')
        );
    });

    it('does not append message if result is empty string', async () => {
        terminalStats.getDurationStatsText.mockResolvedValue('');
        await handleStatsCommand(['duration'], { appendMessage: mockAppendMessage });
        expect(terminalStats.getDurationStatsText).toHaveBeenCalled();
        expect(mockAppendMessage).not.toHaveBeenCalled();
    });
});
