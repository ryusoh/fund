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

    // Clean up old canvas overlay from previous implementations
    if (heatmapEl._bevelCanvas) {
        const old = heatmapEl._bevelCanvas;
        if (old.parentElement) {
            old.parentElement.removeChild(old);
        }
        heatmapEl._bevelCanvas = null;
    }

    const todayStr = getTodayStr();

    d3Instance
        .select(svgEl)
        .selectAll('rect.ch-subdomain-bg')
        .each(function () {
            const cell = d3Instance.select(this);

            const parent = d3Instance.select(this.parentNode);
            const datum = parent.datum ? parent.datum() : null;
            const t = datum && typeof datum === 'object' ? datum.t : null;
            let isToday = false;
            if (t != null) {
                const dt = new Date(t);
                if (Number.isFinite(dt.getTime())) {
                    const ds = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
                    isToday = ds === todayStr;
                }
            }

            const gradUrl = isToday ? `url(#${GRAD_TODAY_ID})` : `url(#${GRAD_ID})`;
            cell.attr('stroke', gradUrl).attr('stroke-width', isToday ? 2 : 1.5);
        });
}

// No-ops: strokes live on the cell rects — they move/die with the cells.
export function clearBevelGlass() {}
export function destroyBevelGlass() {}
