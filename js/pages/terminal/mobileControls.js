import { setActiveChart, whenTransactionDataReady } from '@js/transactions/state.js';
import { adjustMobilePanels } from '@js/transactions/layout.js';

// Curated chart subset for the mobile chart-first view (docs/mobile-terminal-ux.md,
// option D). Keys are transactionState.activeChart values from js/transactions/chart.js.
const MOBILE_CHARTS = [
    { key: 'contribution', label: 'Balance' },
    { key: 'performance', label: 'Performance' },
    { key: 'drawdown', label: 'Drawdown' },
    { key: 'composition', label: 'Composition' },
    { key: 'sectors', label: 'Sectors' },
];

export function initMobileControls({ chartManager } = {}) {
    const container = document.querySelector('.transaction-container');
    const section = document.getElementById('runningAmountSection');
    if (!container || !section || !chartManager) {
        return null;
    }

    const bar = document.createElement('div');
    bar.className = 'mobile-controls';

    const picker = document.createElement('div');
    picker.className = 'mobile-chart-picker';
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', 'Chart selection');

    const buttons = MOBILE_CHARTS.map((chart, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mobile-chart-button';
        button.dataset.chart = chart.key;
        button.textContent = chart.label;
        button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
        picker.appendChild(button);
        return button;
    });

    picker.addEventListener('click', (event) => {
        const button = event.target.closest('.mobile-chart-button');
        if (!button) {
            return;
        }
        buttons.forEach((btn) => {
            btn.setAttribute('aria-pressed', btn === button ? 'true' : 'false');
        });
        whenTransactionDataReady().then(() => {
            setActiveChart(button.dataset.chart);
            section.classList.remove('is-hidden');
            chartManager.update();
            adjustMobilePanels();
        });
    });

    bar.appendChild(picker);
    container.insertBefore(bar, section);
    return bar;
}
