import { transactionState } from '../state.js';
import {
    getDrawdownSnapshotLine,
    getPerformanceSnapshotLine,
    getCompositionSnapshotLine,
    getFxSnapshotLine,
    getContributionSummaryText,
    getConcentrationSnapshotText,
    getPESnapshotLine,
    getRollingSnapshotLine,
    getVolatilitySnapshotLine,
    getSectorsSnapshotLine,
    getYieldSnapshotLine,
    getBetaSnapshotLine,
    getGeographySnapshotLine,
    getMarketcapSnapshotLine,
} from './snapshots.js';

export function ensureTransactionTableVisible() {
    const tableContainer = document.querySelector('.table-responsive-container');
    if (tableContainer) {
        tableContainer.classList.remove('is-hidden');
    }
    const plotSection = document.getElementById('runningAmountSection');
    if (plotSection) {
        plotSection.classList.add('is-hidden');
    }
}

export function isTransactionTableVisible() {
    const tableContainer = document.querySelector('.table-responsive-container');
    return Boolean(tableContainer && !tableContainer.classList.contains('is-hidden'));
}

export function isActiveChartVisible() {
    const activeChart = transactionState.activeChart;
    if (
        !activeChart ||
        ![
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
            'geography',
            'geographyAbs',
            'marketcap',
            'marketcapAbs',
        ].includes(activeChart)
    ) {
        return false;
    }
    const plotSection = document.getElementById('runningAmountSection');
    return plotSection && !plotSection.classList.contains('is-hidden');
}

export async function getActiveChartSummaryText() {
    const activeChart = transactionState.activeChart;
    const summaryMap = {
        'composition': () => getCompositionSnapshotLine(),
        'compositionAbs': () => getCompositionSnapshotLine({ labelPrefix: 'Composition Abs' }),
        'sectors': () => getSectorsSnapshotLine(),
        'sectorsAbs': () => getSectorsSnapshotLine({ labelPrefix: 'Sectors Abs' }),
        'performance': () => getPerformanceSnapshotLine({ includeHidden: true }),
        'fx': () => getFxSnapshotLine(),
        'contribution': () => getContributionSummaryText(transactionState.chartDateRange),
        'drawdown': () => getDrawdownSnapshotLine({ includeHidden: true }),
        'drawdownAbs': () => getDrawdownSnapshotLine({ includeHidden: true, isAbsolute: true }),
        'concentration': () => getConcentrationSnapshotText(),
        'pe': () => getPESnapshotLine(),
        'rolling': () => getRollingSnapshotLine({ includeHidden: true }),
        'volatility': () => getVolatilitySnapshotLine({ includeHidden: true }),
        'yield': () => getYieldSnapshotLine(),
        'beta': () => getBetaSnapshotLine(),
        'geography': () => getGeographySnapshotLine(),
        'geographyAbs': () => getGeographySnapshotLine({ labelPrefix: 'Geography Abs' }),
        'marketcap': () => getMarketcapSnapshotLine(),
        'marketcapAbs': () => getMarketcapSnapshotLine({ labelPrefix: 'Market Cap Abs' }),
    };

    if (summaryMap[activeChart]) {
        return await summaryMap[activeChart]();
    }
    return null;
}
