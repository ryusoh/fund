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
    } else if (activeChart === 'geography' || activeChart === 'geographyAbs') {
        if (!isChartVisible) {
            result = 'Geography chart must be active. Use `plot geography` first.';
        } else if (activeChart === 'geographyAbs') {
            result = 'Geography chart is already showing absolute values.';
        } else {
            setActiveChart('geographyAbs');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched geography chart to absolute view.';
            const { getGeographySnapshotLine } = await import('../snapshots.js');
            const summary = await getGeographySnapshotLine({
                labelPrefix: 'Geography Abs',
            });
            if (summary) {
                result += `\n${summary}`;
            }
        }
    } else {
        result =
            'Composition, Sectors, Geography, or Drawdown chart must be active to switch views. Use `plot composition`, `plot sectors`, `plot geography`, or `plot drawdown` first.';
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
    } else if (activeChart === 'geography' || activeChart === 'geographyAbs') {
        if (!isChartVisible) {
            result = 'Geography chart must be active. Use `plot geography` first.';
        } else if (activeChart === 'geography') {
            result = 'Geography chart is already showing percentages.';
        } else {
            setActiveChart('geography');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched geography chart to percentage view.';
            const { getGeographySnapshotLine } = await import('../snapshots.js');
            const summary = await getGeographySnapshotLine({
                labelPrefix: 'Geography',
            });
            if (summary) {
                result += `\n${summary}`;
            }
        }
    } else {
        result =
            'Composition, Sectors, Geography, or Drawdown chart must be active to switch views. Use `plot composition`, `plot sectors`, `plot geography`, or `plot drawdown` first.';
    }
    appendMessage(result);
}

export async function handleRollingCommand(args, { appendMessage, chartManager }) {
    let result = '';
    const chartSection = document.getElementById('runningAmountSection');
    const isChartVisible = chartSection && !chartSection.classList.contains('is-hidden');
    const activeChart = transactionState.activeChart;

    if (activeChart === 'rolling') {
        if (!isChartVisible) {
            setActiveChart('rolling');
            if (chartSection) {
                chartSection.classList.remove('is-hidden');
            }
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Showing 1-Year rolling returns chart.';
        } else {
            result = 'Rolling returns chart is already active.';
        }
    } else if (activeChart === 'performance') {
        if (!isChartVisible) {
            result = 'Performance chart must be visible. Use `plot performance` first.';
        } else {
            setActiveChart('rolling');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched to 1-Year rolling returns chart.';
        }
    } else {
        result =
            'Performance or Rolling chart must be active. Use `plot performance` or `plot rolling` first.';
    }

    if (result.includes('Showing') || result.includes('Switched')) {
        const { getRollingSnapshotLine } = await import('../snapshots.js');
        const summary = getRollingSnapshotLine({ includeHidden: true });
        if (summary) {
            result += `\n${summary}`;
        }
    }

    appendMessage(result);
}

export async function handleCumulativeCommand(args, { appendMessage, chartManager }) {
    let result = '';
    const chartSection = document.getElementById('runningAmountSection');
    const isChartVisible = chartSection && !chartSection.classList.contains('is-hidden');
    const activeChart = transactionState.activeChart;

    if (activeChart === 'performance') {
        if (!isChartVisible) {
            setActiveChart('performance');
            if (chartSection) {
                chartSection.classList.remove('is-hidden');
            }
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Showing performance chart.';
        } else {
            result = 'Performance chart is already active.';
        }
    } else if (activeChart === 'rolling') {
        if (!isChartVisible) {
            result = 'Rolling chart must be visible. Use `plot rolling` first.';
        } else {
            setActiveChart('performance');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched to cumulative performance chart.';
        }
    } else {
        result =
            'Performance or Rolling chart must be active. Use `plot performance` or `plot rolling` first.';
    }

    if (result.includes('Showing') || result.includes('Switched')) {
        const { getPerformanceSnapshotLine } = await import('../snapshots.js');
        const summary = getPerformanceSnapshotLine({ includeHidden: true });
        if (summary) {
            result += `\n${summary}`;
        }
    }

    appendMessage(result);
}

export async function handleCompositionCommand(args, { appendMessage, chartManager }) {
    let result = '';
    const chartSection = document.getElementById('runningAmountSection');
    const isChartVisible = chartSection && !chartSection.classList.contains('is-hidden');
    const activeChart = transactionState.activeChart;

    if (activeChart === 'composition' || activeChart === 'compositionAbs') {
        if (!isChartVisible) {
            setActiveChart(activeChart);
            if (chartSection) {
                chartSection.classList.remove('is-hidden');
            }
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Showing composition chart.';
        } else {
            result = 'Composition chart is already active.';
        }
    } else if (activeChart === 'sectors') {
        if (!isChartVisible) {
            result = 'Sector allocation chart must be visible. Use `plot sectors` first.';
        } else {
            setActiveChart('composition');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched to composition chart.';
        }
    } else if (activeChart === 'sectorsAbs') {
        if (!isChartVisible) {
            result = 'Sector allocation chart must be visible. Use `plot sectors abs` first.';
        } else {
            setActiveChart('compositionAbs');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched to composition chart (absolute view).';
        }
    } else if (activeChart === 'geography') {
        if (!isChartVisible) {
            result = 'Geography chart must be visible. Use `plot geography` first.';
        } else {
            setActiveChart('composition');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched to composition chart.';
        }
    } else if (activeChart === 'geographyAbs') {
        if (!isChartVisible) {
            result = 'Geography chart must be visible. Use `plot geography abs` first.';
        } else {
            setActiveChart('compositionAbs');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched to composition chart (absolute view).';
        }
    } else {
        result =
            'Composition, Sectors, or Geography chart must be active. Use `plot composition`, `plot sectors`, or `plot geography` first.';
    }

    if (result.includes('Showing') || result.includes('Switched')) {
        const { getCompositionSnapshotLine } = await import('../snapshots.js');
        const labelPrefix =
            activeChart === 'sectorsAbs' ||
            activeChart === 'compositionAbs' ||
            activeChart === 'geographyAbs'
                ? 'Composition Abs'
                : 'Composition';
        const summary = await getCompositionSnapshotLine({
            labelPrefix,
        });
        if (summary) {
            result += `\n${summary}`;
        }
    }

    appendMessage(result);
}

