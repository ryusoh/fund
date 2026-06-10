/**
 * Physically-based "Liquid Glass" backdrop refraction.
 *
 * Implements the SVG displacement-map technique popularized by the
 * open-source liquid-glass projects (shuding/liquid-glass,
 * liquid-glass-react): the pane is modelled as a flat glass slab with a
 * convex circular bezel around its rounded-rect rim. For every pixel we
 * derive the surface normal from the signed distance field, apply
 * Snell's law to get the lateral ray displacement through the slab, and
 * encode that displacement into the R/G channels of a map consumed by
 * feDisplacementMap. Chromatic dispersion uses the Abbe model: separate
 * red/green/blue displacement scales recombined additively, so edges
 * show real spectral fringing.
 *
 * The filter runs as `backdrop-filter: url(#...)`, refracting whatever
 * is actually behind the pane. Only Chromium renders SVG filters inside
 * backdrop-filter; Safari/Firefox keep the stylesheet's frosted-blur
 * fallback untouched.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

let sharedSvg = null;
let sharedDefs = null;
let instanceCount = 0;
let nextFilterId = 0;

export function supportsSvgBackdropFilter() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return false;
    }
    // Safari and Firefox parse url() in backdrop-filter but render nothing,
    // which would also drop the frost fallback — gate on Chromium like the
    // open-source liquid-glass implementations do.
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    if (!/Chrome\//.test(ua)) {
        return false;
    }
    if (
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-transparency: reduce)').matches
    ) {
        return false;
    }
    return true;
}

/**
 * Signed distance to a rounded rectangle centred at the origin.
 * Negative inside, positive outside.
 */
export function roundedRectSDF(x, y, halfWidth, halfHeight, radius) {
    const qx = Math.abs(x) - (halfWidth - radius);
    const qy = Math.abs(y) - (halfHeight - radius);
    const ax = Math.max(qx, 0);
    const ay = Math.max(qy, 0);
    return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - radius;
}

/**
 * Largest lateral displacement the slab can produce: grazing incidence,
 * where the ray inside the glass travels at the critical angle.
 */
export function maxRefractionShift(ior, thickness) {
    return thickness * Math.tan(Math.PI / 2 - Math.asin(1 / ior));
}

/**
 * Lateral backdrop displacement at a given distance from the pane edge.
 *
 * The bezel is a quarter-circle: height h(t) = sqrt(2t - t²) for
 * t = distFromEdge / bezelWidth, so the surface is vertical right at the
 * rim and flattens toward the interior. A vertical viewing ray hits the
 * tilted surface at θi, refracts to θt per Snell, and exits laterally
 * shifted by thickness · tan(θi − θt) toward the pane centre.
 */
export function refractionShift(distFromEdge, bezelWidth, ior, thickness) {
    if (distFromEdge >= bezelWidth) {
        return 0;
    }
    if (distFromEdge <= 0) {
        return maxRefractionShift(ior, thickness);
    }
    const t = distFromEdge / bezelWidth;
    const slope = (1 - t) / Math.sqrt(Math.max(2 * t - t * t, 1e-9));
    const thetaI = Math.atan(slope);
    const thetaT = Math.asin(Math.min(1, Math.sin(thetaI) / ior));
    return thickness * Math.tan(thetaI - thetaT);
}

/**
 * Per-channel displacement ratios from the Abbe number. Lower Abbe means
 * stronger dispersion (flint-like glass). Ratios are paraxial lens-power
 * ratios (n_c − 1)/(n_d − 1) relative to the design wavelength.
 */
export function dispersionRatios(ior, abbeNumber, gain = 1) {
    const spread = ((ior - 1) / Math.max(abbeNumber, 1)) * gain;
    const nRed = ior - spread / 2;
    const nBlue = ior + spread / 2;
    return {
        r: (nRed - 1) / (ior - 1),
        g: 1,
        b: (nBlue - 1) / (ior - 1),
    };
}

/**
 * Light concentration produced by the bezel lens at a given distance from
 * the edge. The lens maps a backdrop span onto a screen span; by energy
 * conservation the brightness multiplier is |d(sample)/d(screen)| =
 * |1 + shift'(d)|. Values above 1 are caustic concentration.
 */
export function causticConcentration(distFromEdge, bezelWidth, ior, thickness) {
    const eps = 0.25;
    const ahead = refractionShift(distFromEdge + eps, bezelWidth, ior, thickness);
    const behind = refractionShift(Math.max(0, distFromEdge - eps), bezelWidth, ior, thickness);
    const slope = (ahead - behind) / (2 * eps);
    return Math.abs(1 + slope);
}

