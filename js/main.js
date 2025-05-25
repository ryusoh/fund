// Assuming Chart and ChartDataLabels are globally available from CDN.
import { customArcBordersPlugin } from './plugins/customArcBordersPlugin.js';
import { waveAnimationPlugin } from './plugins/waveAnimationPlugin.js';
import { loadAndDisplayPortfolioData } from './app/dataService.js';
import { APP_SETTINGS } from './config.js';
import { checkAndToggleVerticalScroll } from './ui/responsive.js';

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    // Register Chart.js plugins here, after DOM is ready and Chart object should be available
    if (typeof Chart !== 'undefined') {
        if (typeof ChartDataLabels !== 'undefined') {
            Chart.register(ChartDataLabels);
        } else {
            console.warn('ChartDataLabels plugin not found. Ensure it is loaded before main.js.');
        }
        Chart.register(customArcBordersPlugin);
        Chart.register(waveAnimationPlugin);

        // Now initialize the application
        loadAndDisplayPortfolioData().catch(error => {
            console.error('Error during initial data fetch and update:', error);
        });
    } else {
        console.error('Chart.js core not found. Ensure it is loaded before main.js.');
    }

    // Initial responsive check
    checkAndToggleVerticalScroll();
});

// Handle responsive adjustments
window.addEventListener('resize', checkAndToggleVerticalScroll);

setInterval(loadAndDisplayPortfolioData, APP_SETTINGS.DATA_REFRESH_INTERVAL);
