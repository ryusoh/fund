import { CalendarRenderer } from './CalendarRenderer.js';
import { applyCurrencyColors } from '@pages/calendar/colorUtils.js';
import { applyBevelGlass } from '@pages/calendar/bevelGlassPlugin.js';
import { renderLabels } from './svgLabels.js';

function nextFrame(cb) {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        return window.requestAnimationFrame(cb);
    }
    return setTimeout(cb, 0);
}

/**
 * SvgRenderer — thin adapter that puts the vendored Cal-Heatmap (D3/SVG) engine
 * behind the {@link CalendarRenderer} interface.
 *
 * Every method forwards to the underlying CalHeatmap instance unchanged, so
 * behaviour is identical to driving CalHeatmap directly. Its only job is to give
 * the page module a stable, backend-agnostic seam so a DOM/CSS renderer can be
 * swapped in later without page changes.
 *
 * `CalHeatmap` is a global provided by a <script> tag on the calendar page.
 */
export class SvgRenderer extends CalendarRenderer {
    constructor() {
        super();
        this.engine = new CalHeatmap();
    }

    _syncViewBox() {
        if (typeof document === 'undefined') {
            return;
        }
        const svg = document.querySelector('#cal-heatmap svg');
        if (
            svg &&
            typeof svg.getAttribute === 'function' &&
            typeof svg.setAttribute === 'function'
        ) {
            const w = svg.getAttribute('width');
            const h = svg.getAttribute('height');
            if (w && h) {
                svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
            }
        }
    }

    async paint(config) {
        const res = await this.engine.paint(config);
        this._syncViewBox();
        return res;
    }

    async next(n) {
        const res = await this.engine.next(n);
        this._syncViewBox();
        return res;
    }

    async previous(n) {
        const res = await this.engine.previous(n);
        this._syncViewBox();
        return res;
    }

    async jumpTo(date, reset) {
        const res = await this.engine.jumpTo(date, reset);
        this._syncViewBox();
        return res;
    }

    on(name, fn) {
        return this.engine.on(name, fn);
    }

    /**
     * Colour the cells, inject the bevel, and render labels. On first paint the
     * three passes are staggered across animation frames to reduce jank; on
     * subsequent updates they run together to avoid flicker.
     */
    renderState({ byDate, state, currencySymbols, isInitialLoad }) {
        this._syncViewBox();
        if (isInitialLoad) {
            applyCurrencyColors(d3, state, byDate);
            nextFrame(() => {
                applyBevelGlass(d3);
                nextFrame(() => renderLabels(byDate, state, currencySymbols));
            });
        } else {
            applyCurrencyColors(d3, state, byDate);
            applyBevelGlass(d3);
            renderLabels(byDate, state, currencySymbols);
        }
    }

    destroy() {
        return typeof this.engine.destroy === 'function' ? this.engine.destroy() : undefined;
    }
}
