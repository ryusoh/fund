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

function getStatsMatches(parts) {
    const subPrefix = parts[1] ? parts[1].toLowerCase() : '';
    return subPrefix
        ? STATS_SUBCOMMANDS.filter((cmd) => cmd.startsWith(subPrefix))
        : STATS_SUBCOMMANDS;
}

function getPlotMatches(parts) {
    const subPrefixRaw = parts.slice(1).join(' ').toLowerCase();
    const normalizedSubPrefix = subPrefixRaw.replace(/\s+/g, '-');
    return normalizedSubPrefix
        ? PLOT_SUBCOMMANDS.filter((cmd) => cmd.startsWith(normalizedSubPrefix))
        : PLOT_SUBCOMMANDS;
}

function getHelpMatches(parts) {
    const subPrefix = parts[1] ? parts[1].toLowerCase() : '';
    return subPrefix
        ? HELP_SUBCOMMANDS.filter((cmd) => cmd.startsWith(subPrefix))
        : HELP_SUBCOMMANDS;
}

function getSubcommandMatches(parts) {
    if (parts.length < 2) {
        return null;
    }
    if (parts[0] === 'stats' || parts[0] === 's') {
        return getStatsMatches(parts);
    }
    if (parts[0] === 'plot' || parts[0] === 'p') {
        return getPlotMatches(parts);
    }
    if (parts[0] === 'help' || parts[0] === 'h') {
        return getHelpMatches(parts);
    }
    return null;
}

function getCommandMatches(searchPrefix) {
    return (
        searchPrefix
            ? COMMAND_ALIASES.filter((cmd) => cmd.startsWith(searchPrefix))
            : COMMAND_ALIASES
    ).filter((cmd, index, arr) => arr.indexOf(cmd) === index);
}

function updateAutocompleteState(currentPrefixKey, matches, trimmedValue) {
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
}

function applyAutocomplete(input, matches, hasSpace, parts) {
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
        const subMatches = getSubcommandMatches(parts);
        if (subMatches === null) {
            resetAutocompleteState();
            return;
        }
        matches = subMatches;
    } else {
        matches = getCommandMatches(searchPrefix);
    }

    if (matches.length === 0) {
        resetAutocompleteState();
        return;
    }

    updateAutocompleteState(searchPrefix, matches, trimmedValue);
    applyAutocomplete(input, matches, hasSpace, parts);
}
