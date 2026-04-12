describe('getConcentrationText', () => {
    beforeEach(() => {
        jest.resetModules();
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                VT: 4000,
                SPY: 2000,
            }),
        });

        jest.mock('@js/transactions/dataLoader.js', () => ({
            loadCompositionSnapshotData: jest.fn().mockResolvedValue({
                dates: ['2023-01-01'],
                composition: {
                    AAPL: [50],
                    VT: [50],
                    CASH: [0],
                },
            }),
        }));

        jest.mock('@js/transactions/terminal/stats/formatting.js', () => ({
            renderAsciiTable: jest.fn().mockReturnValue('MOCK_TABLE'),
            formatTicker: jest.fn((t) => t),
            formatPercent: jest.fn((p) => `${(p * 100).toFixed(1)}%`),
        }));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns error if no snapshot is available', async () => {
        const { loadCompositionSnapshotData } = await import('@js/transactions/dataLoader.js');
        loadCompositionSnapshotData.mockResolvedValueOnce(null);

        const { getConcentrationText } =
            await import('@js/transactions/terminal/stats/analysis.js');
        const result = await getConcentrationText();
        expect(result).toBe(
            'Composition snapshot unavailable. Run `plot composition` first to generate this data.'
        );
    });

    it('returns error if no positive weights', async () => {
        const { loadCompositionSnapshotData } = await import('@js/transactions/dataLoader.js');
        // Need to provide a snapshot that getLatestCompositionSnapshot will parse,
        // but results in holdings with 0 weights
        loadCompositionSnapshotData.mockResolvedValueOnce({
            dates: ['2023-01-01'],
            composition: {
                AAPL: [-1], // Negative weight to trigger empty valid holdings
            },
        });

        const { getConcentrationText } =
            await import('@js/transactions/terminal/stats/analysis.js');
        const result = await getConcentrationText();
        // Since getLatestCompositionSnapshot itself filters out <=0 values, it returns null
        // if no positive weights exist at all in any date.
        expect(result).toBe(
            'Composition snapshot unavailable. Run `plot composition` first to generate this data.'
        );
    });

    it('calculates HHI and returns formatted tables', async () => {
        const { getConcentrationText } =
            await import('@js/transactions/terminal/stats/analysis.js');
        const result = await getConcentrationText();

        expect(result).toContain('MOCK_TABLE');

        // Ensure formatting functions were called
        const { renderAsciiTable, formatPercent } =
            await import('@js/transactions/terminal/stats/formatting.js');
        expect(renderAsciiTable).toHaveBeenCalledTimes(2);
        expect(formatPercent).toHaveBeenCalled();

        // Check if the footnote for ETFs is present since VT was included
        expect(result).toContain('¹ ETF-adjusted: VT=4000');
    });

    it('handles fetch failure for ETF HHI data', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false });
        const { getConcentrationText } =
            await import('@js/transactions/terminal/stats/analysis.js');
        const result = await getConcentrationText();
        expect(result).toContain('MOCK_TABLE');
        expect(result).toContain('VT=4019'); // Fallback value
    });
});

