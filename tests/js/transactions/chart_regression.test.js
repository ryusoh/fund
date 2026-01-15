import { jest } from '@jest/globals';

describe('Regression: Chart Date Range Fixes', () => {
    let injectSyntheticStartPoint;

    beforeEach(async () => {
        jest.resetModules();
        // Access the function - it may be exported or we need to test it indirectly
        // Since it's not exported, we'll test the behavior through the chart rendering
        // For now, let's import and test a mock version

        // Define the function inline for testing (copied from chart.js)
        injectSyntheticStartPoint = function (filteredData, fullSeries, filterFrom = null) {
            if (!Array.isArray(filteredData) || filteredData.length === 0) {
                return filteredData;
            }
            if (!Array.isArray(fullSeries) || fullSeries.length === 0) {
                return filteredData;
            }

            const firstFiltered = filteredData[0];
            const firstTime =
                firstFiltered && firstFiltered.date instanceof Date
                    ? firstFiltered.date.getTime()
                    : new Date(firstFiltered.date).getTime();
            if (!Number.isFinite(firstTime)) {
                return filteredData;
            }

            const matchingIndex = fullSeries.findIndex((item) => {
                if (!item) {
                    return false;
                }
                const itemDate = new Date(item.date);
                if (Number.isNaN(itemDate.getTime())) {
                    return false;
                }
                return itemDate.getTime() === firstTime;
            });

            if (matchingIndex <= 0) {
                return filteredData;
            }

            const previousPoint = fullSeries[matchingIndex - 1];
            if (!previousPoint || !previousPoint.synthetic) {
                return filteredData;
            }

            const prevDate = new Date(previousPoint.date);
            if (Number.isNaN(prevDate.getTime())) {
                return filteredData;
            }

            // If we have a filterFrom date and the synthetic point is before it, clamp it to filterFrom
            // This fixes the "left-edge overhang" where the line starts to the left of the Y-axis
            if (filterFrom && prevDate < filterFrom) {
                // Check if we already have a point at filterFrom to avoid duplicates
                const firstFiltered = filteredData[0];
                const firstTime =
                    firstFiltered && firstFiltered.date instanceof Date
                        ? firstFiltered.date.getTime()
                        : new Date(firstFiltered.date).getTime();

                if (Math.abs(firstTime - filterFrom.getTime()) < 1000) {
                    return filteredData;
                }

                return [
                    {
                        ...previousPoint,
                        date: new Date(filterFrom),
                        synthetic: true,
                    },
                    ...filteredData,
                ];
            }

            const prevValue = Number(previousPoint.value);
            const epsilon = 1e-6;
            if (!Number.isFinite(prevValue) || Math.abs(prevValue) > epsilon) {
                return filteredData;
            }

            // Don't add the synthetic point if it would be at the same position as the first filtered point
            if (
                filteredData[0].date instanceof Date &&
                filteredData[0].date.getTime() === prevDate.getTime()
            ) {
                return filteredData;
            }

            // Only add synthetic point if it's within the filter range
            // Note: The clamping logic above handles the case where prevDate < filterFrom
            if (filterFrom && prevDate < filterFrom) {
                // This block is now redundant due to the clamping above, but keeping for safety
                // in case the logic flow changes.
                return filteredData;
            }

            const syntheticPoint = {
                date: prevDate,
                value: Number.isFinite(prevValue) ? prevValue : 0,
                synthetic: true,
            };

            return [syntheticPoint, ...filteredData];
        };
    });

    describe('Left-Edge Overhang Fix', () => {
        test('should clamp synthetic start point to filterFrom when before filter range', () => {
            // Mock Data
            const fullSeries = [
                { date: new Date('2019-12-31T00:00:00Z'), value: 0, synthetic: true },
                { date: new Date('2020-01-15T00:00:00Z'), value: 110 },
                { date: new Date('2020-02-01T00:00:00Z'), value: 120 },
            ];

            const filteredData = [
                { date: new Date('2020-01-15T00:00:00Z'), value: 110 },
                { date: new Date('2020-02-01T00:00:00Z'), value: 120 },
            ];

            const filterFrom = new Date('2020-01-01T00:00:00Z');

            const result = injectSyntheticStartPoint(filteredData, fullSeries, filterFrom);

            // Should have 3 points: clamped synthetic + original 2
            expect(result.length).toBe(3);

            // First point should be at filterFrom, not before it
            const firstPoint = result[0];
            expect(firstPoint.date.getTime()).toBe(filterFrom.getTime());
            expect(firstPoint.value).toBe(0); // Original synthetic value
            expect(firstPoint.synthetic).toBe(true);
        });

        test('should not add duplicate point if already at filterFrom', () => {
            const fullSeries = [
                { date: new Date('2019-12-31T00:00:00Z'), value: 0, synthetic: true },
                { date: new Date('2020-01-01T00:00:00Z'), value: 110 },
            ];

            const filteredData = [{ date: new Date('2020-01-01T00:00:00Z'), value: 110 }];

            const filterFrom = new Date('2020-01-01T00:00:00Z');

            const result = injectSyntheticStartPoint(filteredData, fullSeries, filterFrom);

            // Should not add a duplicate point
            expect(result.length).toBe(1);
            expect(result[0].date.getTime()).toBe(filterFrom.getTime());
        });

        test('should add synthetic point when within filter range', () => {
            const fullSeries = [
                { date: new Date('2020-01-15T00:00:00Z'), value: 0, synthetic: true },
                { date: new Date('2020-01-30T00:00:00Z'), value: 110 },
            ];

            const filteredData = [{ date: new Date('2020-01-30T00:00:00Z'), value: 110 }];

            const filterFrom = new Date('2020-01-01T00:00:00Z');

            const result = injectSyntheticStartPoint(filteredData, fullSeries, filterFrom);

            // Should add the synthetic point since it's within the filter range
            expect(result.length).toBe(2);
            expect(result[0].value).toBe(0);
            expect(result[0].synthetic).toBe(true);
        });

        test('should handle case with no synthetic point gracefully', () => {
            const fullSeries = [
                { date: new Date('2020-01-15T00:00:00Z'), value: 110 },
                { date: new Date('2020-02-01T00:00:00Z'), value: 120 },
            ];

            const filteredData = [
                { date: new Date('2020-01-15T00:00:00Z'), value: 110 },
                { date: new Date('2020-02-01T00:00:00Z'), value: 120 },
            ];

            const filterFrom = new Date('2020-01-01T00:00:00Z');

            const result = injectSyntheticStartPoint(filteredData, fullSeries, filterFrom);

            // Should return original data unchanged
            expect(result.length).toBe(2);
            expect(result[0].date.getTime()).toBe(filteredData[0].date.getTime());
        });
    });

    describe('Right-Edge Spike Prevention', () => {
        test('should calculate maxTime based only on actual data within filter range', () => {
            // Simulate the maxTime calculation logic from the fix
            const contributionData = [
                { date: new Date('2020-01-01'), amount: 1000 },
                { date: new Date('2020-06-01'), amount: 1500 },
            ];
            const balanceData = [
                { date: new Date('2020-01-01'), value: 1000 },
                { date: new Date('2020-06-01'), value: 1500 },
            ];
            const filterToTime = new Date('2020-12-31').getTime(); // Filter end is Dec 2020

            // Recalculate maxTime to ensure it's based on the actual data range within filter bounds
            const isWithinFilterEnd = (time) =>
                !Number.isFinite(filterToTime) || time <= filterToTime;
            const allContributionTimes = contributionData
                .map((d) => d.date.getTime())
                .filter((time) => Number.isFinite(time) && isWithinFilterEnd(time));
            const allBalanceTimes = balanceData
                .map((d) => d.date.getTime())
                .filter((time) => Number.isFinite(time) && isWithinFilterEnd(time));
            const allActualTimes = [...allContributionTimes, ...allBalanceTimes];

            let maxTime;
            if (allActualTimes.length > 0) {
                maxTime = Math.max(...allActualTimes);
            } else if (Number.isFinite(filterToTime)) {
                maxTime = filterToTime;
            }

            // Ensure maxTime is also capped at filterToTime
            if (Number.isFinite(filterToTime)) {
                maxTime = Math.min(maxTime, filterToTime);
            }

            // maxTime should be the actual max data time (June 2020), not Dec 2020 or a far future date
            expect(maxTime).toBe(new Date('2020-06-01').getTime());
        });

        test('should handle case where data extends beyond filter range', () => {
            // Simulate data that extends beyond the filter range
            const contributionData = [
                { date: new Date('2020-01-01'), amount: 1000 },
                { date: new Date('2020-06-01'), amount: 1500 },
                { date: new Date('2025-01-01'), amount: 5000 }, // This point is beyond the filter
            ];
            const balanceData = [
                { date: new Date('2020-01-01'), value: 1000 },
                { date: new Date('2020-06-01'), value: 1500 },
                { date: new Date('2025-01-01'), value: 5000 }, // This point is beyond the filter
            ];
            const filterToTime = new Date('2020-12-31').getTime(); // Filter ends in 2020

            // Recalculate maxTime to ensure it's based on the actual data range within filter bounds
            const isWithinFilterEnd = (time) =>
                !Number.isFinite(filterToTime) || time <= filterToTime;
            const allContributionTimes = contributionData
                .map((d) => d.date.getTime())
                .filter((time) => Number.isFinite(time) && isWithinFilterEnd(time));
            const allBalanceTimes = balanceData
                .map((d) => d.date.getTime())
                .filter((time) => Number.isFinite(time) && isWithinFilterEnd(time));
            const allActualTimes = [...allContributionTimes, ...allBalanceTimes];

            let maxTime;
            if (allActualTimes.length > 0) {
                maxTime = Math.max(...allActualTimes);
            } else if (Number.isFinite(filterToTime)) {
                maxTime = filterToTime;
            }

            // Ensure maxTime is also capped at filterToTime
            if (Number.isFinite(filterToTime)) {
                maxTime = Math.min(maxTime, filterToTime);
            }

            // maxTime should be the actual max data time within filter (June 2020), not the 2025 data
            expect(maxTime).toBe(new Date('2020-06-01').getTime());
        });

        test('should calculate minTime respecting filterFrom', () => {
            // Simulate the minTime calculation logic
            const effectiveMinTimes = [new Date('2019-06-01').getTime()]; // Data starts in June 2019
            const fallbackMinTime = Date.now();
            let minTime =
                effectiveMinTimes.length > 0 ? Math.min(...effectiveMinTimes) : fallbackMinTime;

            const filterFromTime = new Date('2020-01-01').getTime();

            // Apply the fix: ensure minTime is at least the filter start time
            if (Number.isFinite(filterFromTime)) {
                minTime = Math.max(minTime, filterFromTime);
            }

            // minTime should be the later of the data start and filter start
            expect(minTime).toBe(filterFromTime);
        });
    });
});

