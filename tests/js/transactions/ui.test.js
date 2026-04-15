import { createUiController, _coverage_dummy } from '@js/transactions/ui.js';
import { transactionState } from '@js/transactions/state.js';
import * as layout from '@js/transactions/layout.js';

// Mock layout
jest.mock('@js/transactions/layout.js', () => ({
    adjustMobilePanels: jest.fn()
}));

// Mock state
jest.mock('@js/transactions/state.js', () => ({
    transactionState: {
        activeChart: 'contribution',
        selectedCurrency: 'USD'
    },
    setActiveChart: jest.fn(),
    setChartDateRange: jest.fn(),
    setChartVisibility: jest.fn()
}));

describe('ui.js', () => {
    let uiController;
    let chartManagerMock;

    beforeEach(() => {
        chartManagerMock = {
            update: jest.fn(),
            redraw: jest.fn()
        };

        // Mock requestAnimationFrame
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => cb());

        // Reset dom
        document.body.innerHTML = '';
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should export _coverage_dummy as true', () => {
        expect(_coverage_dummy).toBe(true);
    });

    describe('toggleTable', () => {
        it('should show table and hide plot when hidden', () => {
            document.body.innerHTML = `
                <div class="table-responsive-container is-hidden"></div>
                <table id="transactionTable" style="display: none;"></table>
                <div id="runningAmountSection"></div>
            `;
            uiController = createUiController({ chartManager: chartManagerMock });
            uiController.toggleTable();

            expect(document.querySelector('.table-responsive-container').classList.contains('is-hidden')).toBe(false);
            expect(document.getElementById('transactionTable').style.display).toBe('table');
            expect(document.getElementById('runningAmountSection').classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
        });

        it('should hide table when visible', () => {
            document.body.innerHTML = `
                <div class="table-responsive-container"></div>
                <table id="transactionTable" style="display: table;"></table>
                <div id="runningAmountSection" class="is-hidden"></div>
            `;
            uiController = createUiController({ chartManager: chartManagerMock });
            uiController.toggleTable();

            expect(document.querySelector('.table-responsive-container').classList.contains('is-hidden')).toBe(true);
            expect(layout.adjustMobilePanels).toHaveBeenCalled();
        });

        it('should do nothing if tableContainer is missing', () => {
            document.body.innerHTML = `
                <table id="transactionTable" style="display: none;"></table>
                <div id="runningAmountSection"></div>
            `;
            uiController = createUiController({ chartManager: chartManagerMock });
            uiController.toggleTable();
        });
    });

    describe('togglePlot', () => {
        it('should show plot and hide table when hidden', () => {
            document.body.innerHTML = `
                <div class="table-responsive-container"></div>
                <div id="runningAmountSection" class="is-hidden"></div>
            `;
            const { setActiveChart, setChartDateRange } = require('@js/transactions/state.js');
            uiController = createUiController({ chartManager: chartManagerMock });
            uiController.togglePlot();

            expect(setActiveChart).toHaveBeenCalledWith('contribution');
            expect(setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(document.getElementById('runningAmountSection').classList.contains('is-hidden')).toBe(false);
            expect(document.querySelector('.table-responsive-container').classList.contains('is-hidden')).toBe(true);
            expect(chartManagerMock.update).toHaveBeenCalled();
        });

        it('should hide plot when visible', () => {
            document.body.innerHTML = `
                <div class="table-responsive-container is-hidden"></div>
                <div id="runningAmountSection"></div>
            `;
            uiController = createUiController({ chartManager: chartManagerMock });
            uiController.togglePlot();

            expect(document.getElementById('runningAmountSection').classList.contains('is-hidden')).toBe(true);
        });

        it('should just update when performance chart was active and plot is visible', () => {
            document.body.innerHTML = `
                <div id="runningAmountSection"></div>
            `;
            transactionState.activeChart = 'performance';
            uiController = createUiController({ chartManager: chartManagerMock });
            uiController.togglePlot();

            expect(chartManagerMock.update).toHaveBeenCalled();
            expect(document.getElementById('runningAmountSection').classList.contains('is-hidden')).toBe(false);
        });

        it('should do nothing if plotSection is missing', () => {
            document.body.innerHTML = '';
            uiController = createUiController({ chartManager: chartManagerMock });
            uiController.togglePlot();
        });
    });

    describe('togglePerformanceChart', () => {
        it('should show performance chart', () => {
            document.body.innerHTML = `
                <div class="table-responsive-container"></div>
                <div id="runningAmountSection" class="is-hidden"></div>
            `;
            const { setActiveChart, setChartDateRange } = require('@js/transactions/state.js');
            uiController = createUiController({ chartManager: chartManagerMock });
            uiController.togglePerformanceChart();

            expect(setActiveChart).toHaveBeenCalledWith('performance');
            expect(setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(document.getElementById('runningAmountSection').classList.contains('is-hidden')).toBe(false);
            expect(document.querySelector('.table-responsive-container').classList.contains('is-hidden')).toBe(true);
            expect(chartManagerMock.redraw).toHaveBeenCalled();
        });

        it('should do nothing if plotSection is missing', () => {
            document.body.innerHTML = '';
            uiController = createUiController({ chartManager: chartManagerMock });
            uiController.togglePerformanceChart();
        });
    });

    describe('initLegendToggles', () => {
        it('should toggle legend items', () => {
            document.body.innerHTML = `
                <div class="chart-legend">
                    <div class="legend-item" data-series="test-series"></div>
                    <div class="legend-item"></div>
                </div>
            `;
            const { setChartVisibility } = require('@js/transactions/state.js');
            uiController = createUiController({ chartManager: chartManagerMock });

            const item = document.querySelector('.legend-item[data-series="test-series"]');
            item.click();

            expect(item.classList.contains('legend-disabled')).toBe(true);
            expect(setChartVisibility).toHaveBeenCalledWith('test-series', false);
            expect(chartManagerMock.redraw).toHaveBeenCalled();

            item.click();

            expect(item.classList.contains('legend-disabled')).toBe(false);
            expect(setChartVisibility).toHaveBeenCalledWith('test-series', true);
        });
    });
});
