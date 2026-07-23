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
    } else {
        const terminalOutput = document.getElementById('terminalOutput');
        if (terminalOutput) {
            if (typeof terminalOutput.replaceChildren === 'function') {
                terminalOutput.replaceChildren();
            } else {
                // Fallback for jsdom
                terminalOutput.textContent = '';
            }
        }
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

const CHART_CONFIGS = {
    composition: {
        base: 'composition',
        abs: 'compositionAbs',
        name: 'Composition',
        snapshot: getCompositionSnapshotLine,
        snapshotLabel: 'Composition',
    },
    drawdown: {
        base: 'drawdown',
        abs: 'drawdownAbs',
        name: 'Drawdown',
        snapshot: () => getDrawdownSnapshotLine({ includeHidden: true, isAbsolute: true }),
        pctSnapshot: () => getDrawdownSnapshotLine({ includeHidden: true, isAbsolute: false }),
        snapshotLabel: '',
    },
    sectors: {
        base: 'sectors',
        abs: 'sectorsAbs',
        name: 'Sector allocation',
        snapshot: async (opts) => {
            const mod = await import('../snapshots.js');
            return mod.getSectorsSnapshotLine(opts);
        },
        snapshotLabel: 'Sectors',
    },
    geography: {
        base: 'geography',
        abs: 'geographyAbs',
        name: 'Geography',
        snapshot: async (opts) => {
            const mod = await import('../snapshots.js');
            return mod.getGeographySnapshotLine(opts);
        },
        snapshotLabel: 'Geography',
    },
    marketcap: {
        base: 'marketcap',
        abs: 'marketcapAbs',
        name: 'Market cap',
        snapshot: async (opts) => {
            const mod = await import('../snapshots.js');
            return mod.getMarketcapSnapshotLine(opts);
        },
        snapshotLabel: 'Market Cap',
    },
};

function getMatchedChartConfig(activeChart) {
    return Object.values(CHART_CONFIGS).find(
        (config) => activeChart === config.base || activeChart === config.abs
    );
}

async function getChartSnapshot(config, isAbs) {
    if (config.base === 'drawdown') {
        return isAbs ? config.snapshot() : config.pctSnapshot();
    }
    const prefix = `${config.snapshotLabel}${isAbs ? ' Abs' : ''}`;
    return await config.snapshot({ labelPrefix: prefix });
}

function updateChartStateAndRender(targetChart, chartManager) {
    setActiveChart(targetChart);
    if (chartManager && typeof chartManager.update === 'function') {
        chartManager.update();
    }
}

export async function handleAbsCommand(args, context) {
    const { appendMessage, chartManager } = context;
    let result = '';
    const chartSection = document.getElementById('runningAmountSection');
    const isChartVisible = chartSection && !chartSection.classList.contains('is-hidden');
    const activeChart = transactionState.activeChart;

    const matchedConfig = getMatchedChartConfig(activeChart);

    if (!matchedConfig) {
        result =
            'Composition, Sectors, Geography, Drawdown, or Market Cap chart must be active to switch views. Use `plot composition`, `plot sectors`, `plot geography`, `plot drawdown`, or `plot marketcap` first.';
    } else {
        const targetChart = matchedConfig.abs;

        if (!isChartVisible) {
            result = `${matchedConfig.name} chart must be active. Use \`plot ${matchedConfig.base}\` first.`;
        } else if (activeChart === targetChart) {
            result = `${matchedConfig.name} chart is already showing absolute values.`;
        } else {
            updateChartStateAndRender(targetChart, chartManager);
            result = `Switched ${matchedConfig.name.toLowerCase()} chart to absolute view.`;

            const summary = await getChartSnapshot(matchedConfig, true);
            if (summary) {
                result += `
${summary}`;
            }
        }
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
    } else if (activeChart === 'marketcap' || activeChart === 'marketcapAbs') {
        if (!isChartVisible) {
            result = 'Market cap chart must be active. Use `plot marketcap` first.';
        } else if (activeChart === 'marketcap') {
            result = 'Market cap chart is already showing percentages.';
        } else {
            setActiveChart('marketcap');
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update();
            }
            result = 'Switched market cap chart to percentage view.';
            const { getMarketcapSnapshotLine } = await import('../snapshots.js');
            const summary = await getMarketcapSnapshotLine({
                labelPrefix: 'Market Cap',
            });
            if (summary) {
                result += `\n${summary}`;
            }
        }
    } else {
        result =
            'Composition, Sectors, Geography, Drawdown, or Market Cap chart must be active to switch views. Use `plot composition`, `plot sectors`, `plot geography`, `plot drawdown`, or `plot marketcap` first.';
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

const COMPOSITION_TRANSITIONS = {
    composition: { action: 'show', target: 'composition', label: 'Composition' },
    compositionAbs: { action: 'show', target: 'compositionAbs', label: 'Composition Abs' },
    sectors: {
        action: 'switch',
        target: 'composition',
        label: 'Composition',
        req: 'Sector allocation chart must be visible. Use `plot sectors` first.',
    },
    sectorsAbs: {
        action: 'switch',
        target: 'compositionAbs',
        label: 'Composition Abs',
        req: 'Sector allocation chart must be visible. Use `plot sectors abs` first.',
    },
    geography: {
        action: 'switch',
        target: 'composition',
        label: 'Composition',
        req: 'Geography chart must be visible. Use `plot geography` first.',
    },
    geographyAbs: {
        action: 'switch',
        target: 'compositionAbs',
        label: 'Composition Abs',
        req: 'Geography chart must be visible. Use `plot geography abs` first.',
    },
    marketcap: {
        action: 'switch',
        target: 'composition',
        label: 'Composition',
        req: 'Market cap chart must be visible. Use `plot marketcap` first.',
    },
    marketcapAbs: {
        action: 'switch',
        target: 'compositionAbs',
        label: 'Composition',
        req: 'Market cap chart must be visible. Use `plot marketcap abs` first.',
    },
};

function checkCompositionVisibility(transition, isChartVisible) {
    if (!transition) {
        return {
            result: 'Composition, Sectors, Geography, or Market Cap chart must be active. Use `plot composition`, `plot sectors`, `plot geography`, or `plot marketcap` first.',
            labelPrefix: null,
            success: false,
            needsUpdate: false,
        };
    }
    if (transition.action === 'show') {
        if (!isChartVisible) {
            return {
                result: 'Showing composition chart.',
                labelPrefix: transition.label,
                success: true,
                needsUpdate: true,
                target: transition.target,
            };
        }
        return {
            result: 'Composition chart is already active.',
            labelPrefix: null,
            success: false,
            needsUpdate: false,
        };
    }
    if (!isChartVisible) {
        return { result: transition.req, labelPrefix: null, success: false, needsUpdate: false };
    }
    const suffix = transition.target === 'compositionAbs' ? ' (absolute view)' : '';
    return {
        result: `Switched to composition chart${suffix}.`,
        labelPrefix: transition.label,
        success: true,
        needsUpdate: true,
        target: transition.target,
    };
}

export async function handleCompositionCommand(args, { appendMessage, chartManager }) {
    const chartSection = document.getElementById('runningAmountSection');
    const isChartVisible = chartSection && !chartSection.classList.contains('is-hidden');
    const activeChart = transactionState.activeChart;

    const transition = COMPOSITION_TRANSITIONS[activeChart];
    const state = checkCompositionVisibility(transition, isChartVisible);

    if (state.needsUpdate) {
        setActiveChart(state.target);
        if (chartSection) {
            chartSection.classList.remove('is-hidden');
        }
        if (chartManager && typeof chartManager.update === 'function') {
            chartManager.update();
        }
    }

    let finalResult = state.result;
    if (state.success && state.labelPrefix) {
        const { getCompositionSnapshotLine } = await import('../snapshots.js');
        const summary = await getCompositionSnapshotLine({ labelPrefix: state.labelPrefix });
        if (summary) {
            finalResult += `\n${summary}`;
        }
    }

    appendMessage(finalResult);
}

const SECTORS_TRANSITIONS = {
    sectors: { action: 'show', target: 'sectors', label: 'Sectors' },
    sectorsAbs: { action: 'show', target: 'sectorsAbs', label: 'Sectors Abs' },
    composition: {
        action: 'switch',
        target: 'sectors',
        label: 'Sectors',
        req: 'Composition chart must be visible. Use `plot composition` first.',
    },
    compositionAbs: {
        action: 'switch',
        target: 'sectorsAbs',
        label: 'Sectors Abs',
        req: 'Composition chart must be visible. Use `plot composition abs` first.',
    },
    geography: {
        action: 'switch',
        target: 'sectors',
        label: 'Sectors',
        req: 'Geography chart must be visible. Use `plot geography` first.',
    },
    geographyAbs: {
        action: 'switch',
        target: 'sectorsAbs',
        label: 'Sectors Abs',
        req: 'Geography chart must be visible. Use `plot geography abs` first.',
    },
    marketcap: {
        action: 'switch',
        target: 'sectors',
        label: 'Sectors',
        req: 'Market cap chart must be visible. Use `plot marketcap` first.',
    },
    marketcapAbs: {
        action: 'switch',
        target: 'sectorsAbs',
        label: 'Sectors Abs',
        req: 'Market cap chart must be visible. Use `plot marketcap abs` first.',
    },
};

function checkSectorsVisibility(transition, isChartVisible) {
    if (!transition) {
        return {
            result: 'Composition, Sectors, Geography, or Market Cap chart must be active. Use `plot composition`, `plot sectors`, `plot geography`, or `plot marketcap` first.',
            labelPrefix: null,
            success: false,
            needsUpdate: false,
        };
    }
    if (transition.action === 'show') {
        if (!isChartVisible) {
            return {
                result: 'Showing sector allocation chart.',
                labelPrefix: transition.label,
                success: true,
                needsUpdate: true,
                target: transition.target,
            };
        }
        return {
            result: 'Sector allocation chart is already active.',
            labelPrefix: null,
            success: false,
            needsUpdate: false,
        };
    }
    if (!isChartVisible) {
        return { result: transition.req, labelPrefix: null, success: false, needsUpdate: false };
    }
    const suffix = transition.target === 'sectorsAbs' ? ' (absolute view)' : '';
    return {
        result: `Switched to sector allocation chart${suffix}.`,
        labelPrefix: transition.label,
        success: true,
        needsUpdate: true,
        target: transition.target,
    };
}

export async function handleSectorsCommand(args, { appendMessage, chartManager }) {
    const chartSection = document.getElementById('runningAmountSection');
    const isChartVisible = chartSection && !chartSection.classList.contains('is-hidden');
    const activeChart = transactionState.activeChart;

    const transition = SECTORS_TRANSITIONS[activeChart];
    const state = checkSectorsVisibility(transition, isChartVisible);

    if (state.needsUpdate) {
        setActiveChart(state.target);
        if (chartSection) {
            chartSection.classList.remove('is-hidden');
        }
        if (chartManager && typeof chartManager.update === 'function') {
            chartManager.update();
        }
    }

    let finalResult = state.result;
    if (state.success && state.labelPrefix) {
        const { getSectorsSnapshotLine } = await import('../snapshots.js');
        const summary = await getSectorsSnapshotLine({ labelPrefix: state.labelPrefix });
        if (summary) {
            finalResult += `\n${summary}`;
        }
    }

    appendMessage(finalResult);
}

const GEOGRAPHY_TRANSITIONS = {
    geography: { action: 'show', target: 'geography', label: 'Geography' },
    geographyAbs: { action: 'show', target: 'geographyAbs', label: 'Geography Abs' },
    composition: {
        action: 'switch',
        target: 'geography',
        label: 'Geography',
        req: 'Composition chart must be visible. Use `plot composition` first.',
    },
    compositionAbs: {
        action: 'switch',
        target: 'geographyAbs',
        label: 'Geography Abs',
        req: 'Composition chart must be visible. Use `plot composition abs` first.',
    },
    sectors: {
        action: 'switch',
        target: 'geography',
        label: 'Geography',
        req: 'Sector allocation chart must be visible. Use `plot sectors` first.',
    },
    sectorsAbs: {
        action: 'switch',
        target: 'geographyAbs',
        label: 'Geography Abs',
        req: 'Sector allocation chart must be visible. Use `plot sectors abs` first.',
    },
    marketcap: {
        action: 'switch',
        target: 'geography',
        label: 'Geography',
        req: 'Market cap chart must be visible. Use `plot marketcap` first.',
    },
    marketcapAbs: {
        action: 'switch',
        target: 'geographyAbs',
        label: 'Geography Abs',
        req: 'Market cap chart must be visible. Use `plot marketcap abs` first.',
    },
};

function checkGeographyVisibility(transition, isChartVisible) {
    if (!transition) {
        return {
            result: 'Composition, Sectors, Geography, or Market Cap chart must be active. Use `plot composition`, `plot sectors`, `plot geography`, or `plot marketcap` first.',
            labelPrefix: null,
            success: false,
            needsUpdate: false,
        };
    }
    if (transition.action === 'show') {
        if (!isChartVisible) {
            return {
                result: 'Showing geography chart.',
                labelPrefix: transition.label,
                success: true,
                needsUpdate: true,
                target: transition.target,
            };
        }
        return {
            result: 'Geography chart is already active.',
            labelPrefix: null,
            success: false,
            needsUpdate: false,
        };
    }
    if (!isChartVisible) {
        return { result: transition.req, labelPrefix: null, success: false, needsUpdate: false };
    }
    const suffix = transition.target === 'geographyAbs' ? ' (absolute view)' : '';
    return {
        result: `Switched to geography chart${suffix}.`,
        labelPrefix: transition.label,
        success: true,
        needsUpdate: true,
        target: transition.target,
    };
}

export async function handleGeographyCommand(args, { appendMessage, chartManager }) {
    const chartSection = document.getElementById('runningAmountSection');
    const isChartVisible = chartSection && !chartSection.classList.contains('is-hidden');
    const activeChart = transactionState.activeChart;

    const transition = GEOGRAPHY_TRANSITIONS[activeChart];
    const state = checkGeographyVisibility(transition, isChartVisible);

    if (state.needsUpdate) {
        setActiveChart(state.target);
        if (chartSection) {
            chartSection.classList.remove('is-hidden');
        }
        if (chartManager && typeof chartManager.update === 'function') {
            chartManager.update();
        }
    }

    let finalResult = state.result;
    if (state.success && state.labelPrefix) {
        const { getGeographySnapshotLine } = await import('../snapshots.js');
        const summary = await getGeographySnapshotLine({ labelPrefix: state.labelPrefix });
        if (summary) {
            finalResult += `\n${summary}`;
        }
    }

    appendMessage(finalResult);
}

const MARKETCAP_TRANSITIONS = {
    marketcap: { action: 'show', target: 'marketcap', label: 'Market Cap' },
    marketcapAbs: { action: 'show', target: 'marketcapAbs', label: 'Market Cap Abs' },
    composition: {
        action: 'switch',
        target: 'marketcap',
        label: 'Market Cap',
        req: 'Composition chart must be visible. Use `plot composition` first.',
    },
    compositionAbs: {
        action: 'switch',
        target: 'marketcapAbs',
        label: 'Market Cap Abs',
        req: 'Composition chart must be visible. Use `plot composition abs` first.',
    },
    sectors: {
        action: 'switch',
        target: 'marketcap',
        label: 'Market Cap',
        req: 'Sector allocation chart must be visible. Use `plot sectors` first.',
    },
    sectorsAbs: {
        action: 'switch',
        target: 'marketcapAbs',
        label: 'Market Cap Abs',
        req: 'Sector allocation chart must be visible. Use `plot sectors abs` first.',
    },
    geography: {
        action: 'switch',
        target: 'marketcap',
        label: 'Market Cap',
        req: 'Geography chart must be visible. Use `plot geography` first.',
    },
    geographyAbs: {
        action: 'switch',
        target: 'marketcapAbs',
        label: 'Market Cap Abs',
        req: 'Geography chart must be visible. Use `plot geography abs` first.',
    },
};

function checkMarketcapVisibility(transition, isChartVisible) {
    if (!transition) {
        return {
            result: 'Composition, Sectors, Geography, or Market Cap chart must be active. Use `plot composition`, `plot sectors`, `plot geography`, or `plot marketcap` first.',
            labelPrefix: null,
            success: false,
            needsUpdate: false,
        };
    }
    if (transition.action === 'show') {
        if (!isChartVisible) {
            return {
                result: 'Showing market cap chart.',
                labelPrefix: transition.label,
                success: true,
                needsUpdate: true,
                target: transition.target,
            };
        }
        return {
            result: 'Market cap chart is already active.',
            labelPrefix: null,
            success: false,
            needsUpdate: false,
        };
    }
    if (!isChartVisible) {
        return { result: transition.req, labelPrefix: null, success: false, needsUpdate: false };
    }
    const suffix = transition.target === 'marketcapAbs' ? ' (absolute view)' : '';
    return {
        result: `Switched to market cap chart${suffix}.`,
        labelPrefix: transition.label,
        success: true,
        needsUpdate: true,
        target: transition.target,
    };
}

export async function handleMarketcapCommand(args, { appendMessage, chartManager }) {
    const chartSection = document.getElementById('runningAmountSection');
    const isChartVisible = chartSection && !chartSection.classList.contains('is-hidden');
    const activeChart = transactionState.activeChart;

    const transition = MARKETCAP_TRANSITIONS[activeChart];
    const state = checkMarketcapVisibility(transition, isChartVisible);

    if (state.needsUpdate) {
        setActiveChart(state.target);
        if (chartSection) {
            chartSection.classList.remove('is-hidden');
        }
        if (chartManager && typeof chartManager.update === 'function') {
            chartManager.update();
        }
    }

    let finalResult = state.result;
    if (state.success && state.labelPrefix) {
        const { getMarketcapSnapshotLine } = await import('../snapshots.js');
        const summary = await getMarketcapSnapshotLine({ labelPrefix: state.labelPrefix });
        if (summary) {
            finalResult += `\n${summary}`;
        }
    }

    appendMessage(finalResult);
}
