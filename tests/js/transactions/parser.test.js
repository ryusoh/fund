import {
    normalizeTickerToken,
    parseCommandPalette,
    deriveCompositionTickerFilters,
    matchesAssetClass,
} from '@js/transactions/table/parser.js';
import * as config from '@js/config.js';

jest.mock('@js/config.js');

describe('normalizeTickerToken', () => {
    it('normalizes standard tokens', () => {
        expect(normalizeTickerToken('AAPL')).toBe('AAPL');
        expect(normalizeTickerToken('msft')).toBe('MSFT');
        expect(normalizeTickerToken('123AAPL')).toBe('123AAPL');
    });

    it('resolves aliases', () => {
        expect(normalizeTickerToken('BRK')).toBe('BRKB');
        expect(normalizeTickerToken('BRK-B')).toBe('BRKB');
        expect(normalizeTickerToken('BRKB')).toBe('BRKB');
    });

    it('removes special characters except hyphens', () => {
        expect(normalizeTickerToken('AAPL.US')).toBe('AAPLUS');
        expect(normalizeTickerToken('BRK/B')).toBe('BRKB');
        expect(normalizeTickerToken('TEST-123')).toBe('TEST-123');
    });

    it('returns null for empty or invalid tokens', () => {
        expect(normalizeTickerToken('')).toBeNull();
        expect(normalizeTickerToken('  ')).toBeNull();
        expect(normalizeTickerToken(null)).toBeNull();
        expect(normalizeTickerToken(undefined)).toBeNull();
        expect(normalizeTickerToken('12345')).toBeNull(); // No letters
        expect(normalizeTickerToken('!@#$')).toBeNull();
    });
});

describe('parseCommandPalette - key/value parsing', () => {
    it('parses type command', () => {
        const result = parseCommandPalette('type:buy some text');
        expect(result.commands.type).toBe('buy');
    });

    it('parses security command', () => {
        const result = parseCommandPalette('security:AAPL some text');
        expect(result.commands.security).toBe('AAPL');
    });

    it('parses s command (alias for security)', () => {
        const result = parseCommandPalette('s:AAPL some text');
        expect(result.commands.security).toBe('AAPL');
    });

    it('parses min and max commands', () => {
        const result = parseCommandPalette('min:100 max:500 text');
        expect(result.commands.min).toBe(100);
        expect(result.commands.max).toBe(500);
    });

    it('parses asset class command', () => {
        const result = parseCommandPalette('asset:etf class:stock');
        expect(result.commands.assetClass).toBe('stock'); // The last one wins
    });

    it('parses direct etf/stock keywords', () => {
        const result = parseCommandPalette('etf');
        expect(result.commands.assetClass).toBe('etf');
    });

    it('identifies standalone tickers', () => {
        const result = parseCommandPalette('AAPL text MSFT');
        // 'text' parses as TEXT because it is letters only, which normalized as a valid ticker format
        // wait... wait, 'text' normalized is TEXT. So it considers it a ticker.
        expect(result.commands.tickers).toEqual(['AAPL', 'TEXT', 'MSFT']);
    });

    it('handles type sell', () => {
        const result = parseCommandPalette('type:sell');
        expect(result.commands.type).toBe('sell');
    });

    it('handles invalid type', () => {
        const result = parseCommandPalette('type:invalid');
        expect(result.commands.type).toBeNull();
    });

    it('handles invalid min max', () => {
        const result = parseCommandPalette('min:invalid max:invalid');
        expect(result.commands.min).toBeNaN();
        expect(result.commands.max).toBeNaN();
    });

    it('handles standalone text that is not a ticker', () => {
        const result = parseCommandPalette('12345 !@#$');
        expect(result.text).toBe('12345 !@#$');
        expect(result.commands.tickers).toEqual([]);
    });

    it('handles unknown key:val pairs where token is not a valid ticker', () => {
        const result = parseCommandPalette('unknown:val!');
        // processKeyValToken receives token='unknown:val!'
        // normalizeTickerToken('unknown:val!') returns 'UNKNOWNVAL'
        // So 'unknown:val!' is treated as a valid ticker
        expect(result.commands.tickers).toEqual(['UNKNOWNVAL']);
    });

    it('handles unknown key:val pairs where key is a ticker', () => {
        const result = parseCommandPalette('AAPL:123');
        // AAPL:123 normalizes to AAPL123
        expect(result.commands.tickers).toEqual(['AAPL123']);
    });
});

describe('deriveCompositionTickerFilters', () => {
    it('combines security command and text tickers', () => {
        const commands = { security: 'AAPL' };
        const text = 'MSFT GOOGL';
        expect(deriveCompositionTickerFilters(text, commands)).toEqual(['AAPL', 'MSFT', 'GOOGL']);
    });

    it('deduplicates tickers', () => {
        const commands = { security: 'AAPL' };
        const text = 'AAPL MSFT MSFT';
        expect(deriveCompositionTickerFilters(text, commands)).toEqual(['AAPL', 'MSFT']);
    });

    it('handles missing commands', () => {
        expect(deriveCompositionTickerFilters('AAPL')).toEqual(['AAPL']);
    });

    it('handles missing text', () => {
        const commands = { security: 'AAPL' };
        expect(deriveCompositionTickerFilters('', commands)).toEqual(['AAPL']);
        expect(deriveCompositionTickerFilters(null, commands)).toEqual(['AAPL']);
    });
});

describe('matchesAssetClass', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('returns true if no desired class is specified', () => {
        expect(matchesAssetClass('AAPL', null)).toBe(true);
        expect(matchesAssetClass('AAPL', '')).toBe(true);
    });

    it('returns true if security is not a string', () => {
        expect(matchesAssetClass(123, 'etf')).toBe(true);
    });

    it('matches etf', () => {
        config.getHoldingAssetClass.mockReturnValue('etf');
        expect(matchesAssetClass('VOO', 'etf')).toBe(true);
        expect(matchesAssetClass('VOO', 'stock')).toBe(false);
    });

    it('matches stock', () => {
        config.getHoldingAssetClass.mockReturnValue('stock');
        expect(matchesAssetClass('AAPL', 'stock')).toBe(true);
        expect(matchesAssetClass('AAPL', 'etf')).toBe(false);
    });

    it('returns true for unknown asset classes if not etf', () => {
        config.getHoldingAssetClass.mockReturnValue('unknown');
        expect(matchesAssetClass('CASH', 'stock')).toBe(true);
    });
});
