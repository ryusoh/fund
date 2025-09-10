import { isLocalhost } from './utils/host.js';

export const BASE_URL = isLocalhost(window.location.hostname) ? '' : '/fund';
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
    DEFAULT_FONT_FAMILY:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
    DATALABELS_FONT_SIZE: 10,
    DATALABELS_OFFSET: 8,
    DATALABELS_CONNECTOR_WIDTH: 1,
    // Chart layout
    LAYOUT_PADDING: { right: 35, left: 35 },
    // Doughnut cutout (inner radius). Smaller value => thicker ring => more space for logos
    CUTOUT: '50%',
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
        '#2B2B2B',
        '#333333',
        '#4F4F4F',
        '#606060',
        '#757575',
        '#888888',
        '#A0A0A0',
        '#BDBDBD',
    ],
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
    },
};

// Global logo sizing configuration for chart logos
// mode: 'ratio' uses outerRadius * value; 'px' uses fixed pixels
export const LOGO_SIZE = {
    mode: 'ratio',
    value: 0.13, // 13% of outerRadius by default
    minPx: 14, // minimum rendered height in pixels for legibility
};

const renderAsWhite = true;
const opacity = 0.7;
export const TICKER_TO_LOGO_MAP = {
    GEO: {
        src: 'https://ghproxy.net/https://raw.githubusercontent.com/ryusoh/host/master/brand/logos/fund/geo.png',
        scale: 1,
        rotation: 0,
        renderAsWhite: renderAsWhite,
        opacity: opacity,
    },
    ANET: {
        src: 'https://ghproxy.net/https://raw.githubusercontent.com/ryusoh/host/master/brand/logos/fund/anet.png',
        scale: 0.55,
        rotation: false,
        renderAsWhite: renderAsWhite,
        opacity: opacity,
    },
    GOOG: {
        src: 'https://ghproxy.net/https://raw.githubusercontent.com/ryusoh/host/master/brand/logos/fund/goog.png',
        scale: 1.05,
        rotation: false,
        renderAsWhite: renderAsWhite,
        opacity: opacity,
    },
    PDD: {
        src: 'https://ghproxy.net/https://raw.githubusercontent.com/ryusoh/host/master/brand/logos/fund/pdd.png',
        scale: 1.7,
        rotation: false,
        renderAsWhite: renderAsWhite,
        opacity: opacity,
    },
    OXY: {
        src: 'https://ghproxy.net/https://raw.githubusercontent.com/ryusoh/host/master/brand/logos/fund/oxy.png',
        scale: 1.9,
        rotation: false,
        renderAsWhite: renderAsWhite,
        opacity: opacity,
    },
    'BRK-B': {
        src: 'https://ghproxy.net/https://raw.githubusercontent.com/ryusoh/host/master/brand/logos/fund/brk.png',
        scale: 2,
        rotation: 'radial-in',
        renderAsWhite: renderAsWhite,
        opacity: opacity,
        radialMargin: 1.2,
    },
    VT: {
        src: 'https://ghproxy.net/https://raw.githubusercontent.com/ryusoh/host/master/brand/logos/fund/vt.png',
        scale: 2,
        rotation: false,
        renderAsWhite: renderAsWhite,
        opacity: opacity,
    },
};

export const DATA_PATHS = {
    historical: '../data/historical_portfolio_values.csv',
    fx: '../data/fx_data.json',
    holdings: '../data/holdings_details.json',
    fund: '../data/fund_data.json',
};

export const CALENDAR_SELECTORS = {
    container: '#calendar-container',
    heatmap: '#cal-heatmap',
    prevButton: '#cal-prev',
    nextButton: '#cal-next',
    todayButton: '#cal-today',
    currencyToggle: '#currencyToggleContainer',
    pageWrapper: '.page-center-wrapper',
};

export const CALENDAR_CONFIG = {
    vertical: false,
    itemSelector: CALENDAR_SELECTORS.heatmap,
    range: window.innerWidth > 768 ? 3 : 1,
    scale: {
        color: {
            type: 'diverging',
            range: ['rgba(244, 67, 54, 0.95)', 'rgba(84, 84, 88, 0.7)', 'rgba(76, 175, 80, 0.95)'],
            domain: [-0.02, 0.02],
        },
    },
    domain: {
        type: 'month',
        padding: [10, 10, 10, 10],
        label: { text: 'MMMM YYYY', textAlign: 'center', position: 'top' },
    },
    subDomain: {
        type: 'day',
        radius: 3,
        width: 45,
        height: 45,
        gutter: 6,
        label: () => '',
        color: () => 'white',
    },
};
