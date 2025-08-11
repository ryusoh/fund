const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
export const BASE_URL = isLocalhost ? '' : '/fund';

export const HOLDINGS_DETAILS_URL = '../data/holdings_details.json';
export const FUND_DATA_URL = '../data/fund_data.json';

export const COLORS = {
    POSITIVE_PNL: '#34A853', // Darker, less saturated green
    NEGATIVE_PNL: '#EA4335', // Darker, less saturated red
};

export const CHART_DEFAULTS = {
    BORDER_COLOR: 'rgba(84, 84, 88, 0.5)',
    BORDER_WIDTH: 0.5,
    BACKGROUND_ALPHA: 0.9, // Used for pie slice background
    // For chart datalabels and general text
    DATALABELS_COLOR: 'rgba(235, 235, 245, 0.6)',
    DEFAULT_FONT_FAMILY: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
    DATALABELS_FONT_SIZE: 10,
    DATALABELS_OFFSET: 8,
    DATALABELS_CONNECTOR_WIDTH: 1,
    // Chart layout
    LAYOUT_PADDING: { right: 35, left: 35 },
};

export const APP_SETTINGS = {
    DATA_REFRESH_INTERVAL: 300000, // ms (5 minutes)
};

export const UI_BREAKPOINTS = {
    MOBILE: 768, // px
};

export const CURRENCY_SYMBOLS = {
    USD: '$',
    CNY: '¥',
    JPY: '¥',
    KRW: '₩',
};

export const COLOR_PALETTES = {
    // Palette for pie chart slices
    PIE_CHART_SLICE_COLORS: [
        '#2B2B2B', '#333333', '#4F4F4F', '#606060',
        '#757575', '#888888', '#A0A0A0', '#BDBDBD'
    ]
};

export const PLUGIN_CONFIGS = {
    // Configuration for waveAnimationPlugin
    WAVE_ANIMATION: {
        MAX_WAVES: 10,
        SPAWN_INTERVAL: 80,
        SPEED: 1,
        EXPANSION_DISTANCE: 40,
        SPAWN_OPACITY: 0.25,
        TARGET_OPACITY_FADE: 0.005,
        BASE_COLOR_RGB_TRIPLET: '0, 0, 0',
    }
};

const renderAsWhite = true;
const opacity = 0.7;
export const TICKER_TO_LOGO_MAP = {
    'GEO': { src: '/img/logo/geo.png', scale: 1, rotation: 0, renderAsWhite: renderAsWhite, opacity: opacity },
    'ANET': { src: '/img/logo/anet.png', scale: 0.7, rotation: false, renderAsWhite: renderAsWhite, opacity: opacity },
    'GOOG': { src: '/img/logo/goog.png', scale: 0.9, rotation: false, renderAsWhite: renderAsWhite, opacity: opacity },
    'PDD': { src: '/img/logo/pdd.png', scale: 0.65, rotation: false, renderAsWhite: renderAsWhite, opacity: opacity },
    'OXY': { src: '/img/logo/oxy.png', scale: 1.3, rotation: false, renderAsWhite: renderAsWhite, opacity: opacity },
    'BRK-B': { src: '/img/logo/brk.png', scale: 2, rotation: 76, renderAsWhite: renderAsWhite, opacity: opacity },
    'VT': { src: '/img/logo/vt.png', scale: 0.8, rotation: false, renderAsWhite: renderAsWhite, opacity: opacity },
};