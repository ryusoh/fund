import { logger } from '@utils/logger.js';
import { SvgRenderer } from './SvgRenderer.js';

export const RENDERER_SVG = 'svg';
export const RENDERER_DOM = 'dom';

/**
 * Resolve which renderer to build. Defaults to the SVG renderer; an opt-in
 * `?renderer=dom` query param selects the parallel DOM renderer once it exists.
 * @returns {string}
 */
function resolveRendererName() {
    if (typeof window !== 'undefined' && typeof window.location?.search === 'string') {
        const match = window.location.search.match(/[?&]renderer=(dom|svg)\b/);
        if (match) {
            return match[1];
        }
    }
    return RENDERER_SVG;
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
            // DomRenderer is not built yet — fall back to SVG so the override is
            // harmless until the parallel implementation lands.
            logger.warn('[calendar] DOM renderer not available yet; using SVG renderer');
            return new SvgRenderer();
        case RENDERER_SVG:
        default:
            return new SvgRenderer();
    }
}
