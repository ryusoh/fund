import 'd3';
import { getCalendarData } from '@services/dataService.js';
import { initCalendar } from '@pages/calendar/index.js';

jest.mock('@services/dataService.js', () => ({
    getCalendarData: jest.fn(),
}));

jest.mock('@ui/currencyToggleManager.js', () => ({
    initCurrencyToggle: jest.fn(),
    cycleCurrency: jest.fn(),
    applyCurrencySelection: jest.fn(),
    getStoredCurrency: jest.fn(() => null),
}));

describe('calendar page XSS reproduction', () => {
    beforeEach(() => {
        document.body.innerHTML = `
      <div id="calendar-container"></div>
    `;

        jest.clearAllMocks();

        // Ensure document.querySelector returns our container for the selector used in code
        const originalQuerySelector = document.querySelector;
        document.querySelector = jest.fn().mockImplementation((selector) => {
            if (selector === '#calendar-container') {
                return document.getElementById('calendar-container');
            }
            return originalQuerySelector.call(document, selector);
        });
    });

    it('should NOT render error message as HTML (XSS check)', async () => {
        const xssPayload = '<img src=x onerror=window.xssExecuted=true>';
        const error = new Error(xssPayload);
        getCalendarData.mockRejectedValue(error);

        await initCalendar();

        const container = document.getElementById('calendar-container');

        // If fixed, it will be <p>&lt;img src=x onerror=window.xssExecuted=true&gt;</p>
        const imgTag = container.querySelector('img');

        // After fix, the <img> tag should NOT exist as it should be escaped text
        expect(imgTag).toBeNull();
        expect(container.textContent).toContain(xssPayload);
    });
});