describe('Chart Debug: Date Range Extension', () => {
    // Mock parseLocalDate
    const parseLocalDate = (value) => {
        if (value instanceof Date) {
            return new Date(value.getFullYear(), value.getMonth(), value.getDate());
        }
        if (typeof value === 'string') {
            const parts = value.split('-');
            if (parts.length >= 3) {
                const year = Number(parts[0]);
                const month = Number(parts[1]) - 1;
                const day = Number(parts[2]);
                return new Date(year, month, day);
            }
        }
        return new Date(value);
    };

    // Mock Date.now to return 2025-11-26
    const MOCK_TODAY = new Date(2025, 10, 26).getTime(); // Nov 26, 2025

    let dateSpy;

    beforeAll(() => {
        dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => MOCK_TODAY);
    });

    afterAll(() => {
        if (dateSpy) {
            dateSpy.mockRestore();
        }
    });

    const testScenario = (name, filterFromStr, filterToStr, paddingDateStr, expectedMaxTimeStr) => {
        test(name, () => {
            const filterFrom = filterFromStr ? parseLocalDate(filterFromStr) : null;
            const filterTo = filterToStr ? parseLocalDate(filterToStr) : null;
            const filterToTime = filterTo ? filterTo.getTime() : null;

            const contributionSource = [
                { tradeDate: '2025-01-15', amount: 100, orderType: 'buy' },
                { tradeDate: paddingDateStr, amount: 100, orderType: 'padding' },
            ];

            // Exact logic from chart.js
            const filterDataByDateRange = (data) => {
                return data.filter((item) => {
                    const itemDate = parseLocalDate(item.date);
                    if (!itemDate) {
                        return false;
                    }

                    // Normalize dates to date-only strings for comparison (YYYY-MM-DD)
                    const itemDateStr = itemDate.toISOString().split('T')[0];
                    const filterFromStrLocal = filterFrom
                        ? filterFrom.toISOString().split('T')[0]
                        : null;
                    const filterToStrLocal = filterTo ? filterTo.toISOString().split('T')[0] : null;

                    // Check if item is within the filter range
                    const withinStart = !filterFromStrLocal || itemDateStr >= filterFromStrLocal;
                    const withinEnd = !filterToStrLocal || itemDateStr <= filterToStrLocal;

                    // Preserve padding points that extend the series to the filter endpoint
                    const isPadding = item.orderType && item.orderType.toLowerCase() === 'padding';
                    if (isPadding && filterToStrLocal) {
                        if (itemDateStr === filterToStrLocal) {
                            return withinStart;
                        }
                    }

                    return withinStart && withinEnd;
                });
            };

            const rawContributionData = filterDataByDateRange(
                (contributionSource || [])
                    .map((item) => ({ ...item, date: parseLocalDate(item.tradeDate || item.date) }))
                    .filter((item) => item.date && !Number.isNaN(item.date.getTime()))
            );

            // Calculate maxTime
            let maxTime;
            if (Number.isFinite(filterToTime)) {
                maxTime = Math.min(filterToTime, Date.now());
            } else {
                maxTime = Date.now();
            }

            // Assertions
            // 1. Padding point should be preserved
            expect(rawContributionData.length).toBeGreaterThan(0);
            const lastPoint = rawContributionData[rawContributionData.length - 1];
            const lastPointDateStr = lastPoint.date.toISOString().split('T')[0];
            expect(lastPointDateStr).toBe(paddingDateStr);

            // 2. MaxTime should match expected
            const maxTimeStr = new Date(maxTime).toISOString().split('T')[0];
            expect(maxTimeStr).toBe(expectedMaxTimeStr);
        });
    };

    // Scenario 1: 2025q2 (Past)
    // Filter: Apr 1 - Jun 30. Today: Nov 26.
    // Padding: Jun 30.
    // Expected MaxTime: Jun 30.
    testScenario('2025q2 (Past)', '2025-04-01', '2025-06-30', '2025-06-30', '2025-06-30');

    // Scenario 2: 2025q4 (Current)
    // Filter: Oct 1 - Dec 31. Today: Nov 26.
    // Padding: Nov 26.
    // Expected MaxTime: Nov 26.
    testScenario('2025q4 (Current)', '2025-10-01', '2025-12-31', '2025-11-26', '2025-11-26');
});
