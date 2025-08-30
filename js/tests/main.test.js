import { initCurrencyToggle } from '../ui/currencyToggleManager.js';
import { loadAndDisplayPortfolioData } from '../app/dataService.js';
import { initFooterToggle } from '../ui/footerToggle.js';
import { APP_SETTINGS } from '../config.js';
import { checkAndToggleVerticalScroll, alignToggleWithChartMobile } from '../ui/responsive.js';

// Mock all imported modules
jest.mock('../ui/currencyToggleManager.js', () => ({
  initCurrencyToggle: jest.fn(),
}));
jest.mock('../ui/footerToggle.js', () => ({
  initFooterToggle: jest.fn(),
}));
jest.mock('../ui/responsive.js', () => ({
  checkAndToggleVerticalScroll: jest.fn(),
  alignToggleWithChartMobile: jest.fn(),
}));
jest.mock('../app/dataService.js', () => ({
  loadAndDisplayPortfolioData: jest.fn(() => Promise.resolve()),
}));

describe('main.js application entry point', () => {
  const documentEventListeners = {};
  const windowEventListeners = {};
  let setIntervalCallback;
  let visibilityHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '<div id="fundPieChartContainer"></div>';
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

    jest.spyOn(document, 'addEventListener').mockImplementation((event, callback) => {
      documentEventListeners[event] = callback;
      if (event === 'visibilitychange') {
        visibilityHandler = callback;
      }
    });

    jest.spyOn(window, 'addEventListener').mockImplementation((event, callback) => {
        windowEventListeners[event] = callback;
    });

    jest.spyOn(window, 'setInterval').mockImplementation((callback, interval) => {
      setIntervalCallback = callback;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should prevent default on dblclick', async () => {
    await import('../main.js');
    const event = new Event('dblclick', { bubbles: true, cancelable: true });
    const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
    documentEventListeners.dblclick(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('should initialize Chart plugins and UI on load', async () => {
    await import('../main.js');
    await documentEventListeners.DOMContentLoaded();
    // Chart.register should be called for ChartDataLabels and two custom plugins
    expect(global.Chart.register).toHaveBeenCalled();
    expect(initCurrencyToggle).toHaveBeenCalled();
    expect(initFooterToggle).toHaveBeenCalled();
    expect(loadAndDisplayPortfolioData).toHaveBeenCalledWith('USD', { USD: 1.0, JPY: 110.0 }, expect.any(Object));
    expect(alignToggleWithChartMobile).toHaveBeenCalled();
  });

  it('should handle failed FX data fetch with ok:false', async () => {
    global.fetch.mockImplementationOnce(() => Promise.resolve({ ok: false }));
    await import('../main.js');
    await documentEventListeners.DOMContentLoaded();
    expect(console.error).toHaveBeenCalledWith('Error loading exchange rates:', expect.any(Error));
  });

  it('should handle failed FX data fetch with no rates', async () => {
    global.fetch.mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    await import('../main.js');
    await documentEventListeners.DOMContentLoaded();
    expect(loadAndDisplayPortfolioData).toHaveBeenCalledWith('USD', { USD: 1 }, expect.any(Object));
  });

  it('should handle failed FX data fetch', async () => {
    global.fetch.mockImplementationOnce(() => Promise.reject(new Error('Network error')));
    await import('../main.js');
    await documentEventListeners.DOMContentLoaded();
    expect(console.error).toHaveBeenCalledWith('Error loading exchange rates:', expect.any(Error));
  });

  it('should warn if ChartDataLabels is not found', async () => {
    global.ChartDataLabels = undefined;
    await import('../main.js');
    await documentEventListeners.DOMContentLoaded();
    expect(console.warn).toHaveBeenCalledWith('ChartDataLabels plugin NOT found. Ensure it is loaded before main.js.');
    // Plugins still register without ChartDataLabels
    expect(global.Chart.register).toHaveBeenCalled();
  });

  it('should error if Chart.js is not found', async () => {
    global.Chart = undefined;
    await import('../main.js');
    await documentEventListeners.DOMContentLoaded();
    expect(console.error).toHaveBeenCalledWith('Chart.js core NOT found. Ensure it is loaded before main.js. App initialization skipped.');
  });

  it('should handle error during initial data load', async () => {
    loadAndDisplayPortfolioData.mockImplementationOnce(() => Promise.reject(new Error('Initial load error')));
    await import('../main.js');
    await documentEventListeners.DOMContentLoaded();
    expect(console.error).toHaveBeenCalledWith('Error during initial portfolio data load and display:', expect.any(Error));
  });

  it('should handle currency change', async () => {
    await import('../main.js');
    await documentEventListeners.DOMContentLoaded();
    const event = new CustomEvent('currencyChangedGlobal', { detail: { currency: 'JPY' } });
    await documentEventListeners.currencyChangedGlobal(event);
    expect(console.log).toHaveBeenCalledWith('Global currency selected: JPY. Portfolio display will update.');
    expect(loadAndDisplayPortfolioData).toHaveBeenCalledWith('JPY', { USD: 1, JPY: 110 }, expect.any(Object));
    expect(alignToggleWithChartMobile).toHaveBeenCalled();
  });

  it('should handle error on currency change', async () => {
    await import('../main.js');
    await documentEventListeners.DOMContentLoaded();
    loadAndDisplayPortfolioData.mockImplementationOnce(() => Promise.reject(new Error('Currency change error')));
    const event = new CustomEvent('currencyChangedGlobal', { detail: { currency: 'JPY' } });
    await documentEventListeners.currencyChangedGlobal(event);
    expect(console.error).toHaveBeenCalledWith('Error updating portfolio on currency change:', expect.any(Error));
  });

  it('should handle resize', async () => {
    await import('../main.js');
    await documentEventListeners.DOMContentLoaded();
    windowEventListeners.resize();
    expect(checkAndToggleVerticalScroll).toHaveBeenCalled();
    expect(alignToggleWithChartMobile).toHaveBeenCalled();
  });

  it('should handle scheduled update', async () => {
    await import('../main.js');
    await documentEventListeners.DOMContentLoaded();
    await setIntervalCallback();
    expect(loadAndDisplayPortfolioData).toHaveBeenCalledTimes(2);
    expect(alignToggleWithChartMobile).toHaveBeenCalled();
  });

  it('should skip scheduled update when document is hidden', async () => {
    await import('../main.js');
    await documentEventListeners.DOMContentLoaded();
    // Pretend the document is hidden
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    await setIntervalCallback();
    // Only the initial call from DOMContentLoaded should have occurred
    expect(loadAndDisplayPortfolioData).toHaveBeenCalledTimes(1);
  });

  it('should refresh on visibility change to visible', async () => {
    await import('../main.js');
    await documentEventListeners.DOMContentLoaded();
    // Hidden -> Visible
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    await documentEventListeners.visibilitychange();
    expect(loadAndDisplayPortfolioData).toHaveBeenCalledTimes(2);
    expect(alignToggleWithChartMobile).toHaveBeenCalled();
  });

  it('should handle error during scheduled update', async () => {
    await import('../main.js');
    await documentEventListeners.DOMContentLoaded();
    loadAndDisplayPortfolioData.mockImplementationOnce(() => Promise.reject(new Error('Scheduled update error')));
    await setIntervalCallback();
    expect(console.error).toHaveBeenCalledWith('Error during scheduled portfolio data update:', expect.any(Error));
  });

  it('should handle error on visibility change refresh', async () => {
    await import('../main.js');
    await documentEventListeners.DOMContentLoaded();
    loadAndDisplayPortfolioData.mockImplementationOnce(() => Promise.reject(new Error('Visibility error')));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    await documentEventListeners.visibilitychange();
    expect(console.error).toHaveBeenCalledWith('Error updating portfolio on visibility change:', expect.any(Error));
  });

  it('should not refresh on visibility change when hidden', async () => {
    await import('../main.js');
    await documentEventListeners.DOMContentLoaded();
    const initialCalls = loadAndDisplayPortfolioData.mock.calls.length; // 1
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    await documentEventListeners.visibilitychange();
    expect(loadAndDisplayPortfolioData).toHaveBeenCalledTimes(initialCalls);
  });
});
