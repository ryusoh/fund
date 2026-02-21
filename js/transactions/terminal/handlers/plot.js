import { transactionState, setActiveChart, setChartDateRange } from '../../state.js';
import { updateContextYearFromRange, parseDateRange, formatDateRange } from '../dateUtils.js';
import {
    getPerformanceSnapshotLine,
    getCompositionSnapshotLine,
    getFxSnapshotLine,
    getDrawdownSnapshotLine,
    getContributionSummaryText,
    getConcentrationSnapshotText,
    getPESnapshotLine,
    getRollingSnapshotLine,
    getVolatilitySnapshotLine,
    getSectorsSnapshotLine,
    getGeographySnapshotLine,
    getBetaSnapshotLine,
    getYieldSnapshotLine,
} from '../snapshots.js';
import { toggleZoom, getZoomState } from '../../zoom.js';
import { PLOT_SUBCOMMANDS } from '../constants.js';

const TWRR_MESSAGE =
    'TWRR (Time-Weighted Rate of Return) describes how efficiently the portfolio has grown regardless of when money moved in or out. It focuses purely on investment performance, so the result is not distorted by the size or timing of deposits and withdrawals.\n' +
    '\n' +
    'We follow the industry-standard method: for each day we compute a return factor by dividing the ending market value by the prior-day value after applying that day’s net contribution (cash in is added, cash out is subtracted). Multiplying, or “chaining,” these daily factors produces the cumulative TWRR curve shown in the chart.';

const ROLLING_EXPLANATION =
    'Rolling returns show the investment performance for a fixed period (1 year) ending on each day. This provides a "rolling" window of performance that helps identify consistency over time and smooths out the dependency on a single arbitrary start date, offering a clearer view of historical return volatility.';

const VOLATILITY_EXPLANATION =
    "Rolling volatility shows the annualized standard deviation of daily returns over a fixed period (90 days) ending on each day. It provides a visual representation of the portfolio's risk profile, indicating how much returns deviate from their average. Comparing your portfolio's volatility against benchmarks like the S&P 500 helps you understand your relative risk exposure.";

const BETA_EXPLANATION =
    'Beta measures the portfolio’s sensitivity to the broader market (S&P 500). A Beta of 1.0 means the portfolio moves in line with the market; >1.0 is more aggressive, and <1.0 is more defensive. This chart shows the 6-month (126 trading days) rolling Beta calculated as Covariance(Portfolio, Market) / Variance(Market), illustrating how your risk profile evolves as your holdings change.';

const YIELD_EXPLANATION =
    "This chart maps your portfolio's Forward Dividend Yield (%) against actual Trailing 12-Month (TTM) Dividend Income ($). The line represents the aggregate yield if current holdings were held for a year, while the bars show the actual cash dividends collected in the preceding 12 months.\n\nNote: Early period yields may appear inflated due to the smaller portfolio base and the TTM dividend proxy used in the calculation.";

