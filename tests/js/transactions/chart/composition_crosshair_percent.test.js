import {
    drawCrosshairOverlay,
    crosshairState,
    setCrosshairExternalUpdate,
} from '../../../../js/transactions/chart/interaction.js';

jest.mock('../../../../js/transactions/utils.js', () => ({
    formatCurrencyInline: jest.fn((val) => `$${Number(val || 0).toFixed(2)}`),
    convertValueToCurrency: jest.fn((val) => val),
}));

// Minimal 2D context stub covering every method touched while drawing the
// composition crosshair overlay + hover panel.
function createCtxStub() {
    return {
        canvas: { offsetWidth: 300, offsetHeight: 200 },
        save() {},
        restore() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        fill() {},
        fillRect() {},
        strokeRect() {},
        setLineDash() {},
        arc() {},
        roundRect() {},
        measureText: () => ({ width: 10 }),
        fillText() {},
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: '',
        textBaseline: '',
    };
}

function buildAbsoluteCompositionLayout() {
    const dates = ['2021-01-01', '2021-06-01', '2021-12-01'];
    const dateTimes = dates.map((d) => new Date(d).getTime());
    const minTime = dateTimes[0];
    const maxTime = dateTimes[dateTimes.length - 1];

    // Percentages per ticker, parallel to `dates`.
    const percentSeriesMap = {
        AAPL: [60, 55, 50],
        MSFT: [40, 45, 50],
    };
    const totalValue = 1000;

    const makeSeries = (key) => ({
        key,
        label: key,
        color: '#abcdef',
        // In absolute mode getValueAtTime returns the converted currency value.
        getValueAtTime: (time) => {
            const idx = dateTimes.indexOf(time);
            const pct = idx >= 0 ? percentSeriesMap[key][idx] : percentSeriesMap[key][1];
            return (totalValue * pct) / 100;
        },
        formatValue: (value) => `$${value.toFixed(2)}`,
    });

    return {
        key: 'compositionAbs',
        valueMode: 'absolute',
        valueType: 'currency',
        currency: 'USD',
        minTime,
        maxTime,
        stackMaxValue: totalValue,
        chartBounds: { top: 0, bottom: 200, left: 0, right: 300 },
        xScale: () => 150,
        yScale: (value) => 200 - (value / totalValue) * 200,
        series: [makeSeries('AAPL'), makeSeries('MSFT')],
        percentSeriesMap,
        getTotalValueAtTime: () => totalValue,
    };
}

describe('Composition absolute-mode crosshair percentages', () => {
    let captured;

    beforeEach(() => {
        captured = null;
        setCrosshairExternalUpdate((snapshot) => {
            captured = snapshot;
        });
        crosshairState.active = true;
        crosshairState.rangeStart = null;
        crosshairState.rangeEnd = null;
        crosshairState.hoverY = 100;
    });

    afterEach(() => {
        setCrosshairExternalUpdate(null);
        crosshairState.active = false;
        crosshairState.hoverTime = null;
        crosshairState.hoverY = null;
    });

    it('reports the real percentage at the hover time (not 0%) when abs values are non-zero', () => {
        const layout = buildAbsoluteCompositionLayout();
        // Hover exactly on the middle date: AAPL = 55%, MSFT = 45%.
        crosshairState.hoverTime = new Date('2021-06-01').getTime();

        drawCrosshairOverlay(createCtxStub(), layout);

        expect(captured).not.toBeNull();
        const aapl = captured.series.find((s) => s.key === 'AAPL');
        expect(aapl).toBeDefined();

        // Abs value is correct...
        expect(aapl.absoluteValue).toBeCloseTo(550, 5);
        // ...but the percent must reflect the holding's real allocation, not 0.
        expect(aapl.percent).toBeCloseTo(55, 5);
        expect(aapl.formattedPercent).toBe('55.00%');
    });

    it('interpolates the percentage from layout.dates for an off-date hover', () => {
        const layout = buildAbsoluteCompositionLayout();
        // Provide the `dates` the real renderer now attaches to the layout.
        layout.dates = ['2021-01-01', '2021-06-01', '2021-12-01'];

        // Hover halfway between date[0] (AAPL 60%) and date[1] (AAPL 55%).
        const t0 = new Date('2021-01-01').getTime();
        const t1 = new Date('2021-06-01').getTime();
        crosshairState.hoverTime = t0 + (t1 - t0) / 2;

        drawCrosshairOverlay(createCtxStub(), layout);

        const aapl = captured.series.find((s) => s.key === 'AAPL');
        expect(aapl.percent).toBeCloseTo(57.5, 5);
    });
});
