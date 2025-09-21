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
});
