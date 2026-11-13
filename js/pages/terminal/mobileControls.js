import {
    setActiveChart,
    setChartDateRange,
    whenTransactionDataReady,
} from '@js/transactions/state.js';
import { adjustMobilePanels } from '@js/transactions/layout.js';
import { updateContextYearFromRange } from '@js/transactions/terminal/dateUtils.js';
import { INITIAL_CHART_DATE_RANGE } from '../../config.js';

// Full set of 19 available charts for mobile swipe navigation (js/transactions/chart.js).
const ALL_CHARTS = [
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
    let pinchStartDistance = null;
    let pinchHandled = false;
    let suppressSwipe = false;

    function getPinchDistance(touches) {
        if (!touches || touches.length < 2) {
            return null;
        }
        return Math.hypot(
            touches[0].clientX - touches[1].clientX,
            touches[0].clientY - touches[1].clientY
        );
    }

    function setTimelineRange(range) {
        setChartDateRange(range);
        updateContextYearFromRange(range);
        whenTransactionDataReady().then(() => {
            chartManager.update();
            adjustMobilePanels();
        });
    }

    function handleTouchStart(e) {
        const pinchDistance = getPinchDistance(e.touches);
        if (pinchDistance !== null) {
            pinchStartDistance = pinchDistance > 0 ? pinchDistance : null;
            pinchHandled = false;
            suppressSwipe = true;
            return;
        }
        if (suppressSwipe) {
            return;
        }

        const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = Date.now();
    }

    function handleTouchMove(e) {
        if (pinchStartDistance === null) {
            return;
        }
        const pinchDistance = getPinchDistance(e.touches);
        if (pinchDistance === null) {
            return;
        }
        e.preventDefault();
        if (pinchHandled || pinchDistance === 0) {
            return;
        }

        const scale = pinchDistance / pinchStartDistance;
        if (scale >= 1.2) {
            pinchHandled = true;
            setTimelineRange(INITIAL_CHART_DATE_RANGE);
        } else if (scale <= 0.8) {
            pinchHandled = true;
            setTimelineRange({ from: null, to: null });
        }
    }

    function handleTouchEnd(e) {
        const remainingTouches = e.touches || [];
        if (suppressSwipe) {
            if (remainingTouches.length < 2) {
                pinchStartDistance = null;
            }
            if (remainingTouches.length === 0) {
                suppressSwipe = false;
                pinchHandled = false;
            }
            return;
        }

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

    function handleTouchCancel() {
        pinchStartDistance = null;
        pinchHandled = false;
        suppressSwipe = false;
    }

    section.addEventListener('touchstart', handleTouchStart, { passive: true });
    section.addEventListener('touchmove', handleTouchMove, { passive: false });
    section.addEventListener('touchend', handleTouchEnd, { passive: true });
    section.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return {
        nextChart,
        prevChart,
        switchToChart,
        getCurrentChart: () => ALL_CHARTS[currentChartIndex],
    };
}
