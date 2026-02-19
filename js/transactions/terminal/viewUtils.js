import { transactionState } from '../state.js';
import {
    getDrawdownSnapshotLine,
    getPerformanceSnapshotLine,
    getCompositionSnapshotLine,
    getFxSnapshotLine,
    getContributionSummaryText,
    getConcentrationSnapshotText,
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
            'concentration',
            'fx',
            'drawdown',
            'drawdownAbs',
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
    return null;
}
