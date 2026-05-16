import { createUiController } from '../../../js/transactions/ui.js';
import { setActiveChart, setChartDateRange, transactionState, setChartVisibility } from '../../../js/transactions/state.js';
import { adjustMobilePanels } from '../../../js/transactions/layout.js';

jest.mock('../../../js/transactions/state.js', () => ({
    setActiveChart: jest.fn(),
    setChartVisibility: jest.fn(),
    setChartDateRange: jest.fn(),
    transactionState: { activeChart: 'contribution' }
}));

jest.mock('../../../js/transactions/layout.js', () => ({
    adjustMobilePanels: jest.fn()
}));

describe('UI Controller', () => {
    let chartManager;
    let uiController;

    beforeEach(() => {
        document.body.innerHTML = `
            <div class="table-responsive-container is-hidden"></div>
            <table id="transactionTable" style="display: none;"></table>
            <div id="runningAmountSection" class="is-hidden"></div>
            <div class="chart-legend">
                <div class="legend-item" data-series="AAPL"></div>
            </div>
        `;
        chartManager = {
            update: jest.fn(),
            redraw: jest.fn()
        };
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => cb());
        uiController = createUiController({ chartManager });
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('toggleTable shows table and hides plot', () => {
        const tableContainer = document.querySelector('.table-responsive-container');
        const plotSection = document.getElementById('runningAmountSection');
        plotSection.classList.remove('is-hidden'); // Make plot visible

        uiController.toggleTable();

        expect(tableContainer.classList.contains('is-hidden')).toBe(false);
        expect(document.getElementById('transactionTable').style.display).toBe('table');
        expect(plotSection.classList.contains('is-hidden')).toBe(true);
        expect(adjustMobilePanels).toHaveBeenCalled();
    });

    test('toggleTable hides table if already visible', () => {
        const tableContainer = document.querySelector('.table-responsive-container');
        tableContainer.classList.remove('is-hidden'); // Make table visible

        uiController.toggleTable();

        expect(tableContainer.classList.contains('is-hidden')).toBe(true);
        expect(adjustMobilePanels).toHaveBeenCalled();
    });

    test('togglePlot shows plot and hides table', () => {
        const plotSection = document.getElementById('runningAmountSection');
        const tableContainer = document.querySelector('.table-responsive-container');
        tableContainer.classList.remove('is-hidden'); // Make table visible

        uiController.togglePlot();

        expect(plotSection.classList.contains('is-hidden')).toBe(false);
        expect(tableContainer.classList.contains('is-hidden')).toBe(true);
        expect(setActiveChart).toHaveBeenCalledWith('contribution');
        expect(setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
        expect(adjustMobilePanels).toHaveBeenCalled();
        expect(chartManager.update).toHaveBeenCalled();
    });

    test('togglePlot hides plot if already visible', () => {
        const plotSection = document.getElementById('runningAmountSection');
        plotSection.classList.remove('is-hidden'); // Make plot visible

        uiController.togglePlot();

        expect(plotSection.classList.contains('is-hidden')).toBe(true);
        expect(setActiveChart).toHaveBeenCalledWith('contribution');
        expect(setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
        expect(adjustMobilePanels).toHaveBeenCalled();
    });

    test('togglePlot handles switching from performance chart', () => {
        transactionState.activeChart = 'performance';
        const plotSection = document.getElementById('runningAmountSection');
        plotSection.classList.remove('is-hidden'); // Make plot visible

        uiController.togglePlot();

        expect(setActiveChart).toHaveBeenCalledWith('contribution');
        expect(setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
        expect(chartManager.update).toHaveBeenCalled();
        expect(plotSection.classList.contains('is-hidden')).toBe(false); // Should remain visible
    });

    test('togglePerformanceChart shows performance chart', () => {
        const plotSection = document.getElementById('runningAmountSection');
        const tableContainer = document.querySelector('.table-responsive-container');
        tableContainer.classList.remove('is-hidden');

        uiController.togglePerformanceChart();

        expect(setActiveChart).toHaveBeenCalledWith('performance');
        expect(setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
        expect(plotSection.classList.contains('is-hidden')).toBe(false);
        expect(tableContainer.classList.contains('is-hidden')).toBe(true);
        expect(adjustMobilePanels).toHaveBeenCalled();
        expect(chartManager.redraw).toHaveBeenCalled();
    });

    test('toggleTable gracefully handles missing DOM elements', () => {
        document.body.innerHTML = '';
        expect(() => uiController.toggleTable()).not.toThrow();
        expect(adjustMobilePanels).toHaveBeenCalled();
    });

    test('togglePlot gracefully handles missing DOM elements', () => {
        document.body.innerHTML = '';
        expect(() => uiController.togglePlot()).not.toThrow();
        expect(setActiveChart).not.toHaveBeenCalled();
    });

    test('togglePerformanceChart gracefully handles missing DOM elements', () => {
        document.body.innerHTML = '';
        expect(() => uiController.togglePerformanceChart()).not.toThrow();
    });

    test('legend toggles visibility correctly', () => {
        const item = document.querySelector('.legend-item[data-series="AAPL"]');
        item.click();
        expect(item.classList.contains('legend-disabled')).toBe(true);
        expect(setChartVisibility).toHaveBeenCalledWith('AAPL', false);
        expect(chartManager.redraw).toHaveBeenCalled();

        item.click();
        expect(item.classList.contains('legend-disabled')).toBe(false);
        expect(setChartVisibility).toHaveBeenCalledWith('AAPL', true);
    });

    test('legend init handles item without data-series', () => {
        document.body.innerHTML = `
            <div class="chart-legend">
                <div class="legend-item" data-series=""></div>
            </div>
        `;
        uiController = createUiController({ chartManager });
        const item = document.querySelector('.legend-item');
        item.click(); // Should do nothing, no error
        expect(setChartVisibility).not.toHaveBeenCalled();
    });
});
