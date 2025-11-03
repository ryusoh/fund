// Disable double-click zoom
document.addEventListener(
    'dblclick',
    function (event) {
        event.preventDefault();
    },
    { passive: false }
);

// Assuming Chart and ChartDataLabels are globally available from CDN.
import { customArcBordersPlugin } from '@plugins/customArcBordersPlugin.js';
import { waveAnimationPlugin } from '@plugins/waveAnimationPlugin.js';
import { loadAndDisplayPortfolioData } from '@services/dataService.js';
import {
    initCurrencyToggle,
    cycleCurrency,
    applyCurrencySelection,
    getStoredCurrency,
} from '@ui/currencyToggleManager.js';
import { initFooterToggle } from '@ui/footerToggle.js';
import {
    APP_SETTINGS,
    CURRENCY_SYMBOLS,
    PIE_CHART_GLASS_EFFECT,
    UI_BREAKPOINTS,
} from '@js/config.js';
import { triggerCenterToggle } from '@charts/allocationChartManager.js';
import { checkAndToggleVerticalScroll, alignToggleWithChartMobile } from '@ui/responsive.js';
import { logger } from '@utils/logger.js';

let currentSelectedCurrency = 'USD'; // Default currency
let exchangeRates = { USD: 1.0 }; // Default rates, will be updated

// Make glass effect config globally available for Chart.js
function cloneGlassEffectConfig(config) {
    const globalClone = typeof globalThis !== 'undefined' ? globalThis.structuredClone : undefined;
    if (typeof globalClone === 'function') {
        return globalClone(config);
    }
    try {
        return JSON.parse(JSON.stringify(config));
    } catch (error) {
        logger.warn('Unable to deep clone glass effect config. Using reference.', error);
        return config;
    }
}

function computeGlassOpacity(glassConfig) {
    if (typeof window === 'undefined' || window === null || !glassConfig) {
        return glassConfig?.opacity;
    }
    const { responsiveOpacity } = glassConfig;
    if (!responsiveOpacity) {
        return glassConfig.opacity;
    }
    const isDesktop = window.innerWidth > UI_BREAKPOINTS.MOBILE;
    const desiredOpacity = isDesktop ? responsiveOpacity.desktop : responsiveOpacity.mobile;
    if (typeof desiredOpacity === 'number') {
        return desiredOpacity;
    }
    return glassConfig.opacity;
}

function applyResponsiveGlassOpacity(targetConfig = window.pieChartGlassEffect) {
    if (!targetConfig) {
        return;
    }
    const resolvedOpacity = computeGlassOpacity(targetConfig);
    targetConfig.opacity =
        typeof resolvedOpacity === 'number' ? resolvedOpacity : targetConfig.opacity;
}

if (
    typeof window !== 'undefined' &&
    typeof process !== 'undefined' &&
    process.env &&
    process.env.NODE_ENV === 'test'
) {
    window.__testGlassHelpers = {
        cloneGlassEffectConfig,
        computeGlassOpacity,
        applyResponsiveGlassOpacity,
    };
}

window.pieChartGlassEffect = cloneGlassEffectConfig(PIE_CHART_GLASS_EFFECT);
applyResponsiveGlassOpacity();

