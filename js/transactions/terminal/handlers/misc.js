import {
    transactionState,
    setChartDateRange,
    setActiveChart,
    setCompositionFilterTickers,
    setCompositionAssetClassFilter,
} from '../../state.js';
import { updateContextYearFromRange } from '../dateUtils.js';
import { getDynamicStatsText } from '../../terminalStats.js';
import {
    getActiveChartSummaryText,
    isActiveChartVisible,
    isTransactionTableVisible,
} from '../viewUtils.js';
import {
    getFxSnapshotLine,
    getCompositionSnapshotLine,
    getDrawdownSnapshotLine,
} from '../snapshots.js';
import { toggleZoom } from '../../zoom.js';
import { requestFadeUpdate, setFadePreserveSecondLast } from '../../fade.js';

export async function handleAllCommand(
    args,
    { appendMessage, closeAllFilterDropdowns, resetSortState, filterAndSort, chartManager }
) {
    closeAllFilterDropdowns();
    resetSortState();
    setChartDateRange({ from: null, to: null }); // Reset date range
    updateContextYearFromRange({ from: null, to: null });
    filterAndSort(''); // Clear all filters

    // Update chart if it's currently visible
    if (isActiveChartVisible()) {
        chartManager.update();
    }

    let result = 'Showing all data (filters and date ranges cleared).';

    if (isTransactionTableVisible()) {
        const statsText = await getDynamicStatsText(transactionState.selectedCurrency || 'USD');
        if (statsText) {
            result += statsText.startsWith('\n') ? statsText : `\n${statsText}`;
        }
    } else {
        const summaryText = await getActiveChartSummaryText();
        if (summaryText) {
            result += `\n${summaryText}`;
        }
    }

    const fxSnapshot = getFxSnapshotLine();
    if (fxSnapshot && transactionState.activeChart !== 'fx') {
        result += `\n${fxSnapshot}`;
    }
    appendMessage(result);
}

export async function handleAllTimeCommand(args, { appendMessage, filterAndSort, chartManager }) {
    setChartDateRange({ from: null, to: null });
    updateContextYearFromRange({ from: null, to: null });
    filterAndSort(transactionState.activeFilterTerm || '');
    if (isActiveChartVisible() && chartManager && typeof chartManager.update === 'function') {
        chartManager.update();
    }
    let result = 'Cleared chart date filters.';

    if (isTransactionTableVisible()) {
        const statsText = await getDynamicStatsText(transactionState.selectedCurrency || 'USD');
        if (statsText) {
            result += statsText.startsWith('\n') ? statsText : `\n${statsText}`;
        }
    } else {
        const summaryText = await getActiveChartSummaryText();
        if (summaryText) {
            result += `\n${summaryText}`;
        }
    }
    appendMessage(result);
}

