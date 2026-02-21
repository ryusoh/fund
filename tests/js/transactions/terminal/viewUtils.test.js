import { isActiveChartVisible } from '../../../../js/transactions/terminal/viewUtils.js';
import { transactionState } from '../../../../js/transactions/state.js';

describe('viewUtils - isActiveChartVisible', () => {
    beforeEach(() => {
        // Reset state
        transactionState.activeChart = null;

        // Mock document structure
        document.body.innerHTML = `
            <div id="runningAmountSection" class="is-hidden"></div>
            <div class="table-responsive-container"></div>
        `;
    });

    it('returns false when activeChart is null', () => {
        transactionState.activeChart = null;
        expect(isActiveChartVisible()).toBe(false);
    });

    it('returns false when activeChart is not a valid chart type', () => {
        transactionState.activeChart = 'invalidChartType';
        expect(isActiveChartVisible()).toBe(false);
    });

    it('returns false when plotSection has is-hidden class', () => {
        transactionState.activeChart = 'yield';
        const plotSection = document.getElementById('runningAmountSection');
        plotSection.classList.add('is-hidden');

        expect(isActiveChartVisible()).toBe(false);
    });

    it('returns true for valid chart types when plotSection is visible', () => {
        const plotSection = document.getElementById('runningAmountSection');
        plotSection.classList.remove('is-hidden');

        const validCharts = [
            'contribution',
            'performance',
            'composition',
            'compositionAbs',
            'sectors',
            'sectorsAbs',
            'concentration',
            'pe',
            'fx',
            'drawdown',
            'drawdownAbs',
            'rolling',
            'volatility',
            'yield',
            'beta',
        ];

        validCharts.forEach((chartType) => {
            transactionState.activeChart = chartType;
            expect(isActiveChartVisible()).toBe(true);
        });
    });
});
