import { createGlowTrailAnimator } from '@plugins/glowTrailAnimator.js';

describe('glowTrailAnimator', () => {
    let animator;
    let mockCtx;

    beforeEach(() => {
        animator = createGlowTrailAnimator({
            enabled: true,
            charts: {
                disabledChart: { enabled: false },
                customChart: { tailRatio: 0.5, oscillationSpeed: 2 }
            }
        });

        const mockGradient = {
            addColorStop: jest.fn()
        };

        mockCtx = {
            createLinearGradient: jest.fn(() => mockGradient),
            createRadialGradient: jest.fn(() => mockGradient),
            save: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            arc: jest.fn(),
            fill: jest.fn(),
            globalCompositeOperation: '',
            fillStyle: '',
            strokeStyle: '',
            shadowColor: '',
            shadowBlur: 0,
            lineWidth: 0,
            globalAlpha: 1
        };

        jest.spyOn(global, 'requestAnimationFrame').mockImplementation((cb) => {
            return setTimeout(() => cb(Date.now()), 0);
        });
        jest.spyOn(global, 'cancelAnimationFrame').mockImplementation((id) => {
            clearTimeout(id);
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        animator.stopAll();
    });

    describe('isEnabledFor', () => {
        it('returns true for default chart', () => {
            expect(animator.isEnabledFor('test')).toBe(true);
        });

        it('returns false when globally disabled', () => {
            const disabledAnimator = createGlowTrailAnimator({ enabled: false });
            expect(disabledAnimator.isEnabledFor('test')).toBe(false);
        });

        it('returns false for explicitly disabled chart', () => {
            expect(animator.isEnabledFor('disabledChart')).toBe(false);
        });
    });

    describe('scheduling and animation state', () => {
        it('starts, advances, and stops animation', () => {
            const mockChartManager = { redraw: jest.fn() };

            animator.schedule('test', mockChartManager);
            expect(global.requestAnimationFrame).toHaveBeenCalled();

            const initialPhase = animator.advance('test', 1000);
            expect(initialPhase).toBe(0);

            const nextPhase = animator.advance('test', 1050);
            expect(nextPhase).toBeGreaterThan(0);

            animator.stop('test');
        });

        it('stops animation if isActive returns false', (done) => {
            const mockChartManager = { redraw: jest.fn() };
            animator.schedule('test', mockChartManager, { isActive: () => false });

            setTimeout(() => {
                expect(mockChartManager.redraw).not.toHaveBeenCalled();
                done();
            }, 10);
        });

        it('stopAll clears all active animations', () => {
            animator.advance('chart1', 1000);
            animator.advance('chart2', 1000);

            animator.stopAll();

            // Re-advancing should start from phase 0
            expect(animator.advance('chart1', 2000)).toBe(0);
        });
    });

    describe('drawSeriesGlow', () => {
        it('does not draw if coords are empty', () => {
            animator.drawSeriesGlow(mockCtx, { coords: [], color: '#ff0000', lineWidth: 2 }, { chartKey: 'test' });
            expect(mockCtx.beginPath).not.toHaveBeenCalled();
        });

        it('does not draw if color is invalid', () => {
            animator.drawSeriesGlow(mockCtx, { coords: [{x: 0, y: 0}], color: 'invalid', lineWidth: 2 }, { chartKey: 'test' });
            expect(mockCtx.beginPath).not.toHaveBeenCalled();
        });

        it('draws halo and ring with valid coords and color', () => {
            const series = {
                coords: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
                color: '#ff0000',
                lineWidth: 2
            };

            animator.drawSeriesGlow(mockCtx, series, { chartKey: 'test', isMobile: false, seriesIndex: 0 });

            expect(mockCtx.createRadialGradient).toHaveBeenCalled();
            expect(mockCtx.arc).toHaveBeenCalled();
            expect(mockCtx.fill).toHaveBeenCalled();
            expect(mockCtx.stroke).toHaveBeenCalled();
        });

        it('draws tail when tailRatio > 0 and coords are sufficient', () => {
            const series = {
                coords: Array.from({length: 20}, (_, i) => ({ x: i, y: i })),
                color: 'rgb(255, 0, 0)',
                lineWidth: 2
            };

            animator.drawSeriesGlow(mockCtx, series, { chartKey: 'customChart' });

            expect(mockCtx.createLinearGradient).toHaveBeenCalled();
            expect(mockCtx.lineTo).toHaveBeenCalled();
        });

        it('handles mobile and desktop specific settings', () => {
            const series = {
                coords: [{ x: 10, y: 10 }],
                color: '#00ff00',
                lineWidth: 2
            };

            animator.drawSeriesGlow(mockCtx, series, { chartKey: 'test', isMobile: true });
            const mobileShadowBlur = mockCtx.shadowBlur;

            animator.drawSeriesGlow(mockCtx, series, { chartKey: 'test', isMobile: false });
            const desktopShadowBlur = mockCtx.shadowBlur;

            expect(mobileShadowBlur).not.toEqual(desktopShadowBlur);
        });

        it('supports 3-digit hex colors', () => {
            const series = {
                coords: [{ x: 10, y: 10 }],
                color: '#f00',
                lineWidth: 2
            };

            animator.drawSeriesGlow(mockCtx, series, { chartKey: 'test' });
            expect(mockCtx.beginPath).toHaveBeenCalled();
        });
    });
});
