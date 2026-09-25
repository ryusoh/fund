import {
    getCompositionSnapshotLine,
    getSectorsSnapshotLine,
    _getSectorsHint,
    getGeographySnapshotLine,
    getMarketcapSnapshotLine,
} from '../../../../js/transactions/terminal/snapshots.js';
import { transactionState } from '../../../../js/transactions/state.js';
import * as dataLoader from '../../../../js/transactions/dataLoader.js';

describe('getCompositionSnapshotLine', () => {
    let loadSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        transactionState.activeChart = 'composition';
        transactionState.chartDateRange = null;
        loadSpy = jest.spyOn(dataLoader, 'loadCompositionSnapshotData');
    });

    afterEach(() => {
        loadSpy.mockRestore();
    });

    it('returns null if activeChart is not composition', async () => {
        transactionState.activeChart = 'value';
        expect(await getCompositionSnapshotLine()).toBeNull();
    });

    it('returns null if data is missing', async () => {
        loadSpy.mockResolvedValueOnce(null);
        expect(await getCompositionSnapshotLine()).toBeNull();
    });

    it('returns null if dates is missing or empty', async () => {
        loadSpy.mockResolvedValueOnce({ dates: [] });
        expect(await getCompositionSnapshotLine()).toBeNull();
        loadSpy.mockResolvedValueOnce({});
        expect(await getCompositionSnapshotLine()).toBeNull();
    });

    it('formats snapshot correctly without date filter', async () => {
        loadSpy.mockResolvedValueOnce({
            dates: ['2023-01-01', '2023-02-01'],
            total_values: [1000, 2000],
            composition: {
                AAPL: [50, 60],
                MSFT: [50, 40],
            },
        });
        transactionState.selectedCurrency = 'USD';

        const res = await getCompositionSnapshotLine();
        expect(res).toContain('Composition');
        expect(res).toContain('AAPL');
        expect(res).toContain('MSFT');
        expect(res).toContain('2023-02-01');
    });

    it('formats snapshot correctly with date filter', async () => {
        loadSpy.mockResolvedValueOnce({
            dates: ['2023-01-01', '2023-02-01', '2023-03-01'],
            total_values: [1000, 2000, 3000],
            composition: {
                AAPL: [50, 60, 70],
                MSFT: [50, 40, 30],
            },
        });
        transactionState.chartDateRange = { from: '2023-01-15', to: '2023-02-15' };

        const res = await getCompositionSnapshotLine();
        expect(res).toContain('Composition');
        expect(res).toContain('AAPL');
        expect(res).toContain('2023-02-01');
    });

    it('handles negative or invalid index gracefully', async () => {
        loadSpy.mockResolvedValueOnce({
            dates: ['2023-01-01', '2023-02-01'],
            total_values: [1000, 2000],
            composition: {
                AAPL: [50, 60],
            },
        });
        transactionState.chartDateRange = { from: '2024-01-01', to: '2024-12-31' };

        const res = await getCompositionSnapshotLine();
        expect(res).toContain('2023-02-01');
    });

    it('handles missing total_values gracefully', async () => {
        loadSpy.mockResolvedValueOnce({
            dates: ['2023-01-01'],
            composition: {
                AAPL: [100],
            },
        });

        const res = await getCompositionSnapshotLine();
        expect(res).toContain('AAPL');
    });

    it('handles missing or invalid composition gracefully', async () => {
        loadSpy.mockResolvedValueOnce({
            dates: ['2023-01-01'],
            total_values: [1000],
            composition: {
                AAPL: [0],
                MSFT: ['invalid'],
                GOOG: null,
            },
        });

        const res = await getCompositionSnapshotLine();
        expect(res).toBeNull();
    });
});

describe('getCompositionSnapshotLine with Abs', () => {
    let loadSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        transactionState.activeChart = 'compositionAbs';
        transactionState.chartDateRange = null;
        loadSpy = jest.spyOn(dataLoader, 'loadCompositionSnapshotData');
    });

    afterEach(() => {
        loadSpy.mockRestore();
    });

    it('formats snapshot correctly without date filter', async () => {
        loadSpy.mockResolvedValueOnce({
            dates: ['2023-01-01', '2023-02-01'],
            total_values: [1000, 2000],
            composition: {
                AAPL: [50, 60],
                MSFT: [50, 40],
            },
        });
        transactionState.selectedCurrency = 'USD';

        const res = await getCompositionSnapshotLine({ labelPrefix: 'Composition Abs' });
        expect(res).toContain('Composition Abs');
        expect(res).toContain('AAPL');
        expect(res).toContain('MSFT');
        expect(res).toContain('2023-02-01');
    });
});

