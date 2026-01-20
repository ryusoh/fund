import { transactionState, setActiveChart, setChartDateRange } from '../../state.js';
import { updateContextYearFromRange, parseDateRange, formatDateRange } from '../dateUtils.js';
import {
    getPerformanceSnapshotLine,
    getCompositionSnapshotLine,
    getFxSnapshotLine,
    getDrawdownSnapshotLine,
    getContributionSummaryText,
} from '../snapshots.js';
import { toggleZoom, getZoomState } from '../../zoom.js';
import { PLOT_SUBCOMMANDS } from '../constants.js';

const TWRR_MESSAGE =
    'TWRR (Time-Weighted Rate of Return) describes how efficiently the portfolio has grown regardless of when money moved in or out. It focuses purely on investment performance, so the result is not distorted by the size or timing of deposits and withdrawals.\n' +
    '\n' +
    'We follow the industry-standard method: for each day we compute a return factor by dividing the ending market value by the prior-day value after applying that day’s net contribution (cash in is added, cash out is subtracted). Multiplying, or “chaining,” these daily factors produces the cumulative TWRR curve shown in the chart.';

export async function handlePlotCommand(args, { appendMessage, chartManager }) {
    if (args.length === 0) {
        // Show plot help
        const result =
            'Plot commands:\n' +
            '  plot balance         - Show contribution/balance chart\n' +
            '  plot performance     - Show TWRR performance chart\n' +
            '  plot drawdown        - Show underwater drawdown chart (percentage)\n' +
            '  plot drawdown abs    - Show drawdown chart with absolute values\n' +
            '  plot composition     - Show portfolio composition chart (percent view)\n' +
            '  plot composition abs - Show composition chart with absolute values\n' +
            '  plot fx              - Show FX rate chart for the selected base currency\n\n' +
            'Usage: plot <subcommand> or p <subcommand>\n' +
            '  balance      [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  performance  [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  drawdown     [abs] [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  composition  [abs] [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  fx           [year|quarter|qN] | [from <...>] | [<...> to <...>]';
        appendMessage(result);
        return;
    }

    // Auto-unzoom if zoomed
    if (getZoomState()) {
        await toggleZoom();
    }

    const subcommand = args[0].toLowerCase();
    const rawArgs = args.slice(1);
    let dateRange = { from: null, to: null };
    let result = '';

    const getExistingChartRange = () => {
        const current = transactionState.chartDateRange || {};
        return {
            from: current.from || null,
            to: current.to || null,
        };
    };

    const applyDateArgs = (tokens) => {
        const normalizedTokens = tokens
            .map((token) => (typeof token === 'string' ? token.trim() : ''))
            .filter((token) => token.length > 0);

        if (normalizedTokens.length === 0) {
            // Keep current range if one is already applied when simply switching charts.
            const existing = getExistingChartRange();
            return existing;
        }

        if (normalizedTokens.length === 1) {
            const token = normalizedTokens[0].toLowerCase();
            if (token === 'all' || token === 'reset' || token === 'clear') {
                const clearedRange = { from: null, to: null };
                setChartDateRange(clearedRange);
                updateContextYearFromRange(clearedRange);
                return clearedRange;
            }
        }

        const range = parseDateRange(normalizedTokens);
        if (!range.from && !range.to) {
            return getExistingChartRange();
        }
        setChartDateRange(range);
        updateContextYearFromRange(range);
        return range;
    };

    switch (subcommand) {
        case 'balance':
            dateRange = applyDateArgs(rawArgs);
            const contributionSection = document.getElementById('runningAmountSection');
            const contributionTableContainer = document.querySelector(
                '.table-responsive-container'
            );

            // Check if contribution chart is already active and visible
            const isContributionActive = transactionState.activeChart === 'contribution';
            const isChartVisible =
                contributionSection && !contributionSection.classList.contains('is-hidden');

            if (isContributionActive && isChartVisible) {
                // Toggle off if contribution chart is already visible
                setActiveChart(null);
                if (contributionSection) {
                    contributionSection.classList.add('is-hidden');
                }
                result = 'Hidden contribution chart.';
            } else {
                // Show contribution chart
                setActiveChart('contribution');
                if (contributionSection) {
                    contributionSection.classList.remove('is-hidden');
                    chartManager.update();
                }
                if (contributionTableContainer) {
                    contributionTableContainer.classList.add('is-hidden');
                }
                const summaryText = await getContributionSummaryText(
                    transactionState.chartDateRange
                );
                result = `Showing contribution chart for ${formatDateRange(dateRange)}.`;
                if (summaryText) {
                    result += `\n${summaryText}`;
                }
            }
            break;
        case 'performance':
            dateRange = applyDateArgs(rawArgs);
            const perfSection = document.getElementById('runningAmountSection');
            const perfTableContainer = document.querySelector('.table-responsive-container');

            // Check if performance chart is already active and visible
            const isPerformanceActive = transactionState.activeChart === 'performance';
            const isPerfChartVisible = perfSection && !perfSection.classList.contains('is-hidden');

            if (isPerformanceActive && isPerfChartVisible) {
                // Toggle off if performance chart is already visible
                setActiveChart(null);
                if (perfSection) {
                    perfSection.classList.add('is-hidden');
                }
                result = 'Hidden performance chart.';
            } else {
                // Show performance chart
                setActiveChart('performance');
                if (perfSection) {
                    perfSection.classList.remove('is-hidden');
                    chartManager.update();
                }
                if (perfTableContainer) {
                    perfTableContainer.classList.add('is-hidden');
                }
                result = `Showing performance chart for ${formatDateRange(
                    dateRange
                )}.\n\n${TWRR_MESSAGE}`;
                const performanceSnapshot = getPerformanceSnapshotLine({
                    includeHidden: true,
                });
                if (performanceSnapshot) {
                    result += `\n\n${performanceSnapshot}`;
                }
            }
            break;
        case 'composition':
        case 'composition-abs':
        case 'compositionabs':
        case 'compositionabsolute': {
            let useAbsolute = subcommand !== 'composition';
            let rangeTokens = [...rawArgs];
            if (!useAbsolute && rangeTokens.length > 0) {
                const maybeMode = rangeTokens[0].toLowerCase();
                if (maybeMode === 'abs' || maybeMode === 'absolute') {
                    useAbsolute = true;
                    rangeTokens = rangeTokens.slice(1);
                }
            }
            dateRange = applyDateArgs(rangeTokens);
            const compSection = document.getElementById('runningAmountSection');
            const compTableContainer = document.querySelector('.table-responsive-container');

            // Check if composition chart is already active and visible
            const targetChart = useAbsolute ? 'compositionAbs' : 'composition';
            const isCompositionActive = transactionState.activeChart === targetChart;
            const isCompChartVisible = compSection && !compSection.classList.contains('is-hidden');

            if (isCompositionActive && isCompChartVisible) {
                // Toggle off if composition chart is already visible
                setActiveChart(null);
                if (compSection) {
                    compSection.classList.add('is-hidden');
                }
                result = 'Hidden composition chart.';
            } else {
                // Show composition chart
                setActiveChart(targetChart);
                if (compSection) {
                    compSection.classList.remove('is-hidden');
                    chartManager.update();
                }
                if (compTableContainer) {
                    compTableContainer.classList.add('is-hidden');
                }
                result = `Showing composition${
                    useAbsolute ? ' (absolute)' : ''
                } chart for ${formatDateRange(dateRange)}.`;
                const compositionSnapshot = await getCompositionSnapshotLine({
                    labelPrefix: useAbsolute ? 'Composition Abs' : 'Composition',
                });
                if (compositionSnapshot) {
                    result += `\n${compositionSnapshot}`;
                }
            }
            break;
        }
        case 'fx':
            dateRange = applyDateArgs(rawArgs);
            const fxSection = document.getElementById('runningAmountSection');
            const fxTableContainer = document.querySelector('.table-responsive-container');

            const isFxActive = transactionState.activeChart === 'fx';
            const isFxVisible = fxSection && !fxSection.classList.contains('is-hidden');

            if (isFxActive && isFxVisible) {
                setActiveChart(null);
                if (fxSection) {
                    fxSection.classList.add('is-hidden');
                }
                result = 'Hidden FX chart.';
            } else {
                setActiveChart('fx');
                if (fxSection) {
                    fxSection.classList.remove('is-hidden');
                    chartManager.update();
                }
                if (fxTableContainer) {
                    fxTableContainer.classList.add('is-hidden');
                }
                const baseCurrency = transactionState.selectedCurrency || 'USD';
                result = `Showing FX chart (base ${baseCurrency}) for ${formatDateRange(
                    dateRange
                )}.`;
                const fxSnapshot = getFxSnapshotLine();
                if (fxSnapshot) {
                    result += `\n${fxSnapshot}`;
                }
            }
            break;
        case 'drawdown': {
            // Check for abs argument
            const useAbsolute = rawArgs.some(
                (arg) => arg.toLowerCase() === 'abs' || arg.toLowerCase() === 'absolute'
            );
            const filteredArgs = rawArgs.filter(
                (arg) => arg.toLowerCase() !== 'abs' && arg.toLowerCase() !== 'absolute'
            );
            dateRange = applyDateArgs(filteredArgs);

            const drawdownSection = document.getElementById('runningAmountSection');
            const drawdownTableContainer = document.querySelector('.table-responsive-container');

            const targetChart = useAbsolute ? 'drawdownAbs' : 'drawdown';
            const isDrawdownActive =
                transactionState.activeChart === 'drawdown' ||
                transactionState.activeChart === 'drawdownAbs';
            const isDrawdownVisible =
                drawdownSection && !drawdownSection.classList.contains('is-hidden');

            if (
                isDrawdownActive &&
                isDrawdownVisible &&
                !useAbsolute &&
                transactionState.activeChart === 'drawdown'
            ) {
                // Toggle off only if same mode
                setActiveChart(null);
                if (drawdownSection) {
                    drawdownSection.classList.add('is-hidden');
                }
                result = 'Hidden drawdown chart.';
            } else {
                setActiveChart(targetChart);
                if (drawdownSection) {
                    drawdownSection.classList.remove('is-hidden');
                    chartManager.update();
                }
                if (drawdownTableContainer) {
                    drawdownTableContainer.classList.add('is-hidden');
                }
                const modeLabel = useAbsolute ? ' (absolute)' : '';
                result = `Showing drawdown${modeLabel} chart for ${formatDateRange(dateRange)}.`;
                const drawdownSnapshot = getDrawdownSnapshotLine({
                    includeHidden: true,
                    isAbsolute: useAbsolute,
                });
                if (drawdownSnapshot) {
                    result += `\n${drawdownSnapshot}`;
                }
            }
            break;
        }
        default:
            result = `Unknown plot subcommand: ${subcommand}\nAvailable: ${PLOT_SUBCOMMANDS.join(', ')}`;
            break;
    }

    if (result) {
        appendMessage(result);
    }
}
