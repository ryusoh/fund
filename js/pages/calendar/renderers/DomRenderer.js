import { CalendarRenderer } from './CalendarRenderer.js';
import { getValueFieldForCurrency } from '@pages/calendar/colorUtils.js';
import { ensureEntryDisplay } from '@pages/calendar/displayCache.js';

/**
 * DomRenderer — a CSS-grid / DOM implementation of {@link CalendarRenderer}.
 *
 * Renders the calendar as plain `<div>` cells (no D3, no SVG): one grid per
 * visible month, days flowing down each week-column (rows = weekday) to match
 * Cal-Heatmap's horizontal month layout. Cells are coloured by a diverging
 * red↔grey↔green scale read from the paint config, identical to the SVG path's
 * `applyCurrencyColors`.
 *
 * Parallel/opt-in (`?renderer=dom`). Scope of this step (Step 2): layout,
 * colours, today/min/max, navigation (`next`/`previous`/`jumpTo`), and the
 * `'fill'`/`'date-change'` events. Per-cell P/L labels and currency-toggle
 * recolour without repaint are deferred to Step 3 (see
 * docs/calendar-renderer-migration.md).
 */

const STYLE_ID = 'domcal-styles';

const DEFAULT_SUBDOMAIN = { width: 45, height: 45, gutter: 6, radius: 3 };
const DEFAULT_SCALE = {
    domain: [-0.01, 0.01],
    range: ['rgba(244, 67, 54, 0.95)', 'rgba(120, 120, 125, 0.5)', 'rgba(76, 175, 80, 0.95)'],
};
// Light from the upper-right, matching the SVG bevel (gradient runs
// white@upper-right → black@lower-left, feDistantLight azimuth 315).
// EDGE = directional rim; DOME = specular "pillow" highlight (radial), the
// pure-CSS approximation of the SVG feSpecularLighting bulge.
const EDGE = 'linear-gradient(225deg, rgba(255,255,255,0.55), rgba(0,0,0,0.25))';
const DOME =
    'radial-gradient(ellipse 78% 72% at 70% 24%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 56%)';
const cellBackground = (fill) => `${DOME}, linear-gradient(${fill}, ${fill}), ${EDGE}`;

const pad2 = (n) => String(n).padStart(2, '0');
const toMonthIndex = (date) => date.getFullYear() * 12 + date.getMonth();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function parseRgba(str) {
    const m = typeof str === 'string' ? str.match(/rgba?\(([^)]+)\)/i) : null;
    if (!m) {
        return [0, 0, 0, 1];
    }
    const p = m[1].split(',').map((s) => parseFloat(s.trim()));
    return [p[0] || 0, p[1] || 0, p[2] || 0, p[3] == null ? 1 : p[3]];
}

function mix(a, b, t) {
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
        +(a[3] + (b[3] - a[3]) * t).toFixed(3),
    ];
}

/** Build a diverging colour function from the paint config's scale. */
function makeColorScale(scaleConfig) {
    const domain =
        Array.isArray(scaleConfig?.domain) && scaleConfig.domain.length === 2
            ? scaleConfig.domain
            : DEFAULT_SCALE.domain;
    const range =
        Array.isArray(scaleConfig?.range) && scaleConfig.range.length === 3
            ? scaleConfig.range
            : DEFAULT_SCALE.range;
    const [d0, d1] = domain;
    const [neg, mid, pos] = range.map(parseRgba);
    return (value) => {
        const v = clamp(Number.isFinite(value) ? value : 0, d0, d1);
        let rgba;
        if (v < 0) {
            rgba = mix(mid, neg, d0 !== 0 ? v / d0 : 0);
        } else if (v > 0) {
            rgba = mix(mid, pos, d1 !== 0 ? v / d1 : 0);
        } else {
            rgba = mid;
        }
        return `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3]})`;
    };
}

