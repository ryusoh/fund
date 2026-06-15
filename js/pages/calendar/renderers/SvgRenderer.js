import { CalendarRenderer } from './CalendarRenderer.js';

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

    paint(config) {
        return this.engine.paint(config);
    }

    next(n) {
        return this.engine.next(n);
    }

    previous(n) {
        return this.engine.previous(n);
    }

    jumpTo(date, reset) {
        return this.engine.jumpTo(date, reset);
    }

    on(name, fn) {
        return this.engine.on(name, fn);
    }

    destroy() {
        return typeof this.engine.destroy === 'function' ? this.engine.destroy() : undefined;
    }
}
