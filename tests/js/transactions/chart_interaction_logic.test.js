import {
    drawCrosshairOverlay,
    crosshairState,
    findHoveredHolding,
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
            stackMaxValue: 100,
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

describe('findHoveredHolding', () => {
    // Layout: chartBounds top=0, bottom=100, so plotHeight=100
    // stackMaxValue=100 (percent mode)
    // Three stacked tickers in series order:
    //   A = 30%  -> band [0, 30]   -> pixel Y [100, 70]
    //   B = 50%  -> band [30, 80]  -> pixel Y [70, 20]
    //   C = 20%  -> band [80, 100] -> pixel Y [20, 0]
    let layout;
    let holdingA;
    let holdingB;
    let holdingC;

    beforeEach(() => {
        holdingA = { key: 'A', label: 'A', value: 30, color: '#f00' };
        holdingB = { key: 'B', label: 'B', value: 50, color: '#0f0' };
        holdingC = { key: 'C', label: 'C', value: 20, color: '#00f' };

        layout = {
            key: 'composition',
            chartBounds: { left: 0, right: 200, top: 0, bottom: 100 },
            stackMaxValue: 100,
            series: [
                { key: 'A', getValueAtTime: () => 30 },
                { key: 'B', getValueAtTime: () => 50 },
                { key: 'C', getValueAtTime: () => 20 },
            ],
        };
    });

    test('returns holding under cursor when hovering in middle band (B)', () => {
        // Band B occupies values [30, 80], which maps to pixel Y [70, 20]
        // hoverY=50 -> invertedValue = ((100-50)/100)*100 = 50, inside [30,80] = B
        const result = findHoveredHolding(layout, 500, 50, [holdingB, holdingA, holdingC]);
        expect(result.key).toBe('B');
    });

    test('returns holding under cursor when hovering in bottom band (A)', () => {
        // Band A occupies values [0, 30], which maps to pixel Y [100, 70]
        // hoverY=85 -> invertedValue = ((100-85)/100)*100 = 15, inside [0,30] = A
        const result = findHoveredHolding(layout, 500, 85, [holdingB, holdingA, holdingC]);
        expect(result.key).toBe('A');
    });

    test('returns holding under cursor when hovering in top band (C)', () => {
        // Band C occupies values [80, 100], which maps to pixel Y [20, 0]
        // hoverY=10 -> invertedValue = ((100-10)/100)*100 = 90, inside [80,100] = C
        const result = findHoveredHolding(layout, 500, 10, [holdingB, holdingA, holdingC]);
        expect(result.key).toBe('C');
    });

    test('returns first holding as fallback for invalid hoverY', () => {
        const result = findHoveredHolding(layout, 500, NaN, [holdingB, holdingA, holdingC]);
        expect(result.key).toBe('B');
    });

    test('returns null when holdings array is empty', () => {
        const result = findHoveredHolding(layout, 500, 50, []);
        expect(result).toBeNull();
    });

    test('returns first holding when layout has no series', () => {
        layout.series = null;
        const result = findHoveredHolding(layout, 500, 50, [holdingA]);
        expect(result.key).toBe('A');
    });

    test('returns first holding when hoverY is at exact band boundary', () => {
        // hoverY=70 -> invertedValue = ((100-70)/100)*100 = 30
        // 30 is both the top of A's band [0,30] and the bottom of B's band [30,80]
        // Since we check >= bandBottom && <= bandTop, A's band [0,30] matches first
        const result = findHoveredHolding(layout, 500, 70, [holdingB, holdingA, holdingC]);
        expect(result.key).toBe('A');
    });

    test('returns non-top-7 holding when cursor lands on its band', () => {
        // Simulate 10 stacked tickers each at 10%
        // Holdings passed include all 10 (as allEnhancedHoldings would)
        const allHoldings = [];
        const allSeries = [];
        for (let i = 0; i < 10; i++) {
            const key = `T${i}`;
            allHoldings.push({ key, label: key, value: 10, color: `#${i}${i}${i}` });
            allSeries.push({ key, getValueAtTime: () => 10 });
        }
        layout.series = allSeries;
        // T0 band: [0, 10], pixel Y [100, 90]
        // hoverY=95 -> invertedValue = ((100-95)/100)*100 = 5, inside [0,10] = T0
        const result = findHoveredHolding(layout, 500, 95, allHoldings);
        expect(result.key).toBe('T0');
    });
});
