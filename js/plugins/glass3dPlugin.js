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
    electric: {
        intensity: 0.45,
        width: 0.22,
        colors: null,
        arcCount: 3,
        arcThickness: 2.4,
    },
    ambientGlow: {
        innerOpacity: 0.2,
        outerOpacity: 0.05,
        pulseSpeed: 0.6,
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

function applyAlpha(color, alpha) {
    const normalizedAlpha = Math.max(0, Math.min(1, alpha));
    if (typeof color !== 'string' || color.length === 0) {
        return `rgba(255, 255, 255, ${normalizedAlpha})`;
    }
    const trimmed = color.trim();
    const rgbaMatch = trimmed.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbaMatch) {
        const parts = rgbaMatch[1]
            .split(',')
            .map((segment) => segment.trim())
            .filter(Boolean);
        const [r = '255', g = '255', b = '255'] = parts;
        return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
    }
    if (trimmed.startsWith('#')) {
        let hex = trimmed.slice(1);
        if (hex.length === 3) {
            hex = hex
                .split('')
                .map((c) => c + c)
                .join('');
        }
        if (hex.length === 6) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
                return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
            }
        }
    }
    // Fallback: rely on CSS color with injected alpha via rgba
    return `rgba(255, 255, 255, ${normalizedAlpha})`;
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

function resolveOptions(pluginOptions) {
    const globalConfig =
        (typeof window !== 'undefined' &&
            window.pieChartGlassEffect &&
            window.pieChartGlassEffect.threeD) ||
        {};
    return deepMerge(deepMerge(DEFAULT_OPTIONS, globalConfig), pluginOptions || {});
}

function ensureState(chart, options) {
    if (!chart.$glass3d) {
        chart.$glass3d = {
            pointerTarget: { x: 0, y: 0 },
            pointerSmoothed: { x: 0, y: 0 },
            phase: 0,
            ambientPhase: 0,
            lastTime: null,
            animationFrame: null,
            energyParticles: [],
            maxOffset: options.parallax?.maxOffsetPx ?? 8,
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
    }
    if (!chart.glassPointerTarget) {
        chart.glassPointerTarget = { x: 0, y: 0 };
    }
    chart.$glass3d.maxOffset = options.parallax?.maxOffsetPx ?? 8;
    if (!chart.$glass3d.energyParticles || chart.$glass3d.energyParticles.length === 0) {
        initializeEnergyParticles(chart.$glass3d, options);
    }
    return chart.$glass3d;
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
        return 0;
    }
    const delta = (now - state.lastTime) / 1000;
    state.lastTime = now;
    const speed = options.reflection?.speed ?? 0;
    state.phase = (state.phase + delta * speed) % 1;
    state.ambientPhase =
        (state.ambientPhase + delta * (options.ambientGlow?.pulseSpeed ?? 0.5)) % 1;
    return delta;
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
    ctx.fill('evenodd');

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
        ctx.fill('evenodd');
    }

    ctx.restore();
}

function drawRimHighlight(ctx, centerX, centerY, outerRadius, innerRadius, options, pointer) {
    const rimCfg = options.rimHighlight || {};
    const width = rimCfg.width ?? 1.2;
    const opacity = rimCfg.opacity ?? 0.3;
    const squash = options.squash ?? 1;
    ctx.save();
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
    ctx.ellipse(
        centerX + pointer.x * 0.2,
        centerY + pointer.y * 0.2,
        innerRadius + width / 2,
        (innerRadius + width / 2) * squash,
        0,
        Math.PI * 2,
        0,
        true
    );
    ctx.stroke();
    ctx.restore();
}

