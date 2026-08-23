import { drawCrosshairOverlay } from '../../../../js/transactions/chart/interaction.js';
import { crosshairState } from '../../../../js/transactions/chart/interaction.js';

jest.mock('../../../../js/transactions/chart/helpers.js', () => ({
    ...jest.requireActual('../../../../js/transactions/chart/helpers.js'),
    formatPercentInline: jest.fn(() => '10%'),
    formatCrosshairDateLabel: jest.fn(() => 'Jan 1'),
}));

describe('drawCrosshairOverlay extracted coverage', () => {
    let layout;
    let ctx;

    beforeEach(() => {
        crosshairState.active = false;
        crosshairState.hoverTime = null;
        crosshairState.rangeStart = null;
        crosshairState.rangeEnd = null;

        layout = {
            key: 'contribution',
            minTime: 100,
            maxTime: 1000,
            chartBounds: { left: 0, right: 500, top: 0, bottom: 300 },
            xScale: jest.fn(() => 50),
            yScale: jest.fn(() => 50),
            valueType: 'percent',
            series: [
                { key: 's1', label: null, color: null, getValueAtTime: jest.fn(() => null) },
                { key: 's2', getValueAtTime: 'not a function' },
                { key: 's3', getValueAtTime: jest.fn(() => 10) },
            ],
        };

        ctx = {
            save: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            fillRect: jest.fn(),
            setLineDash: jest.fn(),
            arc: jest.fn(),
            fill: jest.fn(),
            measureText: jest.fn(() => ({ width: 10 })),
            fillText: jest.fn(),
            strokeRect: jest.fn(),
        };
    });

    it('covers standard', () => {
        crosshairState.active = true;
        crosshairState.hoverTime = 500;
        drawCrosshairOverlay(ctx, layout);
    });

    it('covers composition', () => {
        layout.key = 'composition';
        layout.series = [
            { key: 'c1', label: null, color: null, getValueAtTime: jest.fn(() => null) },

            { key: 'c2', getValueAtTime: null },

            { key: 'c3', getValueAtTime: jest.fn(() => 10) },
            { key: 'c4', getValueAtTime: jest.fn(() => 0.05) },
            { key: 'c5', getValueAtTime: jest.fn(() => NaN) },
        ];
        crosshairState.active = true;
        crosshairState.hoverTime = 500;
        drawCrosshairOverlay(ctx, layout);
    });

    it('covers early return', () => {
        drawCrosshairOverlay(ctx, layout);
        crosshairState.rangeStart = NaN;
        crosshairState.rangeEnd = NaN;
        drawCrosshairOverlay(ctx, layout);
        crosshairState.rangeStart = 200;
        crosshairState.rangeEnd = 200;
        layout.xScale = jest.fn(() => -100);
        drawCrosshairOverlay(ctx, layout);
    });
});
