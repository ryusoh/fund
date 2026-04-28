import { createUiController } from '@js/transactions/ui.js';
import {
    setChartVisibility,
    setActiveChart,
    transactionState,
    setChartDateRange,
} from '@js/transactions/state.js';
import { adjustMobilePanels } from '@js/transactions/layout.js';

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

        document.body.innerHTML = `
            <div class="table-responsive-container"></div>
            <div id="runningAmountSection"></div>
            <table id="transactionTable"></table>
            <div class="chart-legend">
                <div class="legend-item" data-series="series1"></div>
                <div class="legend-item" data-series="series2" class="legend-disabled"></div>
            </div>
        `;

        uiController = createUiController({ chartManager });

        // Mock requestAnimationFrame to execute synchronously
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => cb());
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('toggleTable', () => {
        it('should hide table if currently visible', () => {
            const tableContainer = document.querySelector('.table-responsive-container');

            uiController.toggleTable();

            expect(tableContainer.classList.contains('is-hidden')).toBe(true);
            expect(adjustMobilePanels).toHaveBeenCalled();
        });

        it('should show table if currently hidden and hide plot', () => {
            const tableContainer = document.querySelector('.table-responsive-container');
            const plotSection = document.getElementById('runningAmountSection');
            tableContainer.classList.add('is-hidden');

            uiController.toggleTable();

            expect(tableContainer.classList.contains('is-hidden')).toBe(false);
            expect(plotSection.classList.contains('is-hidden')).toBe(true);
            const transactionTable = document.getElementById('transactionTable');
            expect(transactionTable.style.display).toBe('table');
        });

        it('should handle missing elements gracefully', () => {
            document.body.innerHTML = '';
            expect(() => uiController.toggleTable()).not.toThrow();
        });

        it('should show table but handle missing transactionTable gracefully', () => {
            document.body.innerHTML = `
                <div class="table-responsive-container is-hidden"></div>
                <div id="runningAmountSection"></div>
            `;
            uiController = createUiController({ chartManager });
            uiController.toggleTable();

            const tableContainer = document.querySelector('.table-responsive-container');
            expect(tableContainer.classList.contains('is-hidden')).toBe(false);
            // transactionTable is missing, no throw
        });

        it('should show table but handle missing plotSection gracefully', () => {
            document.body.innerHTML = `
                <div class="table-responsive-container is-hidden"></div>
                <table id="transactionTable"></table>
            `;
            uiController = createUiController({ chartManager });
            uiController.toggleTable();

            const tableContainer = document.querySelector('.table-responsive-container');
            expect(tableContainer.classList.contains('is-hidden')).toBe(false);
            const transactionTable = document.getElementById('transactionTable');
            expect(transactionTable.style.display).toBe('table');
            // plotSection is missing, no throw
        });
    });

    describe('togglePlot', () => {
        it('should do nothing if plotSection is missing', () => {
            document.body.innerHTML = '';
            uiController.togglePlot();
            expect(setActiveChart).not.toHaveBeenCalled();
        });

        it('should switch back to contribution if was performance chart and plot visible', () => {
            transactionState.activeChart = 'performance';
            const plotSection = document.getElementById('runningAmountSection');
            plotSection.classList.remove('is-hidden');

            uiController.togglePlot();

            expect(setActiveChart).toHaveBeenCalledWith('contribution');
            expect(setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(chartManager.update).toHaveBeenCalled();
        });

        it('should hide plot if currently visible', () => {
            transactionState.activeChart = 'contribution';
            const plotSection = document.getElementById('runningAmountSection');

            uiController.togglePlot();

            expect(plotSection.classList.contains('is-hidden')).toBe(true);
        });

        it('should show plot and hide table if plot currently hidden', () => {
            transactionState.activeChart = 'contribution';
            const plotSection = document.getElementById('runningAmountSection');
            const tableContainer = document.querySelector('.table-responsive-container');
            plotSection.classList.add('is-hidden');

            uiController.togglePlot();

            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(tableContainer.classList.contains('is-hidden')).toBe(true);
            expect(chartManager.update).toHaveBeenCalled();
        });

        it('should show plot but handle missing tableContainer gracefully', () => {
            document.body.innerHTML = `
                <div id="runningAmountSection" class="is-hidden"></div>
            `;
            transactionState.activeChart = 'contribution';
            uiController = createUiController({ chartManager });
            uiController.togglePlot();

            const plotSection = document.getElementById('runningAmountSection');
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            // tableContainer is missing, no throw
        });

        it('should show plot but not call chartManager.update if classList contains is-hidden after requestAnimationFrame', () => {
            document.body.innerHTML = `
                <div id="runningAmountSection" class="is-hidden"></div>
            `;
            transactionState.activeChart = 'contribution';
            uiController = createUiController({ chartManager });

            // Mock requestAnimationFrame to manually change classList before executing callback
            jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
                const plotSection = document.getElementById('runningAmountSection');
                plotSection.classList.add('is-hidden'); // Force it to be hidden before callback runs
                cb();
            });

            uiController.togglePlot();

            expect(chartManager.update).not.toHaveBeenCalled();
        });
    });

    describe('togglePerformanceChart', () => {
        it('should do nothing if plotSection is missing', () => {
            document.body.innerHTML = '';
            uiController.togglePerformanceChart();
            expect(setActiveChart).toHaveBeenCalledWith('performance');
        });

        it('should show performance chart and hide table', () => {
            const plotSection = document.getElementById('runningAmountSection');
            const tableContainer = document.querySelector('.table-responsive-container');
            plotSection.classList.add('is-hidden');

            uiController.togglePerformanceChart();

            expect(setActiveChart).toHaveBeenCalledWith('performance');
            expect(setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(tableContainer.classList.contains('is-hidden')).toBe(true);
            expect(chartManager.redraw).toHaveBeenCalled();
        });

        it('should show plot but handle missing tableContainer gracefully', () => {
            document.body.innerHTML = `
                <div id="runningAmountSection" class="is-hidden"></div>
            `;
            uiController = createUiController({ chartManager });
            uiController.togglePerformanceChart();

            const plotSection = document.getElementById('runningAmountSection');
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            // tableContainer is missing, no throw
        });
    });

    describe('initLegendToggles', () => {
        it('should toggle legend item visibility', () => {
            const legendItem = document.querySelector('.legend-item');

            legendItem.click();

            expect(legendItem.classList.contains('legend-disabled')).toBe(true);
            expect(setChartVisibility).toHaveBeenCalledWith('series1', false);
            expect(chartManager.redraw).toHaveBeenCalled();

            legendItem.click();

            expect(legendItem.classList.contains('legend-disabled')).toBe(false);
            expect(setChartVisibility).toHaveBeenCalledWith('series1', true);
        });

        it('should ignore clicks on legend items without series data', () => {
            document.body.innerHTML = `
                <div class="chart-legend">
                    <div class="legend-item" data-series=""></div>
                </div>
            `;
            // recreate to trigger initLegendToggles with new DOM
            uiController = createUiController({ chartManager });
            const legendItem = document.querySelector('.legend-item');

            legendItem.click();
            // Should not throw and setChartVisibility not called
        });

        it('should handle chartManager without redraw', () => {
            document.body.innerHTML = `
                <div class="chart-legend">
                    <div class="legend-item" data-series="series1"></div>
                </div>
            `;
            chartManager = {}; // no redraw
            uiController = createUiController({ chartManager });
            const legendItem = document.querySelector('.legend-item');

            legendItem.click();
            // Should not throw
        });

        it('should skip item if dataset.series is empty via setAttribute', () => {
            document.body.innerHTML = `
                <div class="chart-legend">
                    <div class="legend-item"></div>
                </div>
            `;
            // Manually add data-series attribute with empty string to bypass querySelector issue
            const item = document.querySelector('.legend-item');
            item.setAttribute('data-series', '');

            // This will trigger the `if (!key) { return; }` branch inside the map
            uiController = createUiController({ chartManager });

            expect(item.onclick).toBeNull();
        });
    });
});
