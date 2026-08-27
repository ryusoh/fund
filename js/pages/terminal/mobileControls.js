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

    const menuWrap = document.createElement('div');
    menuWrap.className = 'mobile-chart-menu-wrap';

    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'mobile-menu-button';
    menuButton.setAttribute('aria-haspopup', 'menu');
    menuButton.setAttribute('aria-expanded', 'false');

    const menu = document.createElement('div');
    menu.className = 'mobile-chart-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;

    const menuItems = MOBILE_CHARTS.map((chart, index) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'mobile-chart-menu-item';
        item.setAttribute('role', 'menuitemradio');
        item.dataset.chart = chart.key;
        item.textContent = chart.label;
        item.setAttribute('aria-checked', index === 0 ? 'true' : 'false');
        menu.appendChild(item);
        return item;
    });

    menuButton.textContent = `${MOBILE_CHARTS[0].label} ▾`;

    function setMenuOpen(open) {
        menu.hidden = !open;
        menuButton.setAttribute('aria-expanded', String(open));
        if (open) {
            const checked = menu.querySelector('[aria-checked="true"]');
            if (checked) {
                checked.focus();
            }
        }
    }

    function selectChart(key, label) {
        menuItems.forEach((item) => {
            item.setAttribute('aria-checked', item.dataset.chart === key ? 'true' : 'false');
        });
        menuButton.textContent = `${label} ▾`;
        whenTransactionDataReady().then(() => {
            setActiveChart(key);
            section.classList.remove('is-hidden');
            chartManager.update();
            adjustMobilePanels();
        });
    }

    menuButton.addEventListener('click', () => setMenuOpen(menu.hidden));
    menu.addEventListener('click', (event) => {
        const item = event.target.closest('.mobile-chart-menu-item');
        if (!item) {
            return;
        }
        setMenuOpen(false);
        menuButton.focus();
        selectChart(item.dataset.chart, item.textContent);
    });
    menu.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
            return;
        }
        event.preventDefault();
        const current = menuItems.indexOf(document.activeElement);
        const next =
            event.key === 'ArrowDown'
                ? (current + 1) % menuItems.length
                : (current - 1 + menuItems.length) % menuItems.length;
        menuItems[next].focus();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !menu.hidden) {
            setMenuOpen(false);
            menuButton.focus();
        }
        if (event.key === 'Escape' && !sheet.hidden) {
            setSheetOpen(false);
        }
    });
    document.addEventListener('click', (event) => {
        if (!menu.hidden && !menuWrap.contains(event.target)) {
            setMenuOpen(false);
        }
    });

    menuWrap.appendChild(menuButton);
    menuWrap.appendChild(menu);

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

    const controlRow = document.createElement('div');
    controlRow.className = 'mobile-controls-row';

    const overflowButton = document.createElement('button');
    overflowButton.type = 'button';
    overflowButton.className = 'mobile-overflow-button';
    overflowButton.setAttribute('aria-haspopup', 'dialog');
    overflowButton.setAttribute('aria-expanded', 'false');
    overflowButton.setAttribute('aria-label', 'Display settings');
    overflowButton.textContent = '⋯';

    const sheetBackdrop = document.createElement('div');
    sheetBackdrop.className = 'mobile-sheet-backdrop';
    sheetBackdrop.hidden = true;

    const sheet = document.createElement('div');
    sheet.className = 'mobile-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Display settings');
    sheet.hidden = true;

    const currencyToggle = document.getElementById('currencyToggleContainer');
    if (currencyToggle) {
        sheet.appendChild(currencyToggle);
    }

    function setSheetOpen(open) {
        sheet.hidden = !open;
        sheetBackdrop.hidden = !open;
        overflowButton.setAttribute('aria-expanded', String(open));
        if (open) {
            const first = sheet.querySelector('button');
            if (first) {
                first.focus();
            }
        }
    }

    overflowButton.addEventListener('click', () => setSheetOpen(sheet.hidden));
    sheetBackdrop.addEventListener('click', () => setSheetOpen(false));

    controlRow.appendChild(menuWrap);
    controlRow.appendChild(overflowButton);
    bar.appendChild(controlRow);
    document.body.appendChild(sheetBackdrop);
    document.body.appendChild(sheet);
    bar.appendChild(rangePicker);
    container.insertBefore(bar, section);
    return bar;
}
