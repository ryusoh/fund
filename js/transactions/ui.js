import { setChartVisibility, setActiveChart, transactionState } from './state.js';
import { adjustMobilePanels } from './layout.js';

export function createUiController({ chartManager }) {
    function toggleTable() {
        const tableContainer = document.querySelector('.table-responsive-container');
        const plotSection = document.getElementById('runningAmountSection');
        const isVisible = tableContainer && !tableContainer.classList.contains('is-hidden');

        if (tableContainer) {
            if (isVisible) {
                tableContainer.classList.add('is-hidden');
            } else {
                tableContainer.classList.remove('is-hidden');
                const transactionTable = document.getElementById('transactionTable');
                if (transactionTable) {
                    transactionTable.style.display = 'table';
                }
                if (plotSection) {
                    plotSection.classList.add('is-hidden');
                }
            }
        }

        requestAnimationFrame(adjustMobilePanels);
    }

    function togglePlot() {
        const plotSection = document.getElementById('runningAmountSection');
        const tableContainer = document.querySelector('.table-responsive-container');
        const isVisible = plotSection && !plotSection.classList.contains('is-hidden');
        const wasPerformanceChart = transactionState.activeChart === 'performance';

        if (!plotSection) {
            return;
        }

        setActiveChart('contribution');

        // If switching from performance chart, always show contribution chart
        if (wasPerformanceChart && isVisible) {
            // Chart is already visible, just switch to contribution data
            chartManager.update(transactionState.allTransactions, transactionState.splitHistory);
            return;
        }

        if (isVisible) {
            plotSection.classList.add('is-hidden');
        } else {
            plotSection.classList.remove('is-hidden');
            if (tableContainer) {
                tableContainer.classList.add('is-hidden');
            }
        }

        requestAnimationFrame(() => {
            adjustMobilePanels();
            if (!plotSection.classList.contains('is-hidden')) {
                // Force update to ensure contribution data is available
                chartManager.update(
                    transactionState.allTransactions,
                    transactionState.splitHistory
                );
            }
        });
    }

    function togglePerformanceChart() {
        setActiveChart('performance');
        const plotSection = document.getElementById('runningAmountSection');
        const tableContainer = document.querySelector('.table-responsive-container');

        if (!plotSection) {
            return;
        }

        // Always ensure the plot is visible when this command is run
        plotSection.classList.remove('is-hidden');
        if (tableContainer) {
            tableContainer.classList.add('is-hidden');
        }

        requestAnimationFrame(() => {
            adjustMobilePanels();
            chartManager.redraw();
        });
    }

    function initLegendToggles() {
        const items = document.querySelectorAll('.chart-legend .legend-item[data-series]');
        items.forEach((item) => {
            const key = item.dataset.series;
            if (!key) {
                return;
            }
            item.addEventListener('click', () => {
                const disabled = item.classList.toggle('legend-disabled');
                setChartVisibility(key, !disabled);
                if (typeof chartManager.redraw === 'function') {
                    chartManager.redraw();
                }
            });
        });
    }

    initLegendToggles();

    return {
        toggleTable,
        togglePlot,
        togglePerformanceChart,
    };
}
