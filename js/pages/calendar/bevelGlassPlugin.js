import { CALENDAR_SELECTORS } from '@js/config.js';

// ---------------------------------------------------------------------------
// Beveled glass edge effect — native SVG stroke approach.
//
// Applies a directional gradient stroke directly to each cell's existing
// <rect> element. The bevel is an SVG attribute on the cell itself, so it
// moves, transitions, and gets destroyed alongside the cell — zero lingering.
//
// Light direction matches glass3dPlugin: azimuth -45deg (upper-right).
// An objectBoundingBox gradient runs from upper-right (bright highlight)
// to lower-left (shadow), creating the directional bevel.
// ---------------------------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';
const GRAD_ID = 'bgl-edge';
const GRAD_TODAY_ID = 'bgl-edge-today';
const NAV_FILTER_ID = 'bgl-nav-bevel';

function makeGradient(id, highlightAlpha, shadowAlpha) {
    const g = document.createElementNS(NS, 'linearGradient');
    g.id = id;
    g.setAttribute('gradientUnits', 'objectBoundingBox');
    g.setAttribute('x1', '1');
    g.setAttribute('y1', '0');
    g.setAttribute('x2', '0');
    g.setAttribute('y2', '1');

    const stops = [
        { offset: '0%', color: 'white', opacity: highlightAlpha },
        { offset: '42%', color: 'white', opacity: highlightAlpha * 0.28 },
        { offset: '58%', color: 'black', opacity: shadowAlpha * 0.28 },
        { offset: '100%', color: 'black', opacity: shadowAlpha },
    ];

    for (const s of stops) {
        const stop = document.createElementNS(NS, 'stop');
        stop.setAttribute('offset', s.offset);
        stop.setAttribute('stop-color', s.color);
        stop.setAttribute('stop-opacity', s.opacity.toFixed(3));
        g.appendChild(stop);
    }
    return g;
}

function ensureDefs(svgEl) {
    if (svgEl._bglReady) {
        return;
    }

    let defs = svgEl.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS(NS, 'defs');
        svgEl.prepend(defs);
    }

    if (!defs.querySelector(`#${GRAD_ID}`)) {
        defs.appendChild(makeGradient(GRAD_ID, 0.55, 0.25));
    }
    if (!defs.querySelector(`#${GRAD_TODAY_ID}`)) {
        defs.appendChild(makeGradient(GRAD_TODAY_ID, 0.75, 0.35));
    }

    svgEl._bglReady = true;
}

function getTodayStr() {
    const now = new Date();
    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('-');
}

// -- Nav button SVG filter (feSpecularLighting bevel) --

function ensureNavBevelFilter() {
    if (document.querySelector(`#${NAV_FILTER_ID}`)) {
        return;
    }

    const svg = document.createElementNS(NS, 'svg');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    svg.setAttribute('aria-hidden', 'true');

    const defs = document.createElementNS(NS, 'defs');
    const filter = document.createElementNS(NS, 'filter');
    filter.id = NAV_FILTER_ID;
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    filter.setAttribute('x', '-20%');
    filter.setAttribute('y', '-20%');
    filter.setAttribute('width', '140%');
    filter.setAttribute('height', '140%');

    // 1. Blur source alpha → height map
    const blur = document.createElementNS(NS, 'feGaussianBlur');
    blur.setAttribute('in', 'SourceAlpha');
    blur.setAttribute('stdDeviation', '0.4');
    blur.setAttribute('result', 'bump');

    // 2. Specular lighting — physics-based highlights on edges
    //    azimuth 315° = upper-right, elevation 62° — matches glass3dPlugin
    const spec = document.createElementNS(NS, 'feSpecularLighting');
    spec.setAttribute('in', 'bump');
    spec.setAttribute('surfaceScale', '3');
    spec.setAttribute('specularConstant', '0.8');
    spec.setAttribute('specularExponent', '25');
    spec.setAttribute('lighting-color', '#ffffff');
    spec.setAttribute('result', 'spec');

    const light = document.createElementNS(NS, 'feDistantLight');
    light.setAttribute('azimuth', '315');
    light.setAttribute('elevation', '62');
    spec.appendChild(light);

    // 3. Clip specular to source shape
    const clipSpec = document.createElementNS(NS, 'feComposite');
    clipSpec.setAttribute('in', 'spec');
    clipSpec.setAttribute('in2', 'SourceAlpha');
    clipSpec.setAttribute('operator', 'in');
    clipSpec.setAttribute('result', 'specClip');

    // 4. Overlay specular highlights on original graphic
    const merge = document.createElementNS(NS, 'feComposite');
    merge.setAttribute('in', 'specClip');
    merge.setAttribute('in2', 'SourceGraphic');
    merge.setAttribute('operator', 'arithmetic');
    merge.setAttribute('k1', '0');
    merge.setAttribute('k2', '1');
    merge.setAttribute('k3', '1');
    merge.setAttribute('k4', '0');

    filter.append(blur, spec, clipSpec, merge);
    defs.appendChild(filter);
    svg.appendChild(defs);
    document.body.prepend(svg);
}

// -- Public API --

export function applyBevelGlass(d3Instance, selector) {
    if (typeof window === 'undefined') {
        return;
    }

    const root = selector || CALENDAR_SELECTORS.heatmap;
    const heatmapEl = document.querySelector(root);
    if (!heatmapEl) {
        return;
    }

    const svgEl = heatmapEl.querySelector('svg');
    if (!svgEl) {
        return;
    }

    ensureDefs(svgEl);
    ensureNavBevelFilter();

    // One-time cleanup of old canvas overlay from previous implementations
    if (heatmapEl._bevelCanvas) {
        const old = heatmapEl._bevelCanvas;
        if (old.parentElement) {
            old.parentElement.removeChild(old);
        }
        heatmapEl._bevelCanvas = null;
    }

    const defaultGrad = `url(#${GRAD_ID})`;
    const todayGrad = `url(#${GRAD_TODAY_ID})`;

    // Batch: apply default stroke to all cells in one D3 call (no per-cell work)
    const allCells = d3Instance.select(svgEl).selectAll('rect.ch-subdomain-bg');
    allCells.attr('stroke', defaultGrad).attr('stroke-width', 1.5);

    // Single pass: find today's cell by timestamp range (avoids Date→string per cell)
    const now = new Date();
    const todayStart = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = todayStart + 86400000;

    allCells.each(function () {
        const parent = this.parentNode;
        const datum = parent.__data__;
        const t = datum && typeof datum === 'object' ? datum.t : null;
        if (t != null && t >= todayStart && t < todayEnd) {
            this.setAttribute('stroke', todayGrad);
            this.setAttribute('stroke-width', '2');
        }
    });
}

// No-ops: strokes live on the cell rects — they move/die with the cells.
export function clearBevelGlass() {}
export function destroyBevelGlass() {}
