import { createUiController } from '../../../js/transactions/ui.js';
import * as stateModule from '../../../js/transactions/state.js';
import * as layoutModule from '../../../js/transactions/layout.js';

jest.mock('../../../js/transactions/state.js', () => ({
    setChartVisibility: jest.fn(),
    setActiveChart: jest.fn(),
    setChartDateRange: jest.fn(),
    transactionState: {
        activeChart: 'contribution',
    },
}));

jest.mock('../../../js/transactions/layout.js', () => ({
    adjustMobilePanels: jest.fn(),
}));

describe('ui controller', () => {
    let chartManagerMock;
    let uiController;

    beforeEach(() => {
        document.body.innerHTML = `
            <div class="table-responsive-container"></div>
            <table id="transactionTable"></table>
            <div id="runningAmountSection"></div>
            <div class="chart-legend">
                <div class="legend-item" data-series="SPY">SPY</div>
                <div class="legend-item" data-series="QQQ">QQQ</div>
                <div class="legend-item">No Series</div>
            </div>
        `;

        chartManagerMock = {
            update: jest.fn(),
            redraw: jest.fn(),
        };

        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => cb());
        jest.clearAllMocks();

        uiController = createUiController({ chartManager: chartManagerMock });
    });

    afterEach(() => {
        window.requestAnimationFrame.mockRestore();
    });

    describe('toggleTable', () => {
        it('hides table if visible', () => {
            const container = document.querySelector('.table-responsive-container');
            uiController.toggleTable();
            expect(container.classList.contains('is-hidden')).toBe(true);
            expect(layoutModule.adjustMobilePanels).toHaveBeenCalled();
        });

        it('shows table and hides plot if table is hidden', () => {
            const container = document.querySelector('.table-responsive-container');
            container.classList.add('is-hidden');
            const plotSection = document.getElementById('runningAmountSection');

            uiController.toggleTable();

            expect(container.classList.contains('is-hidden')).toBe(false);
            expect(document.getElementById('transactionTable').style.display).toBe('table');
            expect(plotSection.classList.contains('is-hidden')).toBe(true);
            expect(layoutModule.adjustMobilePanels).toHaveBeenCalled();
        });

        it('does nothing if table container is not found', () => {
            document.body.innerHTML = '';
            uiController.toggleTable();
            expect(layoutModule.adjustMobilePanels).toHaveBeenCalled();
        });

        it('shows table even if transactionTable is not found', () => {
            const container = document.querySelector('.table-responsive-container');
            container.classList.add('is-hidden');
            document.getElementById('transactionTable').remove();

            uiController.toggleTable();

            expect(container.classList.contains('is-hidden')).toBe(false);
            expect(layoutModule.adjustMobilePanels).toHaveBeenCalled();
        });

        it('shows table even if runningAmountSection is not found', () => {
            const container = document.querySelector('.table-responsive-container');
            container.classList.add('is-hidden');
            document.getElementById('runningAmountSection').remove();

            uiController.toggleTable();

            expect(container.classList.contains('is-hidden')).toBe(false);
            expect(document.getElementById('transactionTable').style.display).toBe('table');
            expect(layoutModule.adjustMobilePanels).toHaveBeenCalled();
        });
    });

    describe('togglePlot', () => {
        it('does nothing if plot section is not found', () => {
            document.body.innerHTML = '';
            uiController.togglePlot();
            expect(stateModule.setActiveChart).not.toHaveBeenCalled();
        });

        it('switches to contribution chart if coming from performance chart and visible', () => {
            stateModule.transactionState.activeChart = 'performance';
            const plotSection = document.getElementById('runningAmountSection');

            uiController.togglePlot();

            expect(stateModule.setActiveChart).toHaveBeenCalledWith('contribution');
            expect(stateModule.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(chartManagerMock.update).toHaveBeenCalled();
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
        });

        it('hides plot if visible', () => {
            stateModule.transactionState.activeChart = 'contribution';
            const plotSection = document.getElementById('runningAmountSection');

            uiController.togglePlot();

            expect(plotSection.classList.contains('is-hidden')).toBe(true);
            expect(layoutModule.adjustMobilePanels).toHaveBeenCalled();
            expect(chartManagerMock.update).not.toHaveBeenCalled(); // since hidden
        });

        it('shows plot and hides table if hidden', () => {
            stateModule.transactionState.activeChart = 'contribution';
            const plotSection = document.getElementById('runningAmountSection');
            plotSection.classList.add('is-hidden');
            const tableContainer = document.querySelector('.table-responsive-container');

            uiController.togglePlot();

            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(tableContainer.classList.contains('is-hidden')).toBe(true);
            expect(layoutModule.adjustMobilePanels).toHaveBeenCalled();
            expect(chartManagerMock.update).toHaveBeenCalled();
        });

        it('shows plot and handles missing table container', () => {
            stateModule.transactionState.activeChart = 'contribution';
            const plotSection = document.getElementById('runningAmountSection');
            plotSection.classList.add('is-hidden');
            document.querySelector('.table-responsive-container').remove();

            uiController.togglePlot();

            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(layoutModule.adjustMobilePanels).toHaveBeenCalled();
            expect(chartManagerMock.update).toHaveBeenCalled();
        });

        it('hides plot but still requests animation frame if update is not called', () => {
            stateModule.transactionState.activeChart = 'contribution';
            const plotSection = document.getElementById('runningAmountSection');
            uiController.togglePlot();
            expect(plotSection.classList.contains('is-hidden')).toBe(true);
            expect(layoutModule.adjustMobilePanels).toHaveBeenCalled();
        });
    });

    describe('togglePerformanceChart', () => {
        it('does nothing if plot section is not found', () => {
            document.body.innerHTML = '';
            uiController.togglePerformanceChart();
            expect(stateModule.setActiveChart).toHaveBeenCalledWith('performance');
            expect(layoutModule.adjustMobilePanels).not.toHaveBeenCalled();
        });

        it('shows performance chart and hides table', () => {
            const plotSection = document.getElementById('runningAmountSection');
            plotSection.classList.add('is-hidden');
            const tableContainer = document.querySelector('.table-responsive-container');

            uiController.togglePerformanceChart();

            expect(stateModule.setActiveChart).toHaveBeenCalledWith('performance');
            expect(stateModule.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(tableContainer.classList.contains('is-hidden')).toBe(true);
            expect(layoutModule.adjustMobilePanels).toHaveBeenCalled();
            expect(chartManagerMock.redraw).toHaveBeenCalled();
        });

        it('shows performance chart without hiding table if table is not found', () => {
            const plotSection = document.getElementById('runningAmountSection');
            plotSection.classList.add('is-hidden');
            document.querySelector('.table-responsive-container').remove();

            uiController.togglePerformanceChart();

            expect(stateModule.setActiveChart).toHaveBeenCalledWith('performance');
            expect(stateModule.setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(layoutModule.adjustMobilePanels).toHaveBeenCalled();
            expect(chartManagerMock.redraw).toHaveBeenCalled();
        });
    });

    describe('legend toggles', () => {
        it('toggles visibility when clicked', () => {
            const spyItem = document.querySelector('[data-series="SPY"]');
            spyItem.click();

            expect(spyItem.classList.contains('legend-disabled')).toBe(true);
            expect(stateModule.setChartVisibility).toHaveBeenCalledWith('SPY', false);
            expect(chartManagerMock.redraw).toHaveBeenCalled();

            spyItem.click();

            expect(spyItem.classList.contains('legend-disabled')).toBe(false);
            expect(stateModule.setChartVisibility).toHaveBeenCalledWith('SPY', true);
            expect(chartManagerMock.redraw).toHaveBeenCalledTimes(2);
        });

        it('does not crash if chartManager.redraw is not a function', () => {
            uiController = createUiController({ chartManager: {} });
            const spyItem = document.querySelector('[data-series="SPY"]');

            expect(() => spyItem.click()).not.toThrow();
        });

        it('ignores clicks on items without data-series', () => {
            const emptyItem = document.querySelectorAll('.legend-item')[2];
            emptyItem.click();
            expect(stateModule.setChartVisibility).not.toHaveBeenCalled();
        });
    });
});
