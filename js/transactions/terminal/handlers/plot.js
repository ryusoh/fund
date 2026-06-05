import { transactionState, setActiveChart, setChartDateRange } from '../../state.js';
import {
    updateContextYearFromRange,
    parseDateRange,
    formatDateRange,
    parseSimplifiedDateRange,
} from '../dateUtils.js';
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
    getMarketcapSnapshotLine,
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
            '  plot geography       - Show geography allocation chart (percent view)\n' +
            '  plot geography abs   - Show geography allocation chart with absolute values\n' +
            '  plot marketcap       - Show market cap composition chart (percent view)\n' +
            '  plot marketcap abs   - Show market cap composition chart with absolute values\n' +
            '  plot concentration   - Show portfolio concentration (HHI) chart\n' +
            '  plot pe              - Show weighted average P/E ratio chart\n' +
            '  plot fx              - Show FX rate chart for the selected base currency\n\n' +
            'Usage: plot <subcommand> or p <subcommand>\n' +
            '  balance       [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  performance   [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  drawdown      [abs] [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  composition   [abs] [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  sectors       [abs] [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  geography     [abs] [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  marketcap     [abs] [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  concentration [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  pe            [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  fx            [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  rolling       [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  beta          [year|quarter|qN] | [from <...>] | [<...> to <...>]\n' +
            '  yield         [year|quarter|qN] | [from <...>] | [<...> to <...>]';
        appendMessage(result);
        return;
    }

    if (getZoomState()) {
        await toggleZoom();
    }

    const subcommand = args[0].toLowerCase();
    const rawArgs = args.slice(1);

    const isAbsoluteSubcommand = (subcmd) => {
        return subcmd.endsWith('-abs') || subcmd.endsWith('abs') || subcmd.endsWith('absolute');
    };

    const getBaseSubcommand = (subcmd) => {
        if (subcmd.startsWith('composition')) {
            return 'composition';
        }
        if (subcmd.startsWith('sectors')) {
            return 'sectors';
        }
        if (subcmd.startsWith('geography')) {
            return 'geography';
        }
        if (subcmd.startsWith('marketcap')) {
            return 'marketcap';
        }
        if (subcmd.startsWith('drawdown')) {
            return 'drawdown';
        }
        return subcmd;
    };

    const getExistingChartRange = () => {
        const current = transactionState.chartDateRange || {};
        return { from: current.from || null, to: current.to || null };
    };

    const applyDateArgs = (tokens) => {
        const normalizedTokens = tokens
            .map((token) => (typeof token === 'string' ? token.trim() : ''))
            .filter((token) => token.length > 0);

        if (normalizedTokens.length === 0) {
            return getExistingChartRange();
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

        let range = parseDateRange(normalizedTokens);
        if (!range.from && !range.to && normalizedTokens.length === 1) {
            range = parseSimplifiedDateRange(normalizedTokens[0]);
        }

        if (!range.from && !range.to) {
            return getExistingChartRange();
        }
        setChartDateRange(range);
        updateContextYearFromRange(range);
        return range;
    };

    const handleCompositionStyleChart = async (baseChartKey) => {
        let useAbsolute = isAbsoluteSubcommand(subcommand);
        let rangeTokens = [...rawArgs];
        if (!useAbsolute && rangeTokens.length > 0) {
            const maybeMode = rangeTokens[0].toLowerCase();
            if (maybeMode === 'abs' || maybeMode === 'absolute') {
                useAbsolute = true;
                rangeTokens = rangeTokens.slice(1);
            }
        }
        const dateRange = applyDateArgs(rangeTokens);
        const section = document.getElementById('runningAmountSection');
        const tableContainer = document.querySelector('.table-responsive-container');

        const targetChart = useAbsolute ? baseChartKey + 'Abs' : baseChartKey;
        const isActive = transactionState.activeChart === targetChart;
        const isVisible = section && !section.classList.contains('is-hidden');
        const hasDateArgs = rangeTokens.length > 0;

        if (isActive && isVisible && !hasDateArgs) {
            setActiveChart(null);
            if (section) {
                section.classList.add('is-hidden');
            }
            let typeName = baseChartKey;
            if (baseChartKey === 'sectors') {
                typeName = 'sector allocation';
            } else if (baseChartKey === 'geography') {
                typeName = 'geography allocation';
            } else if (baseChartKey === 'marketcap') {
                typeName = 'market cap allocation';
            }
            appendMessage(`Hidden ${typeName} chart.`);
        } else {
            setActiveChart(targetChart);
            if (section) {
                section.classList.remove('is-hidden');
                chartManager.update();
            }
            if (tableContainer) {
                tableContainer.classList.add('is-hidden');
            }
            let typeName = baseChartKey;
            if (baseChartKey === 'sectors') {
                typeName = 'sector allocation';
            } else if (baseChartKey === 'geography') {
                typeName = 'geography allocation';
            } else if (baseChartKey === 'marketcap') {
                typeName = 'market cap allocation';
            }
            let result = `Showing ${typeName}${useAbsolute ? ' (absolute)' : ''} chart for ${formatDateRange(dateRange)}.`;

            let snapshotFn;
            const labelPrefix = useAbsolute
                ? baseChartKey.charAt(0).toUpperCase() + baseChartKey.slice(1) + ' Abs'
                : baseChartKey.charAt(0).toUpperCase() + baseChartKey.slice(1);
            if (baseChartKey === 'composition') {
                snapshotFn = getCompositionSnapshotLine;
            } else if (baseChartKey === 'sectors') {
                snapshotFn = getSectorsSnapshotLine;
            } else if (baseChartKey === 'geography') {
                snapshotFn = getGeographySnapshotLine;
            } else if (baseChartKey === 'marketcap') {
                snapshotFn = getMarketcapSnapshotLine;
            } else if (baseChartKey === 'drawdown') {
                snapshotFn = () =>
                    getDrawdownSnapshotLine({ includeHidden: true, isAbsolute: useAbsolute });
                result = `Showing drawdown${useAbsolute ? ' (absolute)' : ''} chart for ${formatDateRange(dateRange)}.`;
            }

            const snapshot = await snapshotFn({ labelPrefix });
            if (snapshot) {
                result += `\n${snapshot}`;
            }
            appendMessage(result);
        }
    };

    const baseSubcommand = getBaseSubcommand(subcommand);

    if (['composition', 'sectors', 'geography', 'marketcap', 'drawdown'].includes(baseSubcommand)) {
        await handleCompositionStyleChart(baseSubcommand);
        return;
    }

    const dateRange = applyDateArgs(rawArgs);

    if (subcommand === 'balance') {
        const section = document.getElementById('runningAmountSection');
        const isAct = transactionState.activeChart === 'contribution';
        const isVis = section && !section.classList.contains('is-hidden');
        if (isAct && isVis) {
            setActiveChart(null);
            if (section) {
                section.classList.add('is-hidden');
            }
            appendMessage('Hidden contribution chart.');
        } else {
            setActiveChart('contribution');
            if (section) {
                section.classList.remove('is-hidden');
                chartManager.update();
            }
            const summary = await getContributionSummaryText(transactionState.chartDateRange);
            let result = `Showing contribution chart for ${formatDateRange(dateRange)}.`;
            if (summary) {
                result += `\n${summary}`;
            }
            appendMessage(result);
        }
    } else if (subcommand === 'performance') {
        const section = document.getElementById('runningAmountSection');
        const isAct = transactionState.activeChart === 'performance';
        const isVis = section && !section.classList.contains('is-hidden');
        if (isAct && isVis) {
            setActiveChart(null);
            if (section) {
                section.classList.add('is-hidden');
            }
            appendMessage('Hidden performance chart.');
        } else {
            setActiveChart('performance');
            if (section) {
                section.classList.remove('is-hidden');
                chartManager.update();
            }
            let result = `Showing performance chart for ${formatDateRange(dateRange)}.\n\n${TWRR_MESSAGE}`;
            const snap = getPerformanceSnapshotLine({ includeHidden: true });
            if (snap) {
                result += `\n\n${snap}`;
            }
            appendMessage(result);
        }
    } else if (subcommand === 'fx') {
        const section = document.getElementById('runningAmountSection');
        const isAct = transactionState.activeChart === 'fx';
        const isVis = section && !section.classList.contains('is-hidden');
        if (isAct && isVis) {
            setActiveChart(null);
            if (section) {
                section.classList.add('is-hidden');
            }
            appendMessage('Hidden FX rate chart.');
        } else {
            setActiveChart('fx');
            if (section) {
                section.classList.remove('is-hidden');
                chartManager.update();
            }
            let result = `Showing FX rate chart for ${formatDateRange(dateRange)}.`;
            const snap = getFxSnapshotLine();
            if (snap) {
                result += `\n${snap}`;
            }
            appendMessage(result);
        }
    } else if (subcommand === 'concentration') {
        const section = document.getElementById('runningAmountSection');
        const isAct = transactionState.activeChart === 'concentration';
        const isVis = section && !section.classList.contains('is-hidden');
        if (isAct && isVis) {
            setActiveChart(null);
            if (section) {
                section.classList.add('is-hidden');
            }
            appendMessage('Hidden concentration chart.');
        } else {
            setActiveChart('concentration');
            if (section) {
                section.classList.remove('is-hidden');
                chartManager.update();
            }
            let result = `Showing concentration (HHI) chart for ${formatDateRange(dateRange)}.`;
            const snap = await getConcentrationSnapshotText();
            if (snap) {
                result += `\n${snap}`;
            }
            appendMessage(result);
        }
    } else if (subcommand === 'pe') {
        const section = document.getElementById('runningAmountSection');
        const isAct = transactionState.activeChart === 'pe';
        const isVis = section && !section.classList.contains('is-hidden');
        if (isAct && isVis) {
            setActiveChart(null);
            if (section) {
                section.classList.add('is-hidden');
            }
            appendMessage('Hidden P/E ratio chart.');
        } else {
            setActiveChart('pe');
            if (section) {
                section.classList.remove('is-hidden');
                chartManager.update();
            }
            let result = `Showing weighted average P/E ratio chart for ${formatDateRange(dateRange)}.`;
            const snap = await getPESnapshotLine();
            if (snap) {
                result += `\n${snap}`;
            }
            appendMessage(result);
        }
    } else if (subcommand === 'rolling') {
        const section = document.getElementById('runningAmountSection');
        const isAct = transactionState.activeChart === 'rolling';
        const isVis = section && !section.classList.contains('is-hidden');
        if (isAct && isVis) {
            setActiveChart(null);
            if (section) {
                section.classList.add('is-hidden');
            }
            appendMessage('Hidden 1-Year rolling returns chart.');
        } else {
            setActiveChart('rolling');
            if (section) {
                section.classList.remove('is-hidden');
                chartManager.update();
            }
            let result = `Showing 1-Year rolling returns chart for ${formatDateRange(dateRange)}.\n\n${ROLLING_EXPLANATION}`;
            const snap = getRollingSnapshotLine();
            if (snap) {
                result += `\n\n${snap}`;
            }
            appendMessage(result);
        }
    } else if (subcommand === 'volatility') {
        const section = document.getElementById('runningAmountSection');
        const isAct = transactionState.activeChart === 'volatility';
        const isVis = section && !section.classList.contains('is-hidden');
        if (isAct && isVis) {
            setActiveChart(null);
            if (section) {
                section.classList.add('is-hidden');
            }
            appendMessage('Hidden 90-Day annualized rolling volatility chart.');
        } else {
            setActiveChart('volatility');
            if (section) {
                section.classList.remove('is-hidden');
                chartManager.update();
            }
            let result = `Showing 90-Day annualized rolling volatility chart for ${formatDateRange(dateRange)}.\n\n${VOLATILITY_EXPLANATION}`;
            const snap = getVolatilitySnapshotLine();
            if (snap) {
                result += `\n\n${snap}`;
            }
            appendMessage(result);
        }
    } else if (subcommand === 'beta') {
        const section = document.getElementById('runningAmountSection');
        const isAct = transactionState.activeChart === 'beta';
        const isVis = section && !section.classList.contains('is-hidden');
        if (isAct && isVis) {
            setActiveChart(null);
            if (section) {
                section.classList.add('is-hidden');
            }
            appendMessage('Hidden portfolio beta chart.');
        } else {
            setActiveChart('beta');
            if (section) {
                section.classList.remove('is-hidden');
                chartManager.update();
            }
            let result = `Showing 6-Month rolling portfolio beta chart for ${formatDateRange(dateRange)}.\n\n${BETA_EXPLANATION}`;
            const snap = await getBetaSnapshotLine();
            if (snap) {
                result += `\n\n${snap}`;
            }
            appendMessage(result);
        }
    } else if (subcommand === 'yield') {
        const section = document.getElementById('runningAmountSection');
        const isAct = transactionState.activeChart === 'yield';
        const isVis = section && !section.classList.contains('is-hidden');
        if (isAct && isVis) {
            setActiveChart(null);
            if (section) {
                section.classList.add('is-hidden');
            }
            appendMessage('Hidden dividend yield and income chart.');
        } else {
            setActiveChart('yield');
            if (section) {
                section.classList.remove('is-hidden');
                chartManager.update();
            }
            let result = `Showing dividend yield and income chart for ${formatDateRange(dateRange)}.\n\n${YIELD_EXPLANATION}`;
            const snap = await getYieldSnapshotLine();
            if (snap) {
                result += `\n\n${snap}`;
            }
            appendMessage(result);
        }
    } else {
        appendMessage(
            `Unknown plot subcommand: ${subcommand}\nAvailable: ${PLOT_SUBCOMMANDS.join(', ')}`
        );
    }
}
