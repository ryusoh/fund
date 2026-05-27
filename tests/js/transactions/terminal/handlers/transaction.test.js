import { handleTransactionCommand, handleDefaultCommand } from '../../../../../js/transactions/terminal/handlers/transaction.js';
import { transactionState, setChartDateRange } from '../../../../../js/transactions/state.js';
import * as viewUtils from '../../../../../js/transactions/terminal/viewUtils.js';
import * as dateUtils from '../../../../../js/transactions/terminal/dateUtils.js';
import * as terminalStats from '../../../../../js/transactions/terminalStats.js';
import * as zoom from '../../../../../js/transactions/zoom.js';

// Mocks
jest.mock('../../../../../js/transactions/state.js', () => ({
    transactionState: {
        activeFilterTerm: '',
        activeChart: 'performance',
        selectedCurrency: 'USD'
    },
    setChartDateRange: jest.fn()
}));

jest.mock('../../../../../js/transactions/terminal/viewUtils.js', () => ({
    isTransactionTableVisible: jest.fn(),
    getActiveChartSummaryText: jest.fn(),
    ensureTransactionTableVisible: jest.fn(),
    isActiveChartVisible: jest.fn()
}));

jest.mock('../../../../../js/transactions/terminal/dateUtils.js', () => ({
    updateContextYearFromRange: jest.fn(),
    parseSimplifiedDateRange: jest.fn(),
    formatDateRange: jest.fn()
}));

jest.mock('../../../../../js/transactions/zoom.js', () => ({
    toggleZoom: jest.fn(),
    getZoomState: jest.fn()
}));

jest.mock('../../../../../js/transactions/terminalStats.js', () => ({
    getDynamicStatsText: jest.fn()
}));

