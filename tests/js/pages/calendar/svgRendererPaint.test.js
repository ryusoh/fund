import { SvgRenderer } from '@pages/calendar/renderers/SvgRenderer.js';

// The engine's default enter transition animates the svg width/height with an
// elastic ease (~500ms of layout churn). SvgRenderer skips it on the first
// paint so the CSS entrance animation plays against a settled layout, then
// restores the duration so navigation keeps animating.
describe('SvgRenderer.paint first-paint animation', () => {
    let engine;

    beforeEach(() => {
        engine = {
            paint: jest.fn(() => Promise.resolve()),
            options: {
                options: { animationDuration: 500 },
                set: jest.fn(),
            },
        };
        global.CalHeatmap = jest.fn(() => engine);
    });

    it('forces animationDuration 0 on first paint and restores it after', async () => {
        const renderer = new SvgRenderer();
        await renderer.paint({ range: 1 });

        expect(engine.paint).toHaveBeenCalledWith({ range: 1, animationDuration: 0 });
        expect(engine.options.set).toHaveBeenCalledWith('animationDuration', 500);
    });

    it('passes the config through unchanged on later paints', async () => {
        const renderer = new SvgRenderer();
        await renderer.paint({ range: 1 });
        engine.paint.mockClear();

        await renderer.paint({ range: 2 });
        expect(engine.paint).toHaveBeenCalledWith({ range: 2 });
    });

    it('respects an explicit animationDuration on first paint', async () => {
        const renderer = new SvgRenderer();
        await renderer.paint({ range: 1, animationDuration: 250 });

        expect(engine.paint).toHaveBeenCalledWith({ range: 1, animationDuration: 250 });
        expect(engine.options.set).not.toHaveBeenCalled();
    });

    it('tolerates engines without an options API', async () => {
        delete engine.options;
        const renderer = new SvgRenderer();

        await renderer.paint({ range: 1 });
        expect(engine.paint).toHaveBeenCalledWith({ range: 1, animationDuration: 0 });
    });
});
