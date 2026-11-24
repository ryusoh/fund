import { handleHelpCommand } from './handlers/help.js';
import { handleStatsCommand } from './handlers/stats.js';
import { handlePlotCommand } from './handlers/plot.js';
import { handleActiveValuationShortcut } from './handlers/analysis.js';
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
    handleGeographyCommand,
    handleMarketcapCommand,
} from './handlers/misc.js';

import { setFadePreserveSecondLast } from '../fade.js';

const commandMap = {
    h: handleHelpCommand,
    help: handleHelpCommand,
    all: handleAllCommand,
    alltime: handleAllTimeCommand,
    allstock: handleAllStockCommand,
    reset: handleResetCommand,
    clear: handleClearCommand,
    zoom: handleZoomCommand,
    z: handleZoomCommand,
    stats: handleStatsCommand,
    s: handleStatsCommand,
    label: handleLabelCommand,
    l: handleLabelCommand,
    transaction: handleTransactionCommand,
    t: handleTransactionCommand,
    plot: handlePlotCommand,
    p: handlePlotCommand,
    abs: handleAbsCommand,
    absolute: handleAbsCommand,
    a: handleAbsCommand,
    percentage: handlePercentageCommand,
    percent: handlePercentageCommand,
    per: handlePercentageCommand,
    rolling: handleRollingCommand,
    cumulative: handleCumulativeCommand,
    composition: handleCompositionCommand,
    sectors: handleSectorsCommand,
    geography: handleGeographyCommand,
    marketcap: handleMarketcapCommand,
    summary: handleSummaryCommand,
};

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

    const cmdLower = cmd ? cmd.toLowerCase() : '';
    const handler = Object.prototype.hasOwnProperty.call(commandMap, cmdLower)
        ? commandMap[cmdLower]
        : undefined;
    if (
        cmdLower === 'all' &&
        args.length === 0 &&
        (await handleActiveValuationShortcut(cmdLower, args, enhancedContext))
    ) {
        // Handled as valuation horizon expansion while a ticker chart is active.
    } else if (handler) {
        await handler(args, enhancedContext);
    } else if (await handleActiveValuationShortcut(cmdLower, args, enhancedContext)) {
        // Handled as a contextual valuation ticker switch while the pane is open.
    } else {
        await handleDefaultCommand(command, enhancedContext);
    }

    if (typeof onCommandExecuted === 'function') {
        onCommandExecuted();
    }
}
