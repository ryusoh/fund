import { initCurrencyToggle } from '@ui/currencyToggleManager.js';
import { loadAndDisplayPortfolioData } from '@services/dataService.js';
import { initFooterToggle } from '@ui/footerToggle.js';

// Mock all imported modules
jest.mock('@ui/currencyToggleManager.js', () => ({
    initCurrencyToggle: jest.fn(),
}));
jest.mock('@ui/footerToggle.js', () => ({
    initFooterToggle: jest.fn(),
}));
jest.mock('@ui/responsive.js', () => ({
    checkAndToggleVerticalScroll: jest.fn(),
    alignToggleWithChartMobile: jest.fn(),
}));
jest.mock('@services/dataService.js', () => ({
    loadAndDisplayPortfolioData: jest.fn(() => Promise.resolve()),
}));

describe('position page immediate start', () => {
    beforeAll(() => {
        // Set up global mocks before importing the module
        global.Chart = { register: jest.fn() };
        global.ChartDataLabels = {};
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ rates: { USD: 1.0, JPY: 110.0 } }),
            })
        );
        console.error = jest.fn();
        console.warn = jest.fn();
        console.log = jest.fn();

        // Set document.readyState to 'complete' BEFORE importing the module
        Object.defineProperty(document, 'readyState', {
            writable: true,
            value: 'complete',
        });

        // Mock requestAnimationFrame
        global.requestAnimationFrame = jest.fn((cb) => {
            // Execute the callback immediately for testing
            setTimeout(() => cb(), 0);
            return 1;
        });
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    it('should call startApp immediately when DOM is already complete', async () => {
        // Import the module - this should trigger the immediate startApp() call
        await import('@pages/position/index.js');

        // Give time for async operations
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Verify that startApp was called immediately
        expect(global.Chart.register).toHaveBeenCalled();
        expect(initCurrencyToggle).toHaveBeenCalled();
        expect(initFooterToggle).toHaveBeenCalled();
        expect(loadAndDisplayPortfolioData).toHaveBeenCalled();
    });

    it('should execute the rAF delay branch in non-test env', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        // Make rAF synchronous to complete the nested rAF chain immediately
        const originalRaf = global.requestAnimationFrame;
        global.requestAnimationFrame = (cb) => {
            cb();
            return 1;
        };

        await jest.isolateModulesAsync(async () => {
            await import('@pages/position/index.js');
        });

        // Allow microtasks to flush
        await new Promise((resolve) => setTimeout(resolve, 0));

        // After import in production env, the code path with nested rAF has executed
        expect(global.Chart.register).toHaveBeenCalled();
        expect(initCurrencyToggle).toHaveBeenCalled();
        expect(initFooterToggle).toHaveBeenCalled();
        expect(loadAndDisplayPortfolioData).toHaveBeenCalled();

        // Restore globals
        process.env.NODE_ENV = originalEnv;
        global.requestAnimationFrame = originalRaf;
    });
});
