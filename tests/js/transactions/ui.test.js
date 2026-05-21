import { createUiController } from '@js/transactions/ui.js';
import * as state from '@js/transactions/state.js';
import * as layout from '@js/transactions/layout.js';

jest.mock('@js/transactions/state.js', () => ({
    setChartVisibility: jest.fn(),
    setActiveChart: jest.fn(),
    setChartDateRange: jest.fn(),
    transactionState: {
        activeChart: 'contribution',
    },
}));

jest.mock('@js/transactions/layout.js', () => ({
    adjustMobilePanels: jest.fn(),
}));

describe('ui controller', () => {
    let chartManager;
    let uiController;

    beforeEach(() => {
        chartManager = {
            update: jest.fn(),
            redraw: jest.fn(),
        };

        // Setup DOM
        document.body.innerHTML = `
            <div class="table-responsive-container"></div>
            <div id="runningAmountSection"></div>
            <table id="transactionTable"></table>
            <div class="chart-legend">
                <div class="legend-item" data-series="series1"></div>
                <div class="legend-item" data-series="series2"></div>
                <div class="legend-item"></div> <!-- No data-series -->
            </div>
        `;

        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            cb();
            return 0;
        });

        jest.clearAllMocks();
        uiController = createUiController({ chartManager });
    });

    afterEach(() => {
        window.requestAnimationFrame.mockRestore();
        document.body.innerHTML = '';
    });

    describe('toggleTable', () => {
        it('should hide table and show plot if table is visible', () => {
            const tableContainer = document.querySelector('.table-responsive-container');
            const plotSection = document.getElementById('runningAmountSection');

            // Initial state: table visible, plot hidden
            plotSection.classList.add('is-hidden');

            uiController.toggleTable();

            expect(tableContainer.classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
        });

        it('should show table and hide plot if table is hidden', () => {
            const tableContainer = document.querySelector('.table-responsive-container');
            const plotSection = document.getElementById('runningAmountSection');
            const transactionTable = document.getElementById('transactionTable');

            // Initial state: table hidden, plot visible
            tableContainer.classList.add('is-hidden');

            uiController.toggleTable();

            expect(tableContainer.classList.contains('is-hidden')).toBe(false);
            expect(transactionTable.style.display).toBe('table');
            expect(plotSection.classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
        });

        it('should handle missing elements gracefully', () => {
            document.body.innerHTML = '';
            expect(() => uiController.toggleTable()).not.toThrow();
        });
    });

    describe('togglePlot', () => {
        it('should hide plot and show table if plot is visible', () => {
            const plotSection = document.getElementById('runningAmountSection');
            const tableContainer = document.querySelector('.table-responsive-container');

            // Initial state: plot visible, table hidden
            tableContainer.classList.add('is-hidden');

            uiController.togglePlot();

            expect(state.setActiveChart).toHaveBeenCalledWith('contribution');
            expect(state.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
            expect(chartManager.update).not.toHaveBeenCalled(); // Because it's now hidden
        });

        it('should show plot and hide table if plot is hidden', () => {
            const plotSection = document.getElementById('runningAmountSection');
            const tableContainer = document.querySelector('.table-responsive-container');

            // Initial state: plot hidden, table visible
            plotSection.classList.add('is-hidden');

            uiController.togglePlot();

            expect(state.setActiveChart).toHaveBeenCalledWith('contribution');
            expect(state.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(tableContainer.classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
            expect(chartManager.update).toHaveBeenCalled();
        });

        it('should switch to contribution chart if coming from performance chart and plot is visible', () => {
            state.transactionState.activeChart = 'performance';
            const plotSection = document.getElementById('runningAmountSection');

            uiController.togglePlot();

            expect(state.setActiveChart).toHaveBeenCalledWith('contribution');
            expect(state.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(false); // Remains visible
            expect(chartManager.update).toHaveBeenCalled();
            expect(layout.adjustMobilePanels).not.toHaveBeenCalled(); // Returns early
        });

        it('should do nothing if plot section is missing', () => {
            document.body.innerHTML = '';
            expect(() => uiController.togglePlot()).not.toThrow();
            expect(state.setActiveChart).not.toHaveBeenCalled();
        });
    });

    describe('togglePerformanceChart', () => {
        it('should show performance chart and hide table', () => {
            const plotSection = document.getElementById('runningAmountSection');
            const tableContainer = document.querySelector('.table-responsive-container');

            plotSection.classList.add('is-hidden');

            uiController.togglePerformanceChart();

            expect(state.setActiveChart).toHaveBeenCalledWith('performance');
            expect(state.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(tableContainer.classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
            expect(chartManager.redraw).toHaveBeenCalled();
        });

        it('should do nothing if plot section is missing', () => {
            document.body.innerHTML = '';
            expect(() => uiController.togglePerformanceChart()).not.toThrow();
            expect(state.setActiveChart).toHaveBeenCalledWith('performance');
        });
    });

    describe('initLegendToggles', () => {
        it('should toggle legend item and redraw chart on click', () => {
            const legendItem = document.querySelector('[data-series="series1"]');

            // First click
            legendItem.click();
            expect(legendItem.classList.contains('legend-disabled')).toBe(true);
            expect(state.setChartVisibility).toHaveBeenCalledWith('series1', false);
            expect(chartManager.redraw).toHaveBeenCalledTimes(1);

            // Second click
            legendItem.click();
            expect(legendItem.classList.contains('legend-disabled')).toBe(false);
            expect(state.setChartVisibility).toHaveBeenCalledWith('series1', true);
            expect(chartManager.redraw).toHaveBeenCalledTimes(2);
        });

        it('should ignore legend items without data-series attribute', () => {
            const emptyLegendItem = document.querySelector('.legend-item:not([data-series])');
            emptyLegendItem.click();

            expect(emptyLegendItem.classList.contains('legend-disabled')).toBe(false);
            expect(state.setChartVisibility).not.toHaveBeenCalled();
            expect(chartManager.redraw).not.toHaveBeenCalled();
        });

        it('should not throw if chartManager.redraw is not a function', () => {
             createUiController({ chartManager: {} });
            const legendItem = document.querySelector('[data-series="series1"]');
            expect(() => legendItem.click()).not.toThrow();
        });
    });
});
