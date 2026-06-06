import {
    isActiveChartVisible,
    ensureTransactionTableVisible,
    isTransactionTableVisible,
    getActiveChartSummaryText,
} from '../../../../js/transactions/terminal/viewUtils.js';
import * as snapshotsModule from '../../../../js/transactions/terminal/snapshots.js';
import { transactionState } from '../../../../js/transactions/state.js';

describe('viewUtils - isActiveChartVisible', () => {
    beforeEach(() => {
        // Reset state
        transactionState.activeChart = null;

        // Mock document structure
        document.body.innerHTML = `
            <div id="runningAmountSection" class="is-hidden"></div>
            <div class="table-responsive-container"></div>
        `;
    });

    it('returns false when activeChart is null', () => {
        transactionState.activeChart = null;
        expect(isActiveChartVisible()).toBe(false);
    });

    it('returns false when activeChart is not a valid chart type', () => {
        transactionState.activeChart = 'invalidChartType';
        expect(isActiveChartVisible()).toBe(false);
    });

    it('returns false when plotSection has is-hidden class', () => {
        transactionState.activeChart = 'yield';
        const plotSection = document.getElementById('runningAmountSection');
        plotSection.classList.add('is-hidden');

        expect(isActiveChartVisible()).toBe(false);
    });

    it('returns true for valid chart types when plotSection is visible', () => {
        const plotSection = document.getElementById('runningAmountSection');
        plotSection.classList.remove('is-hidden');

        const validCharts = [
            'contribution',
            'performance',
            'composition',
            'compositionAbs',
            'sectors',
            'sectorsAbs',
            'concentration',
            'pe',
            'fx',
            'drawdown',
            'drawdownAbs',
            'rolling',
            'volatility',
            'yield',
            'beta',
        ];

        validCharts.forEach((chartType) => {
            transactionState.activeChart = chartType;
            expect(isActiveChartVisible()).toBe(true);
        });
    });
});