/** Inject the renderer's stylesheet once. Sizes are templated from the config. */
function ensureStyles(sub) {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#cal-heatmap .domcal-root { display: flex; gap: 40px; justify-content: center; align-items: flex-start; }
#cal-heatmap .domcal-month { display: flex; flex-direction: column; align-items: center; gap: 8px; }
#cal-heatmap .domcal-month-label {
    font-size: 13px; letter-spacing: 0.04em; color: rgba(255,255,255,0.55);
    filter: drop-shadow(0 1px 1px rgba(0,0,0,0.5)); text-transform: uppercase;
}
#cal-heatmap .domcal-grid {
    display: grid; grid-template-rows: repeat(7, ${sub.height}px);
    grid-auto-flow: column; grid-auto-columns: ${sub.width}px; gap: ${sub.gutter}px;
}
#cal-heatmap .domcal-cell {
    border-radius: ${sub.radius}px; border: 1.5px solid transparent;
    background-origin: border-box; background-clip: padding-box, padding-box, border-box;
    box-shadow:
        inset 0 1px 1px rgba(255,255,255,0.5), inset 0 -1px 2px rgba(0,0,0,0.32),
        inset -1px 0 1px rgba(255,255,255,0.2), inset 1px 0 1px rgba(0,0,0,0.2);
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.45));
}
#cal-heatmap .domcal-cell--today {
    box-shadow:
        inset 0 1px 1px rgba(255,255,255,0.7), inset 0 -1px 2px rgba(0,0,0,0.4),
        0 0 0 1px rgba(255,255,255,0.5);
}
#cal-heatmap .domcal-cell--labeled {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: rgba(255,255,255,0.9); line-height: 1.1; overflow: hidden;
    text-shadow: 0 1px 1px rgba(0,0,0,0.6);
}
#cal-heatmap .domcal-line0 { font-size: 11px; font-weight: 600; }
#cal-heatmap .domcal-line1, #cal-heatmap .domcal-line2 { font-size: 8px; opacity: 0.9; }
`;
    document.head.appendChild(style);
}

export class DomRenderer extends CalendarRenderer {
    constructor() {
        super();
        this.handlers = {};
        this.config = null;
        this.range = 1;
        this.startIndex = 0;
        this.minIndex = -Infinity;
        this.maxIndex = Infinity;
    }

    on(name, fn) {
        (this.handlers[name] = this.handlers[name] || []).push(fn);
    }

    #emit(name, ...args) {
        (this.handlers[name] || []).forEach((fn) => fn(...args));
    }

    #root() {
        const selector = this.config?.itemSelector || '#cal-heatmap';
        return typeof document !== 'undefined' ? document.querySelector(selector) : null;
    }

    #valueMap() {
        const map = new Map();
        const source = this.config?.data?.source;
        const xField = this.config?.data?.x || 'date';
        if (Array.isArray(source)) {
            for (const entry of source) {
                if (entry && entry[xField] != null) {
                    map.set(String(entry[xField]), entry);
                }
            }
        }
        return map;
    }

    #todayStr() {
        const hi = this.config?.date?.highlight;
        const d = Array.isArray(hi) ? hi[0] : hi;
        if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
            return null;
        }
        return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    }

    #render() {
        const root = this.#root();
        if (!root) {
            return;
        }
        const sub = { ...DEFAULT_SUBDOMAIN, ...(this.config?.subDomain || {}) };
        ensureStyles(sub);

        const colorOf = makeColorScale(this.config?.scale?.color);
        const valueField = this.config?.data?.y || 'value';
        const values = this.#valueMap();
        const todayStr = this.#todayStr();

        const container = document.createElement('div');
        container.className = 'domcal-root';

        for (let i = 0; i < this.range; i++) {
            const mi = this.startIndex + i;
            const year = Math.floor(mi / 12);
            const month = mi % 12;

            const monthEl = document.createElement('div');
            monthEl.className = 'domcal-month';

            const label = document.createElement('div');
            label.className = 'domcal-month-label';
            label.textContent = new Date(year, month, 1).toLocaleString('en-US', {
                month: 'short',
                year: 'numeric',
            });
            monthEl.appendChild(label);

            const grid = document.createElement('div');
            grid.className = 'domcal-grid';

            const startWeekday = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            for (let b = 0; b < startWeekday; b++) {
                grid.appendChild(document.createElement('div'));
            }
            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${year}-${pad2(month + 1)}-${pad2(d)}`;
                const entry = values.get(dateStr);
                const value = entry && entry[valueField] != null ? entry[valueField] : 0;
                const cell = document.createElement('div');
                cell.className =
                    'domcal-cell' + (dateStr === todayStr ? ' domcal-cell--today' : '');
                cell.dataset.date = dateStr;
                cell.style.backgroundImage = cellBackground(colorOf(value));
                grid.appendChild(cell);
            }
            monthEl.appendChild(grid);
            container.appendChild(monthEl);
        }

        root.replaceChildren(container);
        this.#fireDomainCallbacks();
    }

    #fireDomainCallbacks() {
        const lastIndex = this.startIndex + this.range - 1;
        this.config?.onMinDomainReached?.(this.startIndex <= this.minIndex);
        this.config?.onMaxDomainReached?.(lastIndex >= this.maxIndex);
    }

    #domainPayload() {
        const start = new Date(Math.floor(this.startIndex / 12), this.startIndex % 12, 1);
        const lastIndex = this.startIndex + this.range - 1;
        const end = new Date(Math.floor(lastIndex / 12), (lastIndex % 12) + 1, 0);
        return { domain: { start, end } };
    }

    paint(config) {
        if (config) {
            this.config = config;
            this.range = Math.max(1, config.range || 1);
            if (config.date?.start instanceof Date) {
                this.startIndex = toMonthIndex(config.date.start);
            }
            this.minIndex =
                config.date?.min instanceof Date ? toMonthIndex(config.date.min) : -Infinity;
            this.maxIndex =
                config.date?.max instanceof Date ? toMonthIndex(config.date.max) : Infinity;
        }
        this.#render();
        this.#emit('date-change', this.#domainPayload());
        this.#emit('fill');
        return Promise.resolve();
    }

    #navigate(targetIndex) {
        const maxStart = Number.isFinite(this.maxIndex) ? this.maxIndex - this.range + 1 : Infinity;
        const minStart = Number.isFinite(this.minIndex) ? this.minIndex : -Infinity;
        const next = clamp(targetIndex, minStart, maxStart);
        if (next === this.startIndex) {
            this.#fireDomainCallbacks();
            return Promise.resolve();
        }
        this.startIndex = next;
        this.#render();
        this.#emit('date-change', this.#domainPayload());
        this.#emit('fill');
        return Promise.resolve();
    }

    next(n = 1) {
        return this.#navigate(this.startIndex + (n || 1));
    }

    previous(n = 1) {
        return this.#navigate(this.startIndex - (n || 1));
    }

    jumpTo(date, reset = false) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return Promise.resolve();
        }
        const target = toMonthIndex(date);
        if (reset) {
            return this.#navigate(target);
        }
        if (target < this.startIndex) {
            return this.#navigate(target);
        }
        if (target > this.startIndex + this.range - 1) {
            return this.#navigate(target - this.range + 1);
        }
        this.#fireDomainCallbacks();
        return Promise.resolve();
    }

    /**
     * Recolour cells for the active currency and render/clear per-cell labels.
     * The DOM backend needs no staggering, so `isInitialLoad` is ignored.
     */
    renderState({ byDate, state, currencySymbols }) {
        const root = this.#root();
        if (!root || !state) {
            return;
        }
        const colorOf = makeColorScale(this.config?.scale?.color);
        const field = getValueFieldForCurrency(state.selectedCurrency);
        const lookup = byDate instanceof Map ? byDate : this.#valueMap();

        root.querySelectorAll('.domcal-cell').forEach((cell) => {
            const entry = lookup.get(cell.dataset.date);
            const value = entry && entry[field] != null ? entry[field] : 0;
            cell.style.backgroundImage = cellBackground(colorOf(value));
            this.#renderCellLabel(cell, entry, state, currencySymbols);
        });
    }

    #renderCellLabel(cell, entry, state, currencySymbols) {
        if (!state.labelsVisible) {
            if (cell.childElementCount > 0) {
                cell.replaceChildren();
                cell.classList.remove('domcal-cell--labeled');
            }
            return;
        }
        const day = Number(cell.dataset.date.slice(8, 10));
        const display = entry
            ? ensureEntryDisplay(entry, state.selectedCurrency, state.rates, currencySymbols)
            : { showDetails: false };

        const lines = [{ cls: 'domcal-line0', text: String(day) }];
        if (display.showDetails) {
            lines.push({ cls: 'domcal-line1', text: display.changeText });
            lines.push({ cls: 'domcal-line2', text: display.totalText });
        }
        cell.replaceChildren(
            ...lines.map(({ cls, text }) => {
                const span = document.createElement('span');
                span.className = `domcal-line ${cls}`;
                span.textContent = text;
                return span;
            })
        );
        cell.classList.add('domcal-cell--labeled');
    }

    destroy() {
        const root = this.#root();
        if (root) {
            root.replaceChildren();
        }
        return Promise.resolve();
    }
}
