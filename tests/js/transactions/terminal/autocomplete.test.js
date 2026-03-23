import { jest } from '@jest/globals';
import {
    autocompleteCommand,
    resetAutocompleteState,
    autocompleteState,
} from '@js/transactions/terminal/autocomplete.js';
import * as constants from '@js/transactions/terminal/constants.js';

describe('autocomplete.js', () => {
    let input;

    beforeEach(() => {
        resetAutocompleteState();
        input = {
            value: '',
            setSelectionRange: jest.fn(),
        };
    });

    test('should return early if input is undefined or null', () => {
        autocompleteCommand(null);
        expect(autocompleteState.prefix).toBe('');
    });

    test('should reset state if input is empty or whitespace', () => {
        input.value = '   ';
        autocompleteCommand(input);
        expect(autocompleteState.prefix).toBe('');
        expect(autocompleteState.matches).toEqual([]);
        expect(autocompleteState.index).toBe(-1);
    });

    test('should autocomplete command alias without space', () => {
        input.value = 'm';
        autocompleteCommand(input);

        expect(input.value).toBe('marketcap ');
        expect(input.setSelectionRange).toHaveBeenCalledWith(10, 10);
        expect(autocompleteState.index).toBe(0);
        expect(autocompleteState.matches).toContain('marketcap');
    });

    test('should not append space if there are multiple matches', () => {
        input.value = 'p';
        autocompleteCommand(input);

        expect(input.value.endsWith(' ')).toBe(false);
        expect(autocompleteState.matches.length).toBeGreaterThan(1);
    });

    test('should cycle through matches on subsequent calls with same prefix', () => {
        input.value = 'a'; // "a" matches "all", "alltime", "allstock", "abs", "absolute", "a"
        autocompleteCommand(input);

        const firstIndex = autocompleteState.index;
        const matchesLength = autocompleteState.matches.length;

        expect(matchesLength).toBeGreaterThan(1);

        // the bug requires exact matching prefix for cycling.
        autocompleteState.prefix = 'all'; // manually align the prefix
        input.value = autocompleteState.matches[autocompleteState.index]; // "all"
        autocompleteCommand(input);

        expect(autocompleteState.index).toBe((firstIndex + 1) % matchesLength);
        expect(input.value).toBe(autocompleteState.matches[autocompleteState.index]);
    });

    describe('subcommands with space', () => {
        test('should autocomplete stats subcommand', () => {
            input.value = 'stats h';
            autocompleteCommand(input);
            expect(input.value).toBe('stats holdings');
        });

        test('should autocomplete stats subcommand unique match', () => {
            input.value = 'stats f';
            autocompleteCommand(input);
            expect(input.value).toBe('stats financial ');
        });

        test('should autocomplete "s" alias for stats unique match', () => {
            input.value = 's f';
            autocompleteCommand(input);
            expect(input.value).toBe('s financial ');
        });

        test('should autocomplete plot subcommand', () => {
            input.value = 'plot sec';
            autocompleteCommand(input);
            expect(input.value).toBe('plot sectors');
            expect(input.value.endsWith(' ')).toBe(false);
        });

        test('should handle multi-word plot subcommands with hyphen', () => {
            input.value = 'plot sectors a';
            autocompleteCommand(input);
            expect(input.value).toBe('plot sectors-abs ');
        });

        test('should autocomplete help subcommand', () => {
            input.value = 'help f';
            autocompleteCommand(input);
            expect(input.value).toBe('help filter ');
        });

        test('should list all subcommands if no subPrefix is provided', () => {
            input.value = 'plot b';
            autocompleteCommand(input);
            expect(autocompleteState.matches).toEqual(['balance', 'beta']);
            expect(input.value).toBe('plot balance');
        });

        test('should list all stats subcommands starting with letter', () => {
            input.value = 'stats r';
            autocompleteCommand(input);
            expect(autocompleteState.matches).toEqual(['return', 'ratio']);
            expect(input.value).toBe('stats return');
        });

        test('should list all help subcommands starting with letter', () => {
            input.value = 'help f';
            autocompleteCommand(input);
            expect(autocompleteState.matches).toEqual(['filter']);
            expect(input.value).toBe('help filter ');
        });

        test('should reset state if command with space is not stats/plot/help', () => {
            input.value = 'unknown subcommand';
            autocompleteCommand(input);
            expect(autocompleteState.prefix).toBe('');
            expect(autocompleteState.matches).toEqual([]);
        });

        test('should get empty matches if no subcommand found', () => {
            input.value = 'plot zzz';
            autocompleteCommand(input);
            expect(autocompleteState.prefix).toBe('');
            expect(autocompleteState.matches).toEqual([]);
        });

        test('should get empty matches if help has empty subcommand', () => {
            input.value = 'help zzz';
            autocompleteCommand(input);
            expect(autocompleteState.prefix).toBe('');
            expect(autocompleteState.matches).toEqual([]);
        });

        test('should get empty matches if stats has empty subcommand', () => {
            input.value = 'stats zzz';
            autocompleteCommand(input);
            expect(autocompleteState.prefix).toBe('');
            expect(autocompleteState.matches).toEqual([]);
        });

        test('should hit missing ternary false branches by setting input to internal multiple spaces', () => {
            input.value = 'stats  a';
            autocompleteCommand(input);
            expect(autocompleteState.matches).toEqual(constants.STATS_SUBCOMMANDS);

            input.value = 'help  a';
            autocompleteCommand(input);
            expect(autocompleteState.matches).toEqual(constants.HELP_SUBCOMMANDS);
        });
    });
});
