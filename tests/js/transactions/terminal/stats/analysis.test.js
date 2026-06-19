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

        jest.mock('../../../../../js/transactions/dataLoader.js', () => ({
            loadCompositionSnapshotData: jest.fn().mockResolvedValue({
                dates: ['2023-01-01'],
                composition: {
                    AAPL: [50],
                    VT: [50],
                    CASH: [0],
                },
            }),
        }));

        jest.mock('../../../../../js/transactions/terminal/stats/formatting.js', () => ({
            renderAsciiTable: jest.fn().mockReturnValue('MOCK_TABLE'),
            formatTicker: jest.fn((t) => t),
            formatPercent: jest.fn((p) => `${(p * 100).toFixed(1)}%`),
        }));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns error if no snapshot is available', async () => {
        const { loadCompositionSnapshotData } =
            await import('../../../../../js/transactions/dataLoader.js');
        loadCompositionSnapshotData.mockResolvedValueOnce(null);

        const { getConcentrationText } =
            await import('../../../../../js/transactions/terminal/stats/analysis.js');
        const result = await getConcentrationText();
        expect(result).toBe(
            'Composition snapshot unavailable. Run `plot composition` first to generate this data.'
        );
    });

    it('returns error if no positive weights', async () => {
        const { loadCompositionSnapshotData } =
            await import('../../../../../js/transactions/dataLoader.js');
        // Need to provide a snapshot that getLatestCompositionSnapshot will parse,
        // but results in holdings with 0 weights
        loadCompositionSnapshotData.mockResolvedValueOnce({
            dates: ['2023-01-01'],
            composition: {
                AAPL: [-1], // Negative weight to trigger empty valid holdings
            },
        });

        const { getConcentrationText } =
            await import('../../../../../js/transactions/terminal/stats/analysis.js');
        const result = await getConcentrationText();
        // Since getLatestCompositionSnapshot itself filters out <=0 values, it returns null
        // if no positive weights exist at all in any date.
        expect(result).toBe(
            'Composition snapshot unavailable. Run `plot composition` first to generate this data.'
        );
    });

    it('calculates HHI and returns formatted tables', async () => {
        const { getConcentrationText } =
            await import('../../../../../js/transactions/terminal/stats/analysis.js');
        const result = await getConcentrationText();

        expect(result).toContain('MOCK_TABLE');

        // Ensure formatting functions were called
        const { renderAsciiTable, formatPercent } =
            await import('../../../../../js/transactions/terminal/stats/formatting.js');
        expect(renderAsciiTable).toHaveBeenCalledTimes(2);
        expect(formatPercent).toHaveBeenCalled();

        // Check if the footnote for ETFs is present since VT was included
        expect(result).toContain('¹ ETF-adjusted: VT=4000');
    });

    it('handles fetch failure for ETF HHI data', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false });
        const { getConcentrationText } =
            await import('../../../../../js/transactions/terminal/stats/analysis.js');
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
        jest.mock('../../../../../js/transactions/state.js', () => ({
            transactionState: mockState.transactionState,
        }));

        jest.mock('../../../../../js/transactions/dataLoader.js', () => ({
            loadCompositionSnapshotData: jest.fn().mockResolvedValue({
                dates: ['2023-01-01'],
                composition: {
                    AAPL: [100],
                },
            }),
        }));

        jest.mock('../../../../../js/transactions/terminal/stats/formatting.js', () => ({
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
        const { loadCompositionSnapshotData } =
            await import('../../../../../js/transactions/dataLoader.js');
        loadCompositionSnapshotData.mockResolvedValueOnce(null);

        const { getDurationStatsText } =
            await import('../../../../../js/transactions/terminal/stats/analysis.js');
        const result = await getDurationStatsText();
        expect(result).toBe(
            'Composition snapshot unavailable. Run `plot composition` first to generate this data.'
        );
    });

    it('returns error if no transaction data is available', async () => {
        const { getDurationStatsText } =
            await import('../../../../../js/transactions/terminal/stats/analysis.js');
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
            await import('../../../../../js/transactions/terminal/stats/analysis.js');
        const result = await getDurationStatsText();
        expect(result).toContain('MOCK_DURATION_TABLE');

        const { renderAsciiTable } =
            await import('../../../../../js/transactions/terminal/stats/formatting.js');
        expect(renderAsciiTable).toHaveBeenCalledTimes(2);
    });

    it('calculates duration stats for closed positions', async () => {
        mockState.transactionState.allTransactions = [
            {
                security: 'MSFT',
                orderType: 'buy',
                tradeDate: '2023-01-01',
                quantity: '100',
            },
            {
                security: 'MSFT',
                orderType: 'sell',
                tradeDate: '2023-02-01',
                quantity: '100',
            },
        ];

        const { getDurationStatsText } =
            await import('../../../../../js/transactions/terminal/stats/analysis.js');
        const result = await getDurationStatsText();
        expect(result).toContain('MOCK_DURATION_TABLE');

        const { renderAsciiTable } =
            await import('../../../../../js/transactions/terminal/stats/formatting.js');
        // `getDurationStatsText` only has 2 renderAsciiTable calls locally:
        // One for summary table, and one for open holding ages.
        // It does not render a closed table despite calculating closed variables.
        // But since there are no OPEN positions, the detail table is omitted.
        expect(renderAsciiTable).toHaveBeenCalledTimes(1);
    });

    it('calculates duration stats for combined open and closed positions', async () => {
        mockState.transactionState.allTransactions = [
            {
                security: 'TSLA',
                orderType: 'buy',
                tradeDate: '2022-01-01',
                quantity: '50',
            },
            {
                security: 'TSLA',
                orderType: 'sell',
                tradeDate: '2022-06-01',
                quantity: '25',
            },
            {
                security: 'AAPL',
                orderType: 'buy',
                tradeDate: '2022-05-01',
                quantity: '10',
            },
        ];

        const { getDurationStatsText } =
            await import('../../../../../js/transactions/terminal/stats/analysis.js');
        const result = await getDurationStatsText();
        expect(result).toContain('MOCK_DURATION_TABLE');

        const { renderAsciiTable } =
            await import('../../../../../js/transactions/terminal/stats/formatting.js');
        // Expected: summary table and open positions detail table.
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
        jest.mock('../../../../../js/transactions/state.js', () => ({
            transactionState: mockState.transactionState,
        }));

        jest.mock('../../../../../js/transactions/dataLoader.js', () => ({
            loadCompositionSnapshotData: jest.fn().mockResolvedValue({
                dates: ['2023-01-01'],
                composition: {
                    AAPL: [100],
                },
            }),
        }));

        jest.mock('../../../../../js/transactions/terminal/stats/formatting.js', () => ({
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
        const { loadCompositionSnapshotData } =
            await import('../../../../../js/transactions/dataLoader.js');
        loadCompositionSnapshotData.mockResolvedValueOnce(null);

        const { getLifespanStatsText } =
            await import('../../../../../js/transactions/terminal/stats/analysis.js');
        const result = await getLifespanStatsText();
        expect(result).toBe(
            'Composition snapshot unavailable. Run `plot composition` first to generate this data.'
        );
    });

    it('returns error if no transaction data is available', async () => {
        const { getLifespanStatsText } =
            await import('../../../../../js/transactions/terminal/stats/analysis.js');
        const result = await getLifespanStatsText();
        expect(result).toBe(
            'Transaction history not loaded yet, unable to compute holding lifespans.'
        );
    });
});

describe('buildLotSnapshots', () => {
    let mockState;

    beforeEach(() => {
        jest.resetModules();
        mockState = {
            transactionState: {
                allTransactions: [],
                splitHistory: [],
            },
        };
        jest.mock('../../../../../js/transactions/state.js', () => ({
            transactionState: mockState.transactionState,
        }));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns empty structures if no transactions', async () => {
        const { buildLotSnapshots } =
            await import('../../../../../js/transactions/terminal/stats/analysis.js');
        const result = buildLotSnapshots();
        expect(result.lotsByTicker).toBeNull();
        expect(result.closedSales).toEqual([]);
        expect(result.currentPeriodStart).toBeInstanceOf(Map);
        expect(result.closedPeriods).toEqual([]);
    });

    it('builds open lots correctly from buy transactions', async () => {
        mockState.transactionState.allTransactions = [
            {
                security: 'AAPL',
                orderType: 'buy',
                tradeDate: '2023-01-01',
                quantity: '10',
                transactionId: 1,
            },
        ];

        const { buildLotSnapshots } =
            await import('../../../../../js/transactions/terminal/stats/analysis.js');
        const result = buildLotSnapshots();

        expect(result.lotsByTicker).toBeInstanceOf(Map);
        expect(result.lotsByTicker.get('AAPL')).toEqual([
            { qty: 10, date: new Date('2023-01-01T00:00:00.000Z') },
        ]);
        expect(result.currentPeriodStart.get('AAPL')).toEqual(new Date('2023-01-01T00:00:00.000Z'));
    });

    it('builds closed periods correctly from buy and sell transactions', async () => {
        mockState.transactionState.allTransactions = [
            {
                security: 'AAPL',
                orderType: 'buy',
                tradeDate: '2023-01-01',
                quantity: '10',
                transactionId: 1,
            },
            {
                security: 'AAPL',
                orderType: 'sell',
                tradeDate: '2023-01-02',
                quantity: '10',
                transactionId: 2,
            },
        ];

        const { buildLotSnapshots } =
            await import('../../../../../js/transactions/terminal/stats/analysis.js');
        const result = buildLotSnapshots();

        expect(result.lotsByTicker.has('AAPL')).toBe(false);
        expect(result.closedSales).toHaveLength(1);
        expect(result.closedSales[0]).toMatchObject({
            ticker: 'AAPL',
            qty: 10,
            days: 1,
            opened: new Date('2023-01-01T00:00:00.000Z'),
            closed: new Date('2023-01-02T00:00:00.000Z'),
        });
        expect(result.closedPeriods).toHaveLength(1);
        expect(result.closedPeriods[0]).toMatchObject({
            ticker: 'AAPL',
            shares: 10,
            start: new Date('2023-01-01T00:00:00.000Z'),
            end: new Date('2023-01-02T00:00:00.000Z'),
        });
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
            await import('../../../../../js/transactions/terminal/stats/analysis.js');
        const result = await getLifespanStatsText();
        expect(result).toContain('MOCK_LIFESPAN_TABLE');

        const { renderAsciiTable } =
            await import('../../../../../js/transactions/terminal/stats/formatting.js');
        // Called for summary table and open table
        expect(renderAsciiTable).toHaveBeenCalledTimes(2);
    });

    it('calculates lifespan stats for closed positions', async () => {
        mockState.transactionState.allTransactions = [
            {
                security: 'MSFT',
                orderType: 'buy',
                tradeDate: '2023-01-01',
                quantity: '100',
            },
            {
                security: 'MSFT',
                orderType: 'sell',
                tradeDate: '2023-02-01',
                quantity: '100',
            },
        ];

        const { getLifespanStatsText } =
            await import('../../../../../js/transactions/terminal/stats/analysis.js');
        const result = await getLifespanStatsText();
        expect(result).toContain('MOCK_LIFESPAN_TABLE');

        const { renderAsciiTable } =
            await import('../../../../../js/transactions/terminal/stats/formatting.js');
        // Expected: summary table, plus closed tickers detail table
        expect(renderAsciiTable).toHaveBeenCalledTimes(2);
    });

    it('calculates lifespan stats for combined open and closed positions', async () => {
        mockState.transactionState.allTransactions = [
            {
                security: 'TSLA',
                orderType: 'buy',
                tradeDate: '2022-01-01',
                quantity: '50',
            },
            {
                security: 'TSLA',
                orderType: 'sell',
                tradeDate: '2022-06-01',
                quantity: '25',
            },
            {
                security: 'AAPL',
                orderType: 'buy',
                tradeDate: '2022-05-01',
                quantity: '10',
            },
        ];

        const { getLifespanStatsText } =
            await import('../../../../../js/transactions/terminal/stats/analysis.js');
        const result = await getLifespanStatsText();
        expect(result).toContain('MOCK_LIFESPAN_TABLE');

        const { renderAsciiTable } =
            await import('../../../../../js/transactions/terminal/stats/formatting.js');
        // Since TSLA is partially sold but still open in state, and AAPL is open,
        // it generates open table and summary table only.
        expect(renderAsciiTable).toHaveBeenCalledTimes(2);
    });
});
