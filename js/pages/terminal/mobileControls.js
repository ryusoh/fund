import {
    setActiveChart,
    setChartDateRange,
    whenTransactionDataReady,
} from '@js/transactions/state.js';
import { updateContextYearFromRange } from '@js/transactions/terminal/dateUtils.js';
import { adjustMobilePanels } from '@js/transactions/layout.js';

// Full set of 19 available charts for mobile swipe navigation (js/transactions/chart.js).
export const ALL_CHARTS = [
    { key: 'contribution', label: 'Balance' },
    { key: 'performance', label: 'Performance' },
    { key: 'drawdown', label: 'Drawdown' },
    { key: 'drawdownAbs', label: 'Drawdown ($)' },
    { key: 'composition', label: 'Composition' },
    { key: 'compositionAbs', label: 'Composition ($)' },
    { key: 'sectors', label: 'Sectors' },
    { key: 'sectorsAbs', label: 'Sectors ($)' },
    { key: 'geography', label: 'Geography' },
    { key: 'geographyAbs', label: 'Geography ($)' },
    { key: 'marketcap', label: 'Market Cap' },
    { key: 'marketcapAbs', label: 'Market Cap ($)' },
    { key: 'concentration', label: 'Concentration' },
    { key: 'pe', label: 'P/E Ratio' },
    { key: 'yield', label: 'Yield' },
    { key: 'rolling', label: 'Rolling Returns' },
    { key: 'volatility', label: 'Volatility' },
    { key: 'beta', label: 'Beta' },
    { key: 'fx', label: 'FX Rate' },
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

    let currentChartIndex = 0;

    function switchToChart(index) {
        currentChartIndex = (index + ALL_CHARTS.length) % ALL_CHARTS.length;
        const chart = ALL_CHARTS[currentChartIndex];
        whenTransactionDataReady().then(() => {
            setActiveChart(chart.key);
            section.classList.remove('is-hidden');
            chartManager.update();
            adjustMobilePanels();
        });
    }

    function nextChart() {
        switchToChart(currentChartIndex + 1);
    }

    function prevChart() {
        switchToChart(currentChartIndex - 1);
    }

    // Touch and pointer swipe detection across chart section and controls
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    function handleTouchStart(e) {
        const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = Date.now();
    }

    function handleTouchEnd(e) {
        const touch = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]) || e;
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        const elapsed = Date.now() - touchStartTime;

        const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.2;
        const isSwipe = Math.abs(deltaX) >= 40 && (elapsed < 600 || Math.abs(deltaX) >= 80);

        if (isHorizontal && isSwipe) {
            if (deltaX < 0) {
                nextChart();
            } else {
                prevChart();
            }
        }
    }

    [section, bar].forEach((el) => {
        el.addEventListener('touchstart', handleTouchStart, { passive: true });
        el.addEventListener('touchend', handleTouchEnd, { passive: true });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !sheet.hidden) {
            setSheetOpen(false);
        }
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

    controlRow.appendChild(rangePicker);
    controlRow.appendChild(overflowButton);
    bar.appendChild(controlRow);
    document.body.appendChild(sheetBackdrop);
    document.body.appendChild(sheet);
    container.insertBefore(bar, section);
    return bar;
}
