// Assuming Chart and ChartDataLabels are globally available from CDN.
import { customArcBordersPlugin } from './plugins/customArcBordersPlugin.js';
import { waveAnimationPlugin } from './plugins/waveAnimationPlugin.js';
import { loadAndDisplayPortfolioData } from './app/dataService.js';
import { initCurrencyToggle } from './ui/currencyToggleManager.js';
import { APP_SETTINGS, CURRENCY_SYMBOLS } from './config.js';
import { checkAndToggleVerticalScroll } from './ui/responsive.js';

let currentSelectedCurrency = 'USD'; // Default currency
let exchangeRates = { USD: 1.0 }; // Default rates, will be updated

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOMContentLoaded event fired.'); // Log 1

    try {
        const fxResponse = await fetch('./data/fx_data.json?t=' + new Date().getTime());
        if (!fxResponse.ok) throw new Error('Failed to load FX data');
        const fxData = await fxResponse.json();
        exchangeRates = fxData.rates || { USD: 1.0 };
        console.log('Exchange rates loaded:', exchangeRates);
    } catch (error) {
        console.error('Error loading exchange rates:', error);
        // Keep default exchangeRates if loading fails
    }

    if (typeof Chart !== 'undefined') {
        console.log('Chart.js found.'); // Log 2
        if (typeof ChartDataLabels !== 'undefined') {
            console.log('ChartDataLabels plugin found. Registering plugins...'); // Log 3
            Chart.register(ChartDataLabels);
        } else {
            console.warn('ChartDataLabels plugin NOT found. Ensure it is loaded before main.js.'); // Log 3b (Warning)
        }
        Chart.register(customArcBordersPlugin);
        Chart.register(waveAnimationPlugin);
        console.log('Chart.js plugins registered.'); // Log 4

        console.log('Attempting to initialize currency toggle...'); // Log 5
        initCurrencyToggle();
        console.log('Attempting to load and display portfolio data...'); // Log 6
        triggerPortfolioUpdate();
    } else {
        console.error('Chart.js core NOT found. Ensure it is loaded before main.js. App initialization skipped.'); // Log 2b (Error)
    }

    // Initial responsive check
    checkAndToggleVerticalScroll();
});

function triggerPortfolioUpdate() {
    loadAndDisplayPortfolioData(currentSelectedCurrency, exchangeRates, CURRENCY_SYMBOLS)
        .catch(error => {
            console.error('Error during portfolio data fetch and update:', error);
        });
}

// Handle responsive adjustments
window.addEventListener('resize', checkAndToggleVerticalScroll);

// Listen for global currency changes from the toggle
document.addEventListener('currencyChangedGlobal', (event) => {
    currentSelectedCurrency = event.detail.currency;
    console.log(`Global currency selected: ${currentSelectedCurrency}. Portfolio display will update.`);
    triggerPortfolioUpdate();
});

setInterval(triggerPortfolioUpdate, APP_SETTINGS.DATA_REFRESH_INTERVAL);
