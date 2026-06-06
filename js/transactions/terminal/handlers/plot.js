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
        const prefixes = ['composition', 'sectors', 'geography', 'marketcap', 'drawdown'];
        for (const prefix of prefixes) {
            if (subcmd.startsWith(prefix)) {
                return prefix;
            }
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

        const firstTokenLower = normalizedTokens[0].toLowerCase();
        if (normalizedTokens.length === 1 && ['all', 'reset', 'clear'].includes(firstTokenLower)) {
            const clearedRange = { from: null, to: null };
            setChartDateRange(clearedRange);
            updateContextYearFromRange(clearedRange);
            return clearedRange;
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

    const getCompositionTokensAndMode = () => {
        let useAbsolute = isAbsoluteSubcommand(subcommand);
        let rangeTokens = [...rawArgs];
        if (!useAbsolute && rangeTokens.length > 0) {
            const maybeMode = rangeTokens[0].toLowerCase();
            if (maybeMode === 'abs' || maybeMode === 'absolute') {
                useAbsolute = true;
                rangeTokens = rangeTokens.slice(1);
            }
        }
        return { useAbsolute, rangeTokens };
    };

    const getSnapshotFn = (baseChartKey, useAbsolute) => {
        if (baseChartKey === 'drawdown') {
            return () => getDrawdownSnapshotLine({ includeHidden: true, isAbsolute: useAbsolute });
        }
        const snapshotFnMap = {
            composition: getCompositionSnapshotLine,
            sectors: getSectorsSnapshotLine,
            geography: getGeographySnapshotLine,
            marketcap: getMarketcapSnapshotLine,
        };
        return snapshotFnMap[baseChartKey];
    };

    const toggleCompositionChart = (targetChart) => {
        const section = document.getElementById('runningAmountSection');
        const tableContainer = document.querySelector('.table-responsive-container');
        setActiveChart(targetChart);
        if (section) {
            section.classList.remove('is-hidden');
            chartManager.update();
        }
        if (tableContainer) {
            tableContainer.classList.add('is-hidden');
        }
    };

    const buildCompositionResultMsg = (baseChartKey, useAbsolute, dateRange, typeName) => {
        const isAbs = useAbsolute ? ' (absolute)' : '';
        if (baseChartKey === 'drawdown') {
            return `Showing drawdown${isAbs} chart for ${formatDateRange(dateRange)}.`;
        }
        return `Showing ${typeName}${isAbs} chart for ${formatDateRange(dateRange)}.`;
    };

    const handleCompositionStyleChart = async (baseChartKey) => {
        const { useAbsolute, rangeTokens } = getCompositionTokensAndMode();
        const dateRange = applyDateArgs(rangeTokens);
        const targetChart = useAbsolute ? baseChartKey + 'Abs' : baseChartKey;
        const section = document.getElementById('runningAmountSection');
        const isActive = transactionState.activeChart === targetChart;
        const isVisible = section && !section.classList.contains('is-hidden');

        const typeNameMap = {
            sectors: 'sector allocation',
            geography: 'geography allocation',
            marketcap: 'market cap allocation',
        };
        const typeName = typeNameMap[baseChartKey] || baseChartKey;

        if (isActive && isVisible && rangeTokens.length === 0) {
            setActiveChart(null);
            if (section) {
                section.classList.add('is-hidden');
            }
            appendMessage(`Hidden ${typeName} chart.`);
            return;
        }

        toggleCompositionChart(targetChart);
        let result = buildCompositionResultMsg(baseChartKey, useAbsolute, dateRange, typeName);

        const suffix = useAbsolute ? ' Abs' : '';
        const labelPrefix = baseChartKey.charAt(0).toUpperCase() + baseChartKey.slice(1) + suffix;

        const snapshotFn = getSnapshotFn(baseChartKey, useAbsolute);
        const snapshot = await snapshotFn({ labelPrefix });
        if (snapshot) {
            result += `\n${snapshot}`;
        }

        appendMessage(result);
    };

    const baseSubcommand = getBaseSubcommand(subcommand);

    const handleNonCompositionStyleChart = async (subcmd, dateRange) => {
        const chartHandlers = {
            balance: {
                key: 'contribution',
                hiddenName: 'contribution chart.',
                getSummary: async () =>
                    await getContributionSummaryText(transactionState.chartDateRange),
                getBaseMsg: (dRange) =>
                    `Showing contribution chart for ${formatDateRange(dRange)}.`,
                getSnap: async () => null,
            },
            performance: {
                key: 'performance',
                hiddenName: 'performance chart.',
                getSummary: async () => null,
                getBaseMsg: (dRange) =>
                    `Showing performance chart for ${formatDateRange(dRange)}.\n\n${TWRR_MESSAGE}`,
                getSnap: async () => getPerformanceSnapshotLine({ includeHidden: true }),
                appendSnapDoubleNewline: true,
            },
            fx: {
                key: 'fx',
                hiddenName: 'FX rate chart.',
                getSummary: async () => null,
                getBaseMsg: (dRange) => `Showing FX rate chart for ${formatDateRange(dRange)}.`,
                getSnap: async () => getFxSnapshotLine(),
            },
            concentration: {
                key: 'concentration',
                hiddenName: 'concentration chart.',
                getSummary: async () => null,
                getBaseMsg: (dRange) =>
                    `Showing concentration (HHI) chart for ${formatDateRange(dRange)}.`,
                getSnap: async () => await getConcentrationSnapshotText(),
            },
            pe: {
                key: 'pe',
                hiddenName: 'P/E ratio chart.',
                getSummary: async () => null,
                getBaseMsg: (dRange) =>
                    `Showing weighted average P/E ratio chart for ${formatDateRange(dRange)}.`,
                getSnap: async () => await getPESnapshotLine(),
            },
            rolling: {
                key: 'rolling',
                hiddenName: '1-Year rolling returns chart.',
                getSummary: async () => null,
                getBaseMsg: (dRange) =>
                    `Showing 1-Year rolling returns chart for ${formatDateRange(dRange)}.\n\n${ROLLING_EXPLANATION}`,
                getSnap: async () => getRollingSnapshotLine(),
                appendSnapDoubleNewline: true,
            },
            volatility: {
                key: 'volatility',
                hiddenName: '90-Day annualized rolling volatility chart.',
                getSummary: async () => null,
                getBaseMsg: (dRange) =>
                    `Showing 90-Day annualized rolling volatility chart for ${formatDateRange(dRange)}.\n\n${VOLATILITY_EXPLANATION}`,
                getSnap: async () => getVolatilitySnapshotLine(),
                appendSnapDoubleNewline: true,
            },
            beta: {
                key: 'beta',
                hiddenName: 'portfolio beta chart.',
                getSummary: async () => null,
                getBaseMsg: (dRange) =>
                    `Showing 6-Month rolling portfolio beta chart for ${formatDateRange(dRange)}.\n\n${BETA_EXPLANATION}`,
                getSnap: async () => await getBetaSnapshotLine(),
                appendSnapDoubleNewline: true,
            },
            yield: {
                key: 'yield',
                hiddenName: 'dividend yield and income chart.',
                getSummary: async () => null,
                getBaseMsg: (dRange) =>
                    `Showing dividend yield and income chart for ${formatDateRange(dRange)}.\n\n${YIELD_EXPLANATION}`,
                getSnap: async () => await getYieldSnapshotLine(),
                appendSnapDoubleNewline: true,
            },
        };

        const handler = chartHandlers[subcmd];
        if (!handler) {
            appendMessage(
                `Unknown plot subcommand: ${subcmd}\nAvailable: ${PLOT_SUBCOMMANDS.join(', ')}`
            );
            return;
        }

        const section = document.getElementById('runningAmountSection');
        const isAct = transactionState.activeChart === handler.key;
        const isVis = section && !section.classList.contains('is-hidden');

        if (isAct && isVis) {
            setActiveChart(null);
            if (section) {
                section.classList.add('is-hidden');
            }
            appendMessage(`Hidden ${handler.hiddenName}`);
        } else {
            setActiveChart(handler.key);
            const tableContainer = document.querySelector('.table-responsive-container');
            if (section) {
                section.classList.remove('is-hidden');
                chartManager.update();
            }
            if (tableContainer) {
                tableContainer.classList.add('is-hidden');
            }

            let result = handler.getBaseMsg(dateRange);
            const summary = await handler.getSummary();
            if (summary) {
                result += `\n${summary}`;
            }

            const snap = await handler.getSnap();
            if (snap) {
                result += handler.appendSnapDoubleNewline ? `\n\n${snap}` : `\n${snap}`;
            }
            appendMessage(result);
        }
    };

    if (['composition', 'sectors', 'geography', 'marketcap', 'drawdown'].includes(baseSubcommand)) {
        await handleCompositionStyleChart(baseSubcommand);
        return;
    }

    const dateRange = applyDateArgs(rawArgs);
    await handleNonCompositionStyleChart(subcommand, dateRange);
}
