import { BASE_URL, HOLDINGS_DETAILS_URL, FUND_DATA_URL, COLORS, CHART_DEFAULTS, APP_SETTINGS, UI_BREAKPOINTS, CURRENCY_SYMBOLS, COLOR_PALETTES, PLUGIN_CONFIGS, TICKER_TO_LOGO_MAP, DATA_PATHS, CALENDAR_SELECTORS, CALENDAR_CONFIG } from '@js/config.js';
import { isLocalhost } from '@utils/host';

jest.mock('../utils/host');

describe('Configuration', () => {

    // Test BASE_URL
    describe('BASE_URL', () => {
        it('should be an empty string when isLocalhost is true', () => {
            isLocalhost.mockReturnValue(true);
            const { BASE_URL } = require('../config.js');
            expect(BASE_URL).toBe('/fund');
        });

        it('should be "/fund" when isLocalhost is false', () => {
            isLocalhost.mockReturnValue(false);
            const { BASE_URL } = require('../config.js');
            expect(BASE_URL).toBe('/fund');
        });
    });

    // Test other constants
    it('should have correct values for other constants', () => {
        expect(HOLDINGS_DETAILS_URL).toBe('../data/holdings_details.json');
        expect(FUND_DATA_URL).toBe('../data/fund_data.json');
        expect(COLORS).toEqual({
            POSITIVE_PNL: '#34A853',
            NEGATIVE_PNL: '#EA4335',
        });
        expect(CHART_DEFAULTS).toBeDefined();
        expect(APP_SETTINGS).toEqual({ DATA_REFRESH_INTERVAL: 300000 });
        expect(UI_BREAKPOINTS).toEqual({ MOBILE: 768 });
        expect(CURRENCY_SYMBOLS).toEqual({
            USD: '$',
            CNY: '¥',
            JPY: '¥',
            KRW: '₩',
        });
        expect(COLOR_PALETTES).toBeDefined();
        expect(PLUGIN_CONFIGS).toBeDefined();
        expect(TICKER_TO_LOGO_MAP).toBeDefined();
        expect(DATA_PATHS).toBeDefined();
        expect(CALENDAR_SELECTORS).toBeDefined();
    });

    // Test CALENDAR_CONFIG
    describe('CALENDAR_CONFIG', () => {
        it('should have a subDomain configuration with executable label and color functions', () => {
            expect(CALENDAR_CONFIG.subDomain).toBeDefined();
            expect(typeof CALENDAR_CONFIG.subDomain.label).toBe('function');
            expect(CALENDAR_CONFIG.subDomain.label()).toBe('');
            expect(typeof CALENDAR_CONFIG.subDomain.color).toBe('function');
            expect(CALENDAR_CONFIG.subDomain.color()).toBe('white');
        });

        it('should have a range of 1 on mobile', () => {
            Object.defineProperty(window, 'innerWidth', {
                writable: true,
                value: 500
            });
            jest.isolateModules(() => {
                const { CALENDAR_CONFIG } = require('../config.js');
                expect(CALENDAR_CONFIG.range).toBe(1);
            });
        });

        it('should have a range of 3 on desktop', () => {
            Object.defineProperty(window, 'innerWidth', {
                writable: true,
                value: 1024
            });
            jest.isolateModules(() => {
                const { CALENDAR_CONFIG } = require('../config.js');
                expect(CALENDAR_CONFIG.range).toBe(3);
            });
        });
    });
});