export async function handleAllStockCommand(
    args,
    { appendMessage, filterAndSort, chartManager, terminalInput }
) {
    const currentTerm = transactionState.activeFilterTerm || '';
    const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\\]/g, '\\$&');
    const activeTickers = transactionState.compositionFilterTickers || [];
    let cleanedTerm = currentTerm
        .replace(/^\s*(stock|etf)\s*:?/gi, ' ')
        .replace(/\b(stock|etf)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    activeTickers.forEach((ticker) => {
        const escaped = escapeRegExp(ticker);
        const tickerRegex = new RegExp(`\\b${escaped}\\b`, 'gi');
        const securityRegex = new RegExp(`\\bsecurity:${escaped}\\b`, 'gi');
        const shorthandRegex = new RegExp(`\\bs:${escaped}\\b`, 'gi');
        cleanedTerm = cleanedTerm
            .replace(tickerRegex, ' ')
            .replace(securityRegex, ' ')
            .replace(shorthandRegex, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    });
    if (terminalInput) {
        terminalInput.value = cleanedTerm;
    }
    setCompositionFilterTickers([]);
    setCompositionAssetClassFilter(null);
    filterAndSort(cleanedTerm);
    if (isActiveChartVisible() && chartManager && typeof chartManager.update === 'function') {
        chartManager.update();
    }
    let result = 'Cleared composition ticker filters.';

    if (isTransactionTableVisible()) {
        const statsText = await getDynamicStatsText(transactionState.selectedCurrency || 'USD');
        if (statsText) {
            result += statsText.startsWith('\n') ? statsText : `\n${statsText}`;
        }
    } else {
        const summary = await getActiveChartSummaryText();
        if (summary) {
            result += `\n${summary}`;
        }
    }
    appendMessage(result);
}

export async function handleResetCommand(
    args,
    { appendMessage, closeAllFilterDropdowns, resetSortState, filterAndSort, terminalInput }
) {
    closeAllFilterDropdowns();
    resetSortState();
    setChartDateRange({ from: null, to: null }); // Reset date range
    updateContextYearFromRange({ from: null, to: null });
    if (terminalInput) {
        terminalInput.value = '';
    }
    // Hide both table and chart
    const resetTableContainer = document.querySelector('.table-responsive-container');
    const resetPlotSection = document.getElementById('runningAmountSection');
    const resetPerformanceSection = document.getElementById('performanceSection');

    if (resetTableContainer) {
        resetTableContainer.classList.add('is-hidden');
    }
    if (resetPlotSection) {
        resetPlotSection.classList.add('is-hidden');
    }
    if (resetPerformanceSection) {
        resetPerformanceSection.classList.add('is-hidden');
    }

    filterAndSort('');
    const result =
        'Reset filters and date ranges. All views hidden. Use `table`, `plot`, or `performance` to view data.';
    requestFadeUpdate();
    appendMessage(result);
}

export function handleClearCommand(
    args,
    { clearOutput, closeAllFilterDropdowns, resetSortState, filterAndSort, terminalInput }
) {
    if (typeof clearOutput === 'function') {
        clearOutput();
    } else if (document.getElementById('terminalOutput')) {
        document.getElementById('terminalOutput').innerHTML = '';
    }

    closeAllFilterDropdowns();
    resetSortState();
    setChartDateRange({ from: null, to: null }); // Reset date range
    updateContextYearFromRange({ from: null, to: null });
    if (terminalInput) {
        terminalInput.value = '';
    }
    filterAndSort('');
    document
        .querySelectorAll('.table-responsive-container, #runningAmountSection')
        .forEach((el) => el.classList.add('is-hidden'));
    requestFadeUpdate();
}

export async function handleZoomCommand(args, { appendMessage }) {
    setFadePreserveSecondLast(true);
    const zoomResult = await toggleZoom();
    appendMessage(zoomResult.message);
}

export async function handleSummaryCommand(args, { appendMessage }) {
    let resultText = '';

    if (isTransactionTableVisible()) {
        const statsText = await getDynamicStatsText(transactionState.selectedCurrency || 'USD');
        if (statsText) {
            resultText = statsText;
        }
    } else {
        const chartSummary = await getActiveChartSummaryText();
        if (chartSummary) {
            resultText = chartSummary;
        }
    }

    const result = resultText || 'No active chart or summary available.';
    appendMessage(result);
}

export function handleLabelCommand(args, { appendMessage, chartManager }) {
    const nextState = !(transactionState.showChartLabels === false);
    transactionState.showChartLabels = !nextState;
    const result = `Chart labels are now ${transactionState.showChartLabels ? 'visible' : 'hidden'}.`;
    if (chartManager && typeof chartManager.redraw === 'function') {
        chartManager.redraw();
    }
    appendMessage(result);
}

export async function handleAbsCommand(args, { appendMessage, chartManager }) {
    let result = '';
    const chartSection = document.getElementById('runningAmountSection');
    const isChartVisible = chartSection && !chartSection.classList.contains('is-hidden');
    const activeChart = transactionState.activeChart;

    if (activeChart === 'composition' || activeChart === 'compositionAbs') {
        if (!isChartVisible) {
            result = 'Composition chart must be active. Use `plot composition` first.';
        } else if (activeChart === 'compositionAbs') {
            result = 'Composition chart is already showing absolute values.';
        } else {
            setActiveChart('compositionAbs');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched composition chart to absolute view.';
            const summary = await getCompositionSnapshotLine({
                labelPrefix: 'Composition Abs',
            });
            if (summary) {
                result += `\n${summary}`;
            }
        }
    } else if (activeChart === 'drawdown' || activeChart === 'drawdownAbs') {
        if (!isChartVisible) {
            result = 'Drawdown chart must be active. Use `plot drawdown` first.';
        } else if (activeChart === 'drawdownAbs') {
            result = 'Drawdown chart is already showing absolute values.';
        } else {
            setActiveChart('drawdownAbs');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched drawdown chart to absolute view.';
            const summary = getDrawdownSnapshotLine({
                includeHidden: true,
                isAbsolute: true,
            });
            if (summary) {
                result += `\n${summary}`;
            }
        }
    } else if (activeChart === 'sectors' || activeChart === 'sectorsAbs') {
        if (!isChartVisible) {
            result = 'Sector allocation chart must be active. Use `plot sectors` first.';
        } else if (activeChart === 'sectorsAbs') {
            result = 'Sector allocation chart is already showing absolute values.';
        } else {
            setActiveChart('sectorsAbs');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched sector allocation chart to absolute view.';
            const { getSectorsSnapshotLine } = await import('../snapshots.js');
            const summary = await getSectorsSnapshotLine({
                labelPrefix: 'Sectors Abs',
            });
            if (summary) {
                result += `\n${summary}`;
            }
        }
    } else {
        result =
            'Composition, Sectors, or Drawdown chart must be active to switch views. Use `plot composition`, `plot sectors`, or `plot drawdown` first.';
    }
    appendMessage(result);
}

export async function handlePercentageCommand(args, { appendMessage, chartManager }) {
    let result = '';
    const chartSection = document.getElementById('runningAmountSection');
    const isChartVisible = chartSection && !chartSection.classList.contains('is-hidden');
    const activeChart = transactionState.activeChart;

    if (activeChart === 'composition' || activeChart === 'compositionAbs') {
        if (!isChartVisible) {
            result = 'Composition chart must be active. Use `plot composition` first.';
        } else if (activeChart === 'composition') {
            result = 'Composition chart is already showing percentages.';
        } else {
            setActiveChart('composition');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched composition chart to percentage view.';
            const summary = await getCompositionSnapshotLine({
                labelPrefix: 'Composition',
            });
            if (summary) {
                result += `\n${summary}`;
            }
        }
    } else if (activeChart === 'drawdown' || activeChart === 'drawdownAbs') {
        if (!isChartVisible) {
            result = 'Drawdown chart must be active. Use `plot drawdown` first.';
        } else if (activeChart === 'drawdown') {
            result = 'Drawdown chart is already showing percentages.';
        } else {
            setActiveChart('drawdown');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched drawdown chart to percentage view.';
            const summary = getDrawdownSnapshotLine({
                includeHidden: true,
                isAbsolute: false,
            });
            if (summary) {
                result += `\n${summary}`;
            }
        }
    } else if (activeChart === 'sectors' || activeChart === 'sectorsAbs') {
        if (!isChartVisible) {
            result = 'Sector allocation chart must be active. Use `plot sectors` first.';
        } else if (activeChart === 'sectors') {
            result = 'Sector allocation chart is already showing percentages.';
        } else {
            setActiveChart('sectors');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched sector allocation chart to percentage view.';
            const { getSectorsSnapshotLine } = await import('../snapshots.js');
            const summary = await getSectorsSnapshotLine({
                labelPrefix: 'Sectors',
            });
            if (summary) {
                result += `\n${summary}`;
            }
        }
    } else {
        result =
            'Composition, Sectors, or Drawdown chart must be active to switch views. Use `plot composition`, `plot sectors`, or `plot drawdown` first.';
    }
    appendMessage(result);
}