describe('getDurationStatsText', () => {
    let mockState;

    beforeEach(() => {
        jest.resetModules();
        mockState = {
            transactionState: {
                allTransactions: [],
                splitHistory: [],
            },
        };
        jest.mock('@js/transactions/state.js', () => ({
            transactionState: mockState.transactionState,
        }));

        jest.mock('@js/transactions/dataLoader.js', () => ({
            loadCompositionSnapshotData: jest.fn().mockResolvedValue({
                dates: ['2023-01-01'],
                composition: {
                    AAPL: [100],
                },
            }),
        }));

        jest.mock('@js/transactions/terminal/stats/formatting.js', () => ({
            renderAsciiTable: jest.fn().mockReturnValue('MOCK_DURATION_TABLE'),
            formatDurationLabel: jest.fn((d) => `${d}d`),
            formatYearsValue: jest.fn((y) => `${y}y`),
            formatShareValueShort: jest.fn((s) => `${s}s`),
            formatPercent: jest.fn((p) => `${(p * 100).toFixed(1)}%`),
            formatTicker: jest.fn((t) => t),
        }));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns error if no snapshot is available', async () => {
        const { loadCompositionSnapshotData } = await import('@js/transactions/dataLoader.js');
        loadCompositionSnapshotData.mockResolvedValueOnce(null);

        const { getDurationStatsText } =
            await import('@js/transactions/terminal/stats/analysis.js');
        const result = await getDurationStatsText();
        expect(result).toBe(
            'Composition snapshot unavailable. Run `plot composition` first to generate this data.'
        );
    });

    it('returns error if no transaction data is available', async () => {
        const { getDurationStatsText } =
            await import('@js/transactions/terminal/stats/analysis.js');
        const result = await getDurationStatsText();
        expect(result).toBe(
            'Transaction history not loaded yet, unable to compute holding durations.'
        );
    });

    it('calculates duration stats and returns formatted tables', async () => {
        mockState.transactionState.allTransactions = [
            {
                security: 'AAPL',
                orderType: 'buy',
                tradeDate: '2022-01-01',
                quantity: '10',
            },
        ];

        const { getDurationStatsText } =
            await import('@js/transactions/terminal/stats/analysis.js');
        const result = await getDurationStatsText();
        expect(result).toContain('MOCK_DURATION_TABLE');

        const { renderAsciiTable } = await import('@js/transactions/terminal/stats/formatting.js');
        expect(renderAsciiTable).toHaveBeenCalledTimes(2);
    });
});

describe('getLifespanStatsText', () => {
    let mockState;

    beforeEach(() => {
        jest.resetModules();
        mockState = {
            transactionState: {
                allTransactions: [],
                splitHistory: [],
            },
        };
        jest.mock('@js/transactions/state.js', () => ({
            transactionState: mockState.transactionState,
        }));

        jest.mock('@js/transactions/dataLoader.js', () => ({
            loadCompositionSnapshotData: jest.fn().mockResolvedValue({
                dates: ['2023-01-01'],
                composition: {
                    AAPL: [100],
                },
            }),
        }));

        jest.mock('@js/transactions/terminal/stats/formatting.js', () => ({
            renderAsciiTable: jest.fn().mockReturnValue('MOCK_LIFESPAN_TABLE'),
            formatDurationLabel: jest.fn((d) => `${d}d`),
            formatYearsValue: jest.fn((y) => `${y}y`),
            formatShareValueShort: jest.fn((s) => `${s}s`),
            formatPercent: jest.fn((p) => `${(p * 100).toFixed(1)}%`),
            formatTicker: jest.fn((t) => t),
        }));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns error if no snapshot is available', async () => {
        const { loadCompositionSnapshotData } = await import('@js/transactions/dataLoader.js');
        loadCompositionSnapshotData.mockResolvedValueOnce(null);

        const { getLifespanStatsText } =
            await import('@js/transactions/terminal/stats/analysis.js');
        const result = await getLifespanStatsText();
        expect(result).toBe(
            'Composition snapshot unavailable. Run `plot composition` first to generate this data.'
        );
    });

    it('returns error if no transaction data is available', async () => {
        const { getLifespanStatsText } =
            await import('@js/transactions/terminal/stats/analysis.js');
        const result = await getLifespanStatsText();
        expect(result).toBe(
            'Transaction history not loaded yet, unable to compute holding lifespans.'
        );
    });

    it('calculates lifespan stats and returns formatted tables', async () => {
        mockState.transactionState.allTransactions = [
            {
                security: 'AAPL',
                orderType: 'buy',
                tradeDate: '2022-01-01',
                quantity: '10',
            },
        ];

        const { getLifespanStatsText } =
            await import('@js/transactions/terminal/stats/analysis.js');
        const result = await getLifespanStatsText();
        expect(result).toContain('MOCK_LIFESPAN_TABLE');

        const { renderAsciiTable } = await import('@js/transactions/terminal/stats/formatting.js');
        // Called for summary table and open table
        expect(renderAsciiTable).toHaveBeenCalledTimes(2);
    });
});