function drawTopHighlight(ctx, centerX, centerY, outerRadius, innerRadius, options, pointer) {
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
    ctx.ellipse(centerX, centerY, innerRadius, innerRadius * squash, 0, Math.PI * 2, 0, true);
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
    ctx.fill('evenodd');
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

function getOverlayColors(options) {
    const electricColors = options.electric?.colors;
    if (electricColors && typeof electricColors === 'object') {
        const palette = [];
        if (electricColors.primary) {
            palette.push(electricColors.primary);
        }
        if (electricColors.secondary) {
            palette.push(electricColors.secondary);
        }
        if (electricColors.tertiary) {
            palette.push(electricColors.tertiary);
        }
        if (electricColors.quaternary) {
            palette.push(electricColors.quaternary);
        }
        if (Array.isArray(electricColors.list)) {
            palette.push(...electricColors.list);
        }
        if (palette.length > 0) {
            return palette;
        }
    }
    const overlay =
        options.overlayColors ||
        options.distortion?.overlayColors ||
        (typeof window !== 'undefined' &&
            window.pieChartGlassEffect?.liquidGlass?.distortion?.overlayColors);
    if (overlay) {
        return [overlay.inner, overlay.middle, overlay.outer].filter(Boolean);
    }
    return ['rgba(0, 255, 200, 0.6)', 'rgba(0, 180, 255, 0.45)', 'rgba(64, 224, 208, 0.4)'];
}

function initializeEnergyParticles(state, options) {
    const count = Math.max(12, (options.electric?.arcCount || 3) * 8);
    state.energyParticles = Array.from({ length: count }, () => ({
        angle: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.2,
        radiusFactor: 0.75 + Math.random() * 0.2,
        size: 1.2 + Math.random() * 1.6,
        flickerOffset: Math.random() * Math.PI * 2,
    }));
}

function updateEnergyParticles(state, delta, options) {
    if (!state.energyParticles) {
        return;
    }
    const baseSpeed =
        (options.reflection?.speed ?? 0.05) * (options.electric?.particleSpeedMultiplier ?? 1);
    state.energyParticles.forEach((particle, idx) => {
        const variance = 0.8 + (idx % 5) * 0.12;
        particle.angle =
            (particle.angle + delta * baseSpeed * 6 * particle.speed * variance) % (Math.PI * 2);
        particle.radiusFactor =
            0.75 + Math.sin(state.phase * Math.PI * 2 + particle.flickerOffset) * 0.05;
    });
}

function drawElectricTrail(
    ctx,
    centerX,
    centerY,
    outerRadius,
    innerRadius,
    options,
    state,
    pointer,
    squash
) {
    const electric = options.electric || {};
    const colors = getOverlayColors(options);
    const arcCount = electric.arcCount ?? 3;
    const widthFactor = electric.width ?? 0.22;
    const arcThickness = electric.arcThickness ?? 2.4;
    const bandThickness = outerRadius - innerRadius;
    const radius = innerRadius + bandThickness * 0.65;
    const offsetX = pointer.x * 0.2;
    const offsetY = pointer.y * 0.2;
    const speedMultiplier = electric.streakSpeedMultiplier ?? 1;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    for (let i = 0; i < arcCount; i += 1) {
        const color = colors[i % colors.length];
        const localPhase = (state.phase * speedMultiplier + (i / arcCount) * 0.65) % 1;
        const startAngle = localPhase * Math.PI * 2;
        const endAngle = startAngle + widthFactor * Math.PI * 2 * 0.75;
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = arcThickness * 3;
        ctx.lineWidth = arcThickness;
        ctx.beginPath();
        ctx.ellipse(
            centerX + offsetX,
            centerY + offsetY,
            radius,
            radius * squash,
            0,
            startAngle,
            endAngle
        );
        ctx.stroke();
    }
    ctx.restore();
}

function drawEnergyParticles(
    ctx,
    centerX,
    centerY,
    outerRadius,
    innerRadius,
    options,
    state,
    pointer,
    squash
) {
    if (!state.energyParticles) {
        return;
    }
    const colors =
        options.electric?.particleColors && Array.isArray(options.electric.particleColors)
            ? options.electric.particleColors
            : getOverlayColors(options);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const bandThickness = outerRadius - innerRadius;
    const baseRadius = innerRadius + bandThickness * 0.65;
    state.energyParticles.forEach((particle, idx) => {
        const angle = particle.angle;
        const radius = baseRadius * particle.radiusFactor;
        const x = centerX + Math.cos(angle) * radius + pointer.x * 0.15;
        const y = centerY + Math.sin(angle) * radius * squash + pointer.y * 0.15;
        const flicker = 0.5 + 0.5 * Math.sin(state.phase * Math.PI * 4 + particle.flickerOffset);
        const color = colors[idx % colors.length] || 'rgba(0,255,255,0.6)';
        ctx.shadowColor = color;
        ctx.shadowBlur = 8 + flicker * 8;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(
            x,
            y,
            particle.size + flicker * 1.5,
            (particle.size + flicker) * 0.6,
            angle,
            0,
            Math.PI * 2
        );
        ctx.fill();
    });
    ctx.restore();
}

function drawAmbientGlow(ctx, centerX, centerY, outerRadius, innerRadius, options, state, squash) {
    const glow = options.ambientGlow || {};
    const innerOpacity = glow.innerOpacity ?? 0.2;
    const outerOpacity = glow.outerOpacity ?? 0.05;
    const pulse = 0.5 + 0.5 * Math.sin(state.ambientPhase * Math.PI * 2);
    const radius = outerRadius * (1.05 + pulse * 0.05);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const gradient = ctx.createRadialGradient(
        centerX,
        centerY,
        innerRadius,
        centerX,
        centerY,
        radius * 1.3
    );
    const innerColor = applyAlpha(glow.innerColor, innerOpacity * (0.6 + pulse * 0.4));
    const outerColor = applyAlpha(glow.outerColor, outerOpacity);
    gradient.addColorStop(0, innerColor);
    gradient.addColorStop(1, outerColor);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radius * 1.2, radius * 1.2 * squash, 0, 0, Math.PI * 2);
    ctx.ellipse(centerX, centerY, innerRadius, innerRadius * squash, 0, Math.PI * 2, 0, true);
    ctx.fill('evenodd');
    ctx.restore();
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
        const delta = updatePhase(state, options);
        updateEnergyParticles(state, delta, options);
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

        drawAmbientGlow(
            ctx,
            centerX,
            centerY,
            outerRadius,
            innerRadius,
            options,
            state,
            options.squash ?? 1
        );
        drawElectricTrail(
            ctx,
            centerX,
            centerY,
            outerRadius,
            innerRadius,
            options,
            state,
            pointer,
            options.squash ?? 1
        );
        drawEnergyParticles(
            ctx,
            centerX,
            centerY,
            outerRadius,
            innerRadius,
            options,
            state,
            pointer,
            options.squash ?? 1
        );
        drawTopHighlight(ctx, centerX, centerY, outerRadius, innerRadius, options, pointer);
        drawReflection(ctx, centerX, centerY, outerRadius, innerRadius, options, state);
    },
};
