import { LOGO_SIZE, LOGO_SHADOW, LOGO_MARGIN_DEFAULT } from '@js/config.js';

function computeDefaultMarginConfigs() {
    const defaultMax = LOGO_MARGIN_DEFAULT && typeof LOGO_MARGIN_DEFAULT.max === 'number'
        ? LOGO_MARGIN_DEFAULT.max : 0.06;
    const defaultMin = LOGO_MARGIN_DEFAULT && typeof LOGO_MARGIN_DEFAULT.min === 'number'
        ? LOGO_MARGIN_DEFAULT.min : 0.02;
    return { defaultMax, defaultMin };
}

function clampMargin(value, fallback) {
    if (!Number.isFinite(value)) {
        return fallback;
    }
    return Math.max(0, Math.min(0.25, value));
}

function resolveMarginRange(marginConfig, defaultMax, defaultMin) {
    let maxMargin = defaultMax;
    let minMargin = defaultMin;
    if (typeof marginConfig === 'number') {
        const clamped = clampMargin(marginConfig, defaultMax);
        maxMargin = clamped;
        minMargin = clamped;
    } else if (marginConfig && typeof marginConfig === 'object') {
        if (Object.prototype.hasOwnProperty.call(marginConfig, 'max')) {
            maxMargin = clampMargin(marginConfig.max, defaultMax);
        }
        if (Object.prototype.hasOwnProperty.call(marginConfig, 'min')) {
            minMargin = clampMargin(marginConfig.min, defaultMin);
        }
    }
    if (minMargin > maxMargin) {
        const temp = maxMargin;
        maxMargin = minMargin;
        minMargin = temp;
    }
    return { maxMargin, minMargin };
}

function computeMargin(logoInfo, sliceAngle) {
    const sliceFactor = Math.min(sliceAngle / (Math.PI / 2), 1);
    const { defaultMax, defaultMin } = computeDefaultMarginConfigs();
    const { maxMargin, minMargin } = resolveMarginRange(logoInfo.margin, defaultMax, defaultMin);

    const marginRange = Math.max(0, maxMargin - minMargin);
    let margin = maxMargin - marginRange * sliceFactor;
    margin = Math.max(minMargin, Math.min(maxMargin, margin));

    const radialMargin = typeof logoInfo.radialMargin === 'number'
        ? Math.max(0, Math.min(0.2, logoInfo.radialMargin))
        : null;
    if (radialMargin !== null) {
        margin = radialMargin;
    }
    return margin;
}

function resolveTargetHeightMode() {
    const globalMode = LOGO_SIZE && (LOGO_SIZE.mode === 'px' || LOGO_SIZE.mode === 'ratio')
        ? LOGO_SIZE.mode : 'ratio';
    const globalValue = LOGO_SIZE && typeof LOGO_SIZE.value === 'number' ? LOGO_SIZE.value : 0.12;
    const globalMinPx = LOGO_SIZE && typeof LOGO_SIZE.minPx === 'number' ? LOGO_SIZE.minPx : 14;
    return { globalMode, globalValue, globalMinPx };
}

function computeTargetHeight(logoInfo, arc, band, margin) {
    const { globalMode, globalValue, globalMinPx } = resolveTargetHeightMode();

    let targetH;
    if (typeof logoInfo.sizePx === 'number') {
        targetH = logoInfo.sizePx;
    } else if (typeof logoInfo.sizeRatio === 'number') {
        targetH = arc.outerRadius * logoInfo.sizeRatio;
    } else if (globalMode === 'px') {
        targetH = globalValue;
    } else {
        targetH = arc.outerRadius * globalValue;
    }

    return Math.max(globalMinPx, Math.min(targetH, band * (1 - margin)));
}

function computeRotation(logoInfo, arc, sliceAngle) {
    let rotationRad;
    if (logoInfo.rotation === false) {
        rotationRad = 0;
    } else if (typeof logoInfo.rotation === 'number') {
        rotationRad = (logoInfo.rotation * Math.PI) / 180;
    } else if (logoInfo.rotation === 'radial-in') {
        const radial = arc.startAngle + sliceAngle / 2 + Math.PI;
        rotationRad = ((radial + Math.PI) % (2 * Math.PI)) - Math.PI;
    } else if (logoInfo.rotation === 'radial-out' || logoInfo.rotation === 'radial') {
        const radial = arc.startAngle + sliceAngle / 2;
        rotationRad = ((radial + Math.PI) % (2 * Math.PI)) - Math.PI;
    } else {
        let defaultRotation = arc.startAngle + sliceAngle / 2 + Math.PI / 2;
        if (defaultRotation > Math.PI / 2) {
            defaultRotation -= Math.PI;
        }
        if (defaultRotation < -Math.PI / 2) {
            defaultRotation += Math.PI;
        }
        const maxRot = Math.PI / 2;
        rotationRad = Math.max(-maxRot, Math.min(maxRot, defaultRotation));
    }

    if (typeof rotationRad === 'number' && typeof logoInfo.rotationOffsetDeg === 'number') {
        rotationRad += (logoInfo.rotationOffsetDeg * Math.PI) / 180;
        rotationRad = ((rotationRad + Math.PI) % (2 * Math.PI)) - Math.PI;
    }
    return rotationRad;
}

function clampDimensions(drawW, drawH, rotationRad, arcLen, band, margin) {
    const s = Math.abs(Math.sin(rotationRad || 0));
    const c = Math.abs(Math.cos(rotationRad || 0));

    const maxWByArc = Math.max(1, arcLen * (1 - margin));
    const tangentialExtent = drawH * s + drawW * c;
    if (tangentialExtent > maxWByArc) {
        const f = maxWByArc / tangentialExtent;
        drawW *= f;
        drawH *= f;
    }

    const maxRadial = band * (1 - margin);
    const radialExtent = drawH * c + drawW * s;
    if (radialExtent > maxRadial) {
        const f = maxRadial / radialExtent;
        drawW *= f;
        drawH *= f;
    }

    return { drawW, drawH };
}

