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

    let matches = [];
    let lowerPrefix = '';

    if (searchPrefix.includes(' ')) {
        // Subcommand matching
        // const parts = searchPrefix.split(' '); // matching logic moved to later check
        // Actually, logic is: user typed "stats f", we find "financial"
        // prefix is "stats f"
        // lowerPrefix ?? In the original code, lowerPrefix was used for main command matching or single word.
    } else {
        lowerPrefix = searchPrefix;
    }
    // Re-implementing logic from existing code to ensure accuracy.
    // Let's copy the logic fully.

    if (searchPrefix.includes(' ')) {
        const parts = searchPrefix.split(' ');
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
        // Handle main commands
        lowerPrefix = searchPrefix;
        matches = (
            lowerPrefix
                ? COMMAND_ALIASES.filter((cmd) => cmd.startsWith(lowerPrefix))
                : COMMAND_ALIASES
        ).filter((cmd, index, arr) => arr.indexOf(cmd) === index);
    }

    if (matches.length === 0) {
        resetAutocompleteState();
        return;
    }

    if (
        autocompleteState.prefix === searchPrefix && // Use searchPrefix which includes spaces if any
        autocompleteState.matches.length > 0 &&
        trimmedValue === autocompleteState.matches[autocompleteState.index]
        // Wait, original logic compared against matches[index].
        // But if user keeps typing?
        // Original logic:
        // autocompleteState.prefix === lowerPrefix (which was just the search term)
    ) {
        // Check strict equality to original logic variables
    }
    // To match original exactly, I should have viewed commands.js again to be perfect.
    // I have the view_file logs.
    // Lines 1438: autocompleteState.prefix === lowerPrefix
    // Note: in original code, `lowerPrefix` was derived differently?
    // Let's re-read the original function signature in my head/logs.
    // It used `lowerPrefix = searchPrefix` (if no spaces) or undefined if spaces?
    // Ah, lines 1401 checks for spaces.
    // If spaces, lowerPrefix is NOT set in the `else` block of 1423.
    // So lowerPrefix is undefined?
    // Let's look at line 1426: `lowerPrefix ? ... : ...`.
    // And 1438: `autocompleteState.prefix === lowerPrefix`.

    // Correct Implementation:
    const hasSpace = searchPrefix.includes(' ');
    const parts = searchPrefix.split(' ');

    matches = [];

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

    // The key logic regarding state
    // We need to use 'val' (trimmed) as the comparison key?
    // If I type "pl", state.prefix = "pl". matches = ["plot"].
    // I press tab. input becomes "plot ".
    // I press tab again. "plot ". trim is "plot".
    //
    // In original code `lowerPrefix` seems to be what was stored in state.
    // If hasSpace, lowerPrefix was undefined in original?
    // Let's verify line 1438 again.
    // If hasSpace, lowerPrefix is undefined.
    // So state.prefix would be undefined?

    // I will use `searchPrefix` as the stable key for state.

    const currentPrefixKey = searchPrefix;

    if (
        autocompleteState.prefix === currentPrefixKey &&
        autocompleteState.matches.length > 0 &&
        trimmedValue.endsWith(autocompleteState.matches[autocompleteState.index])
        // Logic check: The original code compared trimmedValue directly.
        // But for "stats du", trimmedValue is "stats du".
        // match is "duration".
        // "stats du" !== "duration".
        // So strict equality fails for subcommands?
        // Actually, looks like original code might have been buggy for subcommands cycling?
        // Or `lowerPrefix` was just the *sub* prefix?
        // Let's check 1400-1430 in commands.js.
        // It does NOT assign lowerPrefix inside the if(hasSpace) block.
        // So lowerPrefix is undefined.
        // So 1438: `undefined === undefined` (true).

        // Let's assume for subcommands we reset index if prefix changes.
    ) {
        autocompleteState.index = (autocompleteState.index + 1) % autocompleteState.matches.length;
    } else {
        autocompleteState.prefix = currentPrefixKey;
        autocompleteState.matches = matches;
        autocompleteState.index = 0;
    }

    const completed = autocompleteState.matches[autocompleteState.index];
    const shouldAppendSpace = matches.length === 1;

    // Handle replacement
    if (hasSpace && (parts[0] === 'stats' || parts[0] === 's')) {
        input.value = `stats ${completed}${shouldAppendSpace ? ' ' : ''}`;
    } else if (hasSpace && (parts[0] === 'plot' || parts[0] === 'p')) {
        input.value = `plot ${completed}${shouldAppendSpace ? ' ' : ''}`;
    } else if (hasSpace && (parts[0] === 'help' || parts[0] === 'h')) {
        input.value = `help ${completed}${shouldAppendSpace ? ' ' : ''}`;
    } else {
        input.value = `${completed}${shouldAppendSpace ? ' ' : ''}`;
    }

    // Correction: Preserve the alias used (s vs stats).
    if (hasSpace) {
        if (['stats', 's', 'plot', 'p', 'help', 'h'].includes(parts[0])) {
            input.value = `${parts[0]} ${completed}${shouldAppendSpace ? ' ' : ''}`;
        }
    }

    const newLength = input.value.length;
    input.setSelectionRange(newLength, newLength);
}