// Concentration value that maps to a fully saturated caustic mask.
const CAUSTIC_NORM = 4;

/**
 * Compute the displacement map for a pane. Pure function: returns map
 * dimensions, RGBA bytes (R = x-shift, G = y-shift around 127.5,
 * B = caustic concentration mask) and the shift normalisation in CSS
 * pixels. `scale` trades map resolution for speed; the displacement
 * field is smooth so 0.5 is visually lossless.
 *
 * `shape` is 'roundedRect' (default) or 'annulus' — a glass ring whose
 * inner radius is `innerRadiusRatio` of the outer radius, with the bezel
 * (and its caustics) on both rims.
 */
export function buildDisplacementMap({
    width,
    height,
    radius,
    bezelWidth,
    ior,
    thickness,
    scale = 0.5,
    shape = 'roundedRect',
    innerRadiusRatio = 0.6,
}) {
    const mapW = Math.max(2, Math.round(width * scale));
    const mapH = Math.max(2, Math.round(height * scale));
    const halfW = width / 2;
    const halfH = height / 2;
    const r = Math.max(0, Math.min(radius, Math.min(halfW, halfH)));
    const maxShift = maxRefractionShift(ior, thickness);
    const eps = 0.5;

    const outerR = Math.min(halfW, halfH);
    const innerR = outerR * Math.min(0.95, Math.max(0, innerRadiusRatio));
    const sdfAt =
        shape === 'annulus'
            ? (px, py) => {
                  const d = Math.sqrt(px * px + py * py);
                  return Math.max(d - outerR, innerR - d);
              }
            : (px, py) => roundedRectSDF(px, py, halfW, halfH, r);

    const data = new Uint8ClampedArray(mapW * mapH * 4);
    let i = 0;
    for (let my = 0; my < mapH; my++) {
        const y = ((my + 0.5) / mapH) * height - halfH;
        for (let mx = 0; mx < mapW; mx++) {
            const x = ((mx + 0.5) / mapW) * width - halfW;

            const sdf = sdfAt(x, y);
            const distFromEdge = -sdf;

            let dx = 0;
            let dy = 0;
            let caustic = 0;
            if (distFromEdge > 0 && distFromEdge < bezelWidth) {
                const shift = refractionShift(distFromEdge, bezelWidth, ior, thickness);
                if (shift > 0) {
                    // SDF gradient points outward; displace inward.
                    const gx = sdfAt(x + eps, y) - sdfAt(x - eps, y);
                    const gy = sdfAt(x, y + eps) - sdfAt(x, y - eps);
                    const len = Math.sqrt(gx * gx + gy * gy);
                    if (len > 1e-9) {
                        dx = (-gx / len) * shift;
                        dy = (-gy / len) * shift;
                    }
                }
                const concentration = causticConcentration(
                    distFromEdge,
                    bezelWidth,
                    ior,
                    thickness
                );
                caustic = Math.min(1, Math.max(0, (concentration - 1) / CAUSTIC_NORM));
            }

            data[i++] = 127.5 + 127.5 * (dx / maxShift);
            data[i++] = 127.5 + 127.5 * (dy / maxShift);
            data[i++] = 255 * caustic;
            data[i++] = 255;
        }
    }

    return { width: mapW, height: mapH, data, maxShift };
}

function ensureSharedSvg() {
    if (sharedSvg && sharedSvg.isConnected) {
        return sharedDefs;
    }
    sharedSvg = document.createElementNS(SVG_NS, 'svg');
    sharedSvg.setAttribute('width', '0');
    sharedSvg.setAttribute('height', '0');
    sharedSvg.setAttribute('aria-hidden', 'true');
    // display:none would disable filter references; park it offscreen instead.
    sharedSvg.style.position = 'fixed';
    sharedSvg.style.top = '0';
    sharedSvg.style.left = '0';
    sharedSvg.style.pointerEvents = 'none';
    sharedDefs = document.createElementNS(SVG_NS, 'defs');
    sharedSvg.appendChild(sharedDefs);
    document.body.appendChild(sharedSvg);
    return sharedDefs;
}

function releaseSharedSvg() {
    if (instanceCount <= 0 && sharedSvg) {
        if (sharedSvg.parentNode) {
            sharedSvg.parentNode.removeChild(sharedSvg);
        }
        sharedSvg = null;
        sharedDefs = null;
    }
}

const CHANNEL_MATRICES = {
    r: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
    g: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
    b: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
};

