import {
    getCompositionSnapshotLine,
    getSectorsSnapshotLine,
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