export async function handleSectorsCommand(args, { appendMessage, chartManager }) {
    let result = '';
    const chartSection = document.getElementById('runningAmountSection');
    const isChartVisible = chartSection && !chartSection.classList.contains('is-hidden');
    const activeChart = transactionState.activeChart;

    if (activeChart === 'sectors' || activeChart === 'sectorsAbs') {
        if (!isChartVisible) {
            setActiveChart(activeChart);
            if (chartSection) {
                chartSection.classList.remove('is-hidden');
            }
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Showing sector allocation chart.';
        } else {
            result = 'Sector allocation chart is already active.';
        }
    } else if (activeChart === 'composition') {
        if (!isChartVisible) {
            result = 'Composition chart must be visible. Use `plot composition` first.';
        } else {
            setActiveChart('sectors');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched to sector allocation chart.';
        }
    } else if (activeChart === 'compositionAbs') {
        if (!isChartVisible) {
            result = 'Composition chart must be visible. Use `plot composition abs` first.';
        } else {
            setActiveChart('sectorsAbs');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched to sector allocation chart (absolute view).';
        }
    } else if (activeChart === 'geography') {
        if (!isChartVisible) {
            result = 'Geography chart must be visible. Use `plot geography` first.';
        } else {
            setActiveChart('sectors');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched to sector allocation chart.';
        }
    } else if (activeChart === 'geographyAbs') {
        if (!isChartVisible) {
            result = 'Geography chart must be visible. Use `plot geography abs` first.';
        } else {
            setActiveChart('sectorsAbs');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched to sector allocation chart (absolute view).';
        }
    } else {
        result =
            'Composition, Sectors, or Geography chart must be active. Use `plot composition`, `plot sectors`, or `plot geography` first.';
    }

    if (result.includes('Showing') || result.includes('Switched')) {
        const { getSectorsSnapshotLine } = await import('../snapshots.js');
        const labelPrefix =
            activeChart === 'compositionAbs' ||
            activeChart === 'sectorsAbs' ||
            activeChart === 'geographyAbs'
                ? 'Sectors Abs'
                : 'Sectors';
        const summary = await getSectorsSnapshotLine({
            labelPrefix,
        });
        if (summary) {
            result += `\n${summary}`;
        }
    }

    appendMessage(result);
}

export async function handleGeographyCommand(args, { appendMessage, chartManager }) {
    let result = '';
    const chartSection = document.getElementById('runningAmountSection');
    const isChartVisible = chartSection && !chartSection.classList.contains('is-hidden');
    const activeChart = transactionState.activeChart;

    if (activeChart === 'geography' || activeChart === 'geographyAbs') {
        if (!isChartVisible) {
            setActiveChart(activeChart);
            if (chartSection) {
                chartSection.classList.remove('is-hidden');
            }
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Showing geography chart.';
        } else {
            result = 'Geography chart is already active.';
        }
    } else if (activeChart === 'composition') {
        if (!isChartVisible) {
            result = 'Composition chart must be visible. Use `plot composition` first.';
        } else {
            setActiveChart('geography');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched to geography chart.';
        }
    } else if (activeChart === 'compositionAbs') {
        if (!isChartVisible) {
            result = 'Composition chart must be visible. Use `plot composition abs` first.';
        } else {
            setActiveChart('geographyAbs');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched to geography chart (absolute view).';
        }
    } else if (activeChart === 'sectors') {
        if (!isChartVisible) {
            result = 'Sector allocation chart must be visible. Use `plot sectors` first.';
        } else {
            setActiveChart('geography');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched to geography chart.';
        }
    } else if (activeChart === 'sectorsAbs') {
        if (!isChartVisible) {
            result = 'Sector allocation chart must be visible. Use `plot sectors abs` first.';
        } else {
            setActiveChart('geographyAbs');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched to geography chart (absolute view).';
        }
    } else {
        result =
            'Composition, Sectors, or Geography chart must be active. Use `plot composition`, `plot sectors`, or `plot geography` first.';
    }

    if (result.includes('Showing') || result.includes('Switched')) {
        const { getGeographySnapshotLine } = await import('../snapshots.js');
        const labelPrefix =
            activeChart === 'compositionAbs' ||
            activeChart === 'sectorsAbs' ||
            activeChart === 'geographyAbs'
                ? 'Geography Abs'
                : 'Geography';
        const summary = await getGeographySnapshotLine({
            labelPrefix,
        });
        if (summary) {
            result += `\n${summary}`;
        }
    }

    appendMessage(result);
}
