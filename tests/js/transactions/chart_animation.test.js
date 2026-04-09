import { jest } from '@jest/globals';

const mockGlowAnimator = {
    isEnabledFor: jest.fn(),
    stop: jest.fn(),
    schedule: jest.fn(),
    advance: jest.fn(),
    drawSeriesGlow: jest.fn(),
};

jest.mock('../../../js/plugins/glowTrailAnimator.js', () => ({
    createGlowTrailAnimator: jest.fn(() => mockGlowAnimator),
}));

describe('Chart animation integration', () => {
    let animation;
    let transactionState;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Mock state module completely
        jest.mock('../../../js/transactions/state.js', () => ({
            transactionState: { activeChart: 'performance' }
        }));

        const stateMod = await import('../../../js/transactions/state.js');
        transactionState = stateMod.transactionState;

        animation = await import('../../../js/transactions/chart/animation.js');
    });

    const charts = ['Performance', 'Contribution', 'Fx', 'Pe', 'Concentration', 'Yield'];

    describe('stop functions', () => {
        charts.forEach(chart => {
            test(`stop${chart}Animation stops correct chart`, () => {
                animation[`stop${chart}Animation`]();
                expect(mockGlowAnimator.stop).toHaveBeenCalledWith(chart.toLowerCase());
            });
        });
    });

    describe('schedule functions', () => {
        charts.forEach(chart => {
            describe(`schedule${chart}Animation`, () => {
                it('stops when animation is not enabled', () => {
                    mockGlowAnimator.isEnabledFor.mockReturnValue(false);
                    animation[`schedule${chart}Animation`]({});
                    expect(mockGlowAnimator.stop).toHaveBeenCalledWith(chart.toLowerCase());
                    expect(mockGlowAnimator.schedule).not.toHaveBeenCalled();
                });

                it('schedules when animation is enabled and isActive callback works', () => {
                    mockGlowAnimator.isEnabledFor.mockReturnValue(true);
                    const chartManager = { mock: true };
                    animation[`schedule${chart}Animation`](chartManager);

                    expect(mockGlowAnimator.schedule).toHaveBeenCalledWith(
                        chart.toLowerCase(),
                        chartManager,
                        expect.any(Object)
                    );

                    // Test isActive callback
                    const { isActive } = mockGlowAnimator.schedule.mock.calls[0][2];
                    transactionState.activeChart = chart.toLowerCase();
                    expect(isActive()).toBe(true);

                    transactionState.activeChart = 'other';
                    expect(isActive()).toBe(false);
                });
            });
        });
    });

    describe('advance functions', () => {
        charts.forEach(chart => {
            describe(`advance${chart}Animation`, () => {
                it('returns 0 when animation is not enabled', () => {
                    mockGlowAnimator.isEnabledFor.mockReturnValue(false);
                    expect(animation[`advance${chart}Animation`](123)).toBe(0);
                    expect(mockGlowAnimator.advance).not.toHaveBeenCalled();
                });

                it('calls advance when animation is enabled', () => {
                    mockGlowAnimator.isEnabledFor.mockReturnValue(true);
                    mockGlowAnimator.advance.mockReturnValue(42);
                    expect(animation[`advance${chart}Animation`](123)).toBe(42);
                    expect(mockGlowAnimator.advance).toHaveBeenCalledWith(chart.toLowerCase(), 123);
                });
            });
        });
    });

    describe('drawSeriesGlow', () => {
        it('delegates to animator', () => {
            const ctx = {};
            const series = {};
            const options = {};
            animation.drawSeriesGlow(ctx, series, options);
            expect(mockGlowAnimator.drawSeriesGlow).toHaveBeenCalledWith(ctx, series, options);
        });
    });
});