describe('viewUtils - ensureTransactionTableVisible', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="runningAmountSection" class=""></div>
            <div class="table-responsive-container is-hidden"></div>
        `;
    });

    it('should remove is-hidden from table-responsive-container and add to runningAmountSection', () => {
        ensureTransactionTableVisible();
        const table = document.querySelector('.table-responsive-container');
        const section = document.getElementById('runningAmountSection');
        expect(table.classList.contains('is-hidden')).toBe(false);
        expect(section.classList.contains('is-hidden')).toBe(true);
    });

    it('should handle missing elements gracefully', () => {
        document.body.innerHTML = '';
        expect(() => ensureTransactionTableVisible()).not.toThrow();
    });
});

describe('viewUtils - isTransactionTableVisible', () => {
    it('returns false when table container does not exist', () => {
        document.body.innerHTML = '';
        expect(isTransactionTableVisible()).toBe(false);
    });

    it('returns false when table container is hidden', () => {
        document.body.innerHTML = '<div class="table-responsive-container is-hidden"></div>';
        expect(isTransactionTableVisible()).toBe(false);
    });

    it('returns true when table container is visible', () => {
        document.body.innerHTML = '<div class="table-responsive-container"></div>';
        expect(isTransactionTableVisible()).toBe(true);
    });
});

describe('viewUtils - getActiveChartSummaryText', () => {
    let compositionSpy;
    let sectorsSpy;
    let performanceSpy;
    let fxSpy;
    let contributionSpy;
    let drawdownSpy;
    let concentrationSpy;
    let peSpy;
    let rollingSpy;
    let volatilitySpy;
    let yieldSpy;
    let betaSpy;
    let geographySpy;
    let marketcapSpy;

    beforeEach(() => {
        compositionSpy = jest
            .spyOn(snapshotsModule, 'getCompositionSnapshotLine')
            .mockResolvedValue('composition text');
        sectorsSpy = jest
            .spyOn(snapshotsModule, 'getSectorsSnapshotLine')
            .mockResolvedValue('sectors text');
        performanceSpy = jest
            .spyOn(snapshotsModule, 'getPerformanceSnapshotLine')
            .mockReturnValue('performance text');
        fxSpy = jest.spyOn(snapshotsModule, 'getFxSnapshotLine').mockReturnValue('fx text');
        contributionSpy = jest
            .spyOn(snapshotsModule, 'getContributionSummaryText')
            .mockResolvedValue('contribution text');
        drawdownSpy = jest
            .spyOn(snapshotsModule, 'getDrawdownSnapshotLine')
            .mockReturnValue('drawdown text');
        concentrationSpy = jest
            .spyOn(snapshotsModule, 'getConcentrationSnapshotText')
            .mockReturnValue('concentration text');
        peSpy = jest.spyOn(snapshotsModule, 'getPESnapshotLine').mockResolvedValue('pe text');
        rollingSpy = jest
            .spyOn(snapshotsModule, 'getRollingSnapshotLine')
            .mockReturnValue('rolling text');
        volatilitySpy = jest
            .spyOn(snapshotsModule, 'getVolatilitySnapshotLine')
            .mockReturnValue('volatility text');
        yieldSpy = jest
            .spyOn(snapshotsModule, 'getYieldSnapshotLine')
            .mockResolvedValue('yield text');
        betaSpy = jest.spyOn(snapshotsModule, 'getBetaSnapshotLine').mockResolvedValue('beta text');
        geographySpy = jest
            .spyOn(snapshotsModule, 'getGeographySnapshotLine')
            .mockResolvedValue('geography text');
        marketcapSpy = jest
            .spyOn(snapshotsModule, 'getMarketcapSnapshotLine')
            .mockResolvedValue('marketcap text');
    });

    afterEach(() => {
        jest.restoreAllMocks();
        transactionState.activeChart = null;
        transactionState.chartDateRange = null;
    });

    it('returns composition text for composition', async () => {
        transactionState.activeChart = 'composition';
        const res = await getActiveChartSummaryText();
        expect(res).toBe('composition text');
        expect(compositionSpy).toHaveBeenCalledWith();
    });

    it('returns composition text for compositionAbs', async () => {
        transactionState.activeChart = 'compositionAbs';
        const res = await getActiveChartSummaryText();
        expect(res).toBe('composition text');
        expect(compositionSpy).toHaveBeenCalledWith({ labelPrefix: 'Composition Abs' });
    });

    it('returns sectors text for sectors', async () => {
        transactionState.activeChart = 'sectors';
        const res = await getActiveChartSummaryText();
        expect(res).toBe('sectors text');
        expect(sectorsSpy).toHaveBeenCalledWith();
    });

    it('returns sectors text for sectorsAbs', async () => {
        transactionState.activeChart = 'sectorsAbs';
        const res = await getActiveChartSummaryText();
        expect(res).toBe('sectors text');
        expect(sectorsSpy).toHaveBeenCalledWith({ labelPrefix: 'Sectors Abs' });
    });

    it('returns performance text for performance', async () => {
        transactionState.activeChart = 'performance';
        const res = await getActiveChartSummaryText();
        expect(res).toBe('performance text');
        expect(performanceSpy).toHaveBeenCalledWith({ includeHidden: true });
    });

    it('returns fx text for fx', async () => {
        transactionState.activeChart = 'fx';
        const res = await getActiveChartSummaryText();
        expect(res).toBe('fx text');
        expect(fxSpy).toHaveBeenCalledWith();
    });

    it('returns contribution text for contribution', async () => {
        transactionState.activeChart = 'contribution';
        transactionState.chartDateRange = 'YTD';
        const res = await getActiveChartSummaryText();
        expect(res).toBe('contribution text');
        expect(contributionSpy).toHaveBeenCalledWith('YTD');
    });

    it('returns drawdown text for drawdown', async () => {
        transactionState.activeChart = 'drawdown';
        const res = await getActiveChartSummaryText();
        expect(res).toBe('drawdown text');
        expect(drawdownSpy).toHaveBeenCalledWith({ includeHidden: true });
    });

    it('returns drawdown text for drawdownAbs', async () => {
        transactionState.activeChart = 'drawdownAbs';
        const res = await getActiveChartSummaryText();
        expect(res).toBe('drawdown text');
        expect(drawdownSpy).toHaveBeenCalledWith({ includeHidden: true, isAbsolute: true });
    });

    it('returns concentration text for concentration', async () => {
        transactionState.activeChart = 'concentration';
        const res = await getActiveChartSummaryText();
        expect(res).toBe('concentration text');
        expect(concentrationSpy).toHaveBeenCalledWith();
    });

    it('returns pe text for pe', async () => {
        transactionState.activeChart = 'pe';
        const res = await getActiveChartSummaryText();
        expect(res).toBe('pe text');
        expect(peSpy).toHaveBeenCalledWith();
    });

    it('returns rolling text for rolling', async () => {
        transactionState.activeChart = 'rolling';
        const res = await getActiveChartSummaryText();
        expect(res).toBe('rolling text');
        expect(rollingSpy).toHaveBeenCalledWith({ includeHidden: true });
    });

    it('returns volatility text for volatility', async () => {
        transactionState.activeChart = 'volatility';
        const res = await getActiveChartSummaryText();
        expect(res).toBe('volatility text');
        expect(volatilitySpy).toHaveBeenCalledWith({ includeHidden: true });
    });

    it('returns yield text for yield', async () => {
        transactionState.activeChart = 'yield';
        const res = await getActiveChartSummaryText();
        expect(res).toBe('yield text');
        expect(yieldSpy).toHaveBeenCalledWith();
    });

    it('returns beta text for beta', async () => {
        transactionState.activeChart = 'beta';
        const res = await getActiveChartSummaryText();
        expect(res).toBe('beta text');
        expect(betaSpy).toHaveBeenCalledWith();
    });

    it('returns geography text for geography', async () => {
        transactionState.activeChart = 'geography';
        const res = await getActiveChartSummaryText();
        expect(res).toBe('geography text');
        expect(geographySpy).toHaveBeenCalledWith();
    });

    it('returns geography text for geographyAbs', async () => {
        transactionState.activeChart = 'geographyAbs';
        const res = await getActiveChartSummaryText();
        expect(res).toBe('geography text');
        expect(geographySpy).toHaveBeenCalledWith({ labelPrefix: 'Geography Abs' });
    });

    it('returns marketcap text for marketcap', async () => {
        transactionState.activeChart = 'marketcap';
        const res = await getActiveChartSummaryText();
        expect(res).toBe('marketcap text');
        expect(marketcapSpy).toHaveBeenCalledWith();
    });

    it('returns marketcap text for marketcapAbs', async () => {
        transactionState.activeChart = 'marketcapAbs';
        const res = await getActiveChartSummaryText();
        expect(res).toBe('marketcap text');
        expect(marketcapSpy).toHaveBeenCalledWith({ labelPrefix: 'Market Cap Abs' });
    });

    it('returns null for unknown charts', async () => {
        transactionState.activeChart = 'unknown';
        const res = await getActiveChartSummaryText();
        expect(res).toBeNull();
    });
});
