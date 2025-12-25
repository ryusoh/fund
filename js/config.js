import { isLocalhost } from './utils/host.js';
import { ASSET_CLASS_OVERRIDES, isLikelyFundTicker } from './config/assetClasses.js';

const FUND_BASE_PATH = '/fund';

const isServedFromFundDirectory = (pathname) => {
    if (typeof pathname !== 'string' || pathname.length === 0) {
        return false;
    }
    const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
    const [firstSegment] = normalizedPath.split('/').filter(Boolean);
    return firstSegment === FUND_BASE_PATH.slice(1);
};

export const getBaseUrl = (location) => {
    if (!location) {
        return '';
    }
    const { hostname = '', pathname = '' } = location;
    if (!isLocalhost(hostname) && isServedFromFundDirectory(pathname)) {
        return FUND_BASE_PATH;
    }
    return '';
};

export const BASE_URL = typeof window !== 'undefined' ? getBaseUrl(window.location) : '';
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
        fx: {
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
            passes: 1,
            description: 'Minimal smoothing, preserves most detail',
        },

        // Balanced smoothing - industry standard
        balanced: {
            method: 'exponential',
            params: { alpha: 0.5 },
            passes: 1,
            description: 'Balanced smoothing, good for most financial data',
        },

        // Aggressive smoothing - very smooth lines
        aggressive: {
            method: 'exponential',
            params: { alpha: 0.2 },
            passes: 2,
            description: 'Strong smoothing, reduces noise significantly',
        },

        // Adaptive smoothing - automatically adjusts
        adaptive: {
            method: 'adaptive',
            params: {},
            passes: 1,
            description: 'Automatically adjusts based on data volatility',
        },
        none: {
            method: 'none',
            params: {},
            passes: 0,
            description: 'No smoothing (use raw values)',
        },
    },
    // Chart-specific smoothing configurations
    charts: {
        balance: 'none', // EMA smoothing for balance series
        contribution: 'none', // Stronger smoothing to soften contribution steps
        performance: 'none', // EMA smoothing for performance charts
        composition: 'none', // EMA smoothing with minimal impact for composition charts
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

// Default chart date range on initial load
// Set both to null for all-time view
// Users can clear this with 'alltime' or 'all' commands
export const INITIAL_CHART_DATE_RANGE = {
    from: '2024-01-01', // From start of 2024 (equivalent to 'f:2024')
    to: null, // null means up to present
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

export function getHoldingAssetClass(ticker) {
    if (typeof ticker !== 'string') {
        return 'stock';
    }
    const normalized = ticker.trim().toUpperCase();
    if (!normalized) {
        return 'stock';
    }
    const override = ASSET_CLASS_OVERRIDES[normalized];
    if (override) {
        return override;
    }
    if (isLikelyFundTicker(normalized)) {
        return 'etf';
    }
    return 'stock';
}

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

    // Quantum Mechanics Inspired Color Palette - Futuristic Blue Hues
    COMPOSITION_CHART_COLORS: [
        // Quantum Mechanics Inspired Color Palette - Futuristic Blue Hues
        // Deep Space Quantum Blues
        '#0B3D91', // Deep Cosmic Blue - NASA-inspired deep space blue
        '#1550AF', // Quantum Field Blue - Vibrant electron field blue
        '#2A6EC1', // Particle Accelerator Blue - High-energy physics blue
        '#3984D9', // Neutron Star Blue - Celestial object blue
        '#4DA3F4', // Plasma Discharge Blue - Electric discharge blue

        // Complementary Quantum Hues
        '#0D4B8C', // Wave Function Blue - Schrödinger wave blue
        '#1A6BB5', // Superposition Blue - Quantum superposition state
        '#2A8ACC', // Entanglement Blue - Quantum entanglement connection
        '#3BA9E8', // Probability Cloud Blue - Electron probability distribution
        '#4DC8FF', // Quantum Tunneling Blue - Barrier penetration blue

        // Accent Quantum Colors
        '#0F3D66', // Dark Matter Blue - Mysterious cosmic blue
        '#1A5F8C', // Boson Field Blue - Force carrier particle blue
        '#2A7BA3', // Fermion Blue - Matter particle blue
        '#3B9BC9', // Lepton Blue - Fundamental particle blue
        '#4DBBEF', // Hadron Blue - Composite particle blue

        // Secondary Quantum Tones
        '#123C7A', // Quark Confinement Blue - Strong force blue
        '#284D93', // Gluon Exchange Blue - Color charge interaction
        '#305FAF', // Chromodynamic Blue - Quantum chromodynamics
        '#3971CB', // Electroweak Blue - Unified force blue
        '#3F83E8', // Higgs Field Blue - Mass-giving field blue
        '#4595FF', // Standard Model Blue - Particle physics blue

        // Luminous Quantum Effects
        '#00B4D8', // Cherenkov Radiation Blue - Faster-than-light particle blue
        '#00C8FF', // Synchrotron Radiation Blue - Accelerated electron blue
        '#00DCFF', // Bremsstrahlung Blue - Decelerated particle blue
        '#00F0FF', // Vacuum Polarization Blue - Quantum fluctuation blue
        '#45F0FF', // Zero Point Energy Blue - Ground state energy blue
    ],
};

export const CROSSHAIR_SETTINGS = {
    compositionHoverBackground: 'rgba(6, 9, 22, 0.72)',
    compositionHoverBorder: 'rgba(255, 255, 255, 0.08)',
    compositionHoverPadding: {
        desktop: { x: 12, y: 10 },
        mobile: { x: 10, y: 8 },
    },
    compositionHoverCornerRadius: 6,
    compositionHoverLineGap: {
        desktop: 6,
        mobile: 4,
    },
};

export const CHART_LINE_WIDTHS = {
    contribution: 1,
    balance: 1,
    performance: 1,
    fx: 1,
    crosshairMarker: 1,
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

// Default margins (as a fraction of band thickness) reserved between logos and slice edges
export const LOGO_MARGIN_DEFAULT = {
    max: 0.06,
    min: 0.02,
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

export const CALENDAR_BACKGROUND_EFFECT = {
    enabled: true,
    // Duration of the visible sweep effect in seconds
    // Controls how fast the light moves across the screen
    sweepDuration: 3,
    // Time to wait after a sweep finishes before the next one starts
    sweepPauseTime: 2,
    // Colors for the chromatic aberration effect
    // Format: 'R, G, B' (without 'rgba' or parenthesis)
    colors: {
        color1: '50, 100, 255', // Optical Blue (Leading Edge)
        color2: '255, 50, 80', // Optical Red (Trailing Edge)
    },
};

export const TERMINAL_BACKGROUND_EFFECT = {
    enabled: false,
    sweepDuration: 2,
    sweepPauseTime: 0,
    colors: {
        color1: '60, 120, 255',
        color2: '255, 80, 160',
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
            particlesEnabled: false,
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

export const TABLE_GLASS_EFFECT = {
    enabled: true,
    excludeHeader: true,
    rowHoverEffect: {
        enabled: true,
        // Subtle spotlight effect
        color: 'rgba(255, 255, 255, 0.03)', // Very faint white/blue tint
        borderColor: 'rgba(255, 255, 255, 0.15)', // Subtle border reveal
        spotlightRadius: 500, // Large soft radius
    },
    chromaticAberration: {
        enabled: true, // Disabled for cleaner look
        offset: 2,
        opacity: 0.5,
    },
    // Override specific 3D settings for the table to be more subtle than the chart
    threeD: {
        ...PIE_CHART_GLASS_EFFECT.threeD,
        electric: {
            ...PIE_CHART_GLASS_EFFECT.threeD.electric,
            enabled: false, // Configurable toggle
            intensity: 0.1, // Reduced intensity
            width: 0.1, // Thinner trails
            arcThickness: 1, // Thinner lines
            streakSpeedMultiplier: 1, // Slower, more elegant movement
            colors: {
                primary: 'rgba(255, 255, 255, 0.4)',
                secondary: 'rgba(255, 255, 255, 0.2)',
                tertiary: 'rgba(255, 255, 255, 0.05)',
                quaternary: 'rgba(255, 255, 255, 0.0)',
            },
        },
        reflection: {
            enabled: true,
            speed: 0.05,
            intensity: 0.1, // Subtle
            width: 0.5, // Wider, softer band
            color: 'rgba(255, 255, 255, 1)',
            fadeZone: 0.15, // Smooth fade at wrap point (0-1, higher = longer fade)
        },
    },
};

export const PERLIN_BACKGROUND_SETTINGS = {
    enabled: false,
    blendMode: 'screen',
    opacity: 0.85,
    tint: [1, 1, 1],
    sizeFactor: 0.5,
    speed: 0.001,
    angle: 0,
    respectReducedMotion: true,
    maxPixelRatio: 10,
};
