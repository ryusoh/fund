import { jest } from '@jest/globals';

describe('generateYearBasedTicks Label Logic', () => {
    let generateYearBasedTicks;

    beforeEach(() => {
        jest.resetModules();
        jest.isolateModules(() => {
            const chartModule = require('@js/transactions/chart.js');
            ({ generateYearBasedTicks } = chartModule.__chartTestables);
        });
        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: 1024,
        });
    });

    test('Single Year: Should show Year for Jan, Month name for others', () => {
        // Use local time construction to match function logic
        const minTime = new Date(2025, 0, 1).getTime(); // Jan 1 2025
        const maxTime = new Date(2025, 11, 31).getTime(); // Dec 31 2025

        const ticks = generateYearBasedTicks(minTime, maxTime);

        const janTick = ticks.find((t) => t.label.includes('2025'));
        expect(janTick).toBeDefined();
        expect(janTick.label).toBe('2025');

        const aprTick = ticks.find((t) => t.label === 'Apr');
        expect(aprTick).toBeDefined();
    });

    test('Multi Year: Should show Year only for Jan ticks', () => {
        const minTime = new Date(2024, 0, 1).getTime();
        const maxTime = new Date(2026, 5, 1).getTime(); // Jun 1 2026

        const ticks = generateYearBasedTicks(minTime, maxTime);

        const tick2024 = ticks.find((t) => t.label === '2024');
        const tick2025 = ticks.find((t) => t.label === '2025');
        const tick2026 = ticks.find((t) => t.label === '2026');

        expect(tick2024).toBeDefined();
        expect(tick2025).toBeDefined();
        expect(tick2026).toBeDefined();

        const longLabel = ticks.find((t) => t.label === 'Jan 2024');
        expect(longLabel).toBeUndefined();
    });

    test('End Tick: Should show "Jan" if year tick exists (Context Aware)', () => {
        const minTime = new Date(2026, 0, 1).getTime(); // Jan 1 2026
        const maxTime = new Date(2026, 0, 15).getTime(); // Jan 15 2026

        const ticks = generateYearBasedTicks(minTime, maxTime);

        // Jan 1 should be "2026"
        const yearTick = ticks.find((t) => t.time === minTime && t.label === '2026');
        expect(yearTick).toBeDefined();

        // Jan 15 should be "Jan" (because 2026 is already shown)
        const endTick = ticks.find((t) => t.time === maxTime);
        expect(endTick).toBeDefined();
        expect(endTick.label).toBe('Jan');
    });

    // Modified test: Verify context even with small offset due to padding
    test('End Tick: Should show "Jan" even if start is shortly after Jan 1', () => {
        const minTime = new Date(2026, 0, 2).getTime(); // Jan 2 2026
        const maxTime = new Date(2026, 0, 15).getTime(); // Jan 15 2026

        const ticks = generateYearBasedTicks(minTime, maxTime);

        // The padding logic ensures Jan 1 2026 (Year Start) is included
        const yearTick = ticks.find((t) => t.label === '2026');
        expect(yearTick).toBeDefined();

        // So End Tick becomes "Jan"
        const endTick = ticks.find((t) => t.time === maxTime);
        expect(endTick).toBeDefined();
        expect(endTick.label).toBe('Jan');
    });

    test('Duplicate Filtering & Proximity', () => {
        const minTime = new Date(2026, 0, 1).getTime();
        const maxTime = new Date(2026, 0, 2).getTime(); // Very short range

        const ticks = generateYearBasedTicks(minTime, maxTime);
        expect(ticks.length).toBeGreaterThanOrEqual(2);

        const distinctLabels = new Set(ticks.map((t) => t.label));
        expect(distinctLabels.size).toBe(ticks.length);
    });

    // Regression test: Year label should appear at Jan 1, not at current date
    // https://github.com/user/repo/issues/XXX
    test('Single-year spanning into new year: year label at Jan 1, not end date', () => {
        // Data from March 2025 to Jan 26, 2026 - this triggers single-year mode (<=15 months)
        // but spans two different years
        const minTime = new Date(2025, 2, 15).getTime(); // March 15, 2025
        const maxTime = new Date(2026, 0, 26).getTime(); // Jan 26, 2026

        const ticks = generateYearBasedTicks(minTime, maxTime);

        // Find the 2026 tick - it should be at Jan 1, 2026, not at maxTime
        const tick2026 = ticks.find((t) => t.label === '2026' || t.label === "'26");
        expect(tick2026).toBeDefined();

        // The 2026 label should be at Jan 1, 2026 (approximately - within a day)
        const jan1_2026 = new Date(2026, 0, 1).getTime();
        expect(tick2026.time).toBeCloseTo(jan1_2026, -4); // within ~10 seconds
        expect(tick2026.isYearStart).toBe(true);

        // The end tick should NOT have the 2026 label
        const endTick = ticks.find((t) => t.time === maxTime);
        expect(endTick).toBeDefined();
        expect(endTick.label).toBe('Jan'); // Should be "Jan", not "2026"
        expect(endTick.isYearStart).toBe(false);
    });
});
