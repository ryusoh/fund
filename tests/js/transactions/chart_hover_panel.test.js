import { drawCompositionHoverPanel } from '../../../js/transactions/chart/interaction.js';

describe('drawCompositionHoverPanel', () => {
    let ctx;
    let layout;

    beforeEach(() => {
        ctx = {
            save: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            arc: jest.fn(),
            fill: jest.fn(),
            stroke: jest.fn(),
            fillRect: jest.fn(),
            strokeRect: jest.fn(),
            roundRect: jest.fn(),
            measureText: jest.fn().mockReturnValue({ width: 20 }),
            fillText: jest.fn(),
        };

        layout = {
            chartBounds: { left: 0, right: 200, top: 0, bottom: 200 },
        };
    });

    test('returns early when holding is null or undefined', () => {
        expect(() => drawCompositionHoverPanel(ctx, layout, 50, 50, 1000, null)).not.toThrow();
        expect(ctx.save).not.toHaveBeenCalled();
    });

    test('returns early when chartBounds or dateLabel is missing', () => {
        expect(() =>
            drawCompositionHoverPanel(ctx, {}, 50, 50, 1000, { key: 'AAPL' })
        ).not.toThrow();
        expect(ctx.save).not.toHaveBeenCalled();
    });

    test('draws hover panel with desktop layout and complete holding details', () => {
        const holding = {
            key: 'AAPL',
            label: 'Apple Inc.',
            formattedPercent: '15.5%',
            formattedValue: '$1,550.00',
            color: '#10b981',
        };

        drawCompositionHoverPanel(ctx, layout, 50, 50, 1000, holding);

        expect(ctx.save).toHaveBeenCalled();
        expect(ctx.roundRect).toHaveBeenCalled();
        expect(ctx.fillText).toHaveBeenCalledTimes(2);
        expect(ctx.restore).toHaveBeenCalled();
    });

    test('handles fallback when ctx.roundRect is not available', () => {
        ctx.roundRect = undefined;
        const holding = {
            key: 'NVDA',
            formattedPercent: '20%',
            formattedValue: '$2,000',
        };

        drawCompositionHoverPanel(ctx, layout, 150, 150, 1000, holding);

        expect(ctx.fillRect).toHaveBeenCalled();
        expect(ctx.strokeRect).toHaveBeenCalled();
    });

    test('handles numeric percent fallback and absoluteValue fallback', () => {
        const holding = {
            key: 'MSFT',
            percent: 25.5,
            absoluteValue: 2550,
        };

        drawCompositionHoverPanel(ctx, layout, 50, 50, 1000, holding);

        expect(ctx.fillText).toHaveBeenCalledWith(
            expect.stringContaining('25.50%'),
            expect.any(Number),
            expect.any(Number)
        );
    });

    test('handles null percent fallback', () => {
        const holding = {
            key: 'CASH',
            percent: null,
            absoluteValue: null,
        };

        drawCompositionHoverPanel(ctx, layout, 50, 50, 1000, holding);

        expect(ctx.fillText).toHaveBeenCalledWith(
            expect.stringContaining('(0%)'),
            expect.any(Number),
            expect.any(Number)
        );
    });

    test('handles mobile screen widths', () => {
        const originalWidth = window.innerWidth;
        window.innerWidth = 400;
        try {
            const holding = {
                key: 'GOOGL',
                formattedPercent: '10%',
                formattedValue: '$1,000',
            };

            drawCompositionHoverPanel(ctx, layout, 50, 50, 1000, holding);
            expect(ctx.save).toHaveBeenCalled();
        } finally {
            window.innerWidth = originalWidth;
        }
    });
});
