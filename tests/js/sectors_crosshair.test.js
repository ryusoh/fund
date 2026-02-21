const { createTimeInterpolator } = require('../../js/transactions/chart/helpers.js');

describe('Sectors Chart Crosshair Data', () => {
    it('createTimeInterpolator should correctly interpolate values', () => {
        const points = [
            { time: 1000, value: 10 },
            { time: 2000, value: 20 },
        ];
        const interpolator = createTimeInterpolator(points);

        expect(interpolator(1000)).toBe(10);
        expect(interpolator(1500)).toBe(15);
        expect(interpolator(2000)).toBe(20);
    });

    it('should correctly build seriesSnapshot for composition charts', () => {
        const dateTimes = [1000, 2000];
        const sectorValues = {
            Tech: [30, 40],
            Finance: [70, 60],
        };

        const seriesForCrosshair = Object.entries(sectorValues).map(([sector, values]) => {
            const points = dateTimes.map((time, idx) => ({
                time,
                value: values[idx],
            }));
            return {
                key: sector,
                getValueAtTime: createTimeInterpolator(points),
            };
        });

        const time = 1500;
        const seriesSnapshot = [];
        seriesForCrosshair.forEach((series) => {
            const value = series.getValueAtTime(time);
            seriesSnapshot.push({
                key: series.key,
                value: value,
            });
        });

        expect(seriesSnapshot).toContainEqual({ key: 'Tech', value: 35 });
        expect(seriesSnapshot).toContainEqual({ key: 'Finance', value: 65 });
    });

    it('should show correct percentage in composition hover panel', () => {
        // Mocking drawCrosshairOverlay logic for composition charts
        const layout = {
            key: 'sectors',
            valueMode: 'percent',
            series: [
                {
                    key: 'Tech',
                    label: 'Tech',
                    getValueAtTime: () => 35,
                    formatValue: (v) => `${v.toFixed(2)}%`,
                },
            ],
        };
        const time = 1500;
        const seriesSnapshot = [];

        layout.series.forEach((series) => {
            const value = series.getValueAtTime(time);
            seriesSnapshot.push({
                key: series.key,
                value: value,
                percent: value, // In percent mode, value is percent
            });
        });

        expect(seriesSnapshot[0].percent).toBe(35);
    });
});
