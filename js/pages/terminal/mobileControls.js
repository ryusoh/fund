import { setActiveChart, whenTransactionDataReady } from '@js/transactions/state.js';
import { adjustMobilePanels } from '@js/transactions/layout.js';

// Full set of 19 available charts for mobile swipe navigation (js/transactions/chart.js).
export const ALL_CHARTS = [
    { key: 'contribution', label: 'Balance' },
    { key: 'performance', label: 'Performance' },
    { key: 'drawdown', label: 'Drawdown' },
    { key: 'drawdownAbs', label: 'Drawdown ($)' },
    { key: 'composition', label: 'Composition' },
    { key: 'compositionAbs', label: 'Composition ($)' },
    { key: 'pe', label: 'P/E Ratio' },
    { key: 'fx', label: 'FX Rate' },
    { key: 'yield', label: 'Yield' },
    { key: 'rolling', label: 'Rolling Returns' },
    { key: 'sectors', label: 'Sectors' },
    { key: 'sectorsAbs', label: 'Sectors ($)' },
    { key: 'geography', label: 'Geography' },
    { key: 'geographyAbs', label: 'Geography ($)' },
    { key: 'marketcap', label: 'Market Cap' },
    { key: 'marketcapAbs', label: 'Market Cap ($)' },
    { key: 'concentration', label: 'Concentration' },
    { key: 'volatility', label: 'Volatility' },
    { key: 'beta', label: 'Beta' },
];

export function initMobileControls({ chartManager } = {}) {
    const container = document.querySelector('.transaction-container');
    const section = document.getElementById('runningAmountSection');
    if (!container || !section || !chartManager) {
        return null;
    }

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

    // Touch and pointer swipe detection across chart section
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

    section.addEventListener('touchstart', handleTouchStart, { passive: true });
    section.addEventListener('touchend', handleTouchEnd, { passive: true });

    return {
        nextChart,
        prevChart,
        switchToChart,
        getCurrentChart: () => ALL_CHARTS[currentChartIndex],
    };
}
