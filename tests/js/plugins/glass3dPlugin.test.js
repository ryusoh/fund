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

    it('should render a caustic light ring inside the shadow boundary', () => {
        // Count how many blur filter passes drawShadow produces (contact + ambient + caustic)
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

        // Track radial gradients to find the caustic one
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

        // Should have 3 blur passes: contact shadow, ambient shadow, caustic ring
        expect(filterValues.length).toBeGreaterThanOrEqual(3);

        // The caustic gradient should use a bright color (not pure black)
        // with a ring shape: transparent center, bright band, transparent outer
        const causticGradients = radialGradients.filter((g) => {
            const hasBrightStop = g._stops.some(
                (s) =>
                    s.offset > 0.2 &&
                    s.offset < 0.95 &&
                    /rgba?\(\d+,\s*\d+,\s*255/.test(s.color) &&
                    !s.color.endsWith(', 0)')
            );
            // Must also have a transparent inner region (ring, not filled disc)
            const hasHollowCenter = g._stops.some(
                (s) => s.offset <= 0.5 && s.color.includes(', 0)')
            );
            return hasBrightStop && hasHollowCenter;
        });

        expect(causticGradients.length).toBeGreaterThanOrEqual(1);
    });

    it('should apply Fresnel angle-dependent highlight per arc segment', () => {
        // Track globalAlpha values set during afterDatasetsDraw
        const alphaValues = [];
        let currentAlpha = 1;
        Object.defineProperty(ctx, 'globalAlpha', {
            get() {
                return currentAlpha;
            },
            set(v) {
                currentAlpha = v;
                if (v > 0 && v < 1) {
                    alphaValues.push(v);
                }
            },
            configurable: true,
        });

        glass3dPlugin.beforeDatasetsDraw(chart, { meta: {} }, {});
        alphaValues.length = 0;

        glass3dPlugin.afterDatasetsDraw(chart, { meta: {} }, {});

        // Fresnel highlight should set different alpha values for different arcs
        // (at least 2 arcs in our test setup, each getting a unique Fresnel reflectance)
        expect(alphaValues.length).toBeGreaterThanOrEqual(2);

        // The alpha values should NOT all be the same — Fresnel varies by angle
        const unique = new Set(alphaValues.map((v) => v.toFixed(4)));
        expect(unique.size).toBeGreaterThan(1);
    });

    it('should apply atmospheric back-edge fade on the doughnut face', () => {
        // Track linear gradients created during afterDatasetsDraw
        const linearGradients = [];
        ctx.createLinearGradient = jest.fn((...args) => {
            const stops = [];
            const g = {
                addColorStop: jest.fn((offset, color) => stops.push({ offset, color })),
                _stops: stops,
                _args: args,
            };
            linearGradients.push(g);
            return g;
        });

        glass3dPlugin.beforeDatasetsDraw(chart, { meta: {} }, {});
        linearGradients.length = 0;
        ctx.createLinearGradient.mockClear();

        glass3dPlugin.afterDatasetsDraw(chart, { meta: {} }, {});

        // Find a top-to-bottom gradient where y1 < y2 (top to bottom),
        // with a transparent top and dark bottom stop
        const atmosphericGradients = linearGradients.filter((g) => {
            const [, y1, , y2] = g._args;
            if (y2 <= y1) {
                return false;
            }
            const hasTransparentTop = g._stops.some(
                (s) => s.offset <= 0.1 && s.color.includes('0)')
            );
            const hasDarkBottom = g._stops.some(
                (s) =>
                    s.offset >= 0.8 && /rgba?\(0,\s*0,\s*0/.test(s.color) && !s.color.includes('0)')
            );
            return hasTransparentTop && hasDarkBottom;
        });

        expect(atmosphericGradients.length).toBeGreaterThanOrEqual(1);

        // Should clip to the donut ring (clip() must be called)
        expect(ctx.clip).toHaveBeenCalled();
    });

    it('should render electric trails with alpha taper (fade-in/out)', () => {
        // Track globalAlpha values and lineWidth values during afterDatasetsDraw
        const alphaValues = [];
        const lineWidths = [];
        let currentAlpha = 1;
        Object.defineProperty(ctx, 'globalAlpha', {
            get() {
                return currentAlpha;
            },
            set(v) {
                currentAlpha = v;
                if (v > 0 && v < 1) {
                    alphaValues.push(v);
                }
            },
            configurable: true,
        });
        let currentLineWidth = 0;
        Object.defineProperty(ctx, 'lineWidth', {
            get() {
                return currentLineWidth;
            },
            set(v) {
                currentLineWidth = v;
                if (v > 0) {
                    lineWidths.push(v);
                }
            },
            configurable: true,
        });

        glass3dPlugin.beforeDatasetsDraw(chart, { meta: {} }, {});
        alphaValues.length = 0;
        lineWidths.length = 0;

        glass3dPlugin.afterDatasetsDraw(chart, { meta: {} }, {});

        // Sub-segments should produce many varying alpha values (fade-in/out)
        // 3 arcs × 16 segments = 48 alpha sets, plus Fresnel adds more
        expect(alphaValues.length).toBeGreaterThanOrEqual(20);

        // Alpha values should vary (not all the same) — confirming taper
        const uniqueAlphas = new Set(alphaValues.map((v) => v.toFixed(3)));
        expect(uniqueAlphas.size).toBeGreaterThan(3);

        // Line widths should also vary (thickness taper)
        const uniqueWidths = new Set(lineWidths.map((v) => v.toFixed(3)));
        expect(uniqueWidths.size).toBeGreaterThan(3);
    });

    it('should modulate electric trail brightness by Fresnel grazing angle', () => {
        // Fresnel predicts glancing angles reflect more light → brighter trail segments
        // We capture shadowBlur as a proxy for Fresnel boost (it scales with the effect)
        const shadowBlurs = [];
        let currentShadowBlur = 0;
        Object.defineProperty(ctx, 'shadowBlur', {
            get() {
                return currentShadowBlur;
            },
            set(v) {
                currentShadowBlur = v;
                if (v > 0) {
                    shadowBlurs.push(v);
                }
            },
            configurable: true,
        });

        glass3dPlugin.beforeDatasetsDraw(chart, { meta: {} }, {});
        shadowBlurs.length = 0;

        glass3dPlugin.afterDatasetsDraw(chart, { meta: {} }, {});

        // Trail segments should produce varying shadowBlur values because Fresnel
        // modulates brightness based on the segment's angular position on the torus
        expect(shadowBlurs.length).toBeGreaterThanOrEqual(10);
        const uniqueBlurs = new Set(shadowBlurs.map((v) => v.toFixed(2)));
        expect(uniqueBlurs.size).toBeGreaterThan(3);
    });

    it('should parse hex colors correctly for top highlights', () => {
        arcs[0].options = { backgroundColor: '#ff0000' };
        glass3dPlugin.beforeDatasetsDraw(chart, { meta: {} }, {});
        expect(() => glass3dPlugin.afterDatasetsDraw(chart, { meta: {} }, {})).not.toThrow();
    });

    it('should render reflection with Gaussian beam passes and Fresnel blue tint', () => {
        // Track alpha values during afterDatasetsDraw (where drawReflection lives)
        const alphaValues = [];
        let currentAlpha = 1;
        Object.defineProperty(ctx, 'globalAlpha', {
            get() {
                return currentAlpha;
            },
            set(v) {
                currentAlpha = v;
                alphaValues.push(v);
            },
            configurable: true,
        });

        // Track gradients to find blue-tinted Fresnel pass
        const linearGradients = [];
        ctx.createLinearGradient = jest.fn((...args) => {
            const stops = [];
            const g = {
                addColorStop: jest.fn((offset, color) => stops.push({ offset, color })),
                _stops: stops,
                _args: args,
            };
            linearGradients.push(g);
            return g;
        });

        // beforeDatasetsDraw must run first to init state
        glass3dPlugin.beforeDatasetsDraw(chart, { meta: {} }, {});

        // Reset tracking before afterDatasetsDraw
        alphaValues.length = 0;
        linearGradients.length = 0;
        ctx.stroke = jest.fn();

        glass3dPlugin.afterDatasetsDraw(chart, { meta: {} }, {});

        // Gaussian beam structure: bloom + core + Fresnel edge = 3 stroke passes
        expect(ctx.stroke.mock.calls.length).toBeGreaterThanOrEqual(3);

        // Each pass has a different alpha (bloom dimmer, core brighter, Fresnel mid)
        const subUnitAlphas = alphaValues.filter((v) => v > 0 && v < 1);
        const uniqueAlphas = new Set(subUnitAlphas.map((v) => v.toFixed(3)));
        expect(uniqueAlphas.size).toBeGreaterThanOrEqual(2);

        // Fresnel edge pass should produce a gradient with blue > red (blue-shifted)
        const blueTintedGradients = linearGradients.filter((g) =>
            g._stops.some((s) => {
                const m = s.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                return m && parseInt(m[3]) > parseInt(m[1]);
            })
        );
        expect(blueTintedGradients.length).toBeGreaterThanOrEqual(1);
    });
});
