/* eslint-disable no-unused-vars -- abstract interface: params exist to document the contract */
/**
 * CalendarRenderer — the backend-agnostic contract the calendar page drives.
 *
 * The page module (`js/pages/calendar/index.js`) talks only to this interface,
 * never to a concrete heatmap engine, so a rendering backend can be swapped
 * (SVG/D3 today, DOM/CSS in parallel) without touching page logic.
 *
 * Implementations:
 *   - {@link SvgRenderer} — adapter over the vendored Cal-Heatmap (D3/SVG).
 *   - DomRenderer — CSS-grid/DOM implementation (parallel, not yet built).
 *
 * This base class documents the contract and fails loudly if a subclass forgets
 * a method. It has no runtime behaviour of its own.
 *
 * @abstract
 */
export class CalendarRenderer {
    /**
     * Paint (or repaint) the calendar for the given configuration.
     * @param {object} _config Cal-Heatmap-shaped paint config.
     * @returns {Promise<unknown>} Settles when painting completes.
     */
    paint(_config) {
        throw new Error('CalendarRenderer.paint() not implemented');
    }

    /**
     * Shift forward by `n` domains (default 1).
     * @param {number} [_n]
     * @returns {Promise<unknown>}
     */
    next(_n) {
        throw new Error('CalendarRenderer.next() not implemented');
    }

    /**
     * Shift backward by `n` domains (default 1).
     * @param {number} [_n]
     * @returns {Promise<unknown>}
     */
    previous(_n) {
        throw new Error('CalendarRenderer.previous() not implemented');
    }

    /**
     * Scroll until the domain containing `date` is visible.
     * @param {Date} _date
     * @param {boolean} [_reset]
     * @returns {Promise<unknown>}
     */
    jumpTo(_date, _reset) {
        throw new Error('CalendarRenderer.jumpTo() not implemented');
    }

    /**
     * Subscribe to a lifecycle event (e.g. 'fill', 'date-change').
     * @param {string} _name
     * @param {(...args: unknown[]) => unknown} _fn
     * @returns {void}
     */
    on(_name, _fn) {
        throw new Error('CalendarRenderer.on() not implemented');
    }

    /**
     * Tear down the calendar and release resources.
     * @returns {Promise<unknown> | void}
     */
    destroy() {
        throw new Error('CalendarRenderer.destroy() not implemented');
    }
}