export async function handlePlotCommand(args, { appendMessage, chartManager }) {
    if (args.length === 0) {
        // Show plot help
        const result =
            'Plot commands:\n' +
            '  plot balance         - Show contribution/balance chart\n' +
            '  plot performance     - Show TWRR performance chart\n' +
            '  plot drawdown        - Show underwater drawdown chart (percentage)\n' +
            '  plot drawdown abs    - Show drawdown chart with absolute values\n' +
            '  plot rolling         - Show 1-Year rolling returns chart\n' +
            '  plot volatility      - Show 90-Day annualized rolling volatility chart\n' +
            '  plot beta            - Show 6-Month rolling portfolio Beta vs S&P 500\n' +
            '  plot yield           - Show portfolio forward yield (%) and TTM income ($)\n' +
            '  plot composition     - Show portfolio composition chart (percent view)\n' +
            '  plot composition abs - Show composition chart with absolute values\n' +
            '  plot sectors         - Show sector allocation chart (percent view)\n' +
            '  plot sectors abs     - Show sector allocation chart with absolute values\n' +
            '  plot concentration   - Show portfolio concentration (HHI) chart\n' +
            '  plot pe              - Show weighted average P/E ratio chart\n' +
            '  plot fx              - Show FX rate chart for the selected base currency\n\n' +
            'Usage: plot <subcommand> or p <subcommand>\n' +
            '  balance       [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  performance   [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  drawdown      [abs] [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  composition   [abs] [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  sectors       [abs] [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  concentration [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  pe            [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  fx            [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  rolling       [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  beta          [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  yield         [year|quarter|qN] | [from <...>] | [<...> to <...>]';
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
        case 'sectors':
        case 'sectors-abs':
        case 'sectorsabs':
        case 'sectorsabsolute': {
            let useAbsolute = subcommand !== 'sectors';
            let rangeTokens = [...rawArgs];
            if (!useAbsolute && rangeTokens.length > 0) {
                const maybeMode = rangeTokens[0].toLowerCase();
                if (maybeMode === 'abs' || maybeMode === 'absolute') {
                    useAbsolute = true;
                    rangeTokens = rangeTokens.slice(1);
                }
            }
            dateRange = applyDateArgs(rangeTokens);
            const sectorsSection = document.getElementById('runningAmountSection');
            const sectorsTableContainer = document.querySelector('.table-responsive-container');

            const targetChart = useAbsolute ? 'sectorsAbs' : 'sectors';
            const isSectorsActive = transactionState.activeChart === targetChart;
            const isSectorsVisible =
                sectorsSection && !sectorsSection.classList.contains('is-hidden');

            if (isSectorsActive && isSectorsVisible) {
                setActiveChart(null);
                if (sectorsSection) {
                    sectorsSection.classList.add('is-hidden');
                }
                result = 'Hidden sector allocation chart.';
            } else {
                setActiveChart(targetChart);
                if (sectorsSection) {
                    sectorsSection.classList.remove('is-hidden');
                    chartManager.update();
                }
                if (sectorsTableContainer) {
                    sectorsTableContainer.classList.add('is-hidden');
                }
                result = `Showing sector allocation${useAbsolute ? ' (absolute)' : ''} chart for ${formatDateRange(dateRange)}.`;
                const sectorsSnapshot = await getSectorsSnapshotLine({
                    labelPrefix: useAbsolute ? 'Sectors Abs' : 'Sectors',
                });
                if (sectorsSnapshot) {
                    result += `\n${sectorsSnapshot}`;
                }
            }
            break;
        }
        case 'geography':
        case 'geography-abs':
        case 'geographyabs':
        case 'geographyabsolute': {
            let useAbsolute = subcommand !== 'geography';
            let rangeTokens = [...rawArgs];
            if (!useAbsolute && rangeTokens.length > 0) {
                const maybeMode = rangeTokens[0].toLowerCase();
                if (maybeMode === 'abs' || maybeMode === 'absolute') {
                    useAbsolute = true;
                    rangeTokens = rangeTokens.slice(1);
                }
            }
            dateRange = applyDateArgs(rangeTokens);
            const geographySection = document.getElementById('runningAmountSection');
            const geographyTableContainer = document.querySelector('.table-responsive-container');

            const targetChart = useAbsolute ? 'geographyAbs' : 'geography';
            const isGeographyActive = transactionState.activeChart === targetChart;
            const isGeographyVisible =
                geographySection && !geographySection.classList.contains('is-hidden');

            if (isGeographyActive && isGeographyVisible) {
                setActiveChart(null);
                if (geographySection) {
                    geographySection.classList.add('is-hidden');
                }
                result = 'Hidden geography chart.';
            } else {
                setActiveChart(targetChart);
                if (geographySection) {
                    geographySection.classList.remove('is-hidden');
                    chartManager.update();
                }
                if (geographyTableContainer) {
                    geographyTableContainer.classList.add('is-hidden');
                }
                result = `Showing geography allocation${useAbsolute ? ' (absolute)' : ''} chart for ${formatDateRange(dateRange)}.`;
                const geographySnapshot = await getGeographySnapshotLine({
                    labelPrefix: useAbsolute ? 'Geography Abs' : 'Geography',
                });
                if (geographySnapshot) {
                    result += `\n${geographySnapshot}`;
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
        case 'concentration': {
            dateRange = applyDateArgs(rawArgs);
            const concSection = document.getElementById('runningAmountSection');
            const concTableContainer = document.querySelector('.table-responsive-container');

            const isConcActive = transactionState.activeChart === 'concentration';
            const isConcVisible = concSection && !concSection.classList.contains('is-hidden');

            if (isConcActive && isConcVisible) {
                setActiveChart(null);
                if (concSection) {
                    concSection.classList.add('is-hidden');
                }
                result = 'Hidden concentration chart.';
            } else {
                setActiveChart('concentration');
                if (concSection) {
                    concSection.classList.remove('is-hidden');
                    chartManager.update();
                }
                if (concTableContainer) {
                    concTableContainer.classList.add('is-hidden');
                }
                result = `Showing concentration (HHI) chart for ${formatDateRange(dateRange)}.`;
                const summary = await getConcentrationSnapshotText();
                if (summary) {
                    result += `\n${summary}`;
                }
            }
            break;
        }
        case 'pe': {
            dateRange = applyDateArgs(rawArgs);
            const peSection = document.getElementById('runningAmountSection');
            const peTableContainer = document.querySelector('.table-responsive-container');

            const isPeActive = transactionState.activeChart === 'pe';
            const isPeVisible = peSection && !peSection.classList.contains('is-hidden');

            if (isPeActive && isPeVisible) {
                setActiveChart(null);
                if (peSection) {
                    peSection.classList.add('is-hidden');
                }
                result = 'Hidden P/E ratio chart.';
            } else {
                setActiveChart('pe');
                if (peSection) {
                    peSection.classList.remove('is-hidden');
                    chartManager.update();
                }
                if (peTableContainer) {
                    peTableContainer.classList.add('is-hidden');
                }
                result = `Showing weighted average P/E ratio chart for ${formatDateRange(dateRange)}.`;
                const summary = await getPESnapshotLine();
                if (summary) {
                    result += `\n${summary}`;
                }
            }
            break;
        }
        case 'rolling': {
            dateRange = applyDateArgs(rawArgs);
            const rollingSection = document.getElementById('runningAmountSection');
            const rollingTableContainer = document.querySelector('.table-responsive-container');

            const isRollingActive = transactionState.activeChart === 'rolling';
            const isRollingVisible =
                rollingSection && !rollingSection.classList.contains('is-hidden');

            if (isRollingActive && isRollingVisible) {
                setActiveChart(null);
                if (rollingSection) {
                    rollingSection.classList.add('is-hidden');
                }
                result = 'Hidden 1-Year rolling returns chart.';
            } else {
                setActiveChart('rolling');
                if (rollingSection) {
                    rollingSection.classList.remove('is-hidden');
                    chartManager.update();
                }
                if (rollingTableContainer) {
                    rollingTableContainer.classList.add('is-hidden');
                }
                result = `Showing 1-Year rolling returns chart for ${formatDateRange(dateRange)}.\n\n${ROLLING_EXPLANATION}`;
                const rollingSnapshot = getRollingSnapshotLine();
                if (rollingSnapshot) {
                    result += `\n\n${rollingSnapshot}`;
                }
            }
            break;
        }
        case 'volatility': {
            dateRange = applyDateArgs(rawArgs);
            const volSection = document.getElementById('runningAmountSection');
            const volTableContainer = document.querySelector('.table-responsive-container');

            const isVolActive = transactionState.activeChart === 'volatility';
            const isVolVisible = volSection && !volSection.classList.contains('is-hidden');

            if (isVolActive && isVolVisible) {
                setActiveChart(null);
                if (volSection) {
                    volSection.classList.add('is-hidden');
                }
                result = 'Hidden 90-Day annualized rolling volatility chart.';
            } else {
                setActiveChart('volatility');
                if (volSection) {
                    volSection.classList.remove('is-hidden');
                    chartManager.update();
                }
                if (volTableContainer) {
                    volTableContainer.classList.add('is-hidden');
                }
                result = `Showing 90-Day annualized rolling volatility chart for ${formatDateRange(
                    dateRange
                )}.\n\n${VOLATILITY_EXPLANATION}`;
                const volatilitySnapshot = getVolatilitySnapshotLine();
                if (volatilitySnapshot) {
                    result += `\n\n${volatilitySnapshot}`;
                }
            }
            break;
        }
        case 'beta': {
            dateRange = applyDateArgs(rawArgs);
            const betaSection = document.getElementById('runningAmountSection');
            const betaTableContainer = document.querySelector('.table-responsive-container');

            const isBetaActive = transactionState.activeChart === 'beta';
            const isBetaVisible = betaSection && !betaSection.classList.contains('is-hidden');

            if (isBetaActive && isBetaVisible) {
                setActiveChart(null);
                if (betaSection) {
                    betaSection.classList.add('is-hidden');
                }
                result = 'Hidden portfolio beta chart.';
            } else {
                setActiveChart('beta');
                if (betaSection) {
                    betaSection.classList.remove('is-hidden');
                    chartManager.update();
                }
                if (betaTableContainer) {
                    betaTableContainer.classList.add('is-hidden');
                }
                result = `Showing 6-Month rolling portfolio beta chart for ${formatDateRange(
                    dateRange
                )}.\n\n${BETA_EXPLANATION}`;
                const betaSnapshot = await getBetaSnapshotLine();
                if (betaSnapshot) {
                    result += `\n\n${betaSnapshot}`;
                }
            }
            break;
        }
        case 'yield': {
            dateRange = applyDateArgs(rawArgs);
            const yieldSection = document.getElementById('runningAmountSection');
            const yieldTableContainer = document.querySelector('.table-responsive-container');

            const isYieldActive = transactionState.activeChart === 'yield';
            const isYieldVisible = yieldSection && !yieldSection.classList.contains('is-hidden');

            if (isYieldActive && isYieldVisible) {
                setActiveChart(null);
                if (yieldSection) {
                    yieldSection.classList.add('is-hidden');
                }
                result = 'Hidden dividend yield and income chart.';
            } else {
                setActiveChart('yield');
                if (yieldSection) {
                    yieldSection.classList.remove('is-hidden');
                    chartManager.update();
                }
                if (yieldTableContainer) {
                    yieldTableContainer.classList.add('is-hidden');
                }
                result = `Showing dividend yield and income chart for ${formatDateRange(
                    dateRange
                )}.\n\n${YIELD_EXPLANATION}`;
                const yieldSnapshot = await getYieldSnapshotLine();
                if (yieldSnapshot) {
                    result += `\n\n${yieldSnapshot}`;
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
