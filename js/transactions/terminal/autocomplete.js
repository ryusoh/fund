import {
    COMMAND_ALIASES,
    STATS_SUBCOMMANDS,
    PLOT_SUBCOMMANDS,
    HELP_SUBCOMMANDS,
} from './constants.js';

export const autocompleteState = {
    prefix: '',
    matches: [],
    index: -1,
};

export function resetAutocompleteState() {
    autocompleteState.prefix = '';
    autocompleteState.matches = [];
    autocompleteState.index = -1;
}

export function autocompleteCommand(input) {
    if (!input) {
        return;
    }
    const val = input.value;
    const trimmedValue = val.trim();
    const searchPrefix = trimmedValue.toLowerCase();

    if (!searchPrefix) {
        resetAutocompleteState();
        return;
    }

    const hasSpace = searchPrefix.includes(' ');
    const parts = searchPrefix.split(' ');
    let matches = [];

    if (hasSpace) {
        if (parts.length >= 2 && (parts[0] === 'stats' || parts[0] === 's')) {
            const subPrefix = parts[1] ? parts[1].toLowerCase() : '';
            matches = subPrefix
                ? STATS_SUBCOMMANDS.filter((cmd) => cmd.startsWith(subPrefix))
                : STATS_SUBCOMMANDS;
        } else if (parts.length >= 2 && (parts[0] === 'plot' || parts[0] === 'p')) {
            const subPrefixRaw = parts.slice(1).join(' ').toLowerCase();
            const normalizedSubPrefix = subPrefixRaw.replace(/\s+/g, '-');
            matches = normalizedSubPrefix
                ? PLOT_SUBCOMMANDS.filter((cmd) => cmd.startsWith(normalizedSubPrefix))
                : PLOT_SUBCOMMANDS;
        } else if (parts.length >= 2 && (parts[0] === 'help' || parts[0] === 'h')) {
            const subPrefix = parts[1] ? parts[1].toLowerCase() : '';
            matches = subPrefix
                ? HELP_SUBCOMMANDS.filter((cmd) => cmd.startsWith(subPrefix))
                : HELP_SUBCOMMANDS;
        } else {
            resetAutocompleteState();
            return;
        }
    } else {
        matches = (
            searchPrefix
                ? COMMAND_ALIASES.filter((cmd) => cmd.startsWith(searchPrefix))
                : COMMAND_ALIASES
        ).filter((cmd, index, arr) => arr.indexOf(cmd) === index);
    }

    if (matches.length === 0) {
        resetAutocompleteState();
        return;
    }

    const currentPrefixKey = searchPrefix;

    if (
        autocompleteState.prefix === currentPrefixKey &&
        autocompleteState.matches.length > 0 &&
        trimmedValue.endsWith(autocompleteState.matches[autocompleteState.index])
    ) {
        autocompleteState.index = (autocompleteState.index + 1) % autocompleteState.matches.length;
    } else {
        autocompleteState.prefix = currentPrefixKey;
        autocompleteState.matches = matches;
        autocompleteState.index = 0;
    }

    const completed = autocompleteState.matches[autocompleteState.index];
    const suffix = matches.length === 1 ? ' ' : '';

    if (hasSpace && ['stats', 's', 'plot', 'p', 'help', 'h'].includes(parts[0])) {
        input.value = `${parts[0]} ${completed}${suffix}`;
    } else {
        input.value = `${completed}${suffix}`;
    }

    const newLength = input.value.length;
    input.setSelectionRange(newLength, newLength);
}
