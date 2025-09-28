import { transactionState } from './state.js';
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

        if (!plotSection) {
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
                chartManager.update(
                    transactionState.allTransactions,
                    transactionState.splitHistory
                );
            }
        });
    }

    return {
        toggleTable,
        togglePlot,
    };
}
