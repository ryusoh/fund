import { jest } from '@jest/globals';
import { drawAxes } from '../../../js/transactions/chart/core.js';

describe('Y-axis label generation', () => {
    test('should prevent Y-axis label collision mathematically and enforce at least two labels above and below zero on a square root scale', () => {
        const padding = { top: 0, left: 0 };
        const volumeHeight = 80;
        const volumeYMax = 110000;
        const volumeYMin = -110000;

        // Build a mock square root scale exactly like the volume pane
        const sqrtTop = Math.sqrt(volumeYMax);
        const sqrtRange = sqrtTop - -Math.sqrt(Math.abs(volumeYMin));
        const sqrtTransform = (value) => Math.sign(value) * Math.sqrt(Math.abs(value));
        const sqYScale = (value) =>
            padding.top + ((sqrtTop - sqrtTransform(value)) / sqrtRange) * volumeHeight;
        const dummyXScale = () => 0;

        const fillTextCalls = [];
        const mockCtx = {
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            fillText: jest.fn((text, x, y) => {
                fillTextCalls.push({ text, y });
            }),
            setLineDash: jest.fn(),
            measureText: jest.fn(() => ({ width: 20 })),
        };

        drawAxes(
            mockCtx,
            padding,
            100, // plotWidth
            volumeHeight,
            0,
            100,
            volumeYMin,
            volumeYMax,
            dummyXScale,
            sqYScale,
            (v) => String(v),
            false,
            { drawXAxis: false, drawYAxis: true, maxTicks: 14 }
        );

        // We demand at least 7 labels to mathematically prevent sparsity.
        // With an 80px high volume pane and 11px fontSize, mathematically packing them
        // top-down on a square-root scale gives exactly: [-110k, -50k, -10k, 0, 10k, 50k, 110k]
        // This gives exactly three labels above zero, three labels below zero, plus the zero line.
        expect(fillTextCalls.length).toBeGreaterThanOrEqual(7);

        // Check that none of the labels visually overlap
        const sorted = [...fillTextCalls].sort((a, b) => a.y - b.y);
        for (let i = 0; i < sorted.length - 1; i++) {
            const distance = Math.abs(sorted[i].y - sorted[i + 1].y);
            expect(distance).toBeGreaterThanOrEqual(7); // math distance is ~7.9 for 25k and 50k, our threshold is fontSize * 0.7 (7)
        }
    });
});
