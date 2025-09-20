import { UI_BREAKPOINTS } from '@js/config.js';

const DEFAULT_OPTIONS = {
    enabled: true,
    depth: { desktop: 22, mobile: 12 },
    squash: 0.9,
    light: {
        azimuthDeg: -40,
        elevationDeg: 65,
    },
    sideOpacity: {
        top: 0.55,
        bottom: 0.15,
    },
    rimHighlight: {
        width: 1.2,
        opacity: 0.3,
    },
    topHighlight: {
        intensity: 0.4,
        radiusFraction: 0.8,
    },
    reflection: {
        speed: 0.05,
        width: 0.2,
        intensity: 0.28,
    },
    shadow: {
        scaleX: 1.15,
        scaleY: 0.45,
        offsetYPx: 14,
        blur: 32,
        opacity: 0.28,
    },
    parallax: {
        maxOffsetPx: 8,
        damping: 0.18,
    },
};

function deepMerge(target, source) {
    const output = { ...target };
    Object.keys(source || {}).forEach((key) => {
        const value = source[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            output[key] = deepMerge(output[key] || {}, value);
        } else if (value !== undefined) {
            output[key] = value;
        }
    });
    return output;
}

function resolveResponsive(value) {
    if (typeof value !== 'object' || value === null) {
        return value;
    }
    const isDesktop = typeof window === 'undefined' || window.innerWidth > UI_BREAKPOINTS.MOBILE;
    if (isDesktop && value.desktop !== undefined) {
        return value.desktop;
    }
    if (!isDesktop && value.mobile !== undefined) {
        return value.mobile;
    }
    return value.desktop !== undefined ? value.desktop : value.mobile;
}

function ensureState(chart, options) {
    if (!chart.$glass3d) {
        chart.$glass3d = {
            pointerTarget: { x: 0, y: 0 },
            pointerSmoothed: { x: 0, y: 0 },
            phase: 0,
            lastTime: null,
            animationFrame: null,
        };
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            const tick = () => {
                const state = chart.$glass3d;
                if (!state) {
                    return;
                }
                chart.draw();
                state.animationFrame = window.requestAnimationFrame(tick);
            };
            chart.$glass3d.animationFrame = window.requestAnimationFrame(tick);
        }
        if (!chart.glassPointerTarget) {
            chart.glassPointerTarget = { x: 0, y: 0 };
        }
    }
    if (!chart.glassPointerTarget) {
        chart.glassPointerTarget = { x: 0, y: 0 };
    }
    chart.$glass3d.maxOffset = options.parallax?.maxOffsetPx ?? 8;
    return chart.$glass3d;
}

function resolveOptions(pluginOptions) {
    const globalConfig =
        (typeof window !== 'undefined' &&
            window.pieChartGlassEffect &&
            window.pieChartGlassEffect.threeD) ||
        {};
    return deepMerge(deepMerge(DEFAULT_OPTIONS, globalConfig), pluginOptions || {});
}

function updatePointerState(state, chart, options) {
    const target = chart.glassPointerTarget || { x: 0, y: 0 };
    const damping = options.parallax?.damping ?? 0.18;
    state.pointerTarget.x = Math.max(-1.5, Math.min(1.5, target.x || 0));
    state.pointerTarget.y = Math.max(-1.5, Math.min(1.5, target.y || 0));
    state.pointerSmoothed.x += (state.pointerTarget.x - state.pointerSmoothed.x) * damping;
    state.pointerSmoothed.y += (state.pointerTarget.y - state.pointerSmoothed.y) * damping;
}

function updatePhase(state, options) {
    const perf = typeof globalThis !== 'undefined' ? globalThis.performance : undefined;
    const now = perf && typeof perf.now === 'function' ? perf.now() : Date.now();
    if (state.lastTime === null) {
        state.lastTime = now;
        return;
    }
    const delta = (now - state.lastTime) / 1000;
    state.lastTime = now;
    const speed = options.reflection?.speed ?? 0;
    state.phase = (state.phase + delta * speed) % 1;
}

