import { mergeDividendsIntoContribution } from '@js/transactions/chart/data/contribution.js';

jest.mock('@js/transactions/state.js', () => ({
    transactionState: {
        selectedCurrency: 'USD',
        splitHistory: [],
    },
}));

jest.mock('@js/transactions/utils.js', () => ({
    convertValueToCurrency: jest.fn((value) => value),
}));

jest.mock('@js/transactions/calculations.js', () => ({
    getSplitAdjustment: jest.fn(() => 1),
}));

jest.mock('@js/transactions/chart/helpers.js', () => ({
    parseLocalDate: jest.fn((d) => new Date(d).getTime()),
}));

describe('mergeDividendsIntoContribution', () => {
    // Helper to build a contribution point
    function makePoint(tradeDate, amount, orderType = 'buy', netAmount = null) {
        return {
            tradeDate,
            amount,
            value: amount,
            orderType,
            netAmount: netAmount !== null ? netAmount : amount,
            buyVolume: orderType === 'buy' ? Math.abs(netAmount !== null ? netAmount : amount) : 0,
            sellVolume: orderType === 'sell' ? Math.abs(netAmount !== null ? netAmount : amount) : 0,
        };
    }

    it('returns original series unchanged when yieldData is null', () => {
        const series = [
            makePoint('2020-01-01', 1000, 'buy', 1000),
            makePoint('2020-01-05', 2000, 'buy', 1000),
        ];
        const result = mergeDividendsIntoContribution(series, null, 'USD');
        expect(result).toEqual(series);
    });

    it('returns original series unchanged when yieldData is empty', () => {
        const series = [
            makePoint('2020-01-01', 1000, 'buy', 1000),
        ];
        const result = mergeDividendsIntoContribution(series, [], 'USD');
        expect(result).toEqual(series);
    });

    it('subtracts daily_dividend from cumulative on matching dates', () => {
        // Contribution series: buy on Jan 1 (cum=1000), buy on Jan 5 (cum=2000)
        const series = [
            makePoint('2020-01-01', 1000, 'buy', 1000),
            makePoint('2020-01-05', 2000, 'buy', 1000),
        ];
        // Dividend of 50 on Jan 3 (between the two buys)
        const yieldData = [
            { date: '2020-01-03', daily_dividend: 50 },
        ];

        const result = mergeDividendsIntoContribution(series, yieldData, 'USD');

        // Should have 3 points now: Jan 1, Jan 3 (dividend), Jan 5
        expect(result.length).toBe(3);

        // Jan 1: unchanged, cum = 1000
        const jan1 = result.find((p) => p.tradeDate === '2020-01-01');
        expect(jan1.amount).toBe(1000);

        // Jan 3: new dividend point, cum = 1000 - 50 = 950
        const jan3 = result.find((p) => p.tradeDate === '2020-01-03');
        expect(jan3.amount).toBe(950);

        // Jan 5: cum = 950 + 1000 = 1950
        const jan5 = result.find((p) => p.tradeDate === '2020-01-05');
        expect(jan5.amount).toBe(1950);
    });

    it('adds sellVolume to output points with dividends', () => {
        const series = [
            makePoint('2020-01-01', 1000, 'buy', 1000),
            makePoint('2020-01-05', 2000, 'buy', 1000),
        ];
        const yieldData = [
            { date: '2020-01-03', daily_dividend: 50 },
        ];

        const result = mergeDividendsIntoContribution(series, yieldData, 'USD');
        const jan3 = result.find((p) => p.tradeDate === '2020-01-03');
        expect(jan3.sellVolume).toBe(50);
    });

    it('handles dividend on same day as buy', () => {
        const series = [
            makePoint('2020-01-01', 1000, 'buy', 1000),
        ];
        const yieldData = [
            { date: '2020-01-01', daily_dividend: 25 },
        ];

        const result = mergeDividendsIntoContribution(series, yieldData, 'USD');

        expect(result.length).toBe(1);
        const point = result[0];
        // cum = 1000 (buy) - 25 (dividend) = 975
        expect(point.amount).toBe(975);
        expect(point.sellVolume).toBe(25);
        // orderType stays 'buy' since the original transaction was a buy
        expect(point.orderType).toBe('buy');
    });

    it('marks dividend-only points with orderType sell', () => {
        const series = [
            makePoint('2020-01-01', 1000, 'buy', 1000),
            makePoint('2020-01-10', 2000, 'buy', 1000),
        ];
        const yieldData = [
            { date: '2020-01-05', daily_dividend: 30 },
        ];

        const result = mergeDividendsIntoContribution(series, yieldData, 'USD');
        const jan5 = result.find((p) => p.tradeDate === '2020-01-05');
        expect(jan5).toBeDefined();
        expect(jan5.orderType).toBe('sell');
    });

    it('filters dividends by ticker if filterTickers is provided', () => {
        const series = [
            makePoint('2020-01-01', 1000, 'buy', 1000),
        ];
        // Yield data with daily_dividends_by_ticker
        const yieldData = [
            {
                date: '2020-01-03',
                daily_dividend: 50,
                daily_dividends_by_ticker: { 'AAPL': 30, 'TSLA': 20 }
            },
        ];

        // Filter for AAPL only -> should only subtract 30
        const resultAapl = mergeDividendsIntoContribution(series, yieldData, 'USD', ['AAPL']);
        const pointAapl = resultAapl.find((p) => p.tradeDate === '2020-01-03');
        expect(pointAapl.sellVolume).toBe(30);

        // Filter for TSLA only -> should only subtract 20
        const resultTsla = mergeDividendsIntoContribution(series, yieldData, 'USD', ['TSLA']);
        const pointTsla = resultTsla.find((p) => p.tradeDate === '2020-01-03');
        expect(pointTsla.sellVolume).toBe(20);

        // Filter for PDD -> should not merge any dividends since PDD has 0
        const resultPdd = mergeDividendsIntoContribution(series, yieldData, 'USD', ['PDD']);
        expect(resultPdd.length).toBe(1); // No new point inserted
    });

    it('fails closed (ignores dividend) if filterTickers is active but daily_dividends_by_ticker is missing', () => {
        const series = [
            makePoint('2020-01-01', 1000, 'buy', 1000),
        ];
        // Yield data WITHOUT daily_dividends_by_ticker (e.g. from an old cache)
        const yieldData = [
            {
                date: '2020-01-03',
                daily_dividend: 50
                // daily_dividends_by_ticker is missing
            },
        ];

        // Filter for PDD. Because daily_dividends_by_ticker is missing, it should NOT fall back to daily_dividend!
        // It must assume 0 dividend for PDD.
        const resultPdd = mergeDividendsIntoContribution(series, yieldData, 'USD', ['PDD']);

        // This will currently FAIL because it falls back to item.daily_dividend = 50
        expect(resultPdd.length).toBe(1); // No new point inserted
    });

    it('preserves existing points and ordering', () => {
        const series = [
            makePoint('2020-01-01', 1000, 'buy', 1000),
            makePoint('2020-01-10', 2000, 'buy', 1000),
            makePoint('2020-01-20', 3000, 'buy', 1000),
        ];
        const yieldData = [
            { date: '2020-01-15', daily_dividend: 100 },
            { date: '2020-01-05', daily_dividend: 50 },
        ];

        const result = mergeDividendsIntoContribution(series, yieldData, 'USD');

        // All original dates must be present
        expect(result.find((p) => p.tradeDate === '2020-01-01')).toBeDefined();
        expect(result.find((p) => p.tradeDate === '2020-01-10')).toBeDefined();
        expect(result.find((p) => p.tradeDate === '2020-01-20')).toBeDefined();

        // New dividend dates must be present
        expect(result.find((p) => p.tradeDate === '2020-01-05')).toBeDefined();
        expect(result.find((p) => p.tradeDate === '2020-01-15')).toBeDefined();

        // Result should be sorted by date
        for (let i = 1; i < result.length; i++) {
            expect(result[i].tradeDate >= result[i - 1].tradeDate).toBe(true);
        }
    });

    it('skips zero daily_dividend entries', () => {
        const series = [
            makePoint('2020-01-01', 1000, 'buy', 1000),
        ];
        const yieldData = [
            { date: '2020-01-03', daily_dividend: 0 },
        ];

        const result = mergeDividendsIntoContribution(series, yieldData, 'USD');
        // Zero dividend should not create a new point
        expect(result.length).toBe(1);
        expect(result[0].tradeDate).toBe('2020-01-01');
    });

    it('recalculates cumulative correctly with multiple dividends', () => {
        const series = [
            makePoint('2020-01-01', 1000, 'buy', 1000),
            makePoint('2020-01-10', 2000, 'buy', 1000),
            makePoint('2020-01-20', 3000, 'buy', 1000),
        ];
        const yieldData = [
            { date: '2020-01-05', daily_dividend: 50 },
            { date: '2020-01-15', daily_dividend: 100 },
        ];

        const result = mergeDividendsIntoContribution(series, yieldData, 'USD');

        // Walk through expected cumulatives:
        // Jan 1: +1000 = 1000
        expect(result.find((p) => p.tradeDate === '2020-01-01').amount).toBe(1000);
        // Jan 5: -50 dividend => 1000 - 50 = 950
        expect(result.find((p) => p.tradeDate === '2020-01-05').amount).toBe(950);
        // Jan 10: +1000 buy => 950 + 1000 = 1950
        expect(result.find((p) => p.tradeDate === '2020-01-10').amount).toBe(1950);
        // Jan 15: -100 dividend => 1950 - 100 = 1850
        expect(result.find((p) => p.tradeDate === '2020-01-15').amount).toBe(1850);
        // Jan 20: +1000 buy => 1850 + 1000 = 2850
        expect(result.find((p) => p.tradeDate === '2020-01-20').amount).toBe(2850);
    });
});
