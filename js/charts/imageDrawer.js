import { LOGO_SIZE, LOGO_SHADOW, LOGO_MARGIN_DEFAULT } from '@js/config.js';

export function drawImage(ctx, arc, img, logoInfo) {
    // Skip very small slices to avoid clutter (about 10 degrees)
    const sliceAngle = Math.abs(arc.endAngle - arc.startAngle);
    if (sliceAngle < Math.PI / 18) {
        return;
    }

    const scale = typeof logoInfo.scale === 'number' ? logoInfo.scale : 1;
    const renderAsWhite = !!logoInfo.renderAsWhite;
    const opacity = typeof logoInfo.opacity === 'number' ? logoInfo.opacity : 1;

    // Compute geometry
    const band = Math.max(arc.outerRadius - arc.innerRadius, 1);
    const midRadius = arc.innerRadius + band / 2;
    const arcLen = midRadius * sliceAngle;

    // Consistent visual height baseline (nearly uniform across slices)
    //  - base height scales with chart radius but is clamped by the band thickness
    //  - margins ensure a bit of breathing room inside the slice
    const sliceFactor = Math.min(sliceAngle / (Math.PI / 2), 1);
    const marginConfig = logoInfo.margin;
    const defaultMax =
        LOGO_MARGIN_DEFAULT && typeof LOGO_MARGIN_DEFAULT.max === 'number'
            ? LOGO_MARGIN_DEFAULT.max
            : 0.06;
    const defaultMin =
        LOGO_MARGIN_DEFAULT && typeof LOGO_MARGIN_DEFAULT.min === 'number'
            ? LOGO_MARGIN_DEFAULT.min
            : 0.02;

    const clampMargin = (value, fallback) => {
        if (!Number.isFinite(value)) {
            return fallback;
        }
        return Math.max(0, Math.min(0.25, value));
    };

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
    const marginRange = Math.max(0, maxMargin - minMargin);
    let margin = maxMargin - marginRange * sliceFactor;
    margin = Math.max(minMargin, Math.min(maxMargin, margin));

    // Allow a per-logo tighter/looser fit to inner/outer arcs (radial margin)
    const radialMargin =
        typeof logoInfo.radialMargin === 'number'
            ? Math.max(0, Math.min(0.2, logoInfo.radialMargin))
            : null;
    if (radialMargin !== null) {
        margin = radialMargin;
    }

    // Determine target height based on per-logo override or global defaults
    const globalMode =
        LOGO_SIZE && (LOGO_SIZE.mode === 'px' || LOGO_SIZE.mode === 'ratio')
            ? LOGO_SIZE.mode
            : 'ratio';
    const globalValue = LOGO_SIZE && typeof LOGO_SIZE.value === 'number' ? LOGO_SIZE.value : 0.12;
    const globalMinPx = LOGO_SIZE && typeof LOGO_SIZE.minPx === 'number' ? LOGO_SIZE.minPx : 14;

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

    // Apply minimum and band-based clamp
    targetH = Math.max(globalMinPx, Math.min(targetH, band * (1 - margin)));

    // Maintain aspect ratio with desired height; width gets adjusted later against arc length
    const aspect = img && img.width && img.height ? img.width / img.height : 1;
    let drawH = targetH * scale;
    let drawW = drawH * aspect;

    // Pre-compute rotation to clamp extents in radial/tangential directions
    let rotationRad;
    if (logoInfo.rotation === false) {
        // Explicitly disable rotation
        rotationRad = 0;
    } else if (typeof logoInfo.rotation === 'number') {
        // User-specified degrees
        rotationRad = (logoInfo.rotation * Math.PI) / 180;
    } else if (logoInfo.rotation === 'radial-in') {
        // Point the logo's vertical axis toward the chart center
        const radial = arc.startAngle + sliceAngle / 2 + Math.PI;
        rotationRad = ((radial + Math.PI) % (2 * Math.PI)) - Math.PI; // normalize to [-PI, PI]
    } else if (logoInfo.rotation === 'radial-out' || logoInfo.rotation === 'radial') {
        // Point the logo's vertical axis away from the chart center
        const radial = arc.startAngle + sliceAngle / 2;
        rotationRad = ((radial + Math.PI) % (2 * Math.PI)) - Math.PI; // normalize to [-PI, PI]
    } else {
        // Default: roughly align along the tangent while keeping the logo upright
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

    // Optional fine-tuning: allow a per-logo offset in degrees
    if (typeof rotationRad === 'number' && typeof logoInfo.rotationOffsetDeg === 'number') {
        rotationRad += (logoInfo.rotationOffsetDeg * Math.PI) / 180;
        // Normalize to [-PI, PI] for stability
        rotationRad = ((rotationRad + Math.PI) % (2 * Math.PI)) - Math.PI;
    }

    const s = Math.abs(Math.sin(rotationRad || 0));
    const c = Math.abs(Math.cos(rotationRad || 0));

    // Clamp by arc length (tangential direction)
    const maxWByArc = Math.max(1, arcLen * (1 - margin));
    let tangentialExtent = drawH * s + drawW * c; // projected width along tangent after rotation
    if (tangentialExtent > maxWByArc) {
        const f = maxWByArc / tangentialExtent;
        drawW *= f;
        drawH *= f;
        tangentialExtent = maxWByArc;
    }

    // Clamp by band thickness (radial direction) — closer fit to inner/outer arcs for vertical-ish logos
    const maxRadial = band * (1 - margin);
    let radialExtent = drawH * c + drawW * s; // projected height along radius after rotation
    if (radialExtent > maxRadial) {
        const f = maxRadial / radialExtent;
        drawW *= f;
        drawH *= f;
        radialExtent = maxRadial;
    }

    // Center of the slice at mid radius
    const angle = arc.startAngle + sliceAngle / 2;
    const x = arc.x + Math.cos(angle) * midRadius;
    const y = arc.y + Math.sin(angle) * midRadius;

    // rotationRad already computed above

    ctx.save();

    // Clip to the donut slice to keep logo inside
    ctx.beginPath();
    ctx.arc(arc.x, arc.y, arc.outerRadius, arc.startAngle, arc.endAngle);
    ctx.arc(arc.x, arc.y, arc.innerRadius, arc.endAngle, arc.startAngle, true);
    ctx.closePath();
    ctx.clip();

    // Move to center of slice and rotate
    ctx.translate(x, y);
    /* istanbul ignore next: rotationRad is always a number by construction */
    if (typeof rotationRad === 'number') {
        ctx.rotate(rotationRad);
    }

    // Apply macOS-style drop shadow before drawing the logo
    if (LOGO_SHADOW && LOGO_SHADOW.enabled) {
        ctx.shadowColor = LOGO_SHADOW.color;
        ctx.shadowBlur = LOGO_SHADOW.blur;
        ctx.shadowOffsetX = LOGO_SHADOW.offsetX;
        ctx.shadowOffsetY = LOGO_SHADOW.offsetY;
    }

    const dpr =
        typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
    // Safari drops ctx.globalAlpha when shadows are active on <canvas>; bake opacity into the bitmap.
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(drawW * dpr));
    off.height = Math.max(1, Math.round(drawH * dpr));
    const offCtx = off.getContext('2d', { willReadFrequently: true });

    if (offCtx) {
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

        offCtx.restore();

        ctx.drawImage(off, -drawW / 2, -drawH / 2, drawW, drawH);
    } else {
        // Fallback if offscreen canvas creation fails; allows logos to render albeit without Safari fix
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

    // Reset shadow properties to avoid affecting other elements
    if (LOGO_SHADOW && LOGO_SHADOW.enabled) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }

    ctx.restore();
}
