import { resolveBenchmarkDateKey } from '@js/transactions/benchmark.js';

describe('resolveBenchmarkDateKey', () => {
    const buildMap = (keys) => new Map(keys.map((key) => [key, Math.random()]));

    it('returns same-day key for non-Asian markets when available', () => {
        const map = buildMap(['2024-01-02']);
        const baseDate = new Date('2024-01-02T00:00:00Z');

        expect(resolveBenchmarkDateKey(map, baseDate, false)).toBe('2024-01-02');
    });

    it('returns null for non-Asian markets when key missing', () => {
        const map = buildMap(['2024-01-01']);
        const baseDate = new Date('2024-01-02T00:00:00Z');

        expect(resolveBenchmarkDateKey(map, baseDate, false)).toBeNull();
    });

    it('prefers previous US session for Asian markets', () => {
        const map = buildMap(['2024-01-05', '2024-01-09']);
        const baseDate = new Date('2024-01-08T00:00:00Z'); // Monday

        expect(resolveBenchmarkDateKey(map, baseDate, true)).toBe('2024-01-05');
    });

    it('falls back across longer US holidays when needed', () => {
        const map = buildMap(['2024-04-04']); // US session two days prior
        const baseDate = new Date('2024-04-08T00:00:00Z');

        expect(resolveBenchmarkDateKey(map, baseDate, true)).toBe('2024-04-04');
    });

    it('falls back to same-day key for Asian markets when previous is absent', () => {
        const map = buildMap(['2024-01-02']);
        const baseDate = new Date('2024-01-02T00:00:00Z');

        expect(resolveBenchmarkDateKey(map, baseDate, true)).toBe('2024-01-02');
    });

    it('falls back to next US session when needed', () => {
        const map = buildMap(['2024-01-03']);
        const baseDate = new Date('2024-01-02T00:00:00Z');

        expect(resolveBenchmarkDateKey(map, baseDate, true)).toBe('2024-01-03');
    });

    it('returns null when inputs are invalid', () => {
        expect(resolveBenchmarkDateKey(null, new Date(), false)).toBeNull();
        expect(resolveBenchmarkDateKey(new Map(), new Date('invalid'), false)).toBeNull();
    });
});
