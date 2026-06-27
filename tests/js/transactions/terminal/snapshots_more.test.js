import { getVolatilitySnapshotLine } from '../../../../js/transactions/terminal/snapshots.js';
import {} from '../../../../js/transactions/state.js';

const largeSeries = [];
for (let i = 0; i < 100; i++) {
    largeSeries.push({
        date: new Date(2023, 0, i + 1).toISOString(),
        value: 100 + (i % 2 === 0 ? 1 : -1),
    });
}

jest.mock('../../../../js/transactions/state.js', () => {
    return {
        transactionState: {
            chartDateRange: { from: null, to: null },
            performanceSeries: {
                PORT: largeSeries,
                '^LZ': largeSeries,
            },
            portfolioSeries: [],
            chartVisibility: { PORT: true, '^LZ': true, HIDDEN: false },
            selectedCurrency: 'USD',
            activeChart: 'volatility',
        },
        hasActiveTransactionFilters: jest.fn(() => true),
    };
});

jest.mock('../../../../js/transactions/terminal/dateUtils.js', () => ({
    parseDateSafe: jest.fn((d) => (d ? new Date(d) : null)),
}));

jest.mock('../../../../js/transactions/chart/helpers.js', () => ({
    parseLocalDate: jest.fn((d) => (d ? new Date(d) : null)),
    formatCrosshairDateLabel: jest.fn(() => 'Jan 01, 2023'),
}));

jest.mock('../../../../js/transactions/utils.js', () => ({
    convertBetweenCurrencies: jest.fn((val) => val),
}));

describe('terminal/snapshots_more tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('getVolatilitySnapshotLine returns valid line', () => {
        const result = getVolatilitySnapshotLine();
        expect(typeof result).toBe('string');
    });
});
