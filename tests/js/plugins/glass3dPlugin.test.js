import { glass3dPlugin } from '@plugins/glass3dPlugin.js';

function createMockCtx() {
    const gradient = () => ({ addColorStop: jest.fn() });
    return {
        save: jest.fn(),
        restore: jest.fn(),
        beginPath: jest.fn(),
        closePath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        arc: jest.fn(),
        ellipse: jest.fn(),
        fill: jest.fn(),
        stroke: jest.fn(),
        translate: jest.fn(),
        scale: jest.fn(),
        clip: jest.fn(),
        fillRect: jest.fn(),
        createRadialGradient: jest.fn(gradient),
        createLinearGradient: jest.fn(gradient),
        filter: '',
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0,
        globalCompositeOperation: '',
    };
}

function createArc({ x, y, innerRadius, outerRadius, startAngle, endAngle }) {
    return {
        getProps: jest.fn(() => ({ x, y, innerRadius, outerRadius, startAngle, endAngle })),
    };
}

describe('glass3dPlugin', () => {
    let ctx;
    let chart;
    let arcs;

    beforeEach(() => {
        ctx = createMockCtx();
        arcs = [
            createArc({
                x: 120,
                y: 110,
                innerRadius: 50,
                outerRadius: 95,
                startAngle: 0,
                endAngle: Math.PI / 2,
            }),
            createArc({
                x: 120,
                y: 110,
                innerRadius: 50,
                outerRadius: 95,
                startAngle: Math.PI / 2,
                endAngle: Math.PI,
            }),
        ];
        chart = {
            ctx,
            glassPointerTarget: { x: 0.3, y: -0.2 },
            getDatasetMeta: jest.fn(() => ({ data: arcs })),
            chartArea: { top: 0, bottom: 200, left: 0, right: 200 },
        };
        global.performance = { now: jest.fn(() => 1000) };
        window.pieChartGlassEffect = {
            threeD: {
                depth: { desktop: 18, mobile: 10 },
                reflection: { speed: 0.08, width: 0.25, intensity: 0.3 },
                parallax: { maxOffsetPx: 6, damping: 0.2 },
            },
        };
    });

    it('should render side walls, shadow, and rim highlight without throwing', () => {
        expect(() =>
            glass3dPlugin.beforeDatasetsDraw(chart, { meta: {} }, { sideOpacity: { top: 0.6 } })
        ).not.toThrow();
        expect(ctx.beginPath).toHaveBeenCalled();
        expect(ctx.createLinearGradient).toHaveBeenCalled();
    });

    it('should render highlights and reflections after dataset draw', () => {
        glass3dPlugin.beforeDatasetsDraw(chart, { meta: {} }, {});
        expect(() => glass3dPlugin.afterDatasetsDraw(chart, { meta: {} }, {})).not.toThrow();
        expect(ctx.ellipse).toHaveBeenCalled();
    });

    it('should early-exit when disabled', () => {
        const disabledCtx = createMockCtx();
        const disabledChart = {
            ctx: disabledCtx,
            getDatasetMeta: jest.fn(() => ({ data: arcs })),
        };
        glass3dPlugin.beforeDatasetsDraw(disabledChart, { meta: {} }, { enabled: false });
        expect(disabledCtx.beginPath).not.toHaveBeenCalled();
    });

    it('should handle missing dataset meta gracefully', () => {
        const emptyChart = {
            ctx,
            getDatasetMeta: jest.fn(() => null),
        };
        expect(() => glass3dPlugin.beforeDatasetsDraw(emptyChart, { meta: {} }, {})).not.toThrow();
        expect(() => glass3dPlugin.afterDatasetsDraw(emptyChart, { meta: {} }, {})).not.toThrow();
    });

    it('should handle doughnut inner hole rendering', () => {
        const doughnutChart = {
            ctx,
            getDatasetMeta: jest.fn(() => ({ data: arcs })),
            config: { type: 'doughnut' },
        };
        glass3dPlugin.beforeDatasetsDraw(doughnutChart, { meta: {} }, {});
        expect(() =>
            glass3dPlugin.afterDatasetsDraw(doughnutChart, { meta: {} }, {})
        ).not.toThrow();
        // Additional coverage for drawing hole geometry
        expect(ctx.fill).toHaveBeenCalled();
    });

    it('should render contact-hardening shadow with two passes (sharp + soft)', () => {
        // Track all filter values set during beforeDatasetsDraw
        const filterValues = [];
        let currentFilter = '';
        Object.defineProperty(ctx, 'filter', {
            get() {
                return currentFilter;
            },
            set(v) {
                currentFilter = v;
                if (typeof v === 'string' && v.includes('blur')) {
                    filterValues.push(v);
                }
            },
            configurable: true,
        });
        const origFill = ctx.fill;
        ctx.fill = jest.fn((...args) => origFill(...args));

        glass3dPlugin.beforeDatasetsDraw(chart, { meta: {} }, {});

        // Shadow should produce two blur passes: a sharp contact shadow and a soft ambient shadow
        expect(filterValues.length).toBeGreaterThanOrEqual(2);

        // Extract blur pixel values
        const blurPixels = filterValues.map((f) => {
            const m = f.match(/blur\((\d+(?:\.\d+)?)px\)/);
            return m ? parseFloat(m[1]) : 0;
        });

        // There should be at least one small blur (contact) and one large blur (ambient)
        const minBlur = Math.min(...blurPixels);
        const maxBlur = Math.max(...blurPixels);
        expect(maxBlur).toBeGreaterThan(minBlur);
        expect(minBlur).toBeLessThan(20); // contact shadow should be tight
        expect(maxBlur).toBeGreaterThanOrEqual(20); // ambient shadow should be soft
    });

    it('should apply Beer-Lambert gradient overlay on each arc slice', () => {
        // Track linear gradients created during afterDatasetsDraw
        const gradientsCreated = [];
        const gradientStub = () => {
            const stops = [];
            const g = {
                addColorStop: jest.fn((offset, color) => stops.push({ offset, color })),
                _stops: stops,
            };
            gradientsCreated.push(g);
            return g;
        };
        ctx.createLinearGradient = jest.fn(gradientStub);
        ctx.createRadialGradient = jest.fn(gradientStub);

        // beforeDatasetsDraw must run first to init state
        glass3dPlugin.beforeDatasetsDraw(chart, { meta: {} }, {});

        // Reset tracking after beforeDatasetsDraw
        gradientsCreated.length = 0;
        ctx.createLinearGradient.mockClear();

        glass3dPlugin.afterDatasetsDraw(chart, { meta: {} }, {});

        // Should create at least one linear gradient per arc slice for Beer-Lambert overlay
        // We have 2 arcs, so expect at least 2 linear gradients used for the overlay
        const linearGradientCalls = ctx.createLinearGradient.mock.calls;
        expect(linearGradientCalls.length).toBeGreaterThanOrEqual(2);

        // Each Beer-Lambert gradient should have stops that include both
        // a lighter (white/transparent) and darker (black/transparent) stop
        const beerLambertGradients = gradientsCreated.filter(
            (g) =>
                g._stops.length >= 2 &&
                g._stops.some((s) => s.color.includes('255, 255, 255')) &&
                g._stops.some((s) => s.color.includes('0, 0, 0'))
        );
        expect(beerLambertGradients.length).toBeGreaterThanOrEqual(2);
    });

    it('should render chromatic dispersion with 3 color-channel rim passes', () => {
        // Track radial gradients and their color stops created during beforeDatasetsDraw
        const radialGradients = [];
        ctx.createRadialGradient = jest.fn((...args) => {
            const stops = [];
            const g = {
                addColorStop: jest.fn((offset, color) => stops.push({ offset, color })),
                _stops: stops,
                _args: args,
            };
            radialGradients.push(g);
            return g;
        });

        glass3dPlugin.beforeDatasetsDraw(chart, { meta: {} }, {});

        // Find gradients for each spectral channel:
        // sky-blue (outer), electric blue core, lavender (inner)
        const warmGradients = radialGradients.filter((g) =>
            g._stops.some((s) => /rgba?\(70,\s*205,\s*255/.test(s.color))
        );
        const coreGradients = radialGradients.filter((g) =>
            g._stops.some((s) => /rgba?\(80,\s*185,\s*255/.test(s.color))
        );
        const coolGradients = radialGradients.filter((g) =>
            g._stops.some((s) => /rgba?\(90,\s*140,\s*255/.test(s.color))
        );

        // Each spectral channel should have at least one gradient pass
        expect(warmGradients.length).toBeGreaterThanOrEqual(1);
        expect(coreGradients.length).toBeGreaterThanOrEqual(1);
        expect(coolGradients.length).toBeGreaterThanOrEqual(1);

        // The radii should differ between channels (offset creates dispersion)
        // Compare the outer radius arg (index 5) of the warm vs cool gradient
        const redOuterR = warmGradients[0]._args[5];
        const blueOuterR = coolGradients[0]._args[5];
        expect(redOuterR).not.toBe(blueOuterR);
    });

    it('should parse hex colors correctly for top highlights', () => {
        arcs[0].options = { backgroundColor: '#ff0000' };
        glass3dPlugin.beforeDatasetsDraw(chart, { meta: {} }, {});
        expect(() => glass3dPlugin.afterDatasetsDraw(chart, { meta: {} }, {})).not.toThrow();
    });
});