export class LiquidGlassRefraction {
    constructor(element, options = {}) {
        this.element = element;
        this.options = {
            bezelWidth: 14,
            thickness: 28,
            ior: 1.52,
            abbeNumber: 32,
            dispersionGain: 1,
            // Brightness boost where the bezel lens concentrates light
            // (result = refracted · (1 + causticGain · mask)).
            causticGain: 0.7,
            // Corner radius in px for the lens shape; null = read the element's
            // computed border-radius (supports % of the smaller box dimension).
            radius: null,
            // 'roundedRect' or 'annulus' (glass ring, e.g. a donut chart).
            shape: 'roundedRect',
            // Annulus only: inner radius as a fraction of the outer radius.
            innerRadiusRatio: 0.6,
            // null = keep the pane's existing computed backdrop-filter
            // (e.g. "blur(24px) saturate(1.8)") chained after the lens.
            frost: null,
            mapScale: 0.5,
            ...options,
        };

        this.enabled = options.force === true || supportsSvgBackdropFilter();
        if (!this.enabled) {
            return;
        }

        this.filterId = `liquid-glass-refraction-${nextFilterId++}`;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        if (!this.ctx) {
            this.enabled = false;
            return;
        }

        instanceCount++;
        this._lastGeometry = null;

        // Capture the pane's stylesheet frost before we override it, so the
        // lens can be chained in front of the exact same blur/saturation.
        this._inheritedFrost = '';
        try {
            const computed = window.getComputedStyle(this.element).backdropFilter;
            if (computed && computed !== 'none') {
                this._inheritedFrost = computed;
            }
        } catch {
            this._inheritedFrost = '';
        }

        this._buildFilter();

        this._rafPending = false;
        // eslint-disable-next-line no-undef
        this.resizeObserver = new ResizeObserver(() => this._scheduleUpdate());
        this.resizeObserver.observe(this.element);
        this._scheduleUpdate();
    }

    _buildFilter() {
        const defs = ensureSharedSvg();
        const ratios = dispersionRatios(
            this.options.ior,
            this.options.abbeNumber,
            this.options.dispersionGain
        );

        this.filter = document.createElementNS(SVG_NS, 'filter');
        this.filter.setAttribute('id', this.filterId);
        this.filter.setAttribute('x', '0');
        this.filter.setAttribute('y', '0');
        this.filter.setAttribute('width', '100%');
        this.filter.setAttribute('height', '100%');
        this.filter.setAttribute('color-interpolation-filters', 'sRGB');

        this.feImage = document.createElementNS(SVG_NS, 'feImage');
        this.feImage.setAttribute('x', '0');
        this.feImage.setAttribute('y', '0');
        this.feImage.setAttribute('width', '100%');
        this.feImage.setAttribute('height', '100%');
        this.feImage.setAttribute('preserveAspectRatio', 'none');
        this.feImage.setAttribute('result', 'map');
        this.filter.appendChild(this.feImage);

        this.displacementNodes = {};
        const channels = ['r', 'g', 'b'];
        for (const channel of channels) {
            const disp = document.createElementNS(SVG_NS, 'feDisplacementMap');
            disp.setAttribute('in', 'SourceGraphic');
            disp.setAttribute('in2', 'map');
            disp.setAttribute('xChannelSelector', 'R');
            disp.setAttribute('yChannelSelector', 'G');
            disp.setAttribute('result', `disp-${channel}`);
            this.filter.appendChild(disp);
            this.displacementNodes[channel] = disp;

            const isolate = document.createElementNS(SVG_NS, 'feColorMatrix');
            isolate.setAttribute('in', `disp-${channel}`);
            isolate.setAttribute('type', 'matrix');
            isolate.setAttribute('values', CHANNEL_MATRICES[channel]);
            isolate.setAttribute('result', `ch-${channel}`);
            this.filter.appendChild(isolate);
        }

        const addRG = document.createElementNS(SVG_NS, 'feComposite');
        addRG.setAttribute('in', 'ch-r');
        addRG.setAttribute('in2', 'ch-g');
        addRG.setAttribute('operator', 'arithmetic');
        addRG.setAttribute('k1', '0');
        addRG.setAttribute('k2', '1');
        addRG.setAttribute('k3', '1');
        addRG.setAttribute('k4', '0');
        addRG.setAttribute('result', 'ch-rg');
        this.filter.appendChild(addRG);

        const addRGB = document.createElementNS(SVG_NS, 'feComposite');
        addRGB.setAttribute('in', 'ch-rg');
        addRGB.setAttribute('in2', 'ch-b');
        addRGB.setAttribute('operator', 'arithmetic');
        addRGB.setAttribute('k1', '0');
        addRGB.setAttribute('k2', '1');
        addRGB.setAttribute('k3', '1');
        addRGB.setAttribute('k4', '0');
        addRGB.setAttribute('result', 'refracted');
        this.filter.appendChild(addRGB);

        if (this.options.causticGain > 0) {
            // Lift the map's blue channel (caustic concentration mask) into a
            // grayscale image, then brighten the refracted backdrop where the
            // lens concentrates light: out = refracted · (1 + gain · mask).
            const mask = document.createElementNS(SVG_NS, 'feColorMatrix');
            mask.setAttribute('in', 'map');
            mask.setAttribute('type', 'matrix');
            mask.setAttribute('values', '0 0 1 0 0  0 0 1 0 0  0 0 1 0 0  0 0 0 0 1');
            mask.setAttribute('result', 'caustic-mask');
            this.filter.appendChild(mask);

            const caustic = document.createElementNS(SVG_NS, 'feComposite');
            caustic.setAttribute('in', 'refracted');
            caustic.setAttribute('in2', 'caustic-mask');
            caustic.setAttribute('operator', 'arithmetic');
            caustic.setAttribute('k1', String(this.options.causticGain));
            caustic.setAttribute('k2', '1');
            caustic.setAttribute('k3', '0');
            caustic.setAttribute('k4', '0');
            this.filter.appendChild(caustic);
        }

        defs.appendChild(this.filter);
        this._ratios = ratios;
    }