// Initialize application with visibility checks
async function startApp() {
    try {
        const fxResponse = await fetch('../data/fx_data.json?t=' + new Date().getTime());
        if (!fxResponse.ok) {
            throw new Error('Failed to load FX data');
        }
        const fxData = await fxResponse.json();
        exchangeRates = fxData.rates || { USD: 1.0 };
    } catch (error) {
        logger.error('Error loading exchange rates:', error);
        // Keep default exchangeRates if loading fails
    }

    if (typeof Chart !== 'undefined') {
        if (typeof ChartDataLabels !== 'undefined') {
            Chart.register(ChartDataLabels);
        } else {
            logger.warn('ChartDataLabels plugin NOT found. Ensure it is loaded before main.js.');
        }
        Chart.register(customArcBordersPlugin);
        Chart.register(waveAnimationPlugin);

        initCurrencyToggle();
        const storedCurrency = getStoredCurrency();
        if (storedCurrency) {
            currentSelectedCurrency = storedCurrency;
        }
        applyCurrencySelection(currentSelectedCurrency, { emitEvent: false });
        initFooterToggle();

        // Wait for multiple animation frames to ensure proper layout in real browsers.
        // In test environments, skip this to avoid flakiness from timer/raf scheduling.
        const isTestEnv =
            typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test';
        if (!isTestEnv) {
            await new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve))
            );
        }

        try {
            // Load data, render chart (which also calls checkAndToggleVerticalScroll)
            await loadAndDisplayPortfolioData(
                currentSelectedCurrency,
                exchangeRates,
                CURRENCY_SYMBOLS
            );
            // Now that chart is rendered and initial scroll check is done:
            alignToggleWithChartMobile(); // Align toggle based on the rendered chart

            // Trigger toggle animation after chart loads (mobile only)
            if (window.innerWidth <= 768) {
                setTimeout(() => {
                    const toggleContainer = document.querySelector('#currencyToggleContainer');
                    if (toggleContainer) {
                        toggleContainer.classList.add('chart-loaded');
                    }
                }, 200); // Small delay to ensure chart is fully rendered
            }
            // Keep initial UI minimal on first load (no footer/table)
        } catch (error) {
            logger.error('Error during initial portfolio data load and display:', error);
        }
    } else {
        logger.error(
            'Chart.js core NOT found. Ensure it is loaded before main.js. App initialization skipped.'
        );
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    // DOM already ready (e.g., when module is injected after load)
    startApp();
}

// Handle responsive adjustments
window.addEventListener('resize', () => {
    applyResponsiveGlassOpacity();
    checkAndToggleVerticalScroll(); // Handles general scroll state on resize
    alignToggleWithChartMobile(); // Re-align on resize
});

// Keyboard shortcuts
// - ArrowDown/ArrowUp: toggle same behavior as clicking the pie center
// - ArrowLeft/ArrowRight: cycle currencies (also support Cmd+ArrowLeft/Right)
window.addEventListener('keydown', (e) => {
    // Allow Cmd/Ctrl + ArrowLeft/Right for currency cycling even with modifiers
    if ((e.metaKey || e.ctrlKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        cycleCurrency(e.key === 'ArrowRight' ? 1 : -1);
        return;
    }
    if (e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) {
        return;
    }
    const active = document.activeElement;
    if (
        active &&
        (active.tagName === 'INPUT' ||
            active.tagName === 'TEXTAREA' ||
            active.tagName === 'SELECT' ||
            active.isContentEditable)
    ) {
        return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        triggerCenterToggle();
        return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        cycleCurrency(e.key === 'ArrowRight' ? 1 : -1);
    }
});

// Listen for global currency changes from the toggle
document.addEventListener('currencyChangedGlobal', async (event) => {
    currentSelectedCurrency = event.detail.currency;
    logger.log(
        `Global currency selected: ${currentSelectedCurrency}. Portfolio display will update.`
    );
    try {
        await loadAndDisplayPortfolioData(currentSelectedCurrency, exchangeRates, CURRENCY_SYMBOLS);
        // After chart update, re-align the toggle
        alignToggleWithChartMobile();
    } catch (error) {
        logger.error('Error updating portfolio on currency change:', error);
    }
});

setInterval(async () => {
    try {
        if (typeof document !== 'undefined' && document.hidden) {
            return; // Skip updates when page is not visible
        }
        await loadAndDisplayPortfolioData(currentSelectedCurrency, exchangeRates, CURRENCY_SYMBOLS);
        alignToggleWithChartMobile();
    } catch (error) {
        logger.error('Error during scheduled portfolio data update:', error);
    }
}, APP_SETTINGS.DATA_REFRESH_INTERVAL);

// Refresh when tab becomes visible again
document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
        try {
            await loadAndDisplayPortfolioData(
                currentSelectedCurrency,
                exchangeRates,
                CURRENCY_SYMBOLS
            );
            alignToggleWithChartMobile();
        } catch (error) {
            logger.error('Error updating portfolio on visibility change:', error);
        }
    }
});
