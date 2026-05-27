import { computeAppreciationSeries } from '../../../../../js/transactions/chart/data/contribution.js';

describe('Contribution Data Helpers', () => {
    describe('computeAppreciationSeries', () => {
        it('should calculate appreciation correctly when lengths match', () => {
            const balanceData = [
                { date: new Date('2024-01-01'), value: 100 },
                { date: new Date('2024-01-02'), value: 120 },
                { date: new Date('2024-01-03'), value: 150 }
            ];
            const contributionData = [
                { date: new Date('2024-01-01'), amount: 100 },
                { date: new Date('2024-01-02'), amount: 110 },
                { date: new Date('2024-01-03'), amount: 130 }
            ];

            const result = computeAppreciationSeries(balanceData, contributionData);

            expect(result.length).toBe(3);
            expect(result[0].value).toBe(0); // 100 - 100
            expect(result[1].value).toBe(10); // 120 - 110
            expect(result[2].value).toBe(20); // 150 - 130
            expect(result[0].date).toBe(balanceData[0].date);
        });

        it('should handle empty arrays', () => {
            expect(computeAppreciationSeries([], [])).toEqual([]);
            expect(computeAppreciationSeries(null, null)).toEqual([]);
        });

        it('should align data by date if lengths do not match using interpolation', () => {
            const balanceData = [
                { date: new Date('2024-01-01'), value: 100 },
                { date: new Date('2024-01-02'), value: 120 },
                { date: new Date('2024-01-04'), value: 150 }
            ];
            const contributionData = [
                { date: new Date('2024-01-01'), amount: 100 },
                { date: new Date('2024-01-03'), amount: 110 },
                { date: new Date('2024-01-04'), amount: 130 }
            ];

            const result = computeAppreciationSeries(balanceData, contributionData);

            expect(result.length).toBe(3); // Result should map to balanceData
            // 2024-01-01
            expect(result[0].value).toBe(0); // 100 - 100
            // 2024-01-02 interpolation: time is between Jan 1 (100) and Jan 3 (110)
            // Midpoint value should be 105. 120 - 105 = 15
            expect(result[1].value).toBe(15);
            // 2024-01-04
            expect(result[2].value).toBe(20); // 150 - 130
        });

        it('should handle target time before first contribution', () => {
            const balanceData = [
                { date: new Date('2023-12-31'), value: 100 },
            ];
            const contributionData = [
                { date: new Date('2024-01-01'), amount: 100 },
            ];
            const result = computeAppreciationSeries(balanceData, contributionData);
            expect(result.length).toBe(1);
            expect(result[0].value).toBe(0); // 100 - 100 (first contrib value)
        });

        it('should handle target time after last contribution', () => {
            const balanceData = [
                { date: new Date('2024-01-02'), value: 150 },
            ];
            const contributionData = [
                { date: new Date('2024-01-01'), amount: 100 },
            ];
            const result = computeAppreciationSeries(balanceData, contributionData);
            expect(result.length).toBe(1);
            expect(result[0].value).toBe(50); // 150 - 100 (last contrib value)
        });
    });
});
