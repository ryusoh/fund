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

// macOS-style drop shadow configuration for chart logos
export const LOGO_SHADOW = {
    enabled: true,
    // Shadow properties (like macOS toolbar icons)
    blur: 5, // Shadow blur radius
    offsetX: 8, // Horizontal offset
    offsetY: 8, // Vertical offset (subtle downward shadow)
    color: 'rgba(0, 0, 0, 0.5)', // Semi-transparent black
    // Alternative shadow colors:
    // 'rgba(0, 0, 0, 0.2)' = very subtle
    // 'rgba(0, 0, 0, 0.4)' = medium (current)
    // 'rgba(0, 0, 0, 0.6)' = more prominent
};

const renderAsWhite = true;
const opacity = 0.5;
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

export const CALENDAR_MONTH_LABEL_BACKGROUND = {
    paddingX: 10,
    paddingY: 5,
    radius: 14,
    fill: 'rgba(80, 80, 80, 0.8)',
    stroke: 'rgba(255, 255, 255, 0.1)',
    strokeWidth: 0.8,
    opacity: 1,
    blurStdDeviation: 8,
    alphaSlope: 0.65,
    transitionDuration: 220,
    maxWidth: undefined,
    enabled: true,
};

export const CALENDAR_MONTH_LABEL_HIGHLIGHT = {
    intervalMs: 40,
    waveSize: 4,
    baseColor: 'rgba(255, 255, 255, 0.95)',
    neutralDimColor: 'rgba(150, 150, 150, 0.65)',
    waveAlpha: 0.85,
    pnlLightenFactor: 0.55,
    pnlLightAlpha: 0.85,
};

export const POSITION_PNL_HIGHLIGHT = {
    intervalMs: 40,
    waveSize: 4,
    baseColor: 'rgba(255, 255, 255, 0.95)',
    neutralDimColor: 'rgba(150, 150, 150, 0.65)',
    waveAlpha: 0.85,
    pnlLightenFactor: 0.55,
    pnlLightAlpha: 0.85,
};

export const PIE_CHART_GLASS_EFFECT = {
    enabled: true,
    opacity: 0.75, // More transparent for liquid glass effect
    // All border settings in one place
    borders: {
        // Slice separation borders (between pie slices)
        sliceWidth: 1, // Thinner, more delicate borders
        sliceColor: 'rgba(0, 0, 0, 0.1)', // Subtle white borders like iOS
        // Outer/inner arc borders (for customArcBordersPlugin)
        arcWidth: 1.5, // Thinner arc borders
        arcColor: 'rgba(0, 0, 0, 0.15)', // Very subtle white outline
        // Border style
        style: 'solid', // Clean, crisp lines
    },
    // Enhanced liquid glass properties
    liquidGlass: {
        // Add subtle gradient overlay for depth
        gradientOverlay: true,
        gradientStart: 'rgba(255, 255, 255, 0.3)', // Top highlight
        gradientEnd: 'rgba(255, 255, 255, 0.02)', // Bottom subtle
        // Saturation boost for more vibrant liquid look
        saturationBoost: 1.4, // 40% more saturated colors
        // Optical distortion for glass refraction effect
        distortion: {
            enabled: true,
            strength: 2, // Barrel distortion coefficient (positive = barrel, negative = pincushion)
            type: 'barrel', // 'barrel' for outward bulge effect
            smoothEdges: true, // Smooth distortion falloff at edges
            quality: 'medium', // 'low', 'medium', 'high' - affects performance vs quality
            // Configurable overlay colors for distortion effect - ELECTRIC OCEAN MATRIX
            overlayColors: {
                inner: 'rgba(0, 255, 200, 0.5)', // Electric aqua core - pure digital energy
                middle: 'rgba(0, 180, 255, 0.4)', // Deep sky blue - quantum field
                outer: 'rgba(64, 224, 208, 0.3)', // Turquoise edge - holographic glow
            },
            // Alternative color schemes:
            // Warm glass: { inner: 'rgba(255, 200, 100, 0.3)', middle: 'rgba(255, 220, 150, 0.2)', outer: 'rgba(255, 240, 200, 0.1)' }
            // Purple glass: { inner: 'rgba(200, 100, 255, 0.3)', middle: 'rgba(220, 150, 255, 0.2)', outer: 'rgba(240, 200, 255, 0.1)' }
            // Green glass: { inner: 'rgba(100, 255, 200, 0.3)', middle: 'rgba(150, 255, 220, 0.2)', outer: 'rgba(200, 255, 240, 0.1)' }
            // Alternative strength values:
            // 0.05 = very subtle
            // 0.15 = medium
            // 2.0 = pronounced (current)
        },
    },
};
