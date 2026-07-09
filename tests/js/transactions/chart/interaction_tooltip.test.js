import { createVolumeGetter } from '../../../../js/transactions/chart/renderers/contributionComponents.js';

describe('Crosshair Tooltip Persistence', () => {
    test('createVolumeGetter should return 0 instead of undefined for empty days so buy/sell rows persist in the tooltip', () => {
        const volumeMap = new Map();
        // Insert some data for Jan 1 (local time)
        const day1 = new Date(2024, 0, 1);
        volumeMap.set(day1.getTime(), 500);

        const getter = createVolumeGetter(volumeMap);

        // Assert it gets the real value
        expect(getter(day1.getTime())).toBe(500);

        // Assert it returns 0 (not undefined) for days without data to ensure tooltip row persistence
        const day2 = new Date(2024, 0, 2);
        expect(getter(day2.getTime())).toBe(0);
    });
});
