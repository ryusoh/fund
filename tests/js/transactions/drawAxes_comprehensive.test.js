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
    let yLabelFormatter;

    // Helper to create scales that respect current test parameters
    const getXScale = (t, start, end, width, left) =>
        ((t - start) / (end - start)) * width + left;
    const getYScale = (v, min, max, height, top) =>
        top + height - ((v - min) / (max - min)) * height;

    beforeEach(() => {
        jest.resetModules();

        // Use a simple mock without referencing 'jest' to avoid ReferenceError in some environments
        jest.doMock('@js/transactions/chart/helpers.js', () => ({
            niceNumber: (r) => r,
            getMonoFontFamily: () => 'Monospace',
            colorWithAlpha: () => 'rgba(0,0,0,1)',
            clamp01: (v) => v,
        }));

        const coreModule = require('@js/transactions/chart/core.js');
        drawAxes = coreModule.drawAxes;

        // Stateful mock context
        mockCtx = {
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            fillText: jest.fn(),
            setLineDash: jest.fn(),
            measureText: jest.fn(() => ({ width: 50 })),
            _properties: {
                lineWidth: 1,
                strokeStyle: '',
                fillStyle: '',
                font: '',
                textAlign: '',
                textBaseline: '',
            },
        };

        // Add setters/getters to track property assignments
        Object.keys(mockCtx._properties).forEach((prop) => {
            Object.defineProperty(mockCtx, prop, {
                set: (val) => {
                    mockCtx._properties[prop] = val;
                },
                get: () => mockCtx._properties[prop],
                configurable: true,
            });
        });

        padding = { top: 10, right: 10, bottom: 10, left: 10 };
        plotWidth = 100;
        plotHeight = 100;

        // Use very specific timestamps to avoid timezone/DST issues in CI
        // 2025-01-01 00:00:00 UTC to 2025-12-31 23:59:59 UTC
        minTime = 1735689600000;
        maxTime = 1767225599000;
        yMin = 0;
        yMax = 100;

        yLabelFormatter = (v) => String(v);

        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: 1024,
        });
    });

    test('should draw both axes by default', () => {
        const xScale = (t) => getXScale(t, minTime, maxTime, plotWidth, padding.left);
        const yScale = (v) => getYScale(v, yMin, yMax, plotHeight, padding.top);

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

        expect(mockCtx.fillText).toHaveBeenCalled();
        // X-axis line (lineWidth 1.5)
        const xAxisLineCall = mockCtx.moveTo.mock.calls.find(
            (call) => call[0] === padding.left && call[1] === padding.top + plotHeight
        );
        expect(xAxisLineCall).toBeDefined();
    });

    test('should respect drawXAxis: false', () => {
        const xScale = (t) => getXScale(t, minTime, maxTime, plotWidth, padding.left);
        const yScale = (v) => getYScale(v, yMin, yMax, plotHeight, padding.top);

        const strokeHistory = [];
        mockCtx.stroke.mockImplementation(() => {
            strokeHistory.push({
                lineWidth: mockCtx.lineWidth,
                strokeStyle: mockCtx.strokeStyle,
            });
        });

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

        // X-axis line uses lineWidth 1.5. Grid lines use 1.0 (default in our mock).
        const xAxisStroke = strokeHistory.find((s) => s.lineWidth === 1.5);
        expect(xAxisStroke).toBeUndefined();
    });

    test('should respect drawYAxis: false', () => {
        const xScale = (t) => getXScale(t, minTime, maxTime, plotWidth, padding.left);
        const yScale = (v) => getYScale(v, yMin, yMax, plotHeight, padding.top);

        mockCtx.textAlign = 'initial';

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

        // textAlign is set to 'right' for Y-axis labels.
        expect(mockCtx.textAlign).not.toBe('right');
    });

    test('should handle mobile view', () => {
        window.innerWidth = 500;
        const xScale = (t) => getXScale(t, minTime, maxTime, plotWidth, padding.left);
        const yScale = (v) => getYScale(v, yMin, yMax, plotHeight, padding.top);

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

        expect(mockCtx.font).toContain('9px');
    });

    test('should handle Y-axis label clipping at top', () => {
        padding.top = 5;
        const xScale = (t) => getXScale(t, minTime, maxTime, plotWidth, padding.left);
        const yScale = (v) => getYScale(v, yMin, yMax, plotHeight, padding.top);

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

        expect(mockCtx.textBaseline).toBe('top');
    });

    test('should draw vertical grid lines for boundaries', () => {
        // Multi-year range to trigger isYearStart ticks
        // 2024-01-01 to 2026-01-01
        const start = 1704067200000;
        const end = 1767225600000;
        const xScale = (t) => getXScale(t, start, end, plotWidth, padding.left);
        const yScale = (v) => getYScale(v, yMin, yMax, plotHeight, padding.top);

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

        // Vertical boundary lines use setLineDash([3, 3]) for years or [2, 2] for quarters
        expect(mockCtx.setLineDash).toHaveBeenCalled();
    });

    test('should skip overlapping X-axis labels', () => {
        const smallPlotWidth = 20;
        // 2020-01-01 to 2030-01-01
        const start = 1577836800000;
        const end = 1893456000000;
        const xScale = (t) => getXScale(t, start, end, smallPlotWidth, padding.left);
        const yScale = (v) => getYScale(v, yMin, yMax, plotHeight, padding.top);

        drawAxes(
            mockCtx,
            padding,
            smallPlotWidth,
            plotHeight,
            start,
            end,
            yMin,
            yMax,
            xScale,
            yScale,
            yLabelFormatter
        );

        // X-axis labels are drawn below plot area (padding.top + plotHeight + offset)
        const xAxisY = padding.top + plotHeight;
        const xLabelCalls = mockCtx.fillText.mock.calls.filter((call) => call[2] > xAxisY);

        // Years: 2020, 2021, ..., 2030 (11 years)
        // With width 20 and minSpacing 40, they should definitely overlap and be skipped.
        expect(xLabelCalls.length).toBeLessThan(11);
    });
});
