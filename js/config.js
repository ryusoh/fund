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

export const ANIMATED_LINE_SETTINGS = {
    enabled: true,
    tailRatio: 0.12,
    tailOpacity: 0.85,
    shadowOpacity: 0.45,
    mobileShadowBlur: 4,
    desktopShadowBlur: 12,
    mobileHaloBase: 5.5,
    desktopHaloBase: 7,
    mobileHaloOscillation: 2.2,
    desktopHaloOscillation: 3.5,
    oscillationSpeed: 4,
    phaseOffsetStep: 0.85,
    minPulseRadius: 0.5,
    maxDelta: 0.12,
    charts: {
        performance: {
            enabled: true,
        },
        contribution: {
            enabled: true,
        },
    },
};

export const CHART_SMOOTHING = {
    enabled: true, // Toggle smoothing on/off
    methods: {
        // Conservative smoothing - minimal impact
        conservative: {
            method: 'exponential',
            params: { alpha: 0.8 },
            description: 'Minimal smoothing, preserves most detail',
        },

        // Balanced smoothing - industry standard
        balanced: {
            method: 'exponential',
            params: { alpha: 0.5 },
            description: 'Balanced smoothing, good for most financial data',
        },

        // Aggressive smoothing - very smooth lines
        aggressive: {
            method: 'exponential',
            params: { alpha: 0.2 },
            description: 'Strong smoothing, reduces noise significantly',
        },

        // Adaptive smoothing - automatically adjusts
        adaptive: {
            method: 'adaptive',
            params: {},
            description: 'Automatically adjusts based on data volatility',
        },
    },
    // Chart-specific smoothing configurations
    charts: {
        performance: 'balanced', // EMA with alpha=0.3 for performance charts
        contribution: 'balanced', // EMA with alpha=0.2 for contribution charts (less smoothing)
        composition: 'conservative', // EMA with alpha=0.2 for composition charts
    },
};

export const CHART_MARKERS = {
    // Uniform spacing for buy/sell markers on contribution chart
    // Spacing is automatically calculated as: smallest_radius * 2 (diameter of smallest dot)
    // This ensures dots are touching but not overlapping
    fallbackSpacing: 20, // Fallback spacing if no markers are found
    showContributionMarkers: false, // Toggle buy/sell dots on the contribution chart
};

export const CONTRIBUTION_CHART_SETTINGS = {
    startYAxisAtZero: false, // When true, clamp baseline to zero instead of data minimum
    paddingRatio: 0.05, // Extra space added above (and below when not clamped) as a % of range
    minPaddingValue: 0, // Absolute minimum padding applied in dollars
};

export const mountainFill = {
    enabled: true,
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
        src: '/assets/logos/geo.png',
        scale: 1,
        rotation: 0,
        renderAsWhite: renderAsWhite,
        opacity: opacity,
    },
    ANET: {
        src: '/assets/logos/anet.png',
        scale: 0.5,
        rotation: false,
        renderAsWhite: renderAsWhite,
        opacity: opacity,
    },
    GOOG: {
        src: '/assets/logos/goog.png',
        scale: 1.05,
        rotation: false,
        renderAsWhite: renderAsWhite,
        opacity: opacity,
    },
    PDD: {
        src: '/assets/logos/pdd.png',
        scale: 1.7,
        rotation: false,
        renderAsWhite: renderAsWhite,
        opacity: opacity,
    },
    OXY: {
        src: '/assets/logos/oxy.png',
        scale: 1.9,
        rotation: false,
        renderAsWhite: renderAsWhite,
        opacity: opacity,
    },
    'BRK-B': {
        src: '/assets/logos/brk.png',
        scale: 2,
        rotation: 'radial-in',
        renderAsWhite: renderAsWhite,
        opacity: opacity,
        radialMargin: 1.2,
    },
    VT: {
        src: '/assets/logos/vt.png',
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
    navControls: '#calendar-navigation-controls',
};

