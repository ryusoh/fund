import {
    COMMAND_ALIASES,
    STATS_SUBCOMMANDS,
    PLOT_SUBCOMMANDS,
    HELP_SUBCOMMANDS,
    ANALYSIS_SUBCOMMANDS,
    ANALYSIS_HORIZON_FLAGS,
} from './constants.js';

export const autocompleteState = {
    prefix: '',
    matches: [],
    index: -1,
};

let analysisTickerSymbols = [];
let analysisSymbolsFetchPromise = null;

export function setAnalysisAutocompleteSymbols(symbols = []) {
    if (!Array.isArray(symbols)) {
        analysisTickerSymbols = [];
        return;
    }
    const unique = new Set();
    symbols.forEach((sym) => {
        const clean = String(sym || '')
            .trim()
            .toUpperCase();
        if (clean && clean !== 'PORT') {
            unique.add(clean);
        }
    });
    analysisTickerSymbols = Array.from(unique).sort();
}

export function getAnalysisAutocompleteSymbols() {
    return [...analysisTickerSymbols];
}

export function ensureAnalysisAutocompleteSymbols() {
    if (
        analysisTickerSymbols.length > 0 ||
        analysisSymbolsFetchPromise ||
        typeof fetch !== 'function'
    ) {
        return analysisSymbolsFetchPromise;
    }
    analysisSymbolsFetchPromise = fetch('../data/analysis/index.json', { cache: 'no-store' })
        .then((res) => (res && res.ok ? res.json() : null))
        .then((payload) => {
            const list = Array.isArray(payload?.tickers) ? payload.tickers : [];
            if (list.length > 0) {
                setAnalysisAutocompleteSymbols(list.map((entry) => entry?.symbol));
            }
        })
        .catch(() => null);
    return analysisSymbolsFetchPromise;
}

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

function getAnalysisMatches(parts) {
    ensureAnalysisAutocompleteSymbols();
    const subPrefix = parts[1] ? parts[1].toLowerCase() : '';
    if (parts.length >= 3) {
        if (subPrefix === 'close') {
            return [];
        }
        const flagPrefix = parts[2] ? parts[2].toLowerCase() : '';
        return flagPrefix
            ? ANALYSIS_HORIZON_FLAGS.filter((flag) => flag.startsWith(flagPrefix))
            : ANALYSIS_HORIZON_FLAGS;
    }
    const candidates = [...analysisTickerSymbols, ...ANALYSIS_SUBCOMMANDS];
    return subPrefix
        ? candidates.filter((item) => item.toLowerCase().startsWith(subPrefix))
        : candidates;
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
    if (parts[0] === 'analysis' || parts[0] === 'an') {
        return getAnalysisMatches(parts);
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
    const lowerTrimmed = trimmedValue.toLowerCase();
    const prevMatch = autocompleteState.matches[autocompleteState.index];
    if (
        autocompleteState.prefix === currentPrefixKey &&
        autocompleteState.matches.length > 0 &&
        prevMatch &&
        lowerTrimmed.endsWith(prevMatch.toLowerCase())
    ) {
        autocompleteState.index = (autocompleteState.index + 1) % autocompleteState.matches.length;
    } else {
        autocompleteState.prefix = currentPrefixKey;
        autocompleteState.matches = matches;
        autocompleteState.index = 0;
    }
}

function resolveCanonicalTicker(token) {
    const lower = String(token || '').toLowerCase();
    const found = analysisTickerSymbols.find((s) => s.toLowerCase() === lower);
    return found || String(token || '').toUpperCase();
}

function applyAutocomplete(input, matches, hasSpace, parts) {
    const completed = autocompleteState.matches[autocompleteState.index];
    const suffix = matches.length === 1 ? ' ' : '';
    const isAnalysisCmd = parts[0] === 'analysis' || parts[0] === 'an';

    if (hasSpace && isAnalysisCmd && parts.length >= 3) {
        input.value = `${parts[0]} ${resolveCanonicalTicker(parts[1])} ${completed}${suffix}`;
    } else if (
        hasSpace &&
        ['stats', 's', 'plot', 'p', 'help', 'h', 'analysis', 'an'].includes(parts[0])
    ) {
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