describe('Transaction Command Handler', () => {
    let mockContext;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = {
            toggleTable: jest.fn(),
            filterAndSort: jest.fn(),
            chartManager: { update: jest.fn() },
            appendMessage: jest.fn()
        };
    });

    describe('handleTransactionCommand', () => {
        it('should toggle table when no args provided and return instructions', async () => {
            await handleTransactionCommand([], mockContext);
            expect(mockContext.toggleTable).toHaveBeenCalled();
            expect(mockContext.appendMessage).toHaveBeenCalledWith(expect.stringContaining('Toggled transaction table'));
        });

        it('should apply valid date filter to table when table is visible', async () => {
            // Setup table visible, chart hidden
            viewUtils.isActiveChartVisible.mockReturnValue(false);
            viewUtils.isTransactionTableVisible.mockReturnValue(true);
            viewUtils.ensureTransactionTableVisible.mockReturnValue(true);

            const mockRange = { from: new Date('2023-01-01'), to: new Date('2023-12-31') };
            dateUtils.parseSimplifiedDateRange.mockReturnValue(mockRange);
            dateUtils.formatDateRange.mockReturnValue('2023');

            await handleTransactionCommand(['2023'], mockContext);

            expect(dateUtils.parseSimplifiedDateRange).toHaveBeenCalledWith('2023');
            expect(setChartDateRange).toHaveBeenCalledWith(mockRange);
            expect(dateUtils.updateContextYearFromRange).toHaveBeenCalledWith(mockRange);
            expect(mockContext.filterAndSort).toHaveBeenCalledWith('');
            expect(mockContext.appendMessage).toHaveBeenCalledWith(expect.stringContaining('Applied date filter 2023 to transactions table'));
        });

        it('should apply valid date filter to active chart when chart is visible', async () => {
            viewUtils.isActiveChartVisible.mockReturnValue(true);
            viewUtils.getActiveChartSummaryText.mockResolvedValue('Chart summary');

            const mockRange = { from: new Date('2023-01-01'), to: new Date('2023-12-31') };
            dateUtils.parseSimplifiedDateRange.mockReturnValue(mockRange);
            dateUtils.formatDateRange.mockReturnValue('2023');

            await handleTransactionCommand(['2023'], mockContext);

            expect(setChartDateRange).toHaveBeenCalledWith(mockRange);
            expect(mockContext.chartManager.update).toHaveBeenCalled();
            expect(mockContext.appendMessage).toHaveBeenCalledWith(expect.stringContaining('Applied date filter 2023 to performance chart.'));
            expect(mockContext.appendMessage).toHaveBeenCalledWith(expect.stringContaining('Chart summary'));
        });

        it('should fallback to filter string if invalid date range', async () => {
            dateUtils.parseSimplifiedDateRange.mockReturnValue({ from: null, to: null });
            viewUtils.getActiveChartSummaryText.mockResolvedValue('Chart summary');

            await handleTransactionCommand(['invalid'], mockContext);

            expect(mockContext.filterAndSort).toHaveBeenCalledWith('invalid');
            expect(mockContext.appendMessage).toHaveBeenCalledWith(expect.stringContaining('Filtering transactions by: "invalid"'));
            expect(mockContext.appendMessage).toHaveBeenCalledWith(expect.stringContaining('Chart summary'));
            expect(setChartDateRange).not.toHaveBeenCalled();
        });

        it('should append stats text if transaction table is visible', async () => {
            viewUtils.isActiveChartVisible.mockReturnValue(false);
            viewUtils.isTransactionTableVisible.mockReturnValue(true);
            terminalStats.getDynamicStatsText.mockResolvedValue('Some dynamic stats');
            dateUtils.parseSimplifiedDateRange.mockReturnValue({ from: null, to: null });

            await handleTransactionCommand(['AAPL'], mockContext);

            expect(mockContext.appendMessage).toHaveBeenCalledWith(expect.stringContaining('Some dynamic stats'));
        });

        it('should unzoom if zoomed', async () => {
            zoom.getZoomState.mockReturnValue(true);
            await handleTransactionCommand([], mockContext);
            expect(zoom.toggleZoom).toHaveBeenCalled();
        });
    });

    describe('handleDefaultCommand', () => {
        it('should execute date filter if valid date range is parsed', async () => {
            dateUtils.parseSimplifiedDateRange.mockReturnValue({ from: new Date() });

            viewUtils.isActiveChartVisible.mockReturnValue(false);
            viewUtils.isTransactionTableVisible.mockReturnValue(true);
            viewUtils.ensureTransactionTableVisible.mockReturnValue(true);
            dateUtils.formatDateRange.mockReturnValue('2023');

            await handleDefaultCommand('2023', mockContext);

            expect(dateUtils.parseSimplifiedDateRange).toHaveBeenCalledWith('2023');
            expect(setChartDateRange).toHaveBeenCalled();
            expect(mockContext.appendMessage).toHaveBeenCalledWith(expect.stringContaining('Applied date filter'));
        });

        it('should filter transactions if command is not a valid date range', async () => {
            dateUtils.parseSimplifiedDateRange.mockReturnValue({ from: null, to: null });
            viewUtils.isTransactionTableVisible.mockReturnValue(true);
            terminalStats.getDynamicStatsText.mockResolvedValue('Some dynamic stats');

            await handleDefaultCommand('notadate', mockContext);

            expect(mockContext.filterAndSort).toHaveBeenCalledWith('notadate');
            expect(mockContext.appendMessage).toHaveBeenCalledWith(expect.stringContaining('Some dynamic stats'));
        });

        it('should append summary text if chart is active instead of table', async () => {
            dateUtils.parseSimplifiedDateRange.mockReturnValue({ from: null, to: null });
            viewUtils.isTransactionTableVisible.mockReturnValue(false);
            viewUtils.getActiveChartSummaryText.mockResolvedValue('Some summary');

            await handleDefaultCommand('notadate', mockContext);

            expect(mockContext.filterAndSort).toHaveBeenCalledWith('notadate');
            expect(mockContext.appendMessage).toHaveBeenCalledWith(expect.stringContaining('Some summary'));
        });
    });
});
