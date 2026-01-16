import {
    drawCrosshairOverlay,
    crosshairState,
} from '../../../js/transactions/chart/interaction.js';

// Mock dependencies
jest.mock('../../../js/transactions/chart/state.js', () => ({
    transactionState: { selectedCurrency: 'USD' },
}));

jest.mock('../../../js/transactions/chart/config.js', () => ({
    CHART_LINE_WIDTHS: { crosshairMarker: 1 },
    CROSSHAIR_SETTINGS: {},
}));

jest.mock('../../../js/transactions/chart/helpers.js', () => ({
    getMonoFontFamily: () => 'monospace',
    formatPercentInline: (val) => `${val.toFixed(2)}%`,
    formatCrosshairDateLabel: () => '2023-01-01',
    clampTime: (t) => t,
}));

jest.mock('../../../js/transactions/utils.js', () => ({
    formatCurrencyInline: (val) => `$${val}`,
    convertValueToCurrency: (val) => val,
}));

// Mock drawCompositionHoverPanel to avoid errors
jest.mock('../../../js/transactions/chart/interaction.js', () => ({
    ...jest.requireActual('../../../js/transactions/chart/interaction.js'),
    drawCompositionHoverPanel: jest.fn(),
}));

describe('Chart Interaction Logic', () => {
    let ctx;
    let layout;

    beforeEach(() => {
        // Setup mock context
        ctx = {
            save: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            fill: jest.fn(),
            fillRect: jest.fn(),
            strokeRect: jest.fn(),
            arc: jest.fn(),
            measureText: jest.fn().mockReturnValue({ width: 10 }),
            fillText: jest.fn(),
            setLineDash: jest.fn(),
        };

        // Setup mock layout with many series
        const series = [];
        for (let i = 0; i < 20; i++) {
            series.push({
                key: `ticker_${i}`,
                label: `Ticker ${i}`,
                color: '#000000',
                getValueAtTime: jest.fn().mockReturnValue(10), // Each has 10%
                formatValue: jest.fn().mockReturnValue('10%'),
            });
        }

        layout = {
            key: 'composition',
            chartBounds: { left: 0, right: 100, top: 0, bottom: 100 },
            xScale: jest.fn().mockReturnValue(50),
            yScale: jest.fn().mockReturnValue(50),
            minTime: 0,
            maxTime: 1000,
            series: series,
            valueType: 'percent',
            getTotalValueAtTime: jest.fn().mockReturnValue(200), // Total 200
        };

        // Reset crosshair state
        crosshairState.active = true;
        crosshairState.hoverTime = 500;
        crosshairState.hoverY = 50;
    });

    test('drawCrosshairOverlay should limit dots to top 7 holdings for composition chart', () => {
        // Only top 7 should be shown in panel and thus have dots
        // In our mock, all have value 10, so sort order might be stable or depend on implementation,
        // but regardless only 7 should be picked.

        drawCrosshairOverlay(ctx, layout);

        // Verify ctx.arc was called.
        // We trigger it for:
        // 1. Hover panel logic might imply calls if we didn't mock it out?
        //    Actually drawCompositionHoverPanel calls arc too!
        //    Since internal calls are not mocked in ESM, the real drawCompositionHoverPanel runs.
        //    It draws 1 dot for the panel.
        //    Plus 7 dots for the chart lines (limited to top 7).
        //    Total = 8.

        expect(ctx.arc).toHaveBeenCalledTimes(8);
    });

    test('drawCrosshairOverlay should draw dots for all lines in non-composition charts', () => {
        layout.key = 'performance'; // Not composition
        // For performance/line charts, we generally want dots for ALL series that have data
        // logic in interaction.js: !isBuySellBar && typeof layout.yScale === 'function'

        drawCrosshairOverlay(ctx, layout);

        // 20 series, all valid. Should have 20 dots.
        expect(ctx.arc).toHaveBeenCalledTimes(20);
    });
});
