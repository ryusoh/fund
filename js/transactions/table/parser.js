import { getHoldingAssetClass } from '@js/config.js';

const TICKER_ALIAS_MAP = {
    BRK: 'BRKB',
    'BRK-B': 'BRKB',
    BRKB: 'BRKB',
};

export function normalizeTickerToken(token) {
    if (typeof token !== 'string') {
        return null;
    }
    const cleaned = token.replace(/[^0-9a-zA-Z-]/g, '').toUpperCase();
    if (!cleaned || !/[A-Z]/.test(cleaned)) {
        return null;
    }
    if (TICKER_ALIAS_MAP[cleaned]) {
        return TICKER_ALIAS_MAP[cleaned];
    }
    return cleaned;
}

function handleValueToken(key, val, commands) {
    switch (key.toLowerCase()) {
        case 'type':
            commands.type =
                val.toLowerCase() === 'buy' || val.toLowerCase() === 'sell' ? val : null;
            break;
        case 'security':
        case 's':
            commands.security = val.toUpperCase();
            break;
        case 'min':
            commands.min = parseFloat(val);
            break;
        case 'max':
            commands.max = parseFloat(val);
            break;
        case 'asset':
        case 'class':
            commands.assetClass = val.toLowerCase();
            break;
        default:
            return false;
    }
    return true;
}

function processKeyValToken(key, val, commands, textTokens, token) {
    if (handleValueToken(key, val, commands)) {
        return;
    }

    const normalizedTicker = normalizeTickerToken(token);
    if (normalizedTicker) {
        commands.tickers.push(normalizedTicker);
    } else {
        textTokens.push(token);
    }
}

export function parseCommandPalette(value) {
    const tokens = value.split(/\s+/).filter(Boolean);
    const textTokens = [];
    const commands = {
        type: null,
        security: null,
        min: null,
        max: null,
        assetClass: null,
        tickers: [],
    };

    // Bolt: Replaced .forEach with an explicit for loop to reduce closure allocation overhead
    for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i];
        const [key, ...valParts] = token.split(':');
        const val = valParts.join(':');
        if (!val) {
            const normalizedKey = key.toLowerCase();
            if (normalizedKey === 'etf' || normalizedKey === 'stock') {
                commands.assetClass = normalizedKey;
                continue;
            }
            const normalizedTicker = normalizeTickerToken(key);
            if (normalizedTicker) {
                commands.tickers.push(normalizedTicker);
                continue;
            }
            textTokens.push(key);
            continue;
        }
        processKeyValToken(key, val, commands, textTokens, token);
    }

    return { text: textTokens.join(' '), commands };
}

export function deriveCompositionTickerFilters(textPart, commands) {
    const results = [];
    const seen = new Set();
    const addTicker = (ticker) => {
        const normalized = normalizeTickerToken(ticker);
        if (normalized && !seen.has(normalized)) {
            seen.add(normalized);
            results.push(normalized);
        }
    };
    if (commands?.security) {
        addTicker(commands.security);
    }
    if (typeof textPart === 'string' && textPart.trim()) {
        const parts = textPart.split(/\s+/).filter(Boolean);
        // Bolt: Replaced .forEach with an explicit for loop to reduce closure allocation overhead
        for (let i = 0; i < parts.length; i += 1) {
            addTicker(parts[i]);
        }
    }
    return results;
}

export function matchesAssetClass(security, desiredClass) {
    if (!desiredClass || typeof security !== 'string') {
        return true;
    }
    const normalized = desiredClass.toLowerCase();
    const holdingClass = getHoldingAssetClass(security);
    if (normalized === 'etf') {
        return holdingClass === 'etf';
    }
    if (normalized === 'stock') {
        return holdingClass !== 'etf';
    }
    return true;
}
