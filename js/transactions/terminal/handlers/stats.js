import { transactionState } from '../../state.js';
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

    const subcommand = args[0].toLowerCase();
    let result = '';

    switch (subcommand) {
        case 'transactions':
            result = await getStatsText(transactionState.selectedCurrency || 'USD');
            break;
        case 'holdings':
            result = await getHoldingsText(transactionState.selectedCurrency || 'USD');
            break;
        case 'holdings-debug':
            result = await getHoldingsDebugText();
            break;
        case 'financial':
            result = await getFinancialStatsText();
            break;
        case 'technical':
            result = await getTechnicalStatsText();
            break;
        case 'cagr':
            result = await getCagrText();
            break;
        case 'return':
            result = await getAnnualReturnText();
            break;
        case 'ratio':
            result = await getRatioText();
            break;
        case 'duration':
            result = await getDurationStatsText();
            break;
        case 'lifespan':
            result = await getLifespanStatsText();
            break;
        case 'concentration':
            result = await getConcentrationText();
            break;
        case 'geography':
            result = await getGeographySummaryText();
            break;
        default:
            result = `Unknown stats subcommand: ${subcommand}\nAvailable: ${STATS_SUBCOMMANDS.join(', ')}`;
            break;
    }

    if (result) {
        appendMessage(result);
    }
}
