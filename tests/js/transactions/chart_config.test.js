import { BENCHMARK_GRADIENTS } from '@js/transactions/chart/config.js';

describe('Chart Configuration Color Consistency', () => {
    test('major benchmarks should use consistent color schemes', () => {
        const gspc = BENCHMARK_GRADIENTS['^GSPC'];
        const ixic = BENCHMARK_GRADIENTS['^IXIC'];
        const dji = BENCHMARK_GRADIENTS['^DJI'];

        // Core benchmarks should exist
        expect(gspc).toBeDefined();
        expect(ixic).toBeDefined();
        expect(dji).toBeDefined();

        // GSPC and IXIC should match for consistency as requested
        expect(ixic).toEqual(gspc);

        // DJI should at least be in a similar blue family based on the first stop
        // (Checking first character '#' and general blue-ish start)
        expect(dji[0].startsWith('#1')).toBe(true);
        expect(dji[1].endsWith('fc')).toBe(true);
    });

    test('all benchmarks should have two-stop gradients', () => {
        Object.keys(BENCHMARK_GRADIENTS).forEach((key) => {
            const gradient = BENCHMARK_GRADIENTS[key];
            expect(Array.isArray(gradient)).toBe(true);
            expect(gradient.length).toBe(2);
            expect(typeof gradient[0]).toBe('string');
            expect(typeof gradient[1]).toBe('string');
            expect(gradient[0].startsWith('#')).toBe(true);
            expect(gradient[1].startsWith('#')).toBe(true);
        });
    });
});