describe('getSectorsSnapshotLine', () => {
    let loadSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        transactionState.activeChart = 'sectors';
        transactionState.chartDateRange = null;
        loadSpy = jest.spyOn(dataLoader, 'loadSectorsSnapshotData');
    });

    afterEach(() => {
        loadSpy.mockRestore();
    });

    it('formats snapshot correctly without date filter', async () => {
        loadSpy.mockResolvedValueOnce({
            dates: ['2023-01-01', '2023-02-01'],
            total_values: [1000, 2000],
            series: {
                Technology: [50, 60],
            },
        });
        transactionState.selectedCurrency = 'USD';

        const res = await getSectorsSnapshotLine();
        expect(res).toContain('Sectors');
        expect(res).toContain('Technology');
        expect(res).toContain('2023-02-01');
    });

    it('returns null if activeChart is not sectors or sectorsAbs', async () => {
        transactionState.activeChart = 'value';
        expect(await getSectorsSnapshotLine()).toBeNull();
    });

    it('returns null if data is not an object', async () => {
        loadSpy.mockResolvedValueOnce('not-an-object');
        expect(await getSectorsSnapshotLine()).toBeNull();
    });

    it('returns null if dates is not an array', async () => {
        loadSpy.mockResolvedValueOnce({ dates: '2023-01-01' });
        expect(await getSectorsSnapshotLine()).toBeNull();
    });

    it('returns null if dates is empty', async () => {
        loadSpy.mockResolvedValueOnce({ dates: [] });
        expect(await getSectorsSnapshotLine()).toBeNull();
    });
});

describe('getGeographySnapshotLine', () => {
    let loadSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        transactionState.activeChart = 'geography';
        transactionState.chartDateRange = null;
        loadSpy = jest.spyOn(dataLoader, 'loadGeographySnapshotData');
    });

    afterEach(() => {
        loadSpy.mockRestore();
    });

    it('formats snapshot correctly without date filter', async () => {
        loadSpy.mockResolvedValueOnce({
            dates: ['2023-01-01', '2023-02-01'],
            total_values: [1000, 2000],
            series: {
                US: [50, 60],
            },
        });
        transactionState.selectedCurrency = 'USD';

        const res = await getGeographySnapshotLine();
        expect(res).toContain('Geography');
        expect(res).toContain('US');
        expect(res).toContain('2023-02-01');
    });
});

describe('getMarketcapSnapshotLine', () => {
    let loadSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        transactionState.activeChart = 'marketcap';
        transactionState.chartDateRange = null;
        loadSpy = jest.spyOn(dataLoader, 'loadMarketcapSnapshotData');
    });

    afterEach(() => {
        loadSpy.mockRestore();
    });

    it('formats snapshot correctly without date filter', async () => {
        loadSpy.mockResolvedValueOnce({
            dates: ['2023-01-01', '2023-02-01'],
            total_values: [1000, 2000],
            series: {
                Large: [50, 60],
            },
        });
        transactionState.selectedCurrency = 'USD';

        const res = await getMarketcapSnapshotLine();
        expect(res).toContain('Market Cap');
        expect(res).toContain('Large');
        expect(res).toContain('2023-02-01');
    });
});

describe('getCompositionSnapshotLine with Filters', () => {
    let loadSpy;
    let getFiltersSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        transactionState.activeChart = 'composition';
        transactionState.chartDateRange = null;
        loadSpy = jest.spyOn(dataLoader, 'loadCompositionSnapshotData');

        // Mock the state filters
        getFiltersSpy = jest.spyOn(
            require('../../../../js/transactions/state.js'),
            'getCompositionFilterTickers'
        );
    });

    afterEach(() => {
        loadSpy.mockRestore();
        getFiltersSpy.mockRestore();
    });

    it('formats snapshot correctly with explicit ticker filter', async () => {
        loadSpy.mockResolvedValueOnce({
            dates: ['2023-01-01'],
            total_values: [1000],
            composition: {
                AAPL: [50],
                MSFT: [30],
                GOOG: [20],
            },
        });
        transactionState.selectedCurrency = 'USD';
        getFiltersSpy.mockReturnValue(['AAPL']);

        const res = await getCompositionSnapshotLine();
        expect(res).toContain('AAPL');
        expect(res).toContain('Others');
        expect(res).not.toContain('MSFT');
    });
});

describe('getCompositionSnapshotLine empty result', () => {
    let loadSpy;
    let getFiltersSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        transactionState.activeChart = 'composition';
        transactionState.chartDateRange = null;
        loadSpy = jest.spyOn(dataLoader, 'loadCompositionSnapshotData');

        getFiltersSpy = jest.spyOn(
            require('../../../../js/transactions/state.js'),
            'getCompositionFilterTickers'
        );
    });

    afterEach(() => {
        loadSpy.mockRestore();
        getFiltersSpy.mockRestore();
    });

    it('returns null if filtered array is empty', async () => {
        loadSpy.mockResolvedValueOnce({
            dates: ['2023-01-01'],
            total_values: [1000],
            composition: {
                AAPL: [0.01], // Below the 0.1 threshold
            },
        });

        const res = await getCompositionSnapshotLine();
        expect(res).toBeNull();
    });
});

