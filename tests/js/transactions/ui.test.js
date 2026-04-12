import { jest } from '@jest/globals';

describe('UI Controller', () => {
    let createUiController;
    let mockSetChartVisibility;
    let mockSetActiveChart;
    let mockTransactionState;
    let mockSetChartDateRange;
    let mockAdjustMobilePanels;
    let chartManager;

    beforeEach(async () => {
        jest.resetModules();

        mockSetChartVisibility = jest.fn();
        mockSetActiveChart = jest.fn();
        mockTransactionState = { activeChart: 'contribution' };
        mockSetChartDateRange = jest.fn();
        mockAdjustMobilePanels = jest.fn();

        jest.doMock('@js/transactions/state.js', () => ({
            setChartVisibility: mockSetChartVisibility,
            setActiveChart: mockSetActiveChart,
            transactionState: mockTransactionState,
            setChartDateRange: mockSetChartDateRange,
        }));

        jest.doMock('@js/transactions/layout.js', () => ({
            adjustMobilePanels: mockAdjustMobilePanels,
        }));

        // Mock requestAnimationFrame
        global.requestAnimationFrame = jest.fn((cb) => cb());

        const uiModule = await import('@js/transactions/ui.js');
        createUiController = uiModule.createUiController;

        chartManager = {
            update: jest.fn(),
            redraw: jest.fn(),
        };

        // Reset DOM
        document.body.innerHTML = `
            <div class="table-responsive-container"></div>
            <table id="transactionTable"></table>
            <div id="runningAmountSection"></div>
            <div class="chart-legend">
                <div class="legend-item" data-series="series1"></div>
                <div class="legend-item" data-series="series2"></div>
                <div class="legend-item"></div> <!-- No data-series -->
            </div>
        `;
    });

    describe('toggleTable', () => {
        test('hides table if currently visible', () => {
            const ui = createUiController({ chartManager });
            const tableContainer = document.querySelector('.table-responsive-container');

            ui.toggleTable();

            expect(tableContainer.classList.contains('is-hidden')).toBe(true);
            expect(global.requestAnimationFrame).toHaveBeenCalledWith(mockAdjustMobilePanels);
        });

        test('shows table if currently hidden', () => {
            const tableContainer = document.querySelector('.table-responsive-container');
            tableContainer.classList.add('is-hidden');
            const plotSection = document.getElementById('runningAmountSection');

            const ui = createUiController({ chartManager });
            ui.toggleTable();

            expect(tableContainer.classList.contains('is-hidden')).toBe(false);
            const transactionTable = document.getElementById('transactionTable');
            expect(transactionTable.style.display).toBe('table');
            expect(plotSection.classList.contains('is-hidden')).toBe(true);
        });

        test('handles missing elements gracefully', () => {
            document.body.innerHTML = ''; // Clear DOM
            const ui = createUiController({ chartManager });

            ui.toggleTable(); // Should not throw
            expect(global.requestAnimationFrame).toHaveBeenCalledWith(mockAdjustMobilePanels);
        });

        test('shows table if hidden and handles missing transactionTable/plotSection', () => {
            document.body.innerHTML = '<div class="table-responsive-container is-hidden"></div>';
            const tableContainer = document.querySelector('.table-responsive-container');

            const ui = createUiController({ chartManager });
            ui.toggleTable();

            expect(tableContainer.classList.contains('is-hidden')).toBe(false);
            expect(global.requestAnimationFrame).toHaveBeenCalledWith(mockAdjustMobilePanels);
        });
    });

    describe('togglePlot', () => {
        test('does nothing if plotSection is missing', () => {
            document.body.innerHTML = '';
            const ui = createUiController({ chartManager });
            ui.togglePlot();
            expect(mockSetActiveChart).not.toHaveBeenCalled();
        });

        test('switches from performance to contribution without hiding', () => {
            mockTransactionState.activeChart = 'performance';
            const ui = createUiController({ chartManager });

            ui.togglePlot();

            expect(mockSetActiveChart).toHaveBeenCalledWith('contribution');
            expect(mockSetChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(chartManager.update).toHaveBeenCalled();
            const plotSection = document.getElementById('runningAmountSection');
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
        });

        test('hides plot if currently visible', () => {
            const ui = createUiController({ chartManager });
            const plotSection = document.getElementById('runningAmountSection');

            ui.togglePlot();

            expect(plotSection.classList.contains('is-hidden')).toBe(true);
            expect(global.requestAnimationFrame).toHaveBeenCalled();
            expect(mockAdjustMobilePanels).toHaveBeenCalled();
        });

        test('shows plot if currently hidden', () => {
            const plotSection = document.getElementById('runningAmountSection');
            plotSection.classList.add('is-hidden');
            const tableContainer = document.querySelector('.table-responsive-container');

            const ui = createUiController({ chartManager });
            ui.togglePlot();

            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(tableContainer.classList.contains('is-hidden')).toBe(true);
            expect(chartManager.update).toHaveBeenCalled();
        });

        test('shows plot if currently hidden and handles missing tableContainer', () => {
            document.body.innerHTML = '<div id="runningAmountSection" class="is-hidden"></div>';
            const plotSection = document.getElementById('runningAmountSection');

            const ui = createUiController({ chartManager });
            ui.togglePlot();

            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(chartManager.update).toHaveBeenCalled();
        });

        test('hides plot but no force update if plot section gets is-hidden added', () => {
            const ui = createUiController({ chartManager });

            ui.togglePlot(); // will add is-hidden

            expect(chartManager.update).not.toHaveBeenCalled();
        });
    });

    describe('togglePerformanceChart', () => {
        test('does nothing if plotSection is missing', () => {
            document.body.innerHTML = '';
            const ui = createUiController({ chartManager });
            ui.togglePerformanceChart();
            expect(mockSetActiveChart).toHaveBeenCalledWith('performance'); // Still sets active chart before returning
        });

        test('shows performance chart and hides table', () => {
            const plotSection = document.getElementById('runningAmountSection');
            plotSection.classList.add('is-hidden');
            const tableContainer = document.querySelector('.table-responsive-container');

            const ui = createUiController({ chartManager });
            ui.togglePerformanceChart();

            expect(mockSetActiveChart).toHaveBeenCalledWith('performance');
            expect(mockSetChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(tableContainer.classList.contains('is-hidden')).toBe(true);

            expect(global.requestAnimationFrame).toHaveBeenCalled();
            expect(mockAdjustMobilePanels).toHaveBeenCalled();
            expect(chartManager.redraw).toHaveBeenCalled();
        });

        test('shows performance chart and handles missing table', () => {
            document.body.innerHTML = '<div id="runningAmountSection" class="is-hidden"></div>';
            const plotSection = document.getElementById('runningAmountSection');

            const ui = createUiController({ chartManager });
            ui.togglePerformanceChart();

            expect(plotSection.classList.contains('is-hidden')).toBe(false);
            expect(chartManager.redraw).toHaveBeenCalled();
        });
    });

    describe('initLegendToggles', () => {
        test('attaches click listeners to legend items and toggles visibility', () => {
            createUiController({ chartManager });

            const item = document.querySelector('.legend-item[data-series="series1"]');
            item.click();

            expect(item.classList.contains('legend-disabled')).toBe(true);
            expect(mockSetChartVisibility).toHaveBeenCalledWith('series1', false);
            expect(chartManager.redraw).toHaveBeenCalled();

            item.click();

            expect(item.classList.contains('legend-disabled')).toBe(false);
            expect(mockSetChartVisibility).toHaveBeenCalledWith('series1', true);
            expect(chartManager.redraw).toHaveBeenCalledTimes(2);
        });

        test('handles case where chartManager has no redraw function', () => {
            const chartManagerWithoutRedraw = { update: jest.fn() };
            createUiController({ chartManager: chartManagerWithoutRedraw });

            const item = document.querySelector('.legend-item[data-series="series1"]');
            item.click(); // Should not throw

            expect(mockSetChartVisibility).toHaveBeenCalledWith('series1', false);
        });

        test('skips items without data-series', () => {
            createUiController({ chartManager });

            const item = document.querySelector('.legend-item:not([data-series])');
            if (item) {
                item.click(); // Should not throw and do nothing
            }
            expect(mockSetChartVisibility).not.toHaveBeenCalled();
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
            expect(mockSetChartVisibility).not.toHaveBeenCalled();
            expect(chartManager.redraw).not.toHaveBeenCalled();
        });
    });
});
