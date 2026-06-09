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
        intensity: 0.42,
        width: 0.18,
        colors: {
            primary: 'rgba(140, 205, 255, 0.55)',
            secondary: 'rgba(96, 150, 255, 0.45)',
            tertiary: 'rgba(180, 140, 255, 0.35)',
            quaternary: 'rgba(110, 180, 255, 0.28)',
        },
        arcCount: 3,
        arcThickness: 2.4,
        particleColors: [
            'rgba(220, 235, 255, 0.65)',
            'rgba(150, 185, 255, 0.5)',
            'rgba(105, 135, 220, 0.45)',
        ],
        streakSpeedMultiplier: 1.15,
        particleSpeedMultiplier: 1.25,
    },
    ambientGlow: {
        innerOpacity: 0.17,
        outerOpacity: 0.045,
        pulseSpeed: 0.55,
        innerColor: '#E8F3FF',
        outerColor: '#0A1228',
    },
    seamOffsetRad: 0.05,
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
        // Check if there's a previous state to preserve continuity
        const existingPhase = chart._glass3dPhaseBackup || 0;
        const existingAmbientPhase = chart._glass3dAmbientPhaseBackup || 0;
        const existingContinuousPhase = chart._glass3dContinuousPhaseBackup || 0;

        chart.$glass3d = {
            pointerTarget: { x: 0, y: 0 },
            pointerSmoothed: { x: 0, y: 0 },
            phase: existingPhase,
            ambientPhase: existingAmbientPhase,
            lastTime: null,
            animationFrame: null,
            energyParticles: [],
            maxOffset: options.parallax?.maxOffsetPx ?? 8,
            // Continuous unwrapped phase for electric trails
            continuousPhase: existingContinuousPhase,
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
    const particlesEnabled = options.electric?.particlesEnabled !== false;
    if (!particlesEnabled) {
        chart.$glass3d.energyParticles = [];
    } else if (!chart.$glass3d.energyParticles || chart.$glass3d.energyParticles.length === 0) {
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

function updatePhase(state, options, chart) {
    const perf = typeof globalThis !== 'undefined' ? globalThis.performance : undefined;
    const now = perf && typeof perf.now === 'function' ? perf.now() : Date.now();
    if (state.lastTime === null) {
        state.lastTime = now;
        return 0;
    }
    const delta = (now - state.lastTime) / 1000;
    state.lastTime = now;
    const speed = options.reflection?.speed ?? 0;

    // Keep wrapped phase for other effects that need it
    state.phase = (state.phase + delta * speed) % 1;

    // Keep continuous unwrapped phase for electric trails (NEVER wraps)
    state.continuousPhase = (state.continuousPhase || 0) + delta * speed;

    state.ambientPhase =
        (state.ambientPhase + delta * (options.ambientGlow?.pulseSpeed ?? 0.5)) % 1;

    // Backup phase values to preserve across chart updates
    if (chart) {
        chart._glass3dPhaseBackup = state.phase;
        chart._glass3dAmbientPhaseBackup = state.ambientPhase;
        chart._glass3dContinuousPhaseBackup = state.continuousPhase;
    }

    return delta;
}

function drawShadow(ctx, centerX, centerY, outerRadius, depth, options, pointer, squash) {
    const shadowCfg = options.shadow || {};
    const scaleX = shadowCfg.scaleX ?? 1.1;
    const scaleY = shadowCfg.scaleY ?? 0.45;
    const offsetY = shadowCfg.offsetYPx ?? depth * 0.7;
    const opacity = shadowCfg.opacity ?? 0.22;
    const blur = shadowCfg.blur ?? 28;
    const px = pointer.x * 0.35;

    // --- Contact shadow: sharp, close to the object ---
    const contactBlur = Math.round(blur * 0.3);
    const contactOpacity = opacity * 0.6;
    const contactRadius = outerRadius * 0.88;
    ctx.save();
    ctx.translate(centerX + px, centerY + offsetY * 0.55);
    ctx.scale(scaleX * 0.97, scaleY * squash * 1.05);
    const contactGrad = ctx.createRadialGradient(0, 0, contactRadius * 0.35, 0, 0, contactRadius);
    contactGrad.addColorStop(0, `rgba(0, 0, 0, ${contactOpacity})`);
    contactGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = contactGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, contactRadius, contactRadius, 0, 0, Math.PI * 2);
    ctx.filter = `blur(${contactBlur}px)`;
    ctx.fill();
    ctx.restore();

    // --- Ambient shadow: soft, diffuse, further out ---
    ctx.save();
    ctx.translate(centerX + px, centerY + offsetY);
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

    // --- Caustic ring: light focused by refraction through curved glass ---
    // A glass torus bends light inward, creating a bright concentrated ring
    // just inside the shadow boundary.
    const causticRadius = radius * 0.85;
    const causticBlur = Math.round(blur * 0.5);
    const causticOpacity = 0.08;
    ctx.save();
    ctx.translate(centerX + px, centerY + offsetY * 0.9);
    ctx.scale(scaleX, scaleY * squash);
    const causticGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, causticRadius);
    // Hollow center — no light concentration in the middle
    causticGrad.addColorStop(0, 'rgba(140, 200, 255, 0)');
    causticGrad.addColorStop(0.5, 'rgba(140, 200, 255, 0)');
    // Bright ring where refracted light converges
    causticGrad.addColorStop(0.75, `rgba(140, 200, 255, ${causticOpacity})`);
    causticGrad.addColorStop(0.9, `rgba(180, 220, 255, ${causticOpacity * 0.7})`);
    // Fade out at the edge
    causticGrad.addColorStop(1, 'rgba(140, 200, 255, 0)');
    ctx.fillStyle = causticGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, causticRadius, causticRadius, 0, 0, Math.PI * 2);
    ctx.filter = `blur(${causticBlur}px)`;
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
    const px = pointer.x * 0.3;
    const py = pointer.y * 0.3;
    const dispersion = rimCfg.dispersion ?? 10;

    // Chromatic dispersion derived from the electric trail palette
    // so the rim feels part of the same energy system.
    // Outer: sky-blue (from primary 140,205,255), core: pale electric blue,
    // inner: lavender shift (from tertiary 180,140,255).
    const channels = [
        { color: [70, 205, 255], offset: dispersion, opacityScale: 0.08 }, // sky-blue (outer)
        { color: [80, 185, 255], offset: 0, opacityScale: 0.12 }, // electric blue core
        { color: [90, 140, 255], offset: -dispersion, opacityScale: 0.14 }, // lavender (inner)
    ];

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const bandWidth = width * 50;

    channels.forEach(({ color, offset, opacityScale }) => {
        const outerR = outerRadius + offset;
        const gradient = ctx.createRadialGradient(
            centerX + px,
            centerY + py,
            outerR - bandWidth,
            centerX + px,
            centerY + py,
            outerR + width
        );
        const [r, g, b] = color;
        const peakOpacity = opacity * opacityScale;
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
        gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${peakOpacity})`);
        gradient.addColorStop(0.85, `rgba(${r}, ${g}, ${b}, ${peakOpacity * 0.6})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(centerX + px, centerY + py, outerR, outerR * squash, 0, 0, Math.PI * 2);
        ctx.ellipse(
            centerX + pointer.x * 0.2,
            centerY + pointer.y * 0.2,
            innerRadius,
            innerRadius * squash,
            0,
            Math.PI * 2,
            0,
            true
        );
        ctx.fill('evenodd');
    });

    ctx.restore();
}

