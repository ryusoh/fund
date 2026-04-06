import { buildPESeries } from '@js/transactions/chart/renderers/pe.js';

describe('buildPESeries', () => {
    it('returns an empty array if dates is empty', () => {
        expect(buildPESeries([], [10], {}, {}, null, null)).toEqual([]);
    });

    it('returns an empty array if portfolioPE is empty', () => {
        expect(buildPESeries(['2023-01-01'], [], {}, {}, null, null)).toEqual([]);
    });

    it('filters data outside the date range', () => {
        const dates = ['2023-01-01', '2023-01-02', '2023-01-03'];
        const pe = [15, 16, 17];
        const filterFrom = new Date('2023-01-02');
        const result = buildPESeries(dates, pe, null, null, filterFrom, null);
        expect(result).toHaveLength(2);
        expect(result[0].pe).toBe(16);
        expect(result[1].pe).toBe(17);
    });

    it('skips invalid PE values', () => {
        const dates = ['2023-01-01', '2023-01-02', '2023-01-03'];
        const pe = [15, NaN, 17];
        const result = buildPESeries(dates, pe, null, null, null, null);
        expect(result).toHaveLength(2);
        expect(result[0].pe).toBe(15);
        expect(result[1].pe).toBe(17);
    });

    it('builds series with ticker PEs and weights', () => {
        const dates = ['2023-01-01'];
        const pe = [15];
        const tickerPE = { AAPL: [20], MSFT: [30] };
        const tickerWeights = { AAPL: [0.6], MSFT: [0.4] };
        const result = buildPESeries(dates, pe, tickerPE, tickerWeights, null, null);
        expect(result).toHaveLength(1);
        expect(result[0].pe).toBe(15);
        expect(result[0].tickerPEs).toEqual({ AAPL: 20, MSFT: 30 });
        expect(result[0].tickerWeights).toEqual({ AAPL: 0.6, MSFT: 0.4 });
    });
});

describe('getPESnapshotText', () => {
    let mockState;

    beforeEach(() => {
        jest.resetModules();
        mockState = {
            transactionState: { chartDateRange: {} },
            chartLayouts: {},
        };
        jest.mock('@js/transactions/state.js', () => ({
            transactionState: mockState.transactionState,
        }));
        jest.mock('@js/transactions/chart/state.js', () => ({
            chartLayouts: mockState.chartLayouts,
        }));
    });

    it('returns loading state if series is empty', async () => {
        const { getPESnapshotText } = await import('@js/transactions/chart/renderers/pe.js');
        expect(getPESnapshotText()).toBe('Loading PE data...');
    });

    it('returns formatted stats', async () => {
        mockState.chartLayouts.pe = {
            rawSeries: [
                { date: new Date('2023-01-01'), pe: 15 },
                { date: new Date('2023-01-02'), pe: 20 },
                { date: new Date('2023-01-03'), pe: 10 },
            ],
        };
        const { getPESnapshotText } = await import('@js/transactions/chart/renderers/pe.js');
        expect(getPESnapshotText()).toBe(
            'Current: 10.00x | Range: 10.00x - 20.00x | Harmonic Mean (1 / Σ(w/PE))'
        );
    });

    it('filters data based on date range', async () => {
        mockState.transactionState.chartDateRange = { from: '2023-01-02', to: '2023-01-02' };
        mockState.chartLayouts.pe = {
            rawSeries: [
                { date: new Date('2023-01-01'), pe: 15 },
                { date: new Date('2023-01-02'), pe: 20 },
                { date: new Date('2023-01-03'), pe: 10 },
            ],
        };
        const { getPESnapshotText } = await import('@js/transactions/chart/renderers/pe.js');
        expect(getPESnapshotText()).toBe(
            'Current: 20.00x | Range: 20.00x - 20.00x | Harmonic Mean (1 / Σ(w/PE))'
        );
    });

    it('handles forward PE formatting', async () => {
        mockState.chartLayouts.pe = {
            rawSeries: [{ date: new Date('2023-01-01'), pe: 15 }],
            forwardPE: {
                portfolio_forward_pe: 18,
                benchmark_forward_pe: { '^GSPC': 22 },
            },
        };
        const { getPESnapshotText } = await import('@js/transactions/chart/renderers/pe.js');
        expect(getPESnapshotText()).toBe(
            'Current: 15.00x | Range: 15.00x - 15.00x | Harmonic Mean (1 / Σ(w/PE)) | Forward: 18.00x (S&P 500: 22.00x)'
        );
    });
});
