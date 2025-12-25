import {
    BASE_URL,
    getBaseUrl,
    HOLDINGS_DETAILS_URL,
    FUND_DATA_URL,
    COLORS,
    CHART_DEFAULTS,
    APP_SETTINGS,
    UI_BREAKPOINTS,
    CURRENCY_SYMBOLS,
    COLOR_PALETTES,
    PLUGIN_CONFIGS,
    TICKER_TO_LOGO_MAP,
    DATA_PATHS,
    CALENDAR_SELECTORS,
    CALENDAR_CONFIG,
    INITIAL_CHART_DATE_RANGE,
} from '@js/config.js';
import { isLocalhost } from '@utils/host';

jest.mock('@utils/host');

describe('Configuration', () => {
    // Test BASE_URL
    describe('BASE_URL', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should return an empty string for localhost environments', () => {
            isLocalhost.mockImplementation((hostname) => hostname === 'localhost');
            expect(
                getBaseUrl({
                    hostname: 'localhost',
                    pathname: '/',
                })
            ).toBe('');
        });

        it('should return "/fund" when served from the fund subdirectory on production', () => {
            isLocalhost.mockReturnValue(false);
            expect(
                getBaseUrl({
                    hostname: 'lyeutsaon.com',
                    pathname: '/fund/',
                })
            ).toBe('/fund');
        });

        it('should return an empty string when served from the fund subdomain root', () => {
            isLocalhost.mockReturnValue(false);
            expect(
                getBaseUrl({
                    hostname: 'fund.lyeutsaon.com',
                    pathname: '/',
                })
            ).toBe('');
        });

        it('should match the value derived from the current window location', () => {
            isLocalhost.mockImplementation((hostname) => hostname === 'localhost');
            expect(BASE_URL).toBe('');
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
                value: 500,
            });
            jest.isolateModules(() => {
                const { CALENDAR_CONFIG } = require('@js/config.js');
                expect(CALENDAR_CONFIG.range).toBe(1);
            });
        });

        it('should have a range of 3 on desktop', () => {
            Object.defineProperty(window, 'innerWidth', {
                writable: true,
                value: 1024,
            });
            jest.isolateModules(() => {
                const { CALENDAR_CONFIG } = require('@js/config.js');
                expect(CALENDAR_CONFIG.range).toBe(3);
            });
        });
    });

    // Test INITIAL_CHART_DATE_RANGE
    describe('INITIAL_CHART_DATE_RANGE', () => {
        it('should be defined with from and to properties', () => {
            expect(INITIAL_CHART_DATE_RANGE).toBeDefined();
            expect(INITIAL_CHART_DATE_RANGE).toHaveProperty('from');
            expect(INITIAL_CHART_DATE_RANGE).toHaveProperty('to');
        });

        it('should default to from start of 2024', () => {
            // Default filter starts from start of 2024
            expect(INITIAL_CHART_DATE_RANGE.from).toBe('2024-01-01');
            expect(INITIAL_CHART_DATE_RANGE.to).toBeNull();
        });

        it('should have valid date format for from value when set', () => {
            if (INITIAL_CHART_DATE_RANGE.from !== null) {
                // Verify YYYY-MM-DD format
                expect(INITIAL_CHART_DATE_RANGE.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            }
        });
    });
});
