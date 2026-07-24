import { transactionState, isTransactionDataReady, whenTransactionDataReady } from '../../state.js';
import {
    getStatsText,
    getHoldingsText,
    getHoldingsDebugText,
    getCagrText,
    getAnnualReturnText,
    getRatioText,
    getDurationStatsText,
    getLifespanStatsText,
    getConcentrationText,
    getFinancialStatsText,
    getTechnicalStatsText,
} from '../../terminalStats.js';
import { getGeographySummaryText } from './geographySummary.js';
import { STATS_SUBCOMMANDS } from '../constants.js';

const STATS_DISPATCH = {
    transactions: () => getStatsText(transactionState.selectedCurrency || 'USD'),
    holdings: () => getHoldingsText(transactionState.selectedCurrency || 'USD'),
    'holdings-debug': () => getHoldingsDebugText(),
    financial: () => getFinancialStatsText(),
    technical: () => getTechnicalStatsText(),
    cagr: () => getCagrText(),
    return: () => getAnnualReturnText(),
    ratio: () => getRatioText(),
    duration: () => getDurationStatsText(),
    lifespan: () => getLifespanStatsText(),
    concentration: () => getConcentrationText(),
    geography: () => getGeographySummaryText(),
};

export async function handleStatsCommand(args, { appendMessage }) {
    if (args.length === 0) {
        // Show stats help
        const result =
            'Stats commands:\n' +
            '  stats transactions  - Show transaction statistics\n' +
            '  stats holdings      - Show current holdings\n' +
            '  stats financial     - Show market data for current holdings\n' +
            '  stats technical     - Show technical indicators (price, ranges, averages)\n' +
            '  stats duration      - Show value-weighted holding ages\n' +
            '  stats lifespan      - Show holding lifespans for open and closed tickers\n' +
            '  stats concentration - Show Herfindahl concentration & effective holdings\n' +
            '  stats cagr          - Show CAGR based on TWRR series\n' +
            '  stats return        - Show annual returns for portfolio and benchmarks\n' +
            '  stats ratio         - Show Sharpe and Sortino ratios\n' +
            '  stats geography     - Show geographic allocation by continent/region\n' +
            '\nUsage: stats <subcommand> or s <subcommand>';
        appendMessage(result);
        return;
    }

    // Stats builders read transactionState directly; if the initial page load
    // is still in flight they would compute from empty state.
    if (!isTransactionDataReady()) {
        appendMessage('Loading portfolio data...');
        await whenTransactionDataReady();
    }

    const subcommand = args[0].toLowerCase();
    let result = '';

    if (Object.hasOwn(STATS_DISPATCH, subcommand)) {
        result = await STATS_DISPATCH[subcommand]();
    } else {
        result = `Unknown stats subcommand: ${subcommand}\nAvailable: ${STATS_SUBCOMMANDS.join(', ')}`;
    }

    if (result) {
        appendMessage(result);
    }
}
