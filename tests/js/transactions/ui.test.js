import { createUiController } from '../../../js/transactions/ui.js';
import * as state from '../../../js/transactions/state.js';
import * as layout from '../../../js/transactions/layout.js';

jest.mock('../../../js/transactions/state.js', () => ({
    setChartVisibility: jest.fn(),
    setActiveChart: jest.fn(),
    setChartDateRange: jest.fn(),
    transactionState: {
        activeChart: 'contribution'
    }
}));

jest.mock('../../../js/transactions/layout.js', () => ({
    adjustMobilePanels: jest.fn()
}));

describe('createUiController', () => {
    let mockChartManager;
    let uiController;

    beforeEach(() => {
        jest.clearAllMocks();

        document.body.innerHTML = `
            <div class="table-responsive-container"></div>
            <div id="runningAmountSection"></div>
            <table id="transactionTable"></table>
            <div class="chart-legend">
                <div class="legend-item" data-series="testSeries"></div>
            </div>
        `;

        mockChartManager = {
            update: jest.fn(),
            redraw: jest.fn()
        };

        jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => cb());

        uiController = createUiController({ chartManager: mockChartManager });
    });

    afterEach(() => {
        window.requestAnimationFrame.mockRestore();
    });

    it('toggleTable hides table and shows plot if table is currently visible', () => {
        const tableContainer = document.querySelector('.table-responsive-container');
        const plotSection = document.getElementById('runningAmountSection');

        // Initial state: table is visible (not is-hidden)
        uiController.toggleTable();

        expect(tableContainer.classList.contains('is-hidden')).toBe(true);
        expect(layout.adjustMobilePanels).toHaveBeenCalled();
    });

    it('toggleTable shows table and hides plot if table is currently hidden', () => {
        const tableContainer = document.querySelector('.table-responsive-container');
        const plotSection = document.getElementById('runningAmountSection');

        tableContainer.classList.add('is-hidden');

        uiController.toggleTable();

        expect(tableContainer.classList.contains('is-hidden')).toBe(false);
        expect(document.getElementById('transactionTable').style.display).toBe('table');
        expect(plotSection.classList.contains('is-hidden')).toBe(true);
        expect(layout.adjustMobilePanels).toHaveBeenCalled();
    });

    it('togglePlot hides plot if it is currently visible', () => {
        const plotSection = document.getElementById('runningAmountSection');
        const tableContainer = document.querySelector('.table-responsive-container');

        // Initial state: plot is visible
        uiController.togglePlot();

        expect(state.setActiveChart).toHaveBeenCalledWith('contribution');
        expect(state.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
        expect(plotSection.classList.contains('is-hidden')).toBe(true);
        expect(layout.adjustMobilePanels).toHaveBeenCalled();
    });

    it('togglePlot shows plot and hides table if plot is currently hidden', () => {
        const plotSection = document.getElementById('runningAmountSection');
        const tableContainer = document.querySelector('.table-responsive-container');

        plotSection.classList.add('is-hidden');

        uiController.togglePlot();

        expect(plotSection.classList.contains('is-hidden')).toBe(false);
        expect(tableContainer.classList.contains('is-hidden')).toBe(true);
        expect(mockChartManager.update).toHaveBeenCalled();
        expect(layout.adjustMobilePanels).toHaveBeenCalled();
    });

    it('togglePlot handles switching from performance chart', () => {
        const plotSection = document.getElementById('runningAmountSection');
        state.transactionState.activeChart = 'performance';

        uiController.togglePlot();

        expect(mockChartManager.update).toHaveBeenCalled();

        // Reset
        state.transactionState.activeChart = 'contribution';
    });

    it('togglePerformanceChart activates performance chart and shows plot', () => {
        const plotSection = document.getElementById('runningAmountSection');
        const tableContainer = document.querySelector('.table-responsive-container');

        plotSection.classList.add('is-hidden');

        uiController.togglePerformanceChart();

        expect(state.setActiveChart).toHaveBeenCalledWith('performance');
        expect(state.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
        expect(plotSection.classList.contains('is-hidden')).toBe(false);
        expect(tableContainer.classList.contains('is-hidden')).toBe(true);
        expect(mockChartManager.redraw).toHaveBeenCalled();
        expect(layout.adjustMobilePanels).toHaveBeenCalled();
    });

    it('initLegendToggles adds click listener and toggles visibility', () => {
        const legendItem = document.querySelector('.legend-item');

        // Click event should be handled by the listener attached in createUiController
        legendItem.click();

        expect(legendItem.classList.contains('legend-disabled')).toBe(true);
        expect(state.setChartVisibility).toHaveBeenCalledWith('testSeries', false);
        expect(mockChartManager.redraw).toHaveBeenCalled();

        // Click again
        legendItem.click();

        expect(legendItem.classList.contains('legend-disabled')).toBe(false);
        expect(state.setChartVisibility).toHaveBeenCalledWith('testSeries', true);
        expect(mockChartManager.redraw).toHaveBeenCalledTimes(2);
    });
});
