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