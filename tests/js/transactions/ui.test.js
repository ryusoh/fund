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

describe('ui.js', () => {
    let chartManager;
    let uiController;

    beforeEach(() => {
        jest.clearAllMocks();
        chartManager = {
            update: jest.fn(),
            redraw: jest.fn(),
        };

        // Mock requestAnimationFrame
        global.requestAnimationFrame = jest.fn((cb) => cb());

        document.body.innerHTML = `
            <div class="table-responsive-container"></div>
            <div id="runningAmountSection"></div>
            <table id="transactionTable"></table>
            <div class="chart-legend">
                <div class="legend-item" data-series="SPY"></div>
                <div class="legend-item" data-series="AAPL"></div>
            </div>
        `;

        uiController = createUiController({ chartManager });
    });

    describe('toggleTable', () => {
        it('should hide table if visible', () => {
            uiController.toggleTable();
            expect(
                document
                    .querySelector('.table-responsive-container')
                    .classList.contains('is-hidden')
            ).toBe(true);
            expect(global.requestAnimationFrame).toHaveBeenCalledWith(adjustMobilePanels);
        });

        it('should show table if hidden', () => {
            const tableContainer = document.querySelector('.table-responsive-container');
            tableContainer.classList.add('is-hidden');

            uiController.toggleTable();

            expect(tableContainer.classList.contains('is-hidden')).toBe(false);
            expect(document.getElementById('transactionTable').style.display).toBe('table');
            expect(
                document.getElementById('runningAmountSection').classList.contains('is-hidden')
            ).toBe(true);
        });

        it('should handle missing tableContainer', () => {
            document.body.innerHTML = '';
            uiController = createUiController({ chartManager });
            uiController.toggleTable();
            expect(global.requestAnimationFrame).toHaveBeenCalledWith(adjustMobilePanels);
        });

        it('should show table if hidden but transactionTable and plotSection are missing', () => {
            document.body.innerHTML = '<div class="table-responsive-container is-hidden"></div>';
            uiController = createUiController({ chartManager });
            uiController.toggleTable();
            const tableContainer = document.querySelector('.table-responsive-container');
            expect(tableContainer.classList.contains('is-hidden')).toBe(false);
        });
    });

    describe('togglePlot', () => {
        it('should return early if plotSection is not found', () => {
            document.getElementById('runningAmountSection').remove();
            uiController.togglePlot();
            expect(setActiveChart).not.toHaveBeenCalled();
        });

        it('should switch to contribution data if switching from performance chart', () => {
            transactionState.activeChart = 'performance';
            uiController.togglePlot();

            expect(setActiveChart).toHaveBeenCalledWith('contribution');
            expect(setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(chartManager.update).toHaveBeenCalled();
        });

        it('should hide plot if visible', () => {
            transactionState.activeChart = 'contribution';
            uiController.togglePlot();

            expect(
                document.getElementById('runningAmountSection').classList.contains('is-hidden')
            ).toBe(true);
        });

        it('should show plot if hidden', () => {
            transactionState.activeChart = 'contribution';
            const plotSection = document.getElementById('runningAmountSection');
            plotSection.classList.add('is-hidden');

            uiController.togglePlot();

            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(
                document
                    .querySelector('.table-responsive-container')
                    .classList.contains('is-hidden')
            ).toBe(true);
            expect(chartManager.update).toHaveBeenCalled();
        });

        it('should handle missing tableContainer when showing plot', () => {
            transactionState.activeChart = 'contribution';
            document.querySelector('.table-responsive-container').remove();
            const plotSection = document.getElementById('runningAmountSection');
            plotSection.classList.add('is-hidden');

            uiController.togglePlot();

            expect(plotSection.classList.contains('is-hidden')).toBe(false);
        });
    });

    describe('togglePerformanceChart', () => {
        it('should return early if plotSection is not found', () => {
            document.getElementById('runningAmountSection').remove();
            uiController.togglePerformanceChart();
        });

        it('should show plot and redraw', () => {
            const plotSection = document.getElementById('runningAmountSection');
            plotSection.classList.add('is-hidden');

            uiController.togglePerformanceChart();

            expect(setActiveChart).toHaveBeenCalledWith('performance');
            expect(setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(
                document
                    .querySelector('.table-responsive-container')
                    .classList.contains('is-hidden')
            ).toBe(true);
            expect(chartManager.redraw).toHaveBeenCalled();
        });

        it('should show plot when missing tableContainer', () => {
            document.querySelector('.table-responsive-container').remove();
            const plotSection = document.getElementById('runningAmountSection');
            plotSection.classList.add('is-hidden');

            uiController.togglePerformanceChart();

            expect(setActiveChart).toHaveBeenCalledWith('performance');
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(chartManager.redraw).toHaveBeenCalled();
        });
    });

    describe('legend toggles', () => {
        it('should toggle legend item and call redraw', () => {
            const item = document.querySelector('.legend-item[data-series="SPY"]');
            item.click();

            expect(item.classList.contains('legend-disabled')).toBe(true);
            expect(setChartVisibility).toHaveBeenCalledWith('SPY', false);
            expect(chartManager.redraw).toHaveBeenCalled();
        });
    });

    describe('legend toggles missing cases', () => {
        it('should handle item without series', () => {
            document.body.innerHTML = `
                <div class="chart-legend">
                    <div class="legend-item" data-series=""></div>
                </div>
            `;
            jest.clearAllMocks();
            uiController = createUiController({
                chartManager: { update: jest.fn(), redraw: jest.fn() },
            });
            const item = document.querySelector('.legend-item');
            item.click();
            expect(setChartVisibility).not.toHaveBeenCalled();
        });

        it('should handle chartManager without redraw function', () => {
            document.body.innerHTML = `
                <div class="chart-legend">
                    <div class="legend-item" data-series="AAPL"></div>
                </div>
            `;
            jest.clearAllMocks();
            const chartManagerNoRedraw = { update: jest.fn() };
            uiController = createUiController({ chartManager: chartManagerNoRedraw });
            const item = document.querySelector('.legend-item');
            item.click();
            expect(setChartVisibility).toHaveBeenCalledWith('AAPL', false);
            expect(chartManagerNoRedraw.redraw).toBeUndefined();
        });
    });
});
