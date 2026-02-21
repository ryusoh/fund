const DEFAULT_OPTIONS = {
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
};

function createAnimationState() {
    return {
        handle: null,
        lastFrameTs: null,
        phase: 0,
    };
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function mergeChartSettings(base, override = {}) {
    return {
        tailRatio: override.tailRatio ?? base.tailRatio,
        tailOpacity: override.tailOpacity ?? base.tailOpacity,
        shadowOpacity: override.shadowOpacity ?? base.shadowOpacity,
        mobileShadowBlur: override.mobileShadowBlur ?? base.mobileShadowBlur,
        desktopShadowBlur: override.desktopShadowBlur ?? base.desktopShadowBlur,
        mobileHaloBase: override.mobileHaloBase ?? base.mobileHaloBase,
        desktopHaloBase: override.desktopHaloBase ?? base.desktopHaloBase,
        mobileHaloOscillation: override.mobileHaloOscillation ?? base.mobileHaloOscillation,
        desktopHaloOscillation: override.desktopHaloOscillation ?? base.desktopHaloOscillation,
        oscillationSpeed: override.oscillationSpeed ?? base.oscillationSpeed,
        phaseOffsetStep: override.phaseOffsetStep ?? base.phaseOffsetStep,
        minPulseRadius: override.minPulseRadius ?? base.minPulseRadius,
        maxDelta: override.maxDelta ?? base.maxDelta,
    };
}

function hexToRgb(color) {
    if (!color) {
        return null;
    }
    const trimmed = color.trim();

    if (trimmed.startsWith('rgb')) {
        const match = trimmed.replace(/\s+/g, '').match(/rgba?\((\d+),(\d+),(\d+)/i);
        if (match) {
            return {
                r: Number.parseInt(match[1], 10),
                g: Number.parseInt(match[2], 10),
                b: Number.parseInt(match[3], 10),
            };
        }
    }

    let hex = trimmed;
    if (hex.startsWith('#')) {
        hex = hex.slice(1);
    }
    if (hex.length === 3) {
        hex = hex
            .split('')
            .map((char) => char + char)
            .join('');
    }
    if (hex.length !== 6) {
        return null;
    }
    const num = Number.parseInt(hex, 16);
    if (Number.isNaN(num)) {
        return null;
    }
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255,
    };
}

function drawGlow(ctx, series, options, settings) {
    const { coords, color, lineWidth } = series;
    if (!coords || coords.length === 0) {
        return;
    }

    const { isMobile = false, basePhase = 0, seriesIndex = 0 } = options;
    const rgb = hexToRgb(color);
    if (!rgb) {
        return;
    }

    const appliedPhase = basePhase + seriesIndex * settings.phaseOffsetStep;
    const oscillation = 0.5 + 0.5 * Math.sin(appliedPhase * settings.oscillationSpeed);
    const minPulseRadius = Math.max(settings.minPulseRadius, lineWidth / 2);
    const haloBase = isMobile ? settings.mobileHaloBase : settings.desktopHaloBase;
    const haloOscillation = isMobile
        ? settings.mobileHaloOscillation
        : settings.desktopHaloOscillation;
    const haloRadius = minPulseRadius + haloBase + oscillation * haloOscillation;

    const tailCount =
        settings.tailRatio > 0 ? Math.max(2, Math.floor(coords.length * settings.tailRatio)) : 0;
    if (tailCount > 1) {
        const tailPoints = coords.slice(-tailCount);
        const start = tailPoints[0];
        const end = tailPoints[tailPoints.length - 1];

        if (start.x !== end.x || start.y !== end.y) {
            const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
            gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
            gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${settings.tailOpacity})`);

            ctx.save();
            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = gradient;
            ctx.shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${settings.shadowOpacity})`;
            ctx.shadowBlur = isMobile ? settings.mobileShadowBlur : settings.desktopShadowBlur;
            ctx.beginPath();
            tailPoints.forEach((point, index) => {
                if (index === 0) {
                    ctx.moveTo(point.x, point.y);
                } else {
                    ctx.lineTo(point.x, point.y);
                }
            });
            ctx.stroke();
            ctx.restore();
        }
    }

    const gradient = ctx.createRadialGradient(
        coords[coords.length - 1].x,
        coords[coords.length - 1].y,
        minPulseRadius * 0.6,
        coords[coords.length - 1].x,
        coords[coords.length - 1].y,
        haloRadius
    );
    gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.96)`);
    gradient.addColorStop(0.35, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`);
    gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(coords[coords.length - 1].x, coords[coords.length - 1].y, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.95)`;
    ctx.beginPath();
    ctx.arc(
        coords[coords.length - 1].x,
        coords[coords.length - 1].y,
        minPulseRadius,
        0,
        Math.PI * 2
    );
    ctx.fill();

    const ringRadius = minPulseRadius + Math.min(minPulseRadius * 0.4, 0.5);
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.55)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(coords[coords.length - 1].x, coords[coords.length - 1].y, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${settings.shadowOpacity})`;
    const glowBlur = (isMobile ? settings.mobileShadowBlur : settings.desktopShadowBlur) * 0.8;
    ctx.shadowBlur = glowBlur;
    ctx.globalAlpha = clamp(0.6 + 0.4 * oscillation, 0.25, 1);
    ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`;
    ctx.beginPath();
    ctx.arc(
        coords[coords.length - 1].x,
        coords[coords.length - 1].y,
        minPulseRadius + 1.8,
        0,
        Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
}

export function createGlowTrailAnimator(options = {}) {
    const baseConfig = {
        ...DEFAULT_OPTIONS,
        ...options,
        charts: options.charts || {},
    };

    const states = new Map();

    function ensureState(key) {
        if (!states.has(key)) {
            states.set(key, createAnimationState());
        }
        return states.get(key);
    }

    function getChartSettings(chartKey) {
        const override = baseConfig.charts?.[chartKey] || {};
        return mergeChartSettings(baseConfig, override);
    }

    function isEnabledFor(chartKey) {
        if (baseConfig.enabled === false) {
            return false;
        }
        const override = baseConfig.charts?.[chartKey];
        if (override && override.enabled === false) {
            return false;
        }
        return true;
    }

    function stop(key) {
        const state = states.get(key);
        if (!state) {
            return;
        }
        if (state.handle !== null) {
            cancelAnimationFrame(state.handle);
            state.handle = null;
        }
        state.lastFrameTs = null;
        state.phase = 0;
    }

    function stopAll() {
        states.forEach((_, key) => stop(key));
    }

    function schedule(key, chartManager, { isActive } = {}) {
        const state = ensureState(key);
        if (state.handle !== null) {
            return;
        }
        state.handle = requestAnimationFrame((timestamp) => {
            state.handle = null;
            if (typeof isActive === 'function' && !isActive()) {
                stop(key);
                return;
            }
            chartManager.redraw(timestamp);
        });
    }

    function advance(key, timestamp) {
        const state = ensureState(key);
        const settings = getChartSettings(key);
        const nowFn = () => {
            if (typeof globalThis !== 'undefined' && globalThis.performance) {
                return globalThis.performance.now();
            }
            if (typeof window !== 'undefined' && window.performance) {
                return window.performance.now();
            }
            return Date.now();
        };
        const ts = typeof timestamp === 'number' ? timestamp : nowFn();
        if (state.lastFrameTs === null) {
            state.lastFrameTs = ts;
            return state.phase;
        }
        const maxDelta = settings.maxDelta ?? baseConfig.maxDelta;
        const delta = Math.min((ts - state.lastFrameTs) / 1000, maxDelta);
        state.lastFrameTs = ts;
        state.phase = (state.phase + delta) % (Math.PI * 2);
        return state.phase;
    }

    function drawSeriesGlow(ctx, series, drawOptions = {}) {
        const settings = getChartSettings(drawOptions.chartKey);
        drawGlow(ctx, series, drawOptions, settings);
    }

    return {
        isEnabledFor,
        schedule,
        stop,
        stopAll,
        advance,
        drawSeriesGlow,
    };
}
