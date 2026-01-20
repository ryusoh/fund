import { transactionState, setChartDateRange } from '../../state.js';
import {
    updateContextYearFromRange,
    parseSimplifiedDateRange,
    formatDateRange,
} from '../dateUtils.js';
import { getDynamicStatsText } from '../../terminalStats.js';
import {
    isTransactionTableVisible,
    getActiveChartSummaryText,
    ensureTransactionTableVisible,
    isActiveChartVisible,
} from '../viewUtils.js';
import { toggleZoom, getZoomState } from '../../zoom.js';

async function applyDateFilterRange(range, { chartManager, filterAndSort }) {
    if (!range || (!range.from && !range.to)) {
        return null;
    }
    const activeChartVisible = isActiveChartVisible();
    const activeChart = transactionState.activeChart;

    if (activeChartVisible) {
        setChartDateRange(range);
        updateContextYearFromRange(range);
        if (chartManager && typeof chartManager.update === 'function') {
            chartManager.update();
        }
        let message = `Applied date filter ${formatDateRange(range)} to ${activeChart} chart.`;
        const summary = await getActiveChartSummaryText();
        if (summary) {
            message += `
${summary}`;
        }
        return message;
    }

    if (!isTransactionTableVisible()) {
        return 'Transaction table is hidden. Use the "transaction" command to show it before applying date filters.';
    }

    setChartDateRange(range);
    updateContextYearFromRange(range);
    filterAndSort(transactionState.activeFilterTerm || '');
    return `Applied date filter ${formatDateRange(range)} to transactions table.`;
}

export async function handleTransactionCommand(args, context) {
    const { toggleTable, filterAndSort, chartManager, appendMessage } = context;

    let result = '';

    // Auto-unzoom if zoomed
    if (getZoomState()) {
        await toggleZoom();
    }

    if (args.length === 0) {
        toggleTable();
        result = 'Toggled transaction table visibility.';
    } else {
        ensureTransactionTableVisible();
        const trailingInput = args.join(' ').trim();
        if (trailingInput) {
            const rangeCandidate = parseSimplifiedDateRange(trailingInput);
            if (rangeCandidate.from || rangeCandidate.to) {
                const dateResult = await applyDateFilterRange(rangeCandidate, {
                    chartManager,
                    filterAndSort,
                });
                if (dateResult) {
                    result = dateResult;
                }
            } else {
                filterAndSort(trailingInput);
                const summary = await getActiveChartSummaryText();
                result = `Filtering transactions by: "${trailingInput}"...`;
                if (summary) {
                    result += `
${summary}`;
                }
            }
        } else {
            result = 'Showing transaction table.';
        }
    }

    if (isTransactionTableVisible() && result) {
        const statsText = await getDynamicStatsText(transactionState.selectedCurrency || 'USD');
        if (statsText) {
            result += statsText.startsWith('\n')
                ? statsText
                : `
${statsText}`;
        }
    }

    if (result) {
        appendMessage(result);
    }
}

export async function handleDefaultCommand(command, context) {
    const { filterAndSort, chartManager, appendMessage } = context;
    let result = '';

    const simplifiedDateRange = parseSimplifiedDateRange(command);
    if (simplifiedDateRange.from || simplifiedDateRange.to) {
        const dateMessage = await applyDateFilterRange(simplifiedDateRange, {
            chartManager,
            filterAndSort,
        });
        if (dateMessage) {
            result = dateMessage;
            if (isTransactionTableVisible()) {
                const statsText = await getDynamicStatsText(
                    transactionState.selectedCurrency || 'USD'
                );
                if (statsText) {
                    result += statsText.startsWith('\n')
                        ? statsText
                        : `
${statsText}`;
                }
            }
            appendMessage(result);
            return;
        }
    }

    filterAndSort(command);
    if (isTransactionTableVisible()) {
        const statsText = await getDynamicStatsText(transactionState.selectedCurrency || 'USD');
        if (statsText) {
            result += statsText.startsWith('\n')
                ? statsText
                : `
${statsText}`;
        }
    } else {
        const summaryText = await getActiveChartSummaryText();
        if (summaryText) {
            result += `
${summaryText}`;
        }
    }

    if (result) {
        appendMessage(result);
    }
}