function drawShadow(ctx, centerX, centerY, outerRadius, depth, options, pointer, squash) {
    const shadowCfg = options.shadow || {};
    const scaleX = shadowCfg.scaleX ?? 1.1;
    const scaleY = shadowCfg.scaleY ?? 0.45;
    const offsetY = shadowCfg.offsetYPx ?? depth * 0.7;
    const opacity = shadowCfg.opacity ?? 0.22;
    const blur = shadowCfg.blur ?? 28;

    ctx.save();
    ctx.translate(centerX + pointer.x * 0.35, centerY + offsetY);
    ctx.scale(scaleX, scaleY * squash);
    const radius = outerRadius * 0.92;
    const gradient = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
    gradient.addColorStop(0, `rgba(0, 0, 0, ${opacity})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius, 0, 0, Math.PI * 2);
    ctx.filter = `blur(${blur}px)`;
    ctx.fill();
    ctx.restore();
}

function computeLightVector(options) {
    const azimuth = (options.light?.azimuthDeg ?? -45) * (Math.PI / 180);
    const elevation = (options.light?.elevationDeg ?? 60) * (Math.PI / 180);
    const cosEl = Math.cos(elevation);
    return {
        x: Math.cos(azimuth) * cosEl,
        y: Math.sin(azimuth) * cosEl,
        z: Math.sin(elevation),
    };
}

function drawSideWall(ctx, arc, depth, options, lightVec, pointer) {
    const { x, y, startAngle, endAngle, outerRadius, innerRadius } = arc.getProps(
        ['x', 'y', 'startAngle', 'endAngle', 'outerRadius', 'innerRadius'],
        true
    );
    const squash = options.squash ?? 1;
    const sliceCenterAngle = (startAngle + endAngle) / 2;
    const lightInfluence = Math.max(
        0,
        lightVec.x * Math.cos(sliceCenterAngle) + lightVec.y * Math.sin(sliceCenterAngle)
    );
    const topOpacity = options.sideOpacity?.top ?? 0.5;
    const bottomOpacity = options.sideOpacity?.bottom ?? 0.18;

    const gradient = ctx.createLinearGradient(
        0,
        y - outerRadius * squash,
        0,
        y + depth + outerRadius * squash
    );
    const highlightBoost = 0.15 * lightInfluence;
    gradient.addColorStop(0, `rgba(255, 255, 255, ${Math.min(0.95, topOpacity + highlightBoost)})`);
    gradient.addColorStop(1, `rgba(0, 0, 0, ${Math.max(0, bottomOpacity - highlightBoost * 0.6)})`);

    const centerX = x + (pointer?.x || 0) * 0.2;
    const centerY = y + (pointer?.y || 0) * 0.25;

    ctx.save();
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(
        centerX,
        centerY + depth,
        outerRadius,
        outerRadius * squash,
        0,
        startAngle,
        endAngle
    );
    ctx.ellipse(centerX, centerY, outerRadius, outerRadius * squash, 0, endAngle, startAngle, true);
    ctx.fill();

    if (innerRadius > 0) {
        const innerGradient = ctx.createLinearGradient(
            0,
            y - innerRadius * squash,
            0,
            y + depth + innerRadius * squash
        );
        innerGradient.addColorStop(0, `rgba(255, 255, 255, ${0.25 + highlightBoost * 0.5})`);
        innerGradient.addColorStop(1, `rgba(0, 0, 0, ${0.3})`);
        ctx.beginPath();
        ctx.ellipse(
            centerX,
            centerY + depth,
            innerRadius,
            innerRadius * squash,
            0,
            endAngle,
            startAngle,
            true
        );
        ctx.ellipse(centerX, centerY, innerRadius, innerRadius * squash, 0, startAngle, endAngle);
        ctx.fillStyle = innerGradient;
        ctx.fill();
    }

    ctx.restore();
}

function drawRimHighlight(ctx, centerX, centerY, outerRadius, innerRadius, options, pointer) {
    const rimCfg = options.rimHighlight || {};
    const width = rimCfg.width ?? 1.2;
    const opacity = rimCfg.opacity ?? 0.3;
    ctx.save();
    const squash = options.squash ?? 1;
    ctx.lineWidth = width;
    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.beginPath();
    ctx.ellipse(
        centerX + pointer.x * 0.3,
        centerY + pointer.y * 0.3,
        outerRadius - width / 2,
        (outerRadius - width / 2) * squash,
        0,
        0,
        Math.PI * 2
    );
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = `rgba(0, 0, 0, ${opacity * 0.75})`;
    ctx.ellipse(
        centerX + pointer.x * 0.2,
        centerY + pointer.y * 0.2,
        innerRadius + width / 2,
        (innerRadius + width / 2) * squash,
        0,
        0,
        Math.PI * 2
    );
    ctx.stroke();
    ctx.restore();
}

function drawTopHighlight(ctx, centerX, centerY, outerRadius, options, pointer) {
    const highlightCfg = options.topHighlight || {};
    const intensity = highlightCfg.intensity ?? 0.4;
    const radiusFraction = highlightCfg.radiusFraction ?? 0.8;
    const squash = options.squash ?? 1;
    const highlightX = centerX - pointer.x * 0.4;
    const highlightY = centerY - outerRadius * 0.35 * squash - pointer.y * 0.3;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, outerRadius, outerRadius * squash, 0, 0, Math.PI * 2);
    const radius = outerRadius * radiusFraction;
    const gradient = ctx.createRadialGradient(
        highlightX,
        highlightY,
        radius * 0.1,
        highlightX,
        highlightY,
        radius
    );
    gradient.addColorStop(0, `rgba(255, 255, 255, ${intensity})`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
}

function drawReflection(ctx, centerX, centerY, outerRadius, innerRadius, options, state) {
    const reflectionCfg = options.reflection || {};
    const intensity = reflectionCfg.intensity ?? 0.28;
    const width = reflectionCfg.width ?? 0.2;
    const phase = state.phase || 0;
    const startAngle = phase * Math.PI * 2;
    const endAngle = startAngle + width * Math.PI * 2;
    const squash = options.squash ?? 1;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gradient = ctx.createLinearGradient(0, centerY - outerRadius, 0, centerY + outerRadius);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${intensity})`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = Math.max(2, (outerRadius - innerRadius) * 0.55);
    ctx.beginPath();
    ctx.ellipse(
        centerX,
        centerY,
        (outerRadius + innerRadius) / 2,
        ((outerRadius + innerRadius) / 2) * squash,
        0,
        startAngle,
        endAngle
    );
    ctx.stroke();
    ctx.restore();
}

function drawSideWalls(ctx, meta, depth, options, lightVec, pointer) {
    meta.data.forEach((arc) => {
        drawSideWall(ctx, arc, depth, options, lightVec, pointer);
    });
}

export const glass3dPlugin = {
    id: 'glass3d',
    beforeDatasetsDraw(chart, args, pluginOptions) {
        const options = resolveOptions(pluginOptions);
        if (!options.enabled) {
            return;
        }
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data || meta.data.length === 0) {
            return;
        }
        const ctx = chart.ctx;
        const firstArc = meta.data[0];
        const {
            x: centerX,
            y: centerY,
            outerRadius,
            innerRadius,
        } = firstArc.getProps(['x', 'y', 'outerRadius', 'innerRadius'], true);
        const depthValue = resolveResponsive(options.depth);
        const depth = depthValue !== undefined ? depthValue : Math.max(outerRadius * 0.12, 12);
        const state = ensureState(chart, options);
        updatePointerState(state, chart, options);
        updatePhase(state, options);
        const pointer = {
            x: state.pointerSmoothed.x * state.maxOffset,
            y: state.pointerSmoothed.y * state.maxOffset,
        };

        drawShadow(
            ctx,
            centerX,
            centerY,
            outerRadius,
            depth,
            options,
            pointer,
            options.squash ?? 1
        );
        const lightVec = computeLightVector(options);
        drawSideWalls(ctx, meta, depth, options, lightVec, pointer);
        drawRimHighlight(ctx, centerX, centerY, outerRadius, innerRadius, options, pointer);
    },
    afterDatasetsDraw(chart, args, pluginOptions) {
        const options = resolveOptions(pluginOptions);
        if (!options.enabled) {
            return;
        }
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data || meta.data.length === 0) {
            return;
        }
        const ctx = chart.ctx;
        const firstArc = meta.data[0];
        const {
            x: centerX,
            y: centerY,
            outerRadius,
            innerRadius,
        } = firstArc.getProps(['x', 'y', 'outerRadius', 'innerRadius'], true);
        const state = ensureState(chart, options);
        const pointer = {
            x: state.pointerSmoothed.x * state.maxOffset,
            y: state.pointerSmoothed.y * state.maxOffset,
        };

        drawTopHighlight(ctx, centerX, centerY, outerRadius, options, pointer);
        drawReflection(ctx, centerX, centerY, outerRadius, innerRadius, options, state);
    },
};
