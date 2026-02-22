import { HELP_SUBCOMMANDS } from '../constants.js';

export function handleHelpCommand(args, { appendMessage }) {
    if (args.length === 0) {
        // Show main help
        const result =
            'Available commands:\n' +
            '  stats (s)          - Statistics commands\n' +
            '                       Use "stats" or "s" for subcommands\n' +
            '                       Subcommands: transactions, holdings, financial, technical, duration, lifespan,\n' +
            '                                    concentration, cagr, return, ratio\n' +
            '                       Examples: stats lifespan, s cagr, stats concentration\n' +
            '  plot (p)           - Chart commands\n' +
            '                       Use "plot" or "p" for subcommands\n' +
            '                       Subcommands: balance, performance, drawdown, rolling, volatility, beta, yield, composition,\n' +
            '                                    composition-abs, sectors, sectors-abs, geography, geography-abs, marketcap,\n' +
            '                                    marketcap-abs, concentration, pe, fx\n' +
            '                       Examples: plot balance, p performance, plot drawdown, plot rolling, plot volatility, plot beta,\n' +
            '                                 plot yield, plot composition 2023, plot composition abs 2023, plot sectors,\n' +
            '                                 plot sectors abs, plot geography, plot geography abs, plot marketcap, plot marketcap abs,\n' +
            '                                 plot concentration, plot pe, plot fx\n' +
            '  transaction (t)    - Toggle the transaction table visibility\n' +
            '  zoom (z)           - Toggle terminal zoom (expand to take over chart area)\n' +
            '  summary            - Show summary of the currently active chart\n' +
            '  all                - Show all data (remove filters and date ranges)\n' +
            '  reset              - Restore full transaction list and show table/chart\n' +
            '  clear              - Clear the terminal screen\n' +
            '  help (h)           - Show this help message\n' +
            '                       Use "help filter" for filter commands\n\n' +
            'Hint: Press Tab to auto-complete command names and subcommands\n\n' +
            'Any other input is treated as a filter for the transaction table\n' +
            "When a chart is active, you can use simplified date commands like '2023', '2023q1', 'from:2023q2' (or 'f:2023q2'), '2022:2023'";
        appendMessage(result);
    } else {
        const subcommand = args[0].toLowerCase();
        let result = '';
        switch (subcommand) {
            case 'filter':
                result =
                    'Usage: <filter>:<value>\n\nAvailable filters:\n  type     - Filter by order type (buy or sell).\n             Example: type:buy\n  security - Filter by security ticker.\n             Example: security:NVDA or s:NVDA\n  min      - Show transactions with a net amount greater than value.\n             Example: min:1000\n  max      - Show transactions with a net amount less than value.\n             Example: max:5000\n  stock    - Show individual stock positions (excludes ETFs/funds).\n             Example: stock\n  etf      - Show ETF/mutual fund positions (excludes individual stocks).\n             Example: etf\n  abs/a    - When composition, sectors, geography, or marketcap chart is open, switch to absolute view.\n             Example: abs\n  per      - When absolute view is open, switch back to percentage view.\n             Example: per\n  alltime  - Clear chart date filters without touching other filters.\n             Example: alltime\n  allstock - Clear composition ticker filters (show all holdings).\n             Example: allstock\n\nDate filters (when chart is active):\n  from:YYYY or f:YYYY     - Filter from year (e.g., from:2022 or f:2022)\n  to:YYYY                 - Filter to year (e.g., to:2023)\n  YYYY:YYYY               - Filter year range (e.g., 2022:2023)\n  YYYYqN                  - Filter by quarter (e.g., 2023q1)\n  YYYYqN:YYYYqN           - Filter between two quarters (e.g., 2022q1:2023q2)\n  from:YYYYqN or f:YYYYqN - Filter from quarter (e.g., from:2022q3)\n  qN                      - Quarter of the current range (e.g., q2)\n  from:qN or f:qN         - From the start of that quarter (e.g., f:q3)\n  to:qN                   - To the end of that quarter (e.g., to:q4)\n\nChart label toggle:\n  label (l)               - Toggle chart labels (start/end annotations, FX/composition hover panels).\n                            Example: label\n\nAny text not part of a command is used for a general text search.';
                break;
            default:
                result = `Unknown help subcommand: ${subcommand}\nAvailable: ${HELP_SUBCOMMANDS.join(', ')}`;
                break;
        }
        appendMessage(result);
    }
}
