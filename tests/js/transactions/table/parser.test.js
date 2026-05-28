import {
    normalizeTickerToken,
    parseCommandPalette,
    deriveCompositionTickerFilters,
    matchesAssetClass,
} from '../../../../js/transactions/table/parser.js';

// mock config
jest.mock('../../../../js/config.js', () => ({
    getHoldingAssetClass: jest.fn((ticker) => {
        if (ticker === 'SPY' || ticker === 'VOO') {
            return 'etf';
        }
        return 'stock'; // Default fallback in this mock
    }),
}));

describe('Table Parser Helpers', () => {
    describe('normalizeTickerToken', () => {
        it('should handle invalid inputs', () => {
            expect(normalizeTickerToken(null)).toBeNull();
            expect(normalizeTickerToken(123)).toBeNull();
            expect(normalizeTickerToken({})).toBeNull();
        });

        it('should clean and uppercase string', () => {
            expect(normalizeTickerToken('aapl')).toBe('AAPL');
            expect(normalizeTickerToken(' msft ')).toBe('MSFT');
            expect(normalizeTickerToken('BRK-B')).toBe('BRKB');
        });

        it('should return null for strings without letters', () => {
            expect(normalizeTickerToken('123')).toBeNull();
            expect(normalizeTickerToken('!@#')).toBeNull();
            expect(normalizeTickerToken('')).toBeNull();
        });

        it('should use ticker alias map', () => {
            expect(normalizeTickerToken('BRK')).toBe('BRKB');
            expect(normalizeTickerToken('BRK-B')).toBe('BRKB');
            expect(normalizeTickerToken('BRKB')).toBe('BRKB');
        });
    });

    describe('parseCommandPalette', () => {
        it('should parse empty string', () => {
            expect(parseCommandPalette('')).toEqual({
                text: '',
                commands: {
                    type: null,
                    security: null,
                    min: null,
                    max: null,
                    assetClass: null,
                    tickers: [],
                },
            });
        });

        it('should parse type', () => {
            const res1 = parseCommandPalette('type:buy');
            expect(res1.commands.type).toBe('buy');

            const res2 = parseCommandPalette('type:sell');
            expect(res2.commands.type).toBe('sell');

            const res3 = parseCommandPalette('type:invalid');
            expect(res3.commands.type).toBeNull();
        });

        it('should parse standalone asset class', () => {
            expect(parseCommandPalette('etf').commands.assetClass).toBe('etf');
            expect(parseCommandPalette('stock').commands.assetClass).toBe('stock');
        });

        it('should parse key:val asset class', () => {
            expect(parseCommandPalette('asset:etf').commands.assetClass).toBe('etf');
            expect(parseCommandPalette('class:stock').commands.assetClass).toBe('stock');
        });

        it('should parse min/max values', () => {
            const res = parseCommandPalette('min:100 max:500');
            expect(res.commands.min).toBe(100);
            expect(res.commands.max).toBe(500);
        });

        it('should parse security', () => {
            expect(parseCommandPalette('security:aapl').commands.security).toBe('AAPL');
            expect(parseCommandPalette('s:msft').commands.security).toBe('MSFT');
        });

        it('should separate tickers and text tokens', () => {
            // Note: with current normalizeTickerToken implementation, ANY word with letters is treated as a ticker.
            // For example, "random" -> "RANDOM".
            // The logic in parseCommandPalette is if it normalizes, it goes to tickers, otherwise text.
            const res = parseCommandPalette('AAPL 123 MSFT !@#');
            expect(res.commands.tickers).toEqual(['AAPL', 'MSFT']);
            expect(res.text).toBe('123 !@#');
        });

        it('should handle unhandled key:value tokens', () => {
            const res = parseCommandPalette('unknown:value');
            // processKeyValToken takes the whole token "unknown:value" as the ticker if it fails to parse as a specific key.
            expect(res.commands.tickers).toContain('UNKNOWNVALUE');
        });
    });

    describe('deriveCompositionTickerFilters', () => {
        it('should extract unique tickers from commands and text', () => {
            const commands = { security: 'AAPL' };
            const text = 'MSFT aapl GOOG 123';

            const result = deriveCompositionTickerFilters(text, commands);
            expect(result).toEqual(['AAPL', 'MSFT', 'GOOG']);
        });

        it('should handle null/empty commands or text', () => {
            expect(deriveCompositionTickerFilters('', {})).toEqual([]);
            expect(deriveCompositionTickerFilters(null, null)).toEqual([]);
            expect(deriveCompositionTickerFilters('AAPL', null)).toEqual(['AAPL']);
        });
    });

    describe('matchesAssetClass', () => {
        it('should return true if no desired class is provided', () => {
            expect(matchesAssetClass('AAPL', null)).toBe(true);
            expect(matchesAssetClass('AAPL', '')).toBe(true);
        });

        it('should return true if security is not a string', () => {
            expect(matchesAssetClass(123, 'etf')).toBe(true);
            expect(matchesAssetClass(null, 'etf')).toBe(true);
        });

        it('should match etf', () => {
            expect(matchesAssetClass('SPY', 'etf')).toBe(true);
            expect(matchesAssetClass('AAPL', 'etf')).toBe(false);
        });

        it('should match stock', () => {
            expect(matchesAssetClass('AAPL', 'stock')).toBe(true);
            expect(matchesAssetClass('SPY', 'stock')).toBe(false);
        });

        it('should return true for unknown asset classes', () => {
            expect(matchesAssetClass('AAPL', 'unknown')).toBe(true);
        });
    });
});