describe('getCompositionSnapshotLine with BRK-B mapping', () => {
    let loadSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        transactionState.activeChart = 'composition';
        transactionState.chartDateRange = null;
        loadSpy = jest.spyOn(dataLoader, 'loadCompositionSnapshotData');
    });

    afterEach(() => {
        loadSpy.mockRestore();
    });

    it('formats snapshot correctly with BRKB conversion', async () => {
        loadSpy.mockResolvedValueOnce({
            dates: ['2023-01-01'],
            total_values: [1000],
            composition: {
                BRKB: [100],
            },
        });

        const res = await getCompositionSnapshotLine();
        expect(res).toContain('BRK-B');
    });
});

describe('getGeographySnapshotLine empty result', () => {
    let loadSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        transactionState.activeChart = 'geography';
        transactionState.chartDateRange = null;
        loadSpy = jest.spyOn(dataLoader, 'loadGeographySnapshotData');
    });

    afterEach(() => {
        loadSpy.mockRestore();
    });

    it('returns null if filtered array is empty', async () => {
        loadSpy.mockResolvedValueOnce({
            dates: ['2023-01-01'],
            total_values: [1000],
            series: {
                US: [0.01], // Below the threshold
            },
        });

        const res = await getGeographySnapshotLine();
        expect(res).toBeNull();
    });
});

describe('getSectorsSnapshotLine empty result', () => {
    let loadSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        transactionState.activeChart = 'sectors';
        transactionState.chartDateRange = null;
        loadSpy = jest.spyOn(dataLoader, 'loadSectorsSnapshotData');
    });

    afterEach(() => {
        loadSpy.mockRestore();
    });

    it('returns null if filtered array is empty', async () => {
        loadSpy.mockResolvedValueOnce({
            dates: ['2023-01-01'],
            total_values: [1000],
            series: {
                Technology: [0.01], // Below the threshold
            },
        });

        const res = await getSectorsSnapshotLine();
        expect(res).toBeNull();
    });
});

describe('getMarketcapSnapshotLine empty result', () => {
    let loadSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        transactionState.activeChart = 'marketcap';
        transactionState.chartDateRange = null;
        loadSpy = jest.spyOn(dataLoader, 'loadMarketcapSnapshotData');
    });

    afterEach(() => {
        loadSpy.mockRestore();
    });

    it('returns null if filtered array is empty', async () => {
        loadSpy.mockResolvedValueOnce({
            dates: ['2023-01-01'],
            total_values: [1000],
            series: {
                Large: [0.01], // Below the threshold
            },
        });

        const res = await getMarketcapSnapshotLine();
        expect(res).toBeNull();
    });
});

describe('getMarketcapSnapshotLine Helpers', () => {
    let loadSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        transactionState.activeChart = 'marketcap';
        transactionState.chartDateRange = null;
        loadSpy = jest.spyOn(dataLoader, 'loadMarketcapSnapshotData');
    });

    afterEach(() => {
        if (loadSpy) {
            loadSpy.mockRestore();
        }
    });

    it('should test branches inside _isDateInRange indirectly', async () => {
        transactionState.chartDateRange = { from: '2023-01-01', to: '2023-12-31' };
        loadSpy.mockResolvedValue({
            dates: ['2023-01-01', '2023-06-01', '2023-12-31'],
            total_values: [100, 200, 300],
            series: {
                Tech: [50, 50, 50],
            },
        });
        const res = await getMarketcapSnapshotLine({ labelPrefix: 'Market Cap' });
        expect(res).toContain('Market Cap');
    });

    it('should test branches inside _getMarketcapHint', async () => {
        transactionState.chartDateRange = { from: '2023-01-01', to: '2023-12-31' };
        loadSpy.mockResolvedValue({
            dates: ['2023-01-01', '2023-06-01', '2023-12-31'],
            total_values: [100, 200, 300],
            series: {
                Tech: [50, 50, 50],
            },
        });
        const res1 = await getMarketcapSnapshotLine({ labelPrefix: 'Market Cap Abs' });
        expect(res1).toContain('Market Cap Abs');

        const res2 = await getMarketcapSnapshotLine({ labelPrefix: 'Unknown' });
        expect(res2).toContain('Unknown');
    });
});

describe('getMarketcapSnapshotLine Error paths', () => {
    let loadSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        transactionState.activeChart = 'marketcap';
        transactionState.chartDateRange = null;
        loadSpy = jest.spyOn(dataLoader, 'loadMarketcapSnapshotData');
    });

    afterEach(() => {
        if (loadSpy) {
            loadSpy.mockRestore();
        }
    });

    it('returns null if activeChart is not marketcap', async () => {
        transactionState.activeChart = 'composition';
        const res = await getMarketcapSnapshotLine();
        expect(res).toBeNull();
    });

    it('returns null if data is null', async () => {
        loadSpy.mockResolvedValue(null);
        const res = await getMarketcapSnapshotLine();
        expect(res).toBeNull();
    });
});

describe('_getSectorsHint', () => {
    it('returns hint for Sectors', () => {
        expect(_getSectorsHint('Sectors')).toContain("use 'abs' for absolute values");
    });

    it('returns hint for Sectors Abs', () => {
        expect(_getSectorsHint('Sectors Abs')).toContain("use 'per' for percentages");
    });

    it('returns empty string for unknown prefix', () => {
        expect(_getSectorsHint('Unknown')).toBe('');
    });
});
