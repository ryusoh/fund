import { CALENDAR_RENDERER } from '@js/config.js';
import { SvgRenderer } from './SvgRenderer.js';
import { DomRenderer } from './DomRenderer.js';

export const RENDERER_SVG = 'svg';
export const RENDERER_DOM = 'dom';

/**
 * Resolve which renderer to build. The `CALENDAR_RENDERER` knob in `js/config.js`
 * sets the default; a `?renderer=dom|svg` query param overrides it at runtime
 * (for quick A/B comparison without editing config).
 * @returns {string}
 */
function resolveRendererName() {
    if (typeof window !== 'undefined' && typeof window.location?.search === 'string') {
        const match = window.location.search.match(/[?&]renderer=(dom|svg)\b/);
        if (match) {
            return match[1];
        }
    }
    return CALENDAR_RENDERER === RENDERER_DOM ? RENDERER_DOM : RENDERER_SVG;
}

/**
 * Construct a calendar renderer behind the CalendarRenderer interface.
 *
 * @param {string} [name] Renderer id; defaults to the resolved (query/flag) value.
 * @returns {import('./CalendarRenderer.js').CalendarRenderer}
 */
export function createCalendarRenderer(name = resolveRendererName()) {
    switch (name) {
        case RENDERER_DOM:
            return new DomRenderer();
        case RENDERER_SVG:
        default:
            return new SvgRenderer();
    }
}
