describe('updateLegend memoization', () => {
    beforeEach(() => {
        jest.resetModules();
        document.body.innerHTML = '<div class="chart-legend"></div>';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    async function setup() {
        const stateModule = await import('../../../../js/transactions/state.js');
        const interactionModule = await import('../../../../js/transactions/chart/interaction.js');
        stateModule.transactionState.activeChart = 'composition';
        stateModule.transactionState.chartVisibility = {};
        return {
            transactionState: stateModule.transactionState,
            updateLegend: interactionModule.updateLegend,
        };
    }

    it('skips the DOM rebuild when series and visibility are unchanged', async () => {
        const { updateLegend } = await setup();
        const series = [{ key: 'AAPL', name: 'AAPL', color: '#ffffff' }];
        const chartManager = { redraw: jest.fn() };

        updateLegend(series, chartManager);
        const firstItem = document.querySelector('.legend-item');
        expect(firstItem).not.toBeNull();

        updateLegend(series, chartManager);
        expect(document.querySelector('.legend-item')).toBe(firstItem);
    });

    it('rebuilds when a series visibility flag changes', async () => {
        const { transactionState, updateLegend } = await setup();
        const series = [{ key: 'AAPL', name: 'AAPL', color: '#ffffff' }];
        const chartManager = { redraw: jest.fn() };

        updateLegend(series, chartManager);
        const firstItem = document.querySelector('.legend-item');

        transactionState.chartVisibility = { AAPL: false };
        updateLegend(series, chartManager);

        const rebuiltItem = document.querySelector('.legend-item');
        expect(rebuiltItem).not.toBe(firstItem);
        expect(rebuiltItem.classList.contains('legend-disabled')).toBe(true);
    });

    it('rebuilds when the legend container was cleared externally', async () => {
        const { updateLegend } = await setup();
        const series = [{ key: 'AAPL', name: 'AAPL', color: '#ffffff' }];
        const chartManager = { redraw: jest.fn() };

        updateLegend(series, chartManager);
        document.querySelector('.chart-legend').replaceChildren();

        updateLegend(series, chartManager);
        expect(document.querySelector('.legend-item')).not.toBeNull();
    });
});
