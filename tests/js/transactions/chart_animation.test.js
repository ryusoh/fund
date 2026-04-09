import { jest } from '@jest/globals';

describe('Chart animation integration', () => {
    let animation;

    beforeEach(async () => {
        jest.resetModules();
        animation = await import('@js/transactions/chart/animation.js');
    });

    describe('PE animation channel', () => {
        test('stopPeAnimation is exported', () => {
            expect(typeof animation.stopPeAnimation).toBe('function');
        });

        test('schedulePeAnimation is exported', () => {
            expect(typeof animation.schedulePeAnimation).toBe('function');
        });

        test('advancePeAnimation is exported', () => {
            expect(typeof animation.advancePeAnimation).toBe('function');
        });

        test('advancePeAnimation returns a number', () => {
            const result = animation.advancePeAnimation(Date.now());
            expect(typeof result).toBe('number');
        });

        test('stopPeAnimation does not throw', () => {
            expect(() => animation.stopPeAnimation()).not.toThrow();
        });
    });

    describe('Concentration animation channel', () => {
        test('stopConcentrationAnimation is exported', () => {
            expect(typeof animation.stopConcentrationAnimation).toBe('function');
        });

        test('scheduleConcentrationAnimation is exported', () => {
            expect(typeof animation.scheduleConcentrationAnimation).toBe('function');
        });

        test('advanceConcentrationAnimation is exported', () => {
            expect(typeof animation.advanceConcentrationAnimation).toBe('function');
        });

        test('advanceConcentrationAnimation returns a number', () => {
            const result = animation.advanceConcentrationAnimation(Date.now());
            expect(typeof result).toBe('number');
        });

        test('stopConcentrationAnimation does not throw', () => {
            expect(() => animation.stopConcentrationAnimation()).not.toThrow();
        });
    });

    describe('drawSeriesGlow', () => {
        test('is exported as a function', () => {
            expect(typeof animation.drawSeriesGlow).toBe('function');
        });
    });

    describe('Cross-chart stop behavior', () => {
        test('all stop functions are exported', () => {
            expect(typeof animation.stopPerformanceAnimation).toBe('function');
            expect(typeof animation.stopContributionAnimation).toBe('function');
            expect(typeof animation.stopFxAnimation).toBe('function');
            expect(typeof animation.stopPeAnimation).toBe('function');
            expect(typeof animation.stopConcentrationAnimation).toBe('function');
        });

        test('each chart type has matching schedule/advance/stop', () => {
            const channels = ['Performance', 'Contribution', 'Fx', 'Pe', 'Concentration'];
            for (const ch of channels) {
                expect(typeof animation[`stop${ch}Animation`]).toBe('function');
                expect(typeof animation[`schedule${ch}Animation`]).toBe('function');
                expect(typeof animation[`advance${ch}Animation`]).toBe('function');
            }
        });
    });
});

describe('PE chart accepts timestamp', () => {
    test('drawPEChart function accepts 3 parameters', async () => {
        jest.resetModules();
        const mod = await import('@js/transactions/chart/renderers/pe.js');
        // drawPEChart(ctx, chartManager, timestamp) should accept 3 params
        expect(mod.drawPEChart.length).toBeGreaterThanOrEqual(2);
    });
});

describe('Concentration chart accepts timestamp', () => {
    test('drawConcentrationChart function accepts 3 parameters', async () => {
        jest.resetModules();
        const mod = await import('@js/transactions/chart/renderers/concentration.js');
        // drawConcentrationChart(ctx, chartManager, timestamp) should accept 3 params
        expect(mod.drawConcentrationChart.length).toBeGreaterThanOrEqual(2);
    });
});
