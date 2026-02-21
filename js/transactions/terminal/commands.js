import {
    COMMAND_ALIASES,
    STATS_SUBCOMMANDS,
    PLOT_SUBCOMMANDS,
    HELP_SUBCOMMANDS,
} from './constants.js';

import { handleHelpCommand } from './handlers/help.js';
import { handleStatsCommand } from './handlers/stats.js';
import { handlePlotCommand } from './handlers/plot.js';
import { handleTransactionCommand, handleDefaultCommand } from './handlers/transaction.js';
import {
    handleAllCommand,
    handleAllTimeCommand,
    handleAllStockCommand,
    handleResetCommand,
    handleClearCommand,
    handleZoomCommand,
    handleLabelCommand,
    handleSummaryCommand,
    handleAbsCommand,
    handlePercentageCommand,
    handleRollingCommand,
    handleCumulativeCommand,
    handleCompositionCommand,
    handleSectorsCommand,
} from './handlers/misc.js';

import { setFadePreserveSecondLast } from '../fade.js';

// Re-export constants for backward compatibility (if needed)
export { COMMAND_ALIASES, STATS_SUBCOMMANDS, PLOT_SUBCOMMANDS, HELP_SUBCOMMANDS };

// Autocomplete logic was moved to autocomplete.js.
// We export this placeholder if something still imports it, but autocomplete.js should be used instead.
export function autocompleteCommand() {
    // No-op or throw warning?
    // Given the previous refactoring phase, this might be dead code, but keeping it empty is safe.
    // Ideally, consumers should use autocomplete.js.
}

export async function executeCommand(command, context) {
    const { onCommandExecuted } = context;

    // Provide default implementations if missing (e.g. for clearing output)
    const enhancedContext = {
        ...context,
        clearOutput: context.clearOutput, // Might be undefined
    };

    const parts = command.toLowerCase().split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);

    setFadePreserveSecondLast(false);

    switch (cmd.toLowerCase()) {
        case 'h':
        case 'help':
            handleHelpCommand(args, enhancedContext);
            break;

        case 'all':
            await handleAllCommand(args, enhancedContext);
            break;

        case 'alltime':
            await handleAllTimeCommand(args, enhancedContext);
            break;

        case 'allstock':
            await handleAllStockCommand(args, enhancedContext);
            break;

        case 'reset':
            await handleResetCommand(args, enhancedContext);
            break;

        case 'clear':
            handleClearCommand(args, enhancedContext);
            break;

        case 'zoom':
        case 'z':
            await handleZoomCommand(args, enhancedContext);
            break;

        case 'stats':
        case 's':
            await handleStatsCommand(args, enhancedContext);
            break;

        case 'label':
        case 'l':
            handleLabelCommand(args, enhancedContext);
            break;

        case 'transaction':
        case 't':
            await handleTransactionCommand(args, enhancedContext);
            break;

        case 'plot':
        case 'p':
            await handlePlotCommand(args, enhancedContext);
            break;

        case 'abs':
        case 'absolute':
        case 'a':
            await handleAbsCommand(args, enhancedContext);
            break;

        case 'percentage':
        case 'percent':
        case 'per':
            await handlePercentageCommand(args, enhancedContext);
            break;

        case 'rolling':
            await handleRollingCommand(args, enhancedContext);
            break;

        case 'cumulative':
            await handleCumulativeCommand(args, enhancedContext);
            break;

        case 'composition':
            await handleCompositionCommand(args, enhancedContext);
            break;

        case 'sectors':
            await handleSectorsCommand(args, enhancedContext);
            break;

        case 'summary':
            await handleSummaryCommand(args, enhancedContext);
            break;

        default:
            await handleDefaultCommand(command, enhancedContext);
            break;
    }

    if (typeof onCommandExecuted === 'function') {
        onCommandExecuted();
    }
}
