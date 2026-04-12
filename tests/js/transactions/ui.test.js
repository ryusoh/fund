import { jest } from '@jest/globals';
import { createUiController } from '../../../js/transactions/ui.js';
import * as state from '../../../js/transactions/state.js';
import * as layout from '../../../js/transactions/layout.js';

jest.mock('../../../js/transactions/state.js', () => ({
    setChartVisibility: jest.fn(),
    setActiveChart: jest.fn(),
    setChartDateRange: jest.fn(),
    transactionState: { activeChart: 'contribution' },
}));

jest.mock('../../../js/transactions/layout.js', () => ({
    adjustMobilePanels: jest.fn(),
}));

describe('ui controller', () => {
    let chartManager;

    beforeEach(() => {
        chartManager = {
            update: jest.fn(),
            redraw: jest.fn(),
        };
        document.body.innerHTML = '';
        jest.clearAllMocks();
        global.requestAnimationFrame = jest.fn((cb) => cb());
    });

    afterEach(() => {
        if (global.requestAnimationFrame.mockRestore) {
            global.requestAnimationFrame.mockRestore();
        }
    });

    describe('toggleTable', () => {
        it('toggles table from visible to hidden', () => {
            document.body.innerHTML = `
                <div class="table-responsive-container"></div>
                <div id="runningAmountSection"></div>
                <table id="transactionTable"></table>
            `;
            const controller = createUiController({ chartManager });
            controller.toggleTable();

            const tableContainer = document.querySelector('.table-responsive-container');
            expect(tableContainer.classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
        });

        it('toggles table from hidden to visible', () => {
            document.body.innerHTML = `
                <div class="table-responsive-container is-hidden"></div>
                <div id="runningAmountSection"></div>
                <table id="transactionTable"></table>
            `;
            const controller = createUiController({ chartManager });
            controller.toggleTable();

            const tableContainer = document.querySelector('.table-responsive-container');
            const plotSection = document.getElementById('runningAmountSection');
            const transactionTable = document.getElementById('transactionTable');
            expect(tableContainer.classList.contains('is-hidden')).toBe(false);
            expect(transactionTable.style.display).toBe('table');
            expect(plotSection.classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
        });

        it('handles missing transactionTable', () => {
            document.body.innerHTML = `
                <div class="table-responsive-container is-hidden"></div>
                <div id="runningAmountSection"></div>
            `;
            const controller = createUiController({ chartManager });
            controller.toggleTable();

            const tableContainer = document.querySelector('.table-responsive-container');
            expect(tableContainer.classList.contains('is-hidden')).toBe(false);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
        });

        it('handles missing plotSection when showing table', () => {
            document.body.innerHTML = `
                <div class="table-responsive-container is-hidden"></div>
                <table id="transactionTable"></table>
            `;
            const controller = createUiController({ chartManager });
            controller.toggleTable();

            const tableContainer = document.querySelector('.table-responsive-container');
            expect(tableContainer.classList.contains('is-hidden')).toBe(false);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
        });

        it('does nothing if tableContainer is missing', () => {
            const controller = createUiController({ chartManager });
            expect(() => controller.toggleTable()).not.toThrow();
        });
    });

    describe('togglePlot', () => {
        it('early returns if no plot section', () => {
            document.body.innerHTML = '<div class="table-responsive-container"></div>';
            const controller = createUiController({ chartManager });

            controller.togglePlot();

            expect(state.setActiveChart).not.toHaveBeenCalled();
        });

        it('hides plot if currently visible', () => {
            document.body.innerHTML = `
                <div id="runningAmountSection"></div>
            `;
            const controller = createUiController({ chartManager });
            controller.togglePlot();

            const plotSection = document.getElementById('runningAmountSection');
            expect(state.setActiveChart).toHaveBeenCalledWith('contribution');
            expect(state.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
        });

        it('shows plot if currently hidden and hide table', () => {
            document.body.innerHTML = `
                <div id="runningAmountSection" class="is-hidden"></div>
                <div class="table-responsive-container"></div>
            `;
            const controller = createUiController({ chartManager });

            controller.togglePlot();

            const plotSection = document.getElementById('runningAmountSection');
            const tableContainer = document.querySelector('.table-responsive-container');
            expect(state.setActiveChart).toHaveBeenCalledWith('contribution');
            expect(state.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(tableContainer.classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
            expect(chartManager.update).toHaveBeenCalled();
        });

        it('switches to contribution without hiding if performance was active', () => {
            document.body.innerHTML = `
                <div id="runningAmountSection"></div>
            `;
            state.transactionState.activeChart = 'performance';
            const controller = createUiController({ chartManager });

            controller.togglePlot();

            const plotSection = document.getElementById('runningAmountSection');
            expect(state.setActiveChart).toHaveBeenCalledWith('contribution');
            expect(state.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(chartManager.update).toHaveBeenCalled();

            state.transactionState.activeChart = 'contribution'; // reset
        });

        it('handles missing tableContainer safely when showing plot', () => {
            document.body.innerHTML = `
                <div id="runningAmountSection" class="is-hidden"></div>
            `;
            const controller = createUiController({ chartManager });
            controller.togglePlot();
            const plotSection = document.getElementById('runningAmountSection');
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(chartManager.update).toHaveBeenCalled();
        });
    });

    describe('togglePerformanceChart', () => {
        it('early returns if no plot section', () => {
            document.body.innerHTML = '<div class="table-responsive-container"></div>';
            const controller = createUiController({ chartManager });

            controller.togglePerformanceChart();

            expect(state.setActiveChart).toHaveBeenCalledWith('performance');
            expect(layout.adjustMobilePanels).not.toHaveBeenCalled();
        });

        it('shows plot and hides table', () => {
            document.body.innerHTML = `
                <div id="runningAmountSection" class="is-hidden"></div>
                <div class="table-responsive-container"></div>
            `;
            const controller = createUiController({ chartManager });

            controller.togglePerformanceChart();

            const plotSection = document.getElementById('runningAmountSection');
            const tableContainer = document.querySelector('.table-responsive-container');
            expect(state.setActiveChart).toHaveBeenCalledWith('performance');
            expect(state.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(tableContainer.classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
            expect(chartManager.redraw).toHaveBeenCalled();
        });

        it('shows plot without hiding table if table is missing', () => {
            document.body.innerHTML = `
                <div id="runningAmountSection" class="is-hidden"></div>
            `;
            const controller = createUiController({ chartManager });

            controller.togglePerformanceChart();

            const plotSection = document.getElementById('runningAmountSection');
            expect(state.setActiveChart).toHaveBeenCalledWith('performance');
            expect(state.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
            expect(chartManager.redraw).toHaveBeenCalled();
        });
    });

    describe('initLegendToggles', () => {
        it('adds click listeners to legend items with series data', () => {
            document.body.innerHTML = `
                <div class="chart-legend">
                    <div class="legend-item" data-series="testSeries"></div>
                </div>
            `;
            createUiController({ chartManager });
            const legendItem = document.querySelector('.legend-item');

            legendItem.click();

            expect(legendItem.classList.contains('legend-disabled')).toBe(true);
            expect(state.setChartVisibility).toHaveBeenCalledWith('testSeries', false);
            expect(chartManager.redraw).toHaveBeenCalled();

            legendItem.click();

            expect(legendItem.classList.contains('legend-disabled')).toBe(false);
            expect(state.setChartVisibility).toHaveBeenCalledWith('testSeries', true);
            expect(chartManager.redraw).toHaveBeenCalledTimes(2);
        });

        it('ignores legend items without series data', () => {
            document.body.innerHTML = `
                <div class="chart-legend">
                    <div class="legend-item"></div>
                </div>
            `;
            createUiController({ chartManager });
            const legendItem = document.querySelector('.legend-item');

            legendItem.click();

            expect(state.setChartVisibility).not.toHaveBeenCalled();
            expect(chartManager.redraw).not.toHaveBeenCalled();
        });

        it('handles legend items with empty series string', () => {
            document.body.innerHTML = `
                <div class="chart-legend">
                    <div class="legend-item" data-series=""></div>
                </div>
            `;
            createUiController({ chartManager });
            const legendItem = document.querySelector('.legend-item');

            legendItem.click();

            expect(state.setChartVisibility).not.toHaveBeenCalled();
            expect(chartManager.redraw).not.toHaveBeenCalled();
        });

        it('handles chartManager without redraw function', () => {
            document.body.innerHTML = `
                <div class="chart-legend">
                    <div class="legend-item" data-series="testSeries"></div>
                </div>
            `;
            const chartManagerNoRedraw = { update: jest.fn() };
            createUiController({ chartManager: chartManagerNoRedraw });
            const legendItem = document.querySelector('.legend-item');

            expect(() => legendItem.click()).not.toThrow();
            expect(state.setChartVisibility).toHaveBeenCalledWith('testSeries', false);
        });
    });
});
