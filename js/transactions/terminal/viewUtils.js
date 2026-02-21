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
        ].includes(activeChart)
    ) {
        return false;
    }
    const plotSection = document.getElementById('runningAmountSection');
    return plotSection && !plotSection.classList.contains('is-hidden');
}

export async function getActiveChartSummaryText() {
    const activeChart = transactionState.activeChart;
    if (activeChart === 'composition') {
        return await getCompositionSnapshotLine();
    }
    if (activeChart === 'compositionAbs') {
        return await getCompositionSnapshotLine({ labelPrefix: 'Composition Abs' });
    }
    if (activeChart === 'sectors') {
        return await getSectorsSnapshotLine();
    }
    if (activeChart === 'sectorsAbs') {
        return await getSectorsSnapshotLine({ labelPrefix: 'Sectors Abs' });
    }
    if (activeChart === 'performance') {
        return getPerformanceSnapshotLine({ includeHidden: true });
    }
    if (activeChart === 'fx') {
        return getFxSnapshotLine();
    }
    if (activeChart === 'contribution') {
        return await getContributionSummaryText(transactionState.chartDateRange);
    }
    if (activeChart === 'drawdown') {
        return getDrawdownSnapshotLine({ includeHidden: true });
    }
    if (activeChart === 'drawdownAbs') {
        return getDrawdownSnapshotLine({ includeHidden: true, isAbsolute: true });
    }
    if (activeChart === 'concentration') {
        return getConcentrationSnapshotText();
    }
    if (activeChart === 'pe') {
        return await getPESnapshotLine();
    }
    if (activeChart === 'rolling') {
        return getRollingSnapshotLine({ includeHidden: true });
    }
    if (activeChart === 'volatility') {
        return getVolatilitySnapshotLine({ includeHidden: true });
    }
    if (activeChart === 'yield') {
        return await getYieldSnapshotLine();
    }
    if (activeChart === 'beta') {
        return await getBetaSnapshotLine();
    }
    return null;
}
