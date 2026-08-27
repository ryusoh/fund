import {
    setActiveChart,
    setChartDateRange,
    whenTransactionDataReady,
} from '@js/transactions/state.js';
import { updateContextYearFromRange } from '@js/transactions/terminal/dateUtils.js';
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

// Apple-Stocks-style range presets (docs/mobile-terminal-ux.md, claim 16).
const MOBILE_RANGES = ['1M', '3M', '6M', 'YTD', '1Y', 'ALL'];

function toLocalISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function subtractMonths(now, months) {
    const target = new Date(now.getFullYear(), now.getMonth() - months, 1);
    const lastDayOfMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(now.getDate(), lastDayOfMonth));
    return target;
}

export function resolveRangePreset(preset, now = new Date()) {
    switch (preset) {
        case '1M':
            return { from: toLocalISODate(subtractMonths(now, 1)), to: null };
        case '3M':
            return { from: toLocalISODate(subtractMonths(now, 3)), to: null };
        case '6M':
            return { from: toLocalISODate(subtractMonths(now, 6)), to: null };
        case '1Y':
            return { from: toLocalISODate(subtractMonths(now, 12)), to: null };
        case 'YTD':
            return { from: `${now.getFullYear()}-01-01`, to: null };
        case 'ALL':
            return { from: null, to: null };
        default:
            return null;
    }
}

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

    const rangePicker = document.createElement('div');
    rangePicker.className = 'mobile-range-picker';
    rangePicker.setAttribute('role', 'tablist');
    rangePicker.setAttribute('aria-label', 'Date range');

    // The initial range comes from INITIAL_CHART_DATE_RANGE and matches no
    // preset, so every tab starts unselected.
    const tabs = MOBILE_RANGES.map((preset) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'mobile-range-button';
        tab.setAttribute('role', 'tab');
        tab.dataset.range = preset;
        tab.textContent = preset === 'ALL' ? 'All' : preset;
        tab.setAttribute('aria-selected', 'false');
        rangePicker.appendChild(tab);
        return tab;
    });

    rangePicker.addEventListener('click', (event) => {
        const tab = event.target.closest('.mobile-range-button');
        if (!tab) {
            return;
        }
        const range = resolveRangePreset(tab.dataset.range);
        if (!range) {
            return;
        }
        tabs.forEach((t) => {
            t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
        });
        whenTransactionDataReady().then(() => {
            setChartDateRange(range);
            updateContextYearFromRange(range);
            chartManager.update();
            adjustMobilePanels();
        });
    });

    bar.appendChild(picker);
    bar.appendChild(rangePicker);
    container.insertBefore(bar, section);
    return bar;
}