// Dynamic calendar range calculation based on viewport and zoom state
export const getCalendarRange = () => {
    const isZoomed = document.querySelector('.page-center-wrapper.zoomed') !== null;
    const viewportWidth = window.innerWidth;

    // Calculate available space for calendar
    // Account for padding, margins, and UI elements
    const availableWidth = isZoomed ? viewportWidth * 0.85 : viewportWidth * 0.9;

    // Estimate space needed for each month (approximate)
    // Each month needs ~280px width minimum for good readability
    const monthWidth = 280;
    const maxMonths = Math.floor(availableWidth / monthWidth);

    // Responsive breakpoints with zoom awareness
    if (viewportWidth <= 480 || (isZoomed && viewportWidth <= 768)) {
        return 1; // Mobile or zoomed on small screens
    }
    if (viewportWidth <= 768 || (isZoomed && viewportWidth <= 1024)) {
        return Math.min(2, maxMonths); // Tablet or zoomed on medium screens
    }
    if (viewportWidth <= 1200 || (isZoomed && viewportWidth <= 1600)) {
        return Math.min(3, maxMonths); // Desktop or zoomed on large screens
    }
    return Math.min(3, maxMonths); // Large desktop - max 3 months
};

export const CALENDAR_CONFIG = {
    vertical: false,
    itemSelector: CALENDAR_SELECTORS.heatmap,
    range: getCalendarRange(),
    scale: {
        color: {
            type: 'diverging',
            range: [
                'rgba(244, 67, 54, 0.95)',
                'rgba(120, 120, 125, 0.5)',
                'rgba(76, 175, 80, 0.95)',
            ],
            domain: [-0.01, 0.01],
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
    enabled: false,
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
    opacity: 0.75, // Default fallback; overridden via responsiveOpacity at runtime
    responsiveOpacity: {
        desktop: 0.4,
        mobile: 0.4,
    },
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
            // Configurable overlay colors for distortion effect - QUANTUM COMPUTATION FIELD
            overlayColors: {
                inner: 'rgba(0, 229, 255, 0.45)', // Quantum coherence core - computational precision
                middle: 'rgba(38, 198, 218, 0.32)', // Superposition field - qubit entanglement
                outer: 'rgba(77, 182, 172, 0.22)', // Quantum interference edge - algorithmic resonance
            },
            // Animation and movement settings
            animation: {
                speed: 0.002, // Overall animation speed (0.001 = very slow, 0.01 = fast)
                movement: {
                    hotspotRange: 1.2, // How far the light hotspot moves (0.5 = moderate, 1.2 = extreme)
                    colorBlockRange: 0.8, // How far the entire color block moves (0.2 = subtle, 0.8 = dramatic)
                    xFrequency: 1.3, // X-axis movement frequency multiplier
                    yFrequency: 1.3, // Y-axis movement frequency multiplier
                },
                colors: {
                    shiftIntensity: 1, // How much colors shift (0.1 = subtle, 0.5 = rainbow)
                    phaseOffset: 5, // Phase difference between slices (0.5 = moderate, 1.5 = chaotic)
                },
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
    threeD: {
        enabled: true,
        depth: {
            desktop: 5,
            mobile: 5,
        },
        squash: 1,
        light: {
            azimuthDeg: -45,
            elevationDeg: 62,
        },
        sideOpacity: {
            top: 0.55,
            bottom: 0.18,
        },
        rimHighlight: {
            width: 1.4,
            opacity: 0.38,
        },
        topHighlight: {
            intensity: 0.45,
            radiusFraction: 0.82,
        },
        reflection: {
            speed: 0.1,
            width: 0.22,
            intensity: 0.52,
        },
        shadow: {
            scaleX: 1.12,
            scaleY: 0.46,
            offsetYPx: 16,
            blur: 34,
            opacity: 0.28,
        },
        parallax: {
            maxOffsetPx: 8,
            damping: 0.18,
        },
        electric: {
            intensity: 0.5,
            width: 0.15,
            colors: {
                primary: 'rgba(250, 250, 250, 0.6)',
                secondary: 'rgba(250, 250, 250, 0.4)',
                tertiary: 'rgba(250, 250, 250, 0.2)',
                quaternary: 'rgba(250, 250, 250, 0.1)',
            },
            arcCount: 3,
            arcThickness: 2.5,
            particleColors: null,
            streakSpeedMultiplier: 2.5,
            particleSpeedMultiplier: 0.5,
        },
        ambientGlow: {
            innerOpacity: 0.15,
            outerOpacity: 0.05,
            pulseSpeed: 0.6,
            innerColor: 'rgba(118, 183, 229, 1)',
            outerColor: 'rgba(7, 18, 57, 1)',
        },
        seamOffsetRad: 0,
    },
};
