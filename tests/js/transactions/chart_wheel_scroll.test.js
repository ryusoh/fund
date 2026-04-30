describe('Chart wheel scroll prevention', () => {
    beforeEach(() => {
        jest.resetModules();
        document.body.innerHTML = `
            <section class="chart-card">
                <div class="chart-container">
                    <canvas id="runningAmountCanvas"></canvas>
                </div>
            </section>
        `;
    });

    test('wheel events on .chart-card have preventDefault called', () => {
        const { attachCrosshairEvents } = require('../../../js/transactions/chart/interaction.js');
        const canvas = document.getElementById('runningAmountCanvas');
        const card = canvas.closest('.chart-card');

        attachCrosshairEvents(canvas, { redraw: jest.fn() });

        const event = new Event('wheel', { bubbles: true, cancelable: true });
        card.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
    });

    test('wheel events bubbling from canvas are prevented at .chart-card', () => {
        const { attachCrosshairEvents } = require('../../../js/transactions/chart/interaction.js');
        const canvas = document.getElementById('runningAmountCanvas');

        attachCrosshairEvents(canvas, { redraw: jest.fn() });

        const event = new Event('wheel', { bubbles: true, cancelable: true });
        canvas.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
    });
});