function prepareOffscreenCanvas(dpr, drawW, drawH, img, opacity, renderAsWhite, glassRefraction, isHovered) {
    if (!drawImage._sharedCanvas && typeof document !== 'undefined') {
        drawImage._sharedCanvas = document.createElement('canvas');
        drawImage._sharedCtx = drawImage._sharedCanvas.getContext('2d', {
            willReadFrequently: true,
        });
    }

    const off = drawImage._sharedCanvas;
    const offCtx = drawImage._sharedCtx;

    if (!off || !offCtx) {
        return null;
    }

    off.width = Math.max(1, Math.round(drawW * dpr));
    off.height = Math.max(1, Math.round(drawH * dpr));

    offCtx.save();
    offCtx.scale(dpr, dpr);

    offCtx.save();
    offCtx.globalAlpha = opacity;
    offCtx.drawImage(img, 0, 0, drawW, drawH);
    offCtx.restore();

    if (renderAsWhite) {
        offCtx.save();
        offCtx.globalCompositeOperation = 'source-in';
        offCtx.fillStyle = 'white';
        offCtx.fillRect(0, 0, drawW, drawH);
        offCtx.restore();
    }

    if (glassRefraction !== false) {
        offCtx.save();
        offCtx.globalCompositeOperation = 'source-atop';
        offCtx.globalAlpha = isHovered ? 0.3 : 0.15;
        offCtx.fillStyle = 'rgba(50, 100, 180, 1)';
        offCtx.fillRect(0, 0, drawW, drawH);
        offCtx.restore();
    }

    offCtx.restore();
    return off;
}

function applyShadows(ctx) {
    if (LOGO_SHADOW && LOGO_SHADOW.enabled) {
        ctx.shadowColor = LOGO_SHADOW.color;
        ctx.shadowBlur = LOGO_SHADOW.blur;
        ctx.shadowOffsetX = LOGO_SHADOW.offsetX;
        ctx.shadowOffsetY = LOGO_SHADOW.offsetY;
    }
}

function resetShadows(ctx) {
    if (LOGO_SHADOW && LOGO_SHADOW.enabled) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }
}

function drawFallback(ctx, img, drawW, drawH, renderAsWhite, opacity) {
    ctx.globalAlpha = opacity;
    if (renderAsWhite) {
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = 'white';
        ctx.fillRect(-drawW / 2, -drawH / 2, drawW, drawH);
        ctx.globalCompositeOperation = 'source-over';
    } else {
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    }
    ctx.globalAlpha = 1;
}

function calculatePosition(arc, sliceAngle, midRadius, magneticOffset) {
    const angle = arc.startAngle + sliceAngle / 2;
    let x = arc.x + Math.cos(angle) * midRadius;
    let y = arc.y + Math.sin(angle) * midRadius;

    if (magneticOffset) {
        x += magneticOffset.dx;
        y += magneticOffset.dy;
    }
    return { x, y };
}

function clipToDonutSlice(ctx, arc) {
    ctx.beginPath();
    ctx.arc(arc.x, arc.y, arc.outerRadius, arc.startAngle, arc.endAngle);
    ctx.arc(arc.x, arc.y, arc.innerRadius, arc.endAngle, arc.startAngle, true);
    ctx.closePath();
    ctx.clip();
}

export function drawImage(ctx, arc, img, logoInfo, magneticOffset, isHovered) {
    const sliceAngle = Math.abs(arc.endAngle - arc.startAngle);
    if (sliceAngle < Math.PI / 18) {
        return;
    }

    const scale = typeof logoInfo.scale === 'number' ? logoInfo.scale : 1;
    const renderAsWhite = !!logoInfo.renderAsWhite;
    const opacity = typeof logoInfo.opacity === 'number' ? logoInfo.opacity : 1;

    const band = Math.max(arc.outerRadius - arc.innerRadius, 1);
    const midRadius = arc.innerRadius + band / 2;
    const arcLen = midRadius * sliceAngle;

    const margin = computeMargin(logoInfo, sliceAngle);
    const targetH = computeTargetHeight(logoInfo, arc, band, margin);

    function getAspect(img) { return img && img.width && img.height ? img.width / img.height : 1; }
    const aspect = getAspect(img);
    let drawH = targetH * scale;
    let drawW = drawH * aspect;

    const rotationRad = computeRotation(logoInfo, arc, sliceAngle);

    const dims = clampDimensions(drawW, drawH, rotationRad, arcLen, band, margin);
    drawW = dims.drawW;
    drawH = dims.drawH;

    const { x, y } = calculatePosition(arc, sliceAngle, midRadius, magneticOffset);

    ctx.save();
    clipToDonutSlice(ctx, arc);
    ctx.translate(x, y);

    /* istanbul ignore next: rotationRad is always a number by construction */
    if (typeof rotationRad === 'number') {
        ctx.rotate(rotationRad);
    }

    applyShadows(ctx);

    const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
    const off = prepareOffscreenCanvas(dpr, drawW, drawH, img, opacity, renderAsWhite, logoInfo.glassRefraction, isHovered);

    if (off) {
        ctx.drawImage(off, -drawW / 2, -drawH / 2, drawW, drawH);
    } else {
        drawFallback(ctx, img, drawW, drawH, renderAsWhite, opacity);
    }

    resetShadows(ctx);
    ctx.restore();
}