    _scheduleUpdate() {
        if (this._rafPending || !this.enabled) {
            return;
        }
        this._rafPending = true;
        requestAnimationFrame(() => {
            this._rafPending = false;
            this.update();
        });
    }

    update() {
        if (!this.enabled || !this.element.isConnected) {
            return;
        }
        const width = this.element.clientWidth;
        const height = this.element.clientHeight;
        if (width < 2 || height < 2) {
            return;
        }

        let radius = this.options.radius;
        if (typeof radius !== 'number') {
            radius = 0;
            try {
                const raw = window.getComputedStyle(this.element).borderTopLeftRadius || '';
                const value = parseFloat(raw);
                if (Number.isFinite(value)) {
                    radius = raw.trim().endsWith('%')
                        ? (value / 100) * Math.min(width, height)
                        : value;
                }
            } catch {
                radius = 0;
            }
        }

        const innerRatio = Number(this.options.innerRadiusRatio) || 0;
        const geometry = `${width}x${height}r${radius}s${this.options.shape}i${innerRatio.toFixed(3)}`;
        if (geometry === this._lastGeometry) {
            return;
        }
        this._lastGeometry = geometry;

        const map = buildDisplacementMap({
            width,
            height,
            radius,
            bezelWidth: this.options.bezelWidth,
            ior: this.options.ior,
            thickness: this.options.thickness,
            scale: this.options.mapScale,
            shape: this.options.shape,
            innerRadiusRatio: innerRatio,
        });

        this.canvas.width = map.width;
        this.canvas.height = map.height;
        const imageData = this.ctx.createImageData(map.width, map.height);
        imageData.data.set(map.data);
        this.ctx.putImageData(imageData, 0, 0);
        this.feImage.setAttribute('href', this.canvas.toDataURL('image/png'));

        // feDisplacementMap offset = scale · (channel − 0.5); the map encodes
        // shift / maxShift, so scale = 2 · maxShift reproduces CSS pixels.
        const base = 2 * map.maxShift;
        this.displacementNodes.r.setAttribute('scale', String(base * this._ratios.r));
        this.displacementNodes.g.setAttribute('scale', String(base * this._ratios.g));
        this.displacementNodes.b.setAttribute('scale', String(base * this._ratios.b));

        const frost = this.options.frost !== null ? this.options.frost : this._inheritedFrost;
        const chain = frost ? `url(#${this.filterId}) ${frost}` : `url(#${this.filterId})`;
        this.element.style.backdropFilter = chain;
    }

    dispose() {
        if (!this.enabled) {
            return;
        }
        this.enabled = false;
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this.element) {
            this.element.style.backdropFilter = '';
        }
        if (this.filter && this.filter.parentNode) {
            this.filter.parentNode.removeChild(this.filter);
        }
        this.filter = null;
        this.feImage = null;
        this.displacementNodes = null;
        this.canvas = null;
        this.ctx = null;
        instanceCount--;
        releaseSharedSvg();
    }
}
