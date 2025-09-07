import { initCalendar } from '@pages/calendar/index.js';
import { getCalendarData } from '@services/dataService.js';

jest.mock('@services/dataService.js', () => ({
    getCalendarData: jest.fn(),
}));

jest.mock('@ui/currencyToggleManager.js', () => ({
    initCurrencyToggle: jest.fn(),
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

jest.mock('https://cdn.jsdelivr.net/npm/cal-heatmap@4.2.4/+esm', () =>
    jest.fn().mockImplementation(() => mockCalHeatmapInstance)
);

// Mock D3 CDN import minimally
jest.mock('https://cdn.jsdelivr.net/npm/d3@7/+esm', () => {
    const chain = {
        select: jest.fn().mockReturnThis(),
        selectAll: jest.fn().mockReturnThis(),
        each: jest.fn().mockReturnThis(),
        html: jest.fn().mockReturnThis(),
        append: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        attr: jest.fn().mockReturnThis(),
        datum: jest.fn().mockReturnValue({ t: Date.now() }),
    };
    return chain;
});

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

        getCalendarData.mockResolvedValue({
            processedData: [{ date: '2025-01-01', value: 0.1, total: 1000 }],
            byDate: new Map([['2025-01-01', { date: '2025-01-01', value: 0.1, total: 1000 }]]),
            rates: { USD: 1 },
        });
    });

    it('covers ArrowDown when today button is absent', async () => {
        await initCalendar();
        // Should not throw; just exercise the false branch of todayBtnEl
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown' }));
    });
});
