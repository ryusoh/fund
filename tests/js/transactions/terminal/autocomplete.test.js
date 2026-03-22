import {
    autocompleteCommand,
    resetAutocompleteState,
    autocompleteState,
} from '../../../../js/transactions/terminal/autocomplete.js';
import {
    COMMAND_ALIASES,
    STATS_SUBCOMMANDS,
    PLOT_SUBCOMMANDS,
    HELP_SUBCOMMANDS,
} from '../../../../js/transactions/terminal/constants.js';

describe('Autocomplete Command', () => {
    let inputElement;

    beforeEach(() => {
        resetAutocompleteState();
        inputElement = {
            value: '',
            setSelectionRange: jest.fn(),
        };
    });

    it('should do nothing if input is null', () => {
        autocompleteCommand(null);
        expect(autocompleteState.prefix).toBe('');
    });

    it('should reset state if input is empty or whitespace', () => {
        autocompleteState.prefix = 'test';
        inputElement.value = '   ';
        autocompleteCommand(inputElement);
        expect(autocompleteState.prefix).toBe('');
    });

    it('should complete main command to single match with trailing space', () => {
        inputElement.value = 'mar';
        autocompleteCommand(inputElement);
        expect(inputElement.value).toBe('marketcap ');
        expect(inputElement.setSelectionRange).toHaveBeenCalledWith(10, 10);
    });

    it('should loop through multiple matches correctly', () => {
        inputElement.value = 'a';
        autocompleteCommand(inputElement);
        expect(inputElement.value).toBe('all');
        expect(autocompleteState.prefix).toBe('a');

        inputElement.value = 'all';
        autocompleteCommand(inputElement);
        expect(inputElement.value).toBe('all');
        expect(autocompleteState.prefix).toBe('all');

        inputElement.value = 'all';
        autocompleteCommand(inputElement);
        expect(inputElement.value).toBe('alltime');
    });

    it('should handle single match appending space in loop', () => {
        inputElement.value = 'alltime';
        autocompleteCommand(inputElement);
        expect(inputElement.value).toBe('alltime ');
    });

    it('should reset state if no matches', () => {
        inputElement.value = 'xyz123';
        autocompleteCommand(inputElement);
        expect(autocompleteState.matches).toHaveLength(0);
    });

    it('should populate all plot subcommands when explicitly requested with space inside', () => {
        inputElement.value = 'stats  x';
        autocompleteCommand(inputElement);
        expect(autocompleteState.matches).toEqual(STATS_SUBCOMMANDS);
        expect(inputElement.value).toBe('stats ' + STATS_SUBCOMMANDS[0]);
    });

    it('should complete plot subcommands', () => {
        inputElement.value = 'plot b';
        autocompleteCommand(inputElement);
        expect(inputElement.value).toBe('plot balance');
    });

    it('should complete plot subcommands with space if single match', () => {
        inputElement.value = 'plot balance';
        autocompleteCommand(inputElement);
        expect(inputElement.value).toBe('plot balance ');
    });

    it('should handle multi-word plot subcommands', () => {
        inputElement.value = 'plot composition a';
        autocompleteCommand(inputElement);
        expect(inputElement.value).toBe('plot composition-abs ');
    });

    it('should complete stats subcommands', () => {
        inputElement.value = 's h';
        autocompleteCommand(inputElement);
        expect(inputElement.value).toBe('s holdings');
    });

    it('should complete help subcommands', () => {
        inputElement.value = 'h f';
        autocompleteCommand(inputElement);
        expect(inputElement.value).toBe('h filter ');
    });

    it('should populate all help subcommands if explicitly empty', () => {
        inputElement.value = 'h  x';
        autocompleteCommand(inputElement);
        expect(autocompleteState.matches).toEqual(HELP_SUBCOMMANDS);
        expect(inputElement.value).toBe('h ' + HELP_SUBCOMMANDS[0] + ' ');
    });

    it('should handle space prefixes correctly but no subcommand matches', () => {
        inputElement.value = 'p xyz';
        autocompleteCommand(inputElement);
        expect(autocompleteState.matches).toHaveLength(0);
    });

    it('should handle non-matching prefix with spaces', () => {
        inputElement.value = 'unknown f';
        autocompleteCommand(inputElement);
        expect(autocompleteState.matches).toHaveLength(0);
    });
});
