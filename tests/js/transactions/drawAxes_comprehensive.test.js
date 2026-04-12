import { jest } from '@jest/globals';

describe('drawAxes', () => {
    let drawAxes;
    let mockCtx;
    let padding;
    let plotWidth;
    let plotHeight;
    let minTime;
    let maxTime;
    let yMin;
    let yMax;
    let xScale;
    let yScale;
    let yLabelFormatter;

    beforeEach(() => {
        jest.resetModules();

        // Mock helpers.js using the alias path
        // Using doMock to avoid hoisting issues and referencing global jest inside factory
        jest.doMock('@js/transactions/chart/helpers.js', () => ({
            niceNumber: (r) => r,
            getMonoFontFamily: () => 'Monospace',
            colorWithAlpha: (c, a) => `rgba(0,0,0,${a})`,
            clamp01: (v) => v,
        }));

        // Load the module using the alias
        const coreModule = require('@js/transactions/chart/core.js');
        drawAxes = coreModule.drawAxes;

        mockCtx = {
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            fillText: jest.fn(),
            setLineDash: jest.fn(),
            measureText: jest.fn(() => ({ width: 50 })),
            strokeStyle: '',
            fillStyle: '',
            font: '',
            textAlign: '',
            textBaseline: '',
            lineWidth: 1,
        };

        padding = { top: 10, right: 10, bottom: 10, left: 10 };
        plotWidth = 100;
        plotHeight = 100;
        minTime = 1000;
        maxTime = 2000;
        yMin = 0;
        yMax = 100;

        xScale = jest.fn((t) => ((t - minTime) / (maxTime - minTime)) * plotWidth + padding.left);
        yScale = jest.fn((v) => padding.top + plotHeight - ((v - yMin) / (yMax - yMin)) * plotHeight);
        yLabelFormatter = jest.fn((v) => String(v));

        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: 1024,
        });
    });

    test('should draw both axes by default', () => {
        drawAxes(
            mockCtx,
            padding,
            plotWidth,
            plotHeight,
            minTime,
            maxTime,
            yMin,
            yMax,
            xScale,
            yScale,
            yLabelFormatter
        );

        // Check Y-axis labels (should be called for several values)
        expect(mockCtx.fillText).toHaveBeenCalled();
        // Check X-axis line (one of the moveTo calls should be for the X-axis)
        expect(mockCtx.moveTo).toHaveBeenCalledWith(padding.left, padding.top + plotHeight);
        expect(mockCtx.lineTo).toHaveBeenCalledWith(
            padding.left + plotWidth,
            padding.top + plotHeight
        );
    });

    test('should respect drawXAxis: false', () => {
        drawAxes(
            mockCtx,
            padding,
            plotWidth,
            plotHeight,
            minTime,
            maxTime,
            yMin,
            yMax,
            xScale,
            yScale,
            yLabelFormatter,
            false,
            { drawXAxis: false, drawYAxis: true }
        );

        // The specific moveTo call for X-axis should NOT be present
        const xAxisLineCall = mockCtx.moveTo.mock.calls.find(
            (call) => call[0] === padding.left && call[1] === padding.top + plotHeight
        );
        expect(xAxisLineCall).toBeUndefined();
    });

    test('should respect drawYAxis: false', () => {
        drawAxes(
            mockCtx,
            padding,
            plotWidth,
            plotHeight,
            minTime,
            maxTime,
            yMin,
            yMax,
            xScale,
            yScale,
            yLabelFormatter,
            false,
            { drawXAxis: true, drawYAxis: false }
        );

        // textAlign is set to 'right' during Y-axis drawing. If disabled, it should stay default or be 'center' for X-axis
        expect(mockCtx.textAlign).not.toBe('right');
    });

    test('should handle mobile view', () => {
        window.innerWidth = 500;

        drawAxes(
            mockCtx,
            padding,
            plotWidth,
            plotHeight,
            minTime,
            maxTime,
            yMin,
            yMax,
            xScale,
            yScale,
            yLabelFormatter
        );

        // In mobile, font size should be 9px
        expect(mockCtx.font).toContain('9px');
    });

    test('should handle Y-axis label clipping at top', () => {
        // Adjust padding.top to trigger clipping (y - halfTextHeight < 2)
        // With 11px font, halfTextHeight is 5.5.
        // If y is padding.top (for yMax), then padding.top = 5 means 5 - 5.5 = -0.5 < 2.
        padding.top = 5;

        drawAxes(
            mockCtx,
            padding,
            plotWidth,
            plotHeight,
            minTime,
            maxTime,
            yMin,
            yMax,
            xScale,
            yScale,
            yLabelFormatter
        );

        // Verify that 'top' baseline was used at some point (specifically for the top label)
        // Since we can't easily capture state between calls without a more complex mock,
        // we check the final state which for the last tick (usually the top one or bottom one depending on loop)
        // In the code, ticks are drawn in order. If yMax is last or top-most, it should set it.
        expect(mockCtx.textBaseline).toBe('top');
    });

    test('should draw vertical dashed lines for year starts', () => {
        const start = new Date(2024, 0, 1).getTime();
        const end = new Date(2026, 0, 1).getTime();

        drawAxes(
            mockCtx,
            padding,
            plotWidth,
            plotHeight,
            start,
            end,
            yMin,
            yMax,
            xScale,
            yScale,
            yLabelFormatter
        );

        // Should call setLineDash([3, 3]) for year start boundaries
        expect(mockCtx.setLineDash).toHaveBeenCalledWith([3, 3]);
    });

    test('should draw dashed lines for quarters', () => {
        const start = new Date(2025, 0, 1).getTime();
        const end = new Date(2025, 5, 1).getTime();

        drawAxes(
            mockCtx,
            padding,
            plotWidth,
            plotHeight,
            start,
            end,
            yMin,
            yMax,
            xScale,
            yScale,
            yLabelFormatter
        );

        // Should call setLineDash([2, 2]) for quarters
        expect(mockCtx.setLineDash).toHaveBeenCalledWith([2, 2]);
    });

    test('should skip overlapping X-axis labels', () => {
        const smallPlotWidth = 20;

        drawAxes(
            mockCtx,
            padding,
            smallPlotWidth,
            plotHeight,
            new Date(2020, 0, 1).getTime(),
            new Date(2030, 0, 1).getTime(),
            yMin,
            yMax,
            xScale,
            yScale,
            yLabelFormatter
        );

        // Year ticks for 2020 to 2030 is ~11.
        // On X-axis drawing, it checks x - prevTickX < minSpacing.
        // With width 20, they will certainly overlap.
        const xLabelCalls = mockCtx.fillText.mock.calls.filter(
            (call) => typeof call[0] === 'string' && call[0].length <= 4
        );
        expect(xLabelCalls.length).toBeLessThan(11);
    });
});
