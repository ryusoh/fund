import { handleHelpCommand } from '@js/transactions/terminal/handlers/help.js';
import { HELP_SUBCOMMANDS } from '@js/transactions/terminal/constants.js';

describe('handleHelpCommand', () => {
    let appendMessage;

    beforeEach(() => {
        appendMessage = jest.fn();
    });

    test('shows main help when no args provided', () => {
        handleHelpCommand([], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('Available commands:'));
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
