const { createTimeInterpolator } = require('../../js/transactions/chart/helpers.js');

describe('Geography Chart Crosshair Data', () => {
    it('should correctly build seriesSnapshot for geography charts', () => {
        const dateTimes = [1000, 2000];
        const countryValues = {
            USA: [60, 70],
            China: [40, 30],
        };

        const seriesForCrosshair = Object.entries(countryValues).map(([country, values]) => {
            const points = dateTimes.map((time, idx) => ({
                time,
                value: values[idx],
            }));
            return {
                key: country,
                label: country,
                getValueAtTime: createTimeInterpolator(points),
            };
        });

        const time = 1500;
        const seriesSnapshot = [];
        seriesForCrosshair.forEach((series) => {
            const value = series.getValueAtTime(time);
            seriesSnapshot.push({
                key: series.key,
                label: series.label,
                value: value,
            });
        });

        expect(seriesSnapshot).toContainEqual({ key: 'USA', label: 'USA', value: 65 });
        expect(seriesSnapshot).toContainEqual({ key: 'China', label: 'China', value: 35 });
    });

    it('should correctly handle absolute values for geography crosshair', () => {
        const dateTimes = [1000, 2000];
        const countryAbsValues = {
            USA: [600, 770],
            China: [400, 330],
        };

        const seriesForCrosshair = Object.entries(countryAbsValues).map(([country, values]) => {
            const points = dateTimes.map((time, idx) => ({
                time,
                value: values[idx],
            }));
            return {
                key: country,
                label: country,
                getValueAtTime: createTimeInterpolator(points),
            };
        });

        const time = 1200; // 20% between 1000 and 2000
        const seriesSnapshot = [];
        seriesForCrosshair.forEach((series) => {
            const value = series.getValueAtTime(time);
            seriesSnapshot.push({
                key: series.key,
                label: series.label,
                value: value,
            });
        });

        // USA: 600 + 0.2 * (770 - 600) = 600 + 34 = 634
        // China: 400 + 0.2 * (330 - 400) = 400 - 14 = 386
        expect(seriesSnapshot).toContainEqual({ key: 'USA', label: 'USA', value: 634 });
        expect(seriesSnapshot).toContainEqual({ key: 'China', label: 'China', value: 386 });
    });
});
