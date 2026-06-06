import { executeCommand } from '../../../js/transactions/terminal/commands.js';
import * as helpHandlers from '../../../js/transactions/terminal/handlers/help.js';
import * as statsHandlers from '../../../js/transactions/terminal/handlers/stats.js';
import * as plotHandlers from '../../../js/transactions/terminal/handlers/plot.js';
import * as transactionHandlers from '../../../js/transactions/terminal/handlers/transaction.js';
import * as miscHandlers from '../../../js/transactions/terminal/handlers/misc.js';
import * as fadeModule from '../../../js/transactions/fade.js';

// Mock all the imported handlers
jest.mock('../../../js/transactions/terminal/handlers/help.js');
jest.mock('../../../js/transactions/terminal/handlers/stats.js');
jest.mock('../../../js/transactions/terminal/handlers/plot.js');
jest.mock('../../../js/transactions/terminal/handlers/transaction.js');
jest.mock('../../../js/transactions/terminal/handlers/misc.js');
jest.mock('../../../js/transactions/fade.js');

describe('terminal commands', () => {
    let mockContext;
    let mockOnCommandExecuted;
    let mockClearOutput;

    beforeEach(() => {
        mockOnCommandExecuted = jest.fn();
        mockClearOutput = jest.fn();
        mockContext = {
            onCommandExecuted: mockOnCommandExecuted,
            clearOutput: mockClearOutput,
        };

        jest.clearAllMocks();
    });

    describe('executeCommand', () => {
        it('should call handleHelpCommand for "h" or "help"', async () => {
            await executeCommand('help arg1', mockContext);
            expect(helpHandlers.handleHelpCommand).toHaveBeenCalledWith(
                ['arg1'],
                expect.objectContaining({ clearOutput: mockClearOutput })
            );

            await executeCommand('h arg2', mockContext);
            expect(helpHandlers.handleHelpCommand).toHaveBeenCalledWith(
                ['arg2'],
                expect.any(Object)
            );
        });

        it('should call handleStatsCommand for "s" or "stats"', async () => {
            await executeCommand('stats arg', mockContext);
            expect(statsHandlers.handleStatsCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );

            await executeCommand('s arg', mockContext);
            expect(statsHandlers.handleStatsCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );
        });

        it('should call handlePlotCommand for "p" or "plot"', async () => {
            await executeCommand('plot arg', mockContext);
            expect(plotHandlers.handlePlotCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );

            await executeCommand('p arg', mockContext);
            expect(plotHandlers.handlePlotCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );
        });

        it('should call handleTransactionCommand for "t" or "transaction"', async () => {
            await executeCommand('transaction arg', mockContext);
            expect(transactionHandlers.handleTransactionCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );

            await executeCommand('t arg', mockContext);
            expect(transactionHandlers.handleTransactionCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );
        });

        it('should call handleAllCommand for "all"', async () => {
            await executeCommand('all arg', mockContext);
            expect(miscHandlers.handleAllCommand).toHaveBeenCalledWith(['arg'], expect.any(Object));
        });

        it('should call handleAllTimeCommand for "alltime"', async () => {
            await executeCommand('alltime arg', mockContext);
            expect(miscHandlers.handleAllTimeCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );
        });

        it('should call handleAllStockCommand for "allstock"', async () => {
            await executeCommand('allstock arg', mockContext);
            expect(miscHandlers.handleAllStockCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );
        });

        it('should call handleResetCommand for "reset"', async () => {
            await executeCommand('reset arg', mockContext);
            expect(miscHandlers.handleResetCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );
        });

        it('should call handleClearCommand for "clear"', async () => {
            await executeCommand('clear arg', mockContext);
            expect(miscHandlers.handleClearCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );
        });

        it('should call handleZoomCommand for "zoom" or "z"', async () => {
            await executeCommand('zoom arg', mockContext);
            expect(miscHandlers.handleZoomCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );

            await executeCommand('z arg', mockContext);
            expect(miscHandlers.handleZoomCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );
        });

        it('should call handleLabelCommand for "label" or "l"', async () => {
            await executeCommand('label arg', mockContext);
            expect(miscHandlers.handleLabelCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );

            await executeCommand('l arg', mockContext);
            expect(miscHandlers.handleLabelCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );
        });

        it('should call handleAbsCommand for "abs", "absolute" or "a"', async () => {
            await executeCommand('abs arg', mockContext);
            expect(miscHandlers.handleAbsCommand).toHaveBeenCalledWith(['arg'], expect.any(Object));

            await executeCommand('absolute arg', mockContext);
            expect(miscHandlers.handleAbsCommand).toHaveBeenCalledWith(['arg'], expect.any(Object));

            await executeCommand('a arg', mockContext);
            expect(miscHandlers.handleAbsCommand).toHaveBeenCalledWith(['arg'], expect.any(Object));
        });

        it('should call handlePercentageCommand for "percentage", "percent", or "per"', async () => {
            await executeCommand('percentage arg', mockContext);
            expect(miscHandlers.handlePercentageCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );

            await executeCommand('percent arg', mockContext);
            expect(miscHandlers.handlePercentageCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );

            await executeCommand('per arg', mockContext);
            expect(miscHandlers.handlePercentageCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );
        });

        it('should call handleRollingCommand for "rolling"', async () => {
            await executeCommand('rolling arg', mockContext);
            expect(miscHandlers.handleRollingCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );
        });

        it('should call handleCumulativeCommand for "cumulative"', async () => {
            await executeCommand('cumulative arg', mockContext);
            expect(miscHandlers.handleCumulativeCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );
        });

        it('should call handleCompositionCommand for "composition"', async () => {
            await executeCommand('composition arg', mockContext);
            expect(miscHandlers.handleCompositionCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );
        });

        it('should call handleSectorsCommand for "sectors"', async () => {
            await executeCommand('sectors arg', mockContext);
            expect(miscHandlers.handleSectorsCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );
        });

        it('should call handleGeographyCommand for "geography"', async () => {
            await executeCommand('geography arg', mockContext);
            expect(miscHandlers.handleGeographyCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );
        });

        it('should call handleMarketcapCommand for "marketcap"', async () => {
            await executeCommand('marketcap arg', mockContext);
            expect(miscHandlers.handleMarketcapCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );
        });

        it('should call handleSummaryCommand for "summary"', async () => {
            await executeCommand('summary arg', mockContext);
            expect(miscHandlers.handleSummaryCommand).toHaveBeenCalledWith(
                ['arg'],
                expect.any(Object)
            );
        });

        it('should call handleDefaultCommand for unknown commands', async () => {
            await executeCommand('unknown arg', mockContext);
            expect(transactionHandlers.handleDefaultCommand).toHaveBeenCalledWith(
                'unknown arg',
                expect.any(Object)
            );
        });

        it('should set fade preserve second last to false', async () => {
            await executeCommand('help', mockContext);
            expect(fadeModule.setFadePreserveSecondLast).toHaveBeenCalledWith(false);
        });

        it('should call onCommandExecuted if it is a function', async () => {
            await executeCommand('help', mockContext);
            expect(mockOnCommandExecuted).toHaveBeenCalledTimes(1);
        });

        it('should not throw if onCommandExecuted is missing', async () => {
            await expect(executeCommand('help', {})).resolves.not.toThrow();
        });
    });
});
