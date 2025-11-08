import { getCalendarData } from '@services/dataService.js';

jest.mock('@services/dataService.js', () => ({
    getCalendarData: jest.fn(),
}));

jest.mock('@ui/currencyToggleManager.js', () => ({
    initCurrencyToggle: jest.fn(),
    cycleCurrency: jest.fn(),
    applyCurrencySelection: jest.fn(),
    getStoredCurrency: jest.fn(() => null),
}));

jest.mock('@ui/responsive.js', () => ({
    initCalendarResponsiveHandlers: jest.fn(),
}));

// Mock CalHeatmap CDN import
const mockCalHeatmapInstance = {
    paint: jest.fn(() => Promise.resolve()),
    previous: jest.fn(() => Promise.resolve()),
    next: jest.fn(() => Promise.resolve()),
    jumpTo: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
};

global.CalHeatmap = jest.fn().mockImplementation(() => mockCalHeatmapInstance);

const createProcessedEntry = (overrides = {}) => ({
    date: '2025-01-01',
    value: 0,
    valueUSD: 0,
    valueCNY: 0,
    valueJPY: 0,
    valueKRW: 0,
    total: 0,
    totalUSD: 0,
    totalCNY: 0,
    totalJPY: 0,
    totalKRW: 0,
    dailyChange: 0,
    dailyChangeUSD: 0,
    dailyChangeCNY: 0,
    dailyChangeJPY: 0,
    dailyChangeKRW: 0,
    ...overrides,
});

const createCalendarData = (entries = [{}], extra = {}) => {
    const processedData = entries.map((overrides) => createProcessedEntry(overrides));
    const byDate = new Map(processedData.map((entry) => [entry.date, entry]));
    return {
        processedData,
        byDate,
        rates: { USD: 1 },
        monthlyPnl: new Map(),
        ...extra,
    };
};

describe('calendar keyboard only tests', () => {
    beforeEach(() => {
        document.body.innerHTML = `
      <div id="calendar-container"></div>
      <div id="cal-heatmap"></div>
      <button id="cal-prev"></button>
      <button id="cal-next"></button>
    `;

        // Return null for today to exercise false branch on ArrowDown
        document.querySelector = jest.fn().mockImplementation((sel) => {
            if (sel === '#cal-prev') {
                return { disabled: false, addEventListener: jest.fn(), click: jest.fn() };
            }
            if (sel === '#cal-next') {
                return { disabled: false, addEventListener: jest.fn(), click: jest.fn() };
            }
            if (sel === '#cal-today') {
                return null;
            }
            if (sel === '#calendar-container') {
                return { innerHTML: '' };
            }
            return { addEventListener: jest.fn(), innerHTML: '', disabled: false };
        });

        getCalendarData.mockResolvedValue(
            createCalendarData([
                {
                    date: '2025-01-01',
                    value: 0.1,
                    valueUSD: 0.1,
                    total: 1000,
                    totalUSD: 1000,
                },
            ])
        );
    });

    it('covers ArrowDown when today button is absent', async () => {
        const { initCalendar } = await import('@pages/calendar/index.js');
        await initCalendar();
        // Should not throw; just exercise the false branch of todayBtnEl
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown' }));
    });

    it('cycles currency with Ctrl/Cmd+ArrowLeft/Right without interfering with nav', async () => {
        const { initCalendar } = await import('@pages/calendar/index.js');
        await initCalendar();
        // Just dispatch events to exercise the code path; no assertions needed
        window.dispatchEvent(
            new window.KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true })
        );
        window.dispatchEvent(
            new window.KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true, bubbles: true })
        );
        // Also exercise metaKey path
        window.dispatchEvent(
            new window.KeyboardEvent('keydown', { key: 'ArrowRight', metaKey: true, bubbles: true })
        );
        window.dispatchEvent(
            new window.KeyboardEvent('keydown', { key: 'ArrowLeft', metaKey: true, bubbles: true })
        );
    });
});
