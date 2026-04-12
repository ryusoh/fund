import { isLikelyFundTicker } from '../../../js/config/assetClasses.js';

describe('assetClasses', () => {
    describe('isLikelyFundTicker', () => {
        it('returns false for non-strings', () => {
            expect(isLikelyFundTicker(null)).toBe(false);
            expect(isLikelyFundTicker(123)).toBe(false);
        });
        it('returns false for empty strings', () => {
            expect(isLikelyFundTicker('   ')).toBe(false);
            expect(isLikelyFundTicker('')).toBe(false);
        });
        it('returns true for known ETFs', () => {
            expect(isLikelyFundTicker(' VTI ')).toBe(true);
            expect(isLikelyFundTicker('spy')).toBe(true);
        });
        it('returns true for strings > 4 chars ending in X', () => {
            expect(isLikelyFundTicker('VTSAX')).toBe(true);
            expect(isLikelyFundTicker('AAAAX')).toBe(true);
        });
        it('returns false for other strings', () => {
            expect(isLikelyFundTicker('AAPL')).toBe(false);
            expect(isLikelyFundTicker('TSLA')).toBe(false);
            expect(isLikelyFundTicker('AXX')).toBe(false);
            expect(isLikelyFundTicker('AAAAA')).toBe(false);
        });
    });
});
