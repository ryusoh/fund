import { jest } from '@jest/globals';
import { createUiController } from '../../../js/transactions/ui.js';
import * as state from '../../../js/transactions/state.js';
import * as layout from '../../../js/transactions/layout.js';

jest.mock('../../../js/transactions/state.js', () => ({
    setChartVisibility: jest.fn(),
    setActiveChart: jest.fn(),
    transactionState: {
        activeChart: 'contribution',
    },
    setChartDateRange: jest.fn(),
}));

jest.mock('../../../js/transactions/layout.js', () => ({
    adjustMobilePanels: jest.fn(),
}));

describe('ui controller', () => {
    let chartManager;

    beforeEach(() => {
        jest.clearAllMocks();
        chartManager = {
            update: jest.fn(),
            redraw: jest.fn(),
        };
        document.body.innerHTML = '';
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => cb());
    });

    afterEach(() => {
        window.requestAnimationFrame.mockRestore();
    });

    describe('toggleTable', () => {
        it('should hide table if currently visible', () => {
            document.body.innerHTML = `
                <div class="table-responsive-container"></div>
                <div id="runningAmountSection"></div>
            `;
            const controller = createUiController({ chartManager });
            const tableContainer = document.querySelector('.table-responsive-container');

            controller.toggleTable();

            expect(tableContainer.classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
        });

        it('should show table if currently hidden', () => {
            document.body.innerHTML = `
                <div class="table-responsive-container is-hidden"></div>
                <div id="runningAmountSection"></div>
                <table id="transactionTable"></table>
            `;
            const controller = createUiController({ chartManager });
            const tableContainer = document.querySelector('.table-responsive-container');
            const plotSection = document.getElementById('runningAmountSection');
            const transactionTable = document.getElementById('transactionTable');

            controller.toggleTable();

            expect(tableContainer.classList.contains('is-hidden')).toBe(false);
            expect(transactionTable.style.display).toBe('table');
            expect(plotSection.classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
        });

        it('should handle missing table safely', () => {
            document.body.innerHTML = '<div id="runningAmountSection"></div>';
            const controller = createUiController({ chartManager });

            expect(() => controller.toggleTable()).not.toThrow();
        });

        it('should handle missing plotSection safely when showing table', () => {
            document.body.innerHTML = `
                <div class="table-responsive-container is-hidden"></div>
                <table id="transactionTable"></table>
            `;
            const controller = createUiController({ chartManager });
            expect(() => controller.toggleTable()).not.toThrow();
        });

        it('should handle missing transactionTable safely', () => {
            document.body.innerHTML = `
                <div class="table-responsive-container is-hidden"></div>
                <div id="runningAmountSection"></div>
            `;
            const controller = createUiController({ chartManager });
            expect(() => controller.toggleTable()).not.toThrow();
        });
    });

    describe('togglePlot', () => {
        it('should early return if no plot section', () => {
            document.body.innerHTML = '<div class="table-responsive-container"></div>';
            const controller = createUiController({ chartManager });

            controller.togglePlot();

            expect(state.setActiveChart).not.toHaveBeenCalled();
        });

        it('should hide plot if currently visible', () => {
            document.body.innerHTML = `
                <div id="runningAmountSection"></div>
            `;
            const controller = createUiController({ chartManager });
            const plotSection = document.getElementById('runningAmountSection');

            controller.togglePlot();

            expect(state.setActiveChart).toHaveBeenCalledWith('contribution');
            expect(state.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
        });

        it('should show plot if currently hidden and hide table', () => {
            document.body.innerHTML = `
                <div id="runningAmountSection" class="is-hidden"></div>
                <div class="table-responsive-container"></div>
            `;
            const controller = createUiController({ chartManager });
            const plotSection = document.getElementById('runningAmountSection');
            const tableContainer = document.querySelector('.table-responsive-container');

            controller.togglePlot();

            expect(state.setActiveChart).toHaveBeenCalledWith('contribution');
            expect(state.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(tableContainer.classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
            expect(chartManager.update).toHaveBeenCalled();
        });

        it('should switch to contribution without hiding if performance was active', () => {
            state.transactionState.activeChart = 'performance';
            document.body.innerHTML = `
                <div id="runningAmountSection"></div>
            `;
            const controller = createUiController({ chartManager });
            const plotSection = document.getElementById('runningAmountSection');

            controller.togglePlot();

            expect(state.setActiveChart).toHaveBeenCalledWith('contribution');
            expect(state.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(chartManager.update).toHaveBeenCalled();

            state.transactionState.activeChart = 'contribution'; // reset
        });

        it('should handle missing tableContainer safely when showing plot', () => {
            document.body.innerHTML = `
                <div id="runningAmountSection" class="is-hidden"></div>
            `;
            const controller = createUiController({ chartManager });
            controller.togglePlot();
            const plotSection = document.getElementById('runningAmountSection');
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(chartManager.update).toHaveBeenCalled();
        });

        it('should hide plot section correctly and adjust panels when currently visible without switching from performance chart', () => {
            document.body.innerHTML = `
                <div id="runningAmountSection"></div>
            `;
            const controller = createUiController({ chartManager });
            const plotSection = document.getElementById('runningAmountSection');
            controller.togglePlot();
            expect(plotSection.classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
        });
    });

    describe('togglePerformanceChart', () => {
        it('should early return if no plot section', () => {
            document.body.innerHTML = '<div class="table-responsive-container"></div>';
            const controller = createUiController({ chartManager });

            controller.togglePerformanceChart();

            expect(state.setActiveChart).toHaveBeenCalledWith('performance');
            expect(layout.adjustMobilePanels).not.toHaveBeenCalled();
        });

        it('should show plot and hide table', () => {
            document.body.innerHTML = `
                <div id="runningAmountSection" class="is-hidden"></div>
                <div class="table-responsive-container"></div>
            `;
            const controller = createUiController({ chartManager });
            const plotSection = document.getElementById('runningAmountSection');
            const tableContainer = document.querySelector('.table-responsive-container');

            controller.togglePerformanceChart();

            expect(state.setActiveChart).toHaveBeenCalledWith('performance');
            expect(state.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(tableContainer.classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
            expect(chartManager.redraw).toHaveBeenCalled();
        });

        it('should handle missing table safely when showing performance chart', () => {
            document.body.innerHTML = `
                <div id="runningAmountSection" class="is-hidden"></div>
            `;
            const controller = createUiController({ chartManager });
            controller.togglePerformanceChart();
            const plotSection = document.getElementById('runningAmountSection');
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
        });

        it('should call adjustMobilePanels and chartManager.redraw inside requestAnimationFrame', () => {
            document.body.innerHTML = `
                <div id="runningAmountSection" class="is-hidden"></div>
            `;
            const controller = createUiController({ chartManager });

            controller.togglePerformanceChart();

            expect(layout.adjustMobilePanels).toHaveBeenCalled();
            expect(chartManager.redraw).toHaveBeenCalled();
        });
    });

    describe('initLegendToggles', () => {
        it('should add click listeners to legend items with series data', () => {
            document.body.innerHTML = `
                <div class="chart-legend">
                    <div class="legend-item" data-series="testSeries"></div>
                </div>
            `;
            createUiController({ chartManager });
            const legendItem = document.querySelector('.legend-item[data-series="testSeries"]');

            legendItem.click();

            expect(legendItem.classList.contains('legend-disabled')).toBe(true);
            expect(state.setChartVisibility).toHaveBeenCalledWith('testSeries', false);
            expect(chartManager.redraw).toHaveBeenCalled();

            legendItem.click();

            expect(legendItem.classList.contains('legend-disabled')).toBe(false);
            expect(state.setChartVisibility).toHaveBeenCalledWith('testSeries', true);
            expect(chartManager.redraw).toHaveBeenCalledTimes(2);
        });

        it('should ignore legend items without series data', () => {
            document.body.innerHTML = `
                <div class="chart-legend">
                    <div class="legend-item" data-series="testSeries"></div>
                    <div class="legend-item"></div>
                </div>
            `;
            createUiController({ chartManager });
            const legendItem = document.querySelectorAll('.legend-item')[1];

            legendItem.click();

            expect(state.setChartVisibility).not.toHaveBeenCalled();
            expect(chartManager.redraw).not.toHaveBeenCalled();
        });

        it('should handle chartManager without redraw function', () => {
            document.body.innerHTML = `
                <div class="chart-legend">
                    <div class="legend-item" data-series="testSeries"></div>
                </div>
            `;
            const chartManagerNoRedraw = { update: jest.fn() };
            createUiController({ chartManager: chartManagerNoRedraw });
            const legendItem = document.querySelector('.legend-item[data-series="testSeries"]');

            expect(() => legendItem.click()).not.toThrow();
            expect(state.setChartVisibility).toHaveBeenCalledWith('testSeries', false);
        });

        it('should handle legend item with empty dataset.series string', () => {
            document.body.innerHTML = `
                <div class="chart-legend">
                    <div class="legend-item" data-series=""></div>
                </div>
            `;
            const chartManagerNoRedraw = { update: jest.fn() };
            createUiController({ chartManager: chartManagerNoRedraw });
            const legendItem = document.querySelector('.legend-item');

            legendItem.click();
            expect(state.setChartVisibility).not.toHaveBeenCalled();
        });
    });
});
