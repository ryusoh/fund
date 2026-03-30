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
        document.body.innerHTML = `
            <div class="table-responsive-container"></div>
            <table id="transactionTable"></table>
            <div id="runningAmountSection"></div>
            <div class="chart-legend">
                <div class="legend-item" data-series="testSeries"></div>
                <div class="legend-item"></div>
            </div>
        `;

        chartManager = {
            update: jest.fn(),
            redraw: jest.fn(),
        };

        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => cb());
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('toggleTable', () => {
        it('should hide table if currently visible', () => {
            const controller = createUiController({ chartManager });
            const tableContainer = document.querySelector('.table-responsive-container');

            controller.toggleTable();

            expect(tableContainer.classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
        });

        it('should show table if currently hidden', () => {
            const controller = createUiController({ chartManager });
            const tableContainer = document.querySelector('.table-responsive-container');
            tableContainer.classList.add('is-hidden');
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
    });

    describe('togglePlot', () => {
        it('should early return if no plot section', () => {
            document.body.innerHTML = '<div class="table-responsive-container"></div>';
            const controller = createUiController({ chartManager });

            controller.togglePlot();

            expect(state.setActiveChart).not.toHaveBeenCalled();
        });

        it('should hide plot if currently visible', () => {
            const controller = createUiController({ chartManager });
            const plotSection = document.getElementById('runningAmountSection');

            controller.togglePlot();

            expect(state.setActiveChart).toHaveBeenCalledWith('contribution');
            expect(state.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
        });

        it('should show plot if currently hidden and hide table', () => {
            const controller = createUiController({ chartManager });
            const plotSection = document.getElementById('runningAmountSection');
            plotSection.classList.add('is-hidden');
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
            const controller = createUiController({ chartManager });
            const plotSection = document.getElementById('runningAmountSection');

            controller.togglePlot();

            expect(state.setActiveChart).toHaveBeenCalledWith('contribution');
            expect(state.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(chartManager.update).toHaveBeenCalled();

            state.transactionState.activeChart = 'contribution'; // reset
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
            const controller = createUiController({ chartManager });
            const plotSection = document.getElementById('runningAmountSection');
            plotSection.classList.add('is-hidden');
            const tableContainer = document.querySelector('.table-responsive-container');

            controller.togglePerformanceChart();

            expect(state.setActiveChart).toHaveBeenCalledWith('performance');
            expect(state.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(tableContainer.classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
            expect(chartManager.redraw).toHaveBeenCalled();
        });
    });

    describe('initLegendToggles', () => {
        it('should add click listeners to legend items with series data', () => {
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
            createUiController({ chartManager });
            const legendItem = document.querySelectorAll('.legend-item')[1];

            legendItem.click();

            expect(state.setChartVisibility).not.toHaveBeenCalled();
            expect(chartManager.redraw).not.toHaveBeenCalled();
        });

        it('should handle chartManager without redraw function', () => {
            const chartManagerNoRedraw = { update: jest.fn() };
            createUiController({ chartManager: chartManagerNoRedraw });
            const legendItem = document.querySelector('.legend-item[data-series="testSeries"]');

            expect(() => legendItem.click()).not.toThrow();
            expect(state.setChartVisibility).toHaveBeenCalledWith('testSeries', false);
        });
    });
});