function drawFresnelHighlight(ctx, meta, options, pointer) {
    const squash = options.squash ?? 1;
    const fresnelCfg = options.fresnel || {};
    const baseReflectance = fresnelCfg.r0 ?? 0.04; // glass at normal incidence ~4%
    const intensity = fresnelCfg.intensity ?? 0.35;
    const exponent = fresnelCfg.exponent ?? 5; // Schlick's approximation power
    const lightVec = computeLightVector(options);
    const lightAngle = Math.atan2(lightVec.y, lightVec.x);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    meta.data.forEach((arc) => {
        const { x, y, startAngle, endAngle, outerRadius, innerRadius } = arc.getProps(
            ['x', 'y', 'startAngle', 'endAngle', 'outerRadius', 'innerRadius'],
            true
        );

        const midAngle = (startAngle + endAngle) / 2;

        // Schlick's Fresnel approximation for a torus cross-section.
        // The grazing factor measures how edge-on this arc segment is:
        // segments at the sides of the ring (3/9 o'clock) are glancing,
        // segments at top/bottom face the viewer more directly.
        const grazing = 1 - Math.abs(Math.sin(midAngle) * squash);
        const fresnel = baseReflectance + (1 - baseReflectance) * Math.pow(grazing, exponent);

        // Modulate by light direction — segments facing the light get a boost,
        // segments facing away get attenuated. This breaks left/right symmetry.
        const lightDot = 0.5 + 0.5 * Math.cos(midAngle - lightAngle);
        const alpha = fresnel * intensity * (0.4 + 0.6 * lightDot);

        if (alpha < 0.005) {
            return;
        }

        const bandRadius = (outerRadius + innerRadius) / 2;
        const bandWidth = (outerRadius - innerRadius) * 0.5;
        const cx = x + (pointer?.x || 0) * 0.2;
        const cy = y + (pointer?.y || 0) * 0.2;

        ctx.globalAlpha = alpha;
        ctx.strokeStyle = 'rgba(200, 225, 255, 1)';
        ctx.lineWidth = bandWidth;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.ellipse(cx, cy, bandRadius, bandRadius * squash, 0, startAngle, endAngle);
        ctx.stroke();
    });

    ctx.globalAlpha = 1;
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
    // Draw outer circle
    ctx.ellipse(centerX, centerY, outerRadius, outerRadius * squash, 0, 0, Math.PI * 2);
    // Cut out inner circle to create donut shape
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
    const midRadius = (outerRadius + innerRadius) / 2;
    const bandWidth = (outerRadius - innerRadius) * 0.55;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Gaussian beam optics: a specular caustic on curved glass is a sharp core
    // surrounded by a softer bloom halo, with Fresnel blue-shift at grazing edges.
    // 3 smooth passes replicate this layered structure without segmentation seams.

    const passes = [
        // Pass 1 — Bloom halo: wide, soft, white — the diffuse scatter around the caustic
        { widthScale: 1.6, alpha: intensity * 0.25, color: [255, 255, 255] },
        // Pass 2 — Core highlight: sharp, bright, near-white with very subtle blue shift
        { widthScale: 0.7, alpha: intensity, color: [240, 248, 255] },
        // Pass 3 — Fresnel edge: narrow inner rim, blue-tinted — grazing-angle Fresnel reflection
        { widthScale: 0.3, alpha: intensity * 0.4, color: [180, 215, 255] },
    ];

    for (const pass of passes) {
        const lw = Math.max(1, bandWidth * pass.widthScale);
        const [r, g, b] = pass.color;

        // Top-to-bottom gradient: overhead light = bright at top, fade to transparent at bottom
        const gradient = ctx.createLinearGradient(
            0,
            centerY - outerRadius,
            0,
            centerY + outerRadius
        );
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${pass.alpha.toFixed(3)})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = lw;
        ctx.globalAlpha = pass.alpha;

        ctx.beginPath();
        ctx.ellipse(centerX, centerY, midRadius, midRadius * squash, 0, startAngle, endAngle);
        ctx.stroke();
    }

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
    if (!state.energyParticles || options.electric?.particlesEnabled === false) {
        if (options.electric?.particlesEnabled === false) {
            state.energyParticles = [];
        }
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
    const baseRadius = innerRadius + bandThickness * 0.65;
    const offsetX = pointer.x * 0.2;
    const offsetY = pointer.y * 0.2;
    const speedMultiplier = electric.streakSpeedMultiplier ?? 1;
    const segments = 20;

    // Head color: hot white-blue plasma
    const headColor = 'rgba(220, 240, 255, 1)';
    // Tail tint shifts toward cool violet
    const tailColor = 'rgba(140, 100, 255, 1)';

    // Reflection band angular range — trails flare when crossing the specular zone
    const reflectionCfg = options.reflection || {};
    const reflWidth = reflectionCfg.width ?? 0.2;
    const reflPhase = state.phase || 0;
    const reflStart = reflPhase * Math.PI * 2;
    const flareColor = 'rgba(240, 250, 255, 1)';

    // Fresnel modulation: trails glow brighter at glancing angles on the torus
    const fresnelCfg = options.fresnel || {};
    const fresnelR0 = fresnelCfg.r0 ?? 0.04;
    const fresnelExp = fresnelCfg.exponent ?? 5;
    const fresnelBoost = fresnelCfg.trailBoost ?? 0.6;

    const fresnelAt = (angle) => {
        const grazing = 1 - Math.abs(Math.sin(angle) * squash);
        return fresnelR0 + (1 - fresnelR0) * Math.pow(grazing, fresnelExp);
    };

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    const cx = centerX + offsetX;
    const cy = centerY + offsetY;

    for (let i = 0; i < arcCount; i += 1) {
        const color = colors[i % colors.length];
        const localPhase = state.continuousPhase * speedMultiplier + (i / arcCount) * 0.65;
        const arcStart = localPhase * Math.PI * 2;
        const arcSpan = widthFactor * Math.PI * 2 * 0.75;

        // Each trail orbits at a slightly different radius (weave within the band)
        const radiusOffset = Math.sin(localPhase * Math.PI * 4 + i * 2.1) * bandThickness * 0.08;
        const trailRadius = baseRadius + radiusOffset;

        // Energy pulse: sinusoidal throb along the trail phase
        const pulsePhase = state.continuousPhase * 3 + i * 1.7;
        const pulseBase = 0.7 + 0.3 * Math.sin(pulsePhase * Math.PI * 2);

        // Compute specular overlap for a segment mid-angle.
        // Returns 0–1: how deeply this angle sits inside the reflection band.
        const specularOverlap = (angle) => {
            // Normalize angle into [0, 2π) range
            const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            // Check against the reflection band (which may wrap around 2π)
            const rStart = ((reflStart % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const rSpan = reflWidth * Math.PI * 2;
            let dist;
            if (rStart + rSpan <= Math.PI * 2) {
                // Band doesn't wrap
                if (a >= rStart && a <= rStart + rSpan) {
                    dist = Math.min(a - rStart, rStart + rSpan - a) / (rSpan * 0.5);
                    return 1 - dist;
                }
                return 0;
            }
            // Band wraps around 2π
            if (a >= rStart || a <= (rStart + rSpan) % (Math.PI * 2)) {
                const wrapped = a >= rStart ? a - rStart : a + Math.PI * 2 - rStart;
                dist = Math.min(wrapped, rSpan - wrapped) / (rSpan * 0.5);
                return 1 - Math.max(0, dist);
            }
            return 0;
        };

        // --- Ghost afterglow trail (wider, dimmer, slightly behind) ---
        const ghostOffset = arcSpan * 0.15;
        const ghostRadius = trailRadius + bandThickness * 0.05 * (i % 2 === 0 ? 1 : -1);
        for (let s = 0; s < segments; s += 1) {
            const t = (s + 0.5) / segments;
            const segStart = arcStart - ghostOffset + arcSpan * (s / segments);
            const segEnd = arcStart - ghostOffset + arcSpan * ((s + 1) / segments);

            // Asymmetric comet fade: fast rise at head (t≈1), long decay into tail (t≈0)
            const cometFade = Math.pow(t, 0.6) * Math.pow(1 - Math.pow(t, 3), 0.5);
            const segMid = (segStart + segEnd) / 2;
            const flare = specularOverlap(segMid);
            const fresnel = 1 + fresnelAt(segMid) * fresnelBoost;
            const ghostAlpha = cometFade * (0.2 + flare * 0.3) * pulseBase * fresnel;

            if (ghostAlpha < 0.005) {
                continue;
            }

            ctx.strokeStyle = flare > 0.1 ? flareColor : color;
            ctx.shadowColor = flare > 0.1 ? flareColor : color;
            ctx.shadowBlur = arcThickness * (4 + flare * 8);
            ctx.lineWidth = arcThickness * 2.5 * cometFade * (1 + flare * 0.5);
            ctx.globalAlpha = ghostAlpha;
            ctx.beginPath();
            ctx.ellipse(cx, cy, ghostRadius, ghostRadius * squash, 0, segStart, segEnd);
            ctx.stroke();
        }

        // --- Main plasma trail with color temperature shift ---
        for (let s = 0; s < segments; s += 1) {
            const t = (s + 0.5) / segments; // 0 = tail, 1 = head
            const segStart = arcStart + arcSpan * (s / segments);
            const segEnd = arcStart + arcSpan * ((s + 1) / segments);

            // Asymmetric comet envelope: sharp bright head, long diffuse tail
            const cometFade = Math.pow(t, 0.5) * Math.pow(1 - Math.pow(t, 4), 0.4);
            const pulse = pulseBase * (0.85 + 0.15 * Math.sin(t * Math.PI * 6 + pulsePhase));

            // Color temperature: interpolate from tail (cool base color) → head (hot white-blue)
            // Head segments (t > 0.7) shift to hot white, tail stays as the base color
            const headMix = Math.pow(Math.max(0, (t - 0.4) / 0.6), 2);
            const tailMix = Math.pow(Math.max(0, (0.5 - t) / 0.5), 1.5);
            let segColor = color;
            if (headMix > 0.01) {
                segColor = applyAlpha(headColor, headMix * 0.8);
            } else if (tailMix > 0.01) {
                segColor = applyAlpha(tailColor, tailMix * 0.5);
            }

            // Specular flare: boost when crossing the reflection band
            const mainSegMid = (segStart + segEnd) / 2;
            const flare = specularOverlap(mainSegMid);
            // Fresnel modulation: glancing angles on the torus surface reflect more light
            const fresnel = 1 + fresnelAt(mainSegMid) * fresnelBoost;
            const alpha = cometFade * pulse * (1 + flare * 1.5) * fresnel;
            const thickness = arcThickness * (0.2 + 0.8 * cometFade) * (1 + flare * 0.4);

            if (alpha < 0.005) {
                continue;
            }

            // Main stroke — shifts to flare white in the specular zone
            const mainColor = flare > 0.15 ? flareColor : color;
            const glowColor = flare > 0.15 ? flareColor : segColor;
            ctx.strokeStyle = mainColor;
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = thickness * 3 * (0.5 + headMix * 2 + flare * 4);
            ctx.lineWidth = thickness;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.ellipse(cx, cy, trailRadius, trailRadius * squash, 0, segStart, segEnd);
            ctx.stroke();

            // Hot core overlay at the head OR in the specular zone
            if (headMix > 0.05 || flare > 0.2) {
                const coreMix = Math.max(headMix, flare);
                ctx.strokeStyle = flareColor;
                ctx.shadowColor = flareColor;
                ctx.shadowBlur = thickness * (5 + flare * 6);
                ctx.lineWidth = thickness * (0.4 + flare * 0.3);
                ctx.globalAlpha = alpha * coreMix * 0.9;
                ctx.beginPath();
                ctx.ellipse(cx, cy, trailRadius, trailRadius * squash, 0, segStart, segEnd);
                ctx.stroke();
            }
        }
    }
    ctx.globalAlpha = 1;
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
    if (!state.energyParticles || options.electric?.particlesEnabled === false) {
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

function drawBeerLambertOverlay(ctx, meta, options) {
    const lightVec = computeLightVector(options);
    const lightAngle = Math.atan2(lightVec.y, lightVec.x);
    const highlightOpacity = 0.18;
    const shadowOpacity = 0.14;

    ctx.save();
    meta.data.forEach((arc) => {
        const { x, y, startAngle, endAngle, outerRadius, innerRadius } = arc.getProps(
            ['x', 'y', 'startAngle', 'endAngle', 'outerRadius', 'innerRadius'],
            true
        );

        // Gradient runs from the light direction toward the opposite side
        const gradX1 = x + Math.cos(lightAngle) * outerRadius;
        const gradY1 = y + Math.sin(lightAngle) * outerRadius;
        const gradX2 = x - Math.cos(lightAngle) * outerRadius;
        const gradY2 = y - Math.sin(lightAngle) * outerRadius;

        const gradient = ctx.createLinearGradient(gradX1, gradY1, gradX2, gradY2);
        // Light-facing side: slight white wash (less absorption path)
        gradient.addColorStop(0, `rgba(255, 255, 255, ${highlightOpacity})`);
        // Middle: neutral
        gradient.addColorStop(0.45, 'rgba(0, 0, 0, 0)');
        // Shadow side: deeper/darker (longer absorption path through colored glass)
        gradient.addColorStop(1, `rgba(0, 0, 0, ${shadowOpacity})`);

        // Clip to this specific arc slice
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, outerRadius, startAngle, endAngle);
        ctx.arc(x, y, innerRadius, endAngle, startAngle, true);
        ctx.closePath();
        ctx.clip();

        ctx.fillStyle = gradient;
        ctx.fillRect(x - outerRadius, y - outerRadius, outerRadius * 2, outerRadius * 2);
        ctx.restore();
    });
    ctx.restore();
}

function drawAtmosphericFade(ctx, centerX, centerY, outerRadius, innerRadius, options) {
    const squash = options.squash ?? 1;
    const fadeOpacity = 0.12;

    ctx.save();

    // Clip to the donut ring so the gradient only affects the face
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, outerRadius, outerRadius * squash, 0, 0, Math.PI * 2);
    ctx.ellipse(centerX, centerY, innerRadius, innerRadius * squash, 0, Math.PI * 2, 0, true);
    ctx.clip('evenodd');

    // Top-to-bottom gradient: transparent at top (near edge), dark at bottom (far edge)
    const gradient = ctx.createLinearGradient(
        centerX,
        centerY - outerRadius * squash,
        centerX,
        centerY + outerRadius * squash
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, `rgba(0, 0, 0, ${fadeOpacity})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(
        centerX - outerRadius,
        centerY - outerRadius * squash,
        outerRadius * 2,
        outerRadius * squash * 2
    );
    ctx.restore();
}

function drawAmbientGlow(ctx, centerX, centerY, outerRadius, innerRadius, options, state, squash) {
    const glow = options.ambientGlow || {};
    const innerOpacity = glow.innerOpacity ?? 0.2;
    const outerOpacity = glow.outerOpacity ?? 0.05;
    const pulse = 0.5 + 0.5 * Math.sin(state.ambientPhase * Math.PI * 2);

    ctx.save();

    // Clip to exact donut boundaries to prevent glow bleeding
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, outerRadius, outerRadius * squash, 0, 0, Math.PI * 2);
    ctx.ellipse(centerX, centerY, innerRadius, innerRadius * squash, 0, Math.PI * 2, 0, true);
    ctx.clip('evenodd');

    ctx.globalCompositeOperation = 'screen';

    // Use outerRadius as max extent instead of exceeding it
    const gradientRadius = outerRadius * (0.9 + pulse * 0.1);
    const gradient = ctx.createRadialGradient(
        centerX,
        centerY,
        innerRadius,
        centerX,
        centerY,
        gradientRadius
    );
    const innerColor = applyAlpha(glow.innerColor, innerOpacity * (0.6 + pulse * 0.4));
    const outerColor = applyAlpha(glow.outerColor, outerOpacity);
    gradient.addColorStop(0, innerColor);
    gradient.addColorStop(1, outerColor);
    ctx.fillStyle = gradient;

    ctx.beginPath();
    // Draw exactly to outer radius, no overflow
    ctx.ellipse(centerX, centerY, outerRadius, outerRadius * squash, 0, 0, Math.PI * 2);
    // Cut out inner circle to create donut shape
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
        const delta = updatePhase(state, options, chart);
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

        drawBeerLambertOverlay(ctx, meta, options);
        drawAtmosphericFade(ctx, centerX, centerY, outerRadius, innerRadius, options);
        drawFresnelHighlight(ctx, meta, options, pointer);
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
        if (options.electric?.particlesEnabled !== false) {
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
        }
        drawTopHighlight(ctx, centerX, centerY, outerRadius, innerRadius, options, pointer);
        drawReflection(ctx, centerX, centerY, outerRadius, innerRadius, options, state);
    },
};
