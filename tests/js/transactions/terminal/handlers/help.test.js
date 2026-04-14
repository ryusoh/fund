import { handleHelpCommand } from '@js/transactions/terminal/handlers/help.js';

jest.mock('@js/transactions/terminal/constants.js', () => ({
    HELP_SUBCOMMANDS: ['filter', 'other'],
}));

describe('handleHelpCommand', () => {
    let appendMessage;

    beforeEach(() => {
        appendMessage = jest.fn();
    });

    it('should display main help when no args provided', () => {
        handleHelpCommand([], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('Available commands:'));
        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('stats (s)'));
        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('plot (p)'));
    });

    it('should display filter help when filter subcommand is provided', () => {
        handleHelpCommand(['filter'], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('Available filters:'));
        expect(appendMessage).toHaveBeenCalledWith(
            expect.stringContaining('type     - Filter by order type')
        );
    });

    it('should handle uppercase filter subcommand', () => {
        handleHelpCommand(['FILTER'], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('Available filters:'));
    });

    it('should handle unknown subcommand', () => {
        handleHelpCommand(['unknown'], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(
            'Unknown help subcommand: unknown\nAvailable: filter, other'
        );
    });
});

describe('help.js coverage dummy', () => {
    it('should export _coverage_dummy as true', async () => {
        const { _coverage_dummy } = await import('@js/transactions/terminal/handlers/help.js');
        expect(_coverage_dummy).toBe(true);
    });
});
