// Disable double-click zoom
document.addEventListener('dblclick', function(event) {
    event.preventDefault();
}, { passive: false });

// Assuming Chart and ChartDataLabels are globally available from CDN.
import { customArcBordersPlugin } from './plugins/customArcBordersPlugin.js';
import { waveAnimationPlugin } from './plugins/waveAnimationPlugin.js';
import { loadAndDisplayPortfolioData } from './app/dataService.js';
import { initCurrencyToggle } from './ui/currencyToggleManager.js';
import { initFooterToggle } from './ui/footerToggle.js';
import { APP_SETTINGS, CURRENCY_SYMBOLS } from './config.js';
import { checkAndToggleVerticalScroll, alignToggleWithChartMobile } from './ui/responsive.js';

let currentSelectedCurrency = 'USD'; // Default currency
let exchangeRates = { USD: 1.0 }; // Default rates, will be updated

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const fxResponse = await fetch('../data/fx_data.json?t=' + new Date().getTime());
        if (!fxResponse.ok) throw new Error('Failed to load FX data');
        const fxData = await fxResponse.json();
        exchangeRates = fxData.rates || { USD: 1.0 };
        console.log('Exchange rates loaded:', exchangeRates);
    } catch (error) {
        console.error('Error loading exchange rates:', error);
        // Keep default exchangeRates if loading fails
    }

    if (typeof Chart !== 'undefined') {
        if (typeof ChartDataLabels !== 'undefined') {
            Chart.register(ChartDataLabels);
        } else {
            console.warn('ChartDataLabels plugin NOT found. Ensure it is loaded before main.js.');
        }
        Chart.register(customArcBordersPlugin);
        Chart.register(waveAnimationPlugin);

        initCurrencyToggle();
        initFooterToggle();

        try {
            // Load data, render chart (which also calls checkAndToggleVerticalScroll)
            await loadAndDisplayPortfolioData(currentSelectedCurrency, exchangeRates, CURRENCY_SYMBOLS);
            // Now that chart is rendered and initial scroll check is done:
            alignToggleWithChartMobile(); // Align toggle based on the rendered chart
        } catch (error) {
            console.error('Error during initial portfolio data load and display:', error);
        }
    } else {
        console.error('Chart.js core NOT found. Ensure it is loaded before main.js. App initialization skipped.');
    }
});

// Handle responsive adjustments
window.addEventListener('resize', () => {
    checkAndToggleVerticalScroll(); // Handles general scroll state on resize
    alignToggleWithChartMobile(); // Re-align on resize
});

// Listen for global currency changes from the toggle
document.addEventListener('currencyChangedGlobal', async (event) => {
    currentSelectedCurrency = event.detail.currency;
    console.log(`Global currency selected: ${currentSelectedCurrency}. Portfolio display will update.`);
    try {
        await loadAndDisplayPortfolioData(currentSelectedCurrency, exchangeRates, CURRENCY_SYMBOLS);
        // After chart update, re-align the toggle
        alignToggleWithChartMobile();
    } catch (error) {
        console.error('Error updating portfolio on currency change:', error);
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
        console.error('Error during scheduled portfolio data update:', error);
    }
}, APP_SETTINGS.DATA_REFRESH_INTERVAL);

// Refresh when tab becomes visible again
document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
        try {
            await loadAndDisplayPortfolioData(currentSelectedCurrency, exchangeRates, CURRENCY_SYMBOLS);
            alignToggleWithChartMobile();
        } catch (error) {
            console.error('Error updating portfolio on visibility change:', error);
        }
    }
});
