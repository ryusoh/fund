import { handleHelpCommand } from '@js/transactions/terminal/handlers/help.js';
import {
    HELP_SUBCOMMANDS,
    STATS_SUBCOMMANDS,
    PLOT_SUBCOMMANDS,
} from '@js/transactions/terminal/constants.js';

describe('handleHelpCommand', () => {
    let appendMessage;

    beforeEach(() => {
        appendMessage = jest.fn();
    });

    test('shows main help when no args provided', () => {
        handleHelpCommand([], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('Available commands:'));
    });

    test('main help includes all stats subcommands', () => {
        handleHelpCommand([], { appendMessage });
        const output = appendMessage.mock.calls[0][0];

        STATS_SUBCOMMANDS.forEach((subcommand) => {
            if (subcommand === 'holdings-debug') {
                return;
            }
            expect(output).toContain(subcommand);
        });
    });

    test('main help includes all plot subcommands', () => {
        handleHelpCommand([], { appendMessage });
        const output = appendMessage.mock.calls[0][0];

        PLOT_SUBCOMMANDS.forEach((subcommand) => {
            // Clean the subcommand (e.g., 'sectors-abs' -> 'sectors abs' for help string matching)
            const documentedName = subcommand.replace('-', ' ');
            expect(output).toContain(documentedName);
        });
    });

    test('shows filter help when args[0] is "filter"', () => {
        handleHelpCommand(['filter'], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('Available filters:'));
    });

    test('shows unknown help subcommand when args[0] is unknown', () => {
        handleHelpCommand(['unknown'], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Unknown help subcommand: unknown')
        );
        expect(appendMessage).toHaveBeenCalledWith(
            expect.stringContaining(HELP_SUBCOMMANDS.join(', '))
        );
    });
});
