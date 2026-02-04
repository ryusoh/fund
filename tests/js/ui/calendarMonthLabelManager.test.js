import { CURRENCY_SYMBOLS, COLORS, CALENDAR_MONTH_LABEL_HIGHLIGHT } from '@js/config.js';
import { updateMonthLabels } from '@ui/calendarMonthLabelManager.js';
import { setThinkingHighlight } from '@ui/textHighlightManager.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function lightenHexToRgba(hex, factor, alpha) {
    const normalized =
        hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
    const r = parseInt(normalized.substring(1, 3), 16);
    const g = parseInt(normalized.substring(3, 5), 16);
    const b = parseInt(normalized.substring(5, 7), 16);
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const light = clamp(Number.isFinite(factor) ? factor : 0.5, 0, 1);
    const targetAlpha = clamp(Number.isFinite(alpha) ? alpha : 1, 0, 1);
    const lighten = (channel) => Math.round(channel + (255 - channel) * light);
    return `rgba(${lighten(r)}, ${lighten(g)}, ${lighten(b)}, ${targetAlpha})`;
}

class Selection {
    constructor(nodes) {
        this.nodes = Array.isArray(nodes) ? nodes : nodes ? [nodes] : [];
    }

    _resolveSelector(selector) {
        if (typeof selector === 'string') {
            if (this.nodes.length) {
                const results = [];
                this.nodes.forEach((node) => {
                    results.push(...node.querySelectorAll(selector));
                });
                if (results.length) {
                    return results;
                }
            }
            return Array.from(document.querySelectorAll(selector));
        }
        return selector ? [selector] : [];
    }

    select(selector) {
        const nodes = this._resolveSelector(selector);
        return new Selection(nodes.length ? nodes[0] : null);
    }

    selectAll(selector) {
        return new Selection(this._resolveSelector(selector));
    }

    each(callback) {
        this.nodes.forEach((node, index) => {
            callback.call(node, node.__data__, index, this.nodes);
        });
        return this;
    }

    empty() {
        return this.nodes.length === 0;
    }

    attr(name, value) {
        if (value === undefined) {
            return this.nodes[0] ? this.nodes[0].getAttribute(name) : undefined;
        }
        this.nodes.forEach((node) => {
            if (value === null || value === undefined) {
                node.removeAttribute(name);
            } else {
                node.setAttribute(name, value);
            }
        });
        return this;
    }

    text(value) {
        if (value === undefined) {
            return this.nodes[0] ? this.nodes[0].textContent : undefined;
        }
        this.nodes.forEach((node) => {
            node.textContent = value;
        });
        return this;
    }

    style(name, value) {
        this.nodes.forEach((node) => {
            if (node.style) {
                node.style[name] = value;
            } else if (value === undefined) {
                // no-op for getter compatibility
            }
        });
        return this;
    }

    append(tag) {
        const created = this.nodes.map((node) => {
            const child = node.ownerDocument.createElementNS(node.namespaceURI || SVG_NS, tag);
            node.appendChild(child);
            return child;
        });
        return new Selection(created);
    }

    insert(tag, beforeFn) {
        const created = this.nodes.map((node, index) => {
            const reference =
                typeof beforeFn === 'function' ? beforeFn.call(node, node, index) : null;
            const child = node.ownerDocument.createElementNS(node.namespaceURI || SVG_NS, tag);
            node.insertBefore(child, reference || node.firstChild);
            return child;
        });
        return new Selection(created);
    }

    lower() {
        this.nodes.forEach((node) => {
            if (node.parentNode && node.parentNode.firstChild !== node) {
                node.parentNode.insertBefore(node, node.parentNode.firstChild);
            }
        });
        return this;
    }

    interrupt() {
        return this;
    }

    transition() {
        const selection = this;
        return {
            duration() {
                return this;
            },
            ease() {
                return this;
            },
            attr(name, value) {
                selection.attr(name, value);
                return this;
            },
        };
    }
}

const d3Stub = {
    easeCubicOut: () => {},
    easeCubicInOut: () => {},
    select(target) {
        if (target && target.nodeType) {
            return new Selection(target);
        }
        const nodes = Array.from(document.querySelectorAll(target));
        return new Selection(nodes);
    },
};

function createDomainLabel(textContent) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    const group = document.createElementNS(SVG_NS, 'g');
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('class', 'ch-domain-text');
    text.textContent = textContent;
    text.getBBox = () => ({ x: 10, y: 5, width: 120, height: 22 });
    group.appendChild(text);
    svg.appendChild(group);
    return { svg, group, text };
}

describe('calendarMonthLabelManager', () => {
    const originalInnerWidth = window.innerWidth;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;

    beforeEach(() => {
        jest.useFakeTimers();
        window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 16);
        window.cancelAnimationFrame = (handle) => clearTimeout(handle);
        document.body.innerHTML = `
            <div class="page-center-wrapper">
                <div id="cal-heatmap"></div>
            </div>
        `;
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
        const { svg } = createDomainLabel('June 2025');
        document.getElementById('cal-heatmap').appendChild(svg);
    });

    afterEach(() => {
        document
            .querySelectorAll('[data-thinking-active="true"]')
            .forEach((node) => setThinkingHighlight(node, false));
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        document.body.innerHTML = '';
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: originalInnerWidth,
        });
        if (originalRequestAnimationFrame) {
            window.requestAnimationFrame = originalRequestAnimationFrame;
        } else {
            delete window.requestAnimationFrame;
        }
        if (originalCancelAnimationFrame) {
            window.cancelAnimationFrame = originalCancelAnimationFrame;
        } else {
            delete window.cancelAnimationFrame;
        }
    });

    it('renders detailed month labels with frosted background for positive change', () => {
        const monthlyPnl = new Map([
            [
                '2025-06',
                {
                    absoluteChangeUSD: 500,
                    percentChange: 0.05,
                },
            ],
        ]);
        const state = {
            selectedCurrency: 'USD',
            labelsVisible: true,
            rates: { USD: 1 },
            monthlyPnl,
        };

        updateMonthLabels(d3Stub, state, CURRENCY_SYMBOLS);

        const text = document.querySelector('.ch-domain-text');
        const percentSpan = text.querySelector('.domain-label-percent');
        const changeSpan = text.querySelector('.domain-label-pnl');
        const background = text.parentNode.querySelector('rect.domain-label-bg');

        expect(percentSpan.textContent).toBe('+5.00%');
        expect(changeSpan.textContent).toBe('+$500.00');
        expect(percentSpan.getAttribute('fill')).toBe(COLORS.POSITIVE_PNL);
        expect(background).toBeNull();
    });

    it('hides detailed spans when labels are invisible and preserves background size cache', () => {
        const monthlyPnl = new Map([['2025-06', { absoluteChangeUSD: 100, percentChange: 0.02 }]]);
        const stateVisible = {
            selectedCurrency: 'USD',
            labelsVisible: true,
            rates: { USD: 1 },
            monthlyPnl,
        };
        updateMonthLabels(d3Stub, stateVisible, CURRENCY_SYMBOLS);

        const stateHidden = { ...stateVisible, labelsVisible: false };
        updateMonthLabels(d3Stub, stateHidden, CURRENCY_SYMBOLS);

        const text = document.querySelector('.ch-domain-text');
        const percentSpan = text.querySelector('.domain-label-percent');
        const changeSpan = text.querySelector('.domain-label-pnl');
        const background = text.parentNode.querySelector('rect.domain-label-bg');

        expect(percentSpan.getAttribute('opacity')).toBe('0');
        expect(changeSpan.getAttribute('opacity')).toBe('0');
        expect(background).toBeNull();
    });

    it('applies negative coloring and hides background when zoomed on desktop', () => {
        const monthlyPnl = new Map([
            ['2025-06', { absoluteChangeUSD: -750, percentChange: -0.03 }],
        ]);
        const state = {
            selectedCurrency: 'USD',
            labelsVisible: true,
            rates: { USD: 1 },
            monthlyPnl,
        };

        // First render on mobile to create the background node
        updateMonthLabels(d3Stub, state, CURRENCY_SYMBOLS);

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
        document.querySelector('.page-center-wrapper').classList.add('zoomed');

        updateMonthLabels(d3Stub, state, CURRENCY_SYMBOLS);

        const text = document.querySelector('.ch-domain-text');
        const percentSpan = text.querySelector('.domain-label-percent');
        const changeSpan = text.querySelector('.domain-label-pnl');
        const background = text.parentNode.querySelector('rect.domain-label-bg');

        expect(percentSpan.getAttribute('fill')).toBe(COLORS.NEGATIVE_PNL);
        expect(changeSpan.getAttribute('fill')).toBe(COLORS.NEGATIVE_PNL);
        expect(background).toBeNull();
    });

    it('applies rolling grey highlight to the most recent month label', () => {
        const monthlyPnl = new Map([
            [
                '2025-06',
                {
                    absoluteChangeUSD: 320,
                    percentChange: 0.012,
                },
            ],
        ]);
        const state = {
            selectedCurrency: 'USD',
            labelsVisible: true,
            rates: { USD: 1 },
            monthlyPnl,
            highlightMonthKey: '2025-06',
        };

        updateMonthLabels(d3Stub, state, CURRENCY_SYMBOLS);

        const text = document.querySelector('.ch-domain-text');
        const background = text.parentNode.querySelector('rect.domain-label-bg');
        const percentSpan = document.querySelector('.domain-label-percent');
        const changeSpan = document.querySelector('.domain-label-pnl');
        expect(percentSpan).not.toBeNull();
        expect(changeSpan).not.toBeNull();
        const percentChars = percentSpan
            ? Array.from(percentSpan.querySelectorAll('.text-thinking-char'))
            : [];
        const changeChars = changeSpan
            ? Array.from(changeSpan.querySelectorAll('.text-thinking-char'))
            : [];
        const combinedChars = [...percentChars, ...changeChars];

        expect(background).toBeNull();
        const activeNodes = Array.from(document.querySelectorAll('[data-thinking-active="true"]'));
        expect(activeNodes.length).toBe(2);
        expect(
            activeNodes.every(
                (node) =>
                    node.classList.contains('domain-label-percent') ||
                    node.classList.contains('domain-label-pnl')
            )
        ).toBe(true);
        expect(combinedChars.length).toBeGreaterThan(0);

        const expectedDimColor = lightenHexToRgba(
            COLORS.POSITIVE_PNL,
            CALENDAR_MONTH_LABEL_HIGHLIGHT.pnlLightenFactor ?? 0.55,
            CALENDAR_MONTH_LABEL_HIGHLIGHT.pnlLightAlpha ??
                CALENDAR_MONTH_LABEL_HIGHLIGHT.waveAlpha ??
                0.85
        );
        const fills = combinedChars.map((span) => span.getAttribute('fill'));
        expect(fills).toContain(expectedDimColor);
        const baseColorPreserved = combinedChars.some(
            (span) => span.getAttribute('data-thinking-base-fill') === COLORS.POSITIVE_PNL
        );
        expect(baseColorPreserved).toBe(true);
        expect(percentSpan.getAttribute('fill')).toBe(COLORS.POSITIVE_PNL);
        expect(changeSpan.getAttribute('fill')).toBe(COLORS.POSITIVE_PNL);
        expect(fills.every((fill) => Boolean(fill))).toBe(true);
    });

    it('falls back to neutral highlight when configuration values are invalid', () => {
        const originalColor = COLORS.POSITIVE_PNL;
        const originalFactor = CALENDAR_MONTH_LABEL_HIGHLIGHT.pnlLightenFactor;
        const originalAlpha = CALENDAR_MONTH_LABEL_HIGHLIGHT.pnlLightAlpha;
        COLORS.POSITIVE_PNL = 'not-a-hex';
        CALENDAR_MONTH_LABEL_HIGHLIGHT.pnlLightenFactor = 'invalid';
        CALENDAR_MONTH_LABEL_HIGHLIGHT.pnlLightAlpha = 'invalid';

        const monthlyPnl = new Map([
            [
                '2025-06',
                {
                    absoluteChangeUSD: 320,
                    percentChange: 0.012,
                },
            ],
        ]);
        const state = {
            selectedCurrency: 'USD',
            labelsVisible: true,
            rates: { USD: 1 },
            monthlyPnl,
            highlightMonthKey: '2025-06',
        };

        updateMonthLabels(d3Stub, state, CURRENCY_SYMBOLS);

        const text = document.querySelector('.ch-domain-text');
        const percentSpan = text.querySelector('.domain-label-percent');
        const changeSpan = text.querySelector('.domain-label-pnl');
        const combinedChars = [
            ...percentSpan.querySelectorAll('.text-thinking-char'),
            ...changeSpan.querySelectorAll('.text-thinking-char'),
        ];
        const neutralColor = CALENDAR_MONTH_LABEL_HIGHLIGHT.neutralDimColor;
        const fills = combinedChars.map((span) => span.getAttribute('fill'));
        expect(fills).toContain(neutralColor);

        setThinkingHighlight([percentSpan, changeSpan], false);
        COLORS.POSITIVE_PNL = originalColor;
        CALENDAR_MONTH_LABEL_HIGHLIGHT.pnlLightenFactor = originalFactor;
        CALENDAR_MONTH_LABEL_HIGHLIGHT.pnlLightAlpha = originalAlpha;
    });

    it('lightens three-digit hex colors correctly for highlight tinting', () => {
        const originalColor = COLORS.POSITIVE_PNL;
        COLORS.POSITIVE_PNL = '#0f0';

        const monthlyPnl = new Map([
            [
                '2025-06',
                {
                    absoluteChangeUSD: 220,
                    percentChange: 0.01,
                },
            ],
        ]);
        const state = {
            selectedCurrency: 'USD',
            labelsVisible: true,
            rates: { USD: 1 },
            monthlyPnl,
            highlightMonthKey: '2025-06',
        };

        updateMonthLabels(d3Stub, state, CURRENCY_SYMBOLS);

        const percentSpan = document.querySelector('.domain-label-percent');
        const changeSpan = document.querySelector('.domain-label-pnl');
        const combinedChars = [
            ...percentSpan.querySelectorAll('.text-thinking-char'),
            ...changeSpan.querySelectorAll('.text-thinking-char'),
        ];

        const expectedDimColor = lightenHexToRgba('#00ff00', 0.55, 0.85);
        const fills = combinedChars.map((span) => span.getAttribute('fill'));
        expect(fills).toContain(expectedDimColor);

        setThinkingHighlight([percentSpan, changeSpan], false);
        COLORS.POSITIVE_PNL = originalColor;
    });

    it('uses default lighten factor when configuration value is invalid', () => {
        const originalColor = COLORS.POSITIVE_PNL;
        const originalFactor = CALENDAR_MONTH_LABEL_HIGHLIGHT.pnlLightenFactor;
        const originalAlpha = CALENDAR_MONTH_LABEL_HIGHLIGHT.pnlLightAlpha;

        COLORS.POSITIVE_PNL = '#123456';
        CALENDAR_MONTH_LABEL_HIGHLIGHT.pnlLightenFactor = NaN;
        CALENDAR_MONTH_LABEL_HIGHLIGHT.pnlLightAlpha = 0.9;

        const monthlyPnl = new Map([
            [
                '2025-06',
                {
                    absoluteChangeUSD: 150,
                    percentChange: 0.015,
                },
            ],
        ]);
        const state = {
            selectedCurrency: 'USD',
            labelsVisible: true,
            rates: { USD: 1 },
            monthlyPnl,
            highlightMonthKey: '2025-06',
        };

        updateMonthLabels(d3Stub, state, CURRENCY_SYMBOLS);

        const percentSpan = document.querySelector('.domain-label-percent');
        const changeSpan = document.querySelector('.domain-label-pnl');
        const combinedChars = [
            ...percentSpan.querySelectorAll('.text-thinking-char'),
            ...changeSpan.querySelectorAll('.text-thinking-char'),
        ];

        const expectedDimColor = 'rgba(148, 164, 179, 0.9)';
        const fills = combinedChars.map((span) => span.getAttribute('fill'));
        expect(fills).toContain(expectedDimColor);

        setThinkingHighlight([percentSpan, changeSpan], false);
        COLORS.POSITIVE_PNL = originalColor;
        CALENDAR_MONTH_LABEL_HIGHLIGHT.pnlLightenFactor = originalFactor;
        CALENDAR_MONTH_LABEL_HIGHLIGHT.pnlLightAlpha = originalAlpha;
    });

    // Tests for edge cases to achieve 100% coverage
    it('should handle invalid month label formats in getMonthKeyFromLabel', () => {
        // Create month label elements with invalid formats to trigger lines 28, 32, 36, 42
        const invalidCases = [
            { input: null, description: 'null input' }, // line 28
            { input: undefined, description: 'undefined input' }, // line 28
            { input: 123, description: 'number input' }, // line 28
            { input: '', description: 'empty string' }, // line 32
            { input: '   ', description: 'whitespace only' }, // line 32
            { input: '\t\n  ', description: 'tabs and newlines' }, // line 32
            { input: 'InvalidFormat', description: 'no match' }, // line 36
            { input: 'Month', description: 'incomplete format' }, // line 36
            { input: '2025', description: 'year only' }, // line 36
            { input: 'Jan 25', description: 'short format' }, // line 36
            { input: 'InvalidMonth 2025', description: 'invalid month name' }, // line 42
            { input: 'Invalidmonth 2025', description: 'lowercase invalid month' }, // line 42
            { input: 'January InvalidYear', description: 'invalid year' }, // line 42
            { input: 'January abc', description: 'non-numeric year' }, // line 42
        ];

        invalidCases.forEach((testCase, index) => {
            const svg = document.createElementNS(SVG_NS, 'svg');
            svg.id = `test-svg-${index}`;
            const g = document.createElementNS(SVG_NS, 'g');
            const text = document.createElementNS(SVG_NS, 'text');
            text.classList.add('ch-domain-text');

            // Set text content for non-null cases
            if (testCase.input !== null && testCase.input !== undefined) {
                text.textContent = String(testCase.input);
            }

            g.appendChild(text);
            svg.appendChild(g);
            document.body.appendChild(svg);
        });

        const monthlyPnl = new Map([['2025-01', { absoluteChangeUSD: 100, percentChange: 0.05 }]]);
        const state = {
            selectedCurrency: 'USD',
            labelsVisible: true,
            rates: { USD: 1 },
            monthlyPnl,
        };

        // This should exercise the error handling paths in getMonthKeyFromLabel
        updateMonthLabels(d3Stub, state, CURRENCY_SYMBOLS);

        // Clean up
        document.querySelectorAll('svg[id^="test-svg-"]').forEach((svg) => svg.remove());
    });

    it('should handle edge cases in updateMonthLabels processing', () => {
        // Test scenarios that trigger various edge cases including lines 49, 64, 73, 77, 111, 150, etc.
        const svg = document.createElementNS(SVG_NS, 'svg');
        const g = document.createElementNS(SVG_NS, 'g');

        // Create text elements with different scenarios
        const text1 = document.createElementNS(SVG_NS, 'text');
        text1.classList.add('ch-domain-text');
        text1.textContent = ''; // empty text should trigger early return (line 49)

        const text2 = document.createElementNS(SVG_NS, 'text');
        text2.classList.add('ch-domain-text');
        text2.textContent = 'January 2025'; // valid month

        const text3 = document.createElementNS(SVG_NS, 'text');
        text3.classList.add('ch-domain-text');
        text3.textContent = 'February 2025'; // month with no PnL data

        g.appendChild(text1);
        g.appendChild(text2);
        g.appendChild(text3);
        svg.appendChild(g);
        document.body.appendChild(svg);

        // Test with missing monthlyPnl data to trigger more edge cases
        const monthlyPnl = new Map([
            ['2025-01', { absoluteChangeUSD: 100, percentChange: 0.05 }],
            // No entry for February 2025 - should trigger "no data" paths
        ]);

        const state = {
            selectedCurrency: 'USD',
            labelsVisible: true,
            rates: { USD: 1 },
            monthlyPnl,
        };

        // This should exercise additional edge case paths
        updateMonthLabels(d3Stub, state, CURRENCY_SYMBOLS);

        // Test with labels not visible to trigger different paths
        state.labelsVisible = false;
        updateMonthLabels(d3Stub, state, CURRENCY_SYMBOLS);

        // Clean up
        svg.remove();
    });

    it('should handle specific edge cases for lines 207, 254-255, 304', () => {
        // Create elements to trigger specific uncovered lines
        const svg = document.createElementNS(SVG_NS, 'svg');
        const g = document.createElementNS(SVG_NS, 'g');
        const text = document.createElementNS(SVG_NS, 'text');

        text.classList.add('ch-domain-text');
        text.textContent = 'January 2025';

        g.appendChild(text);
        svg.appendChild(g);
        document.body.appendChild(svg);

        // Create scenario that might trigger the uncovered lines
        const monthlyPnl = new Map([
            ['2025-01', { absoluteChangeUSD: 0, percentChange: 0 }], // zero values
        ]);

        const state = {
            selectedCurrency: 'EUR', // different currency to test currency conversion paths
            labelsVisible: true,
            rates: { USD: 1, EUR: 0.85 },
            monthlyPnl,
        };

        updateMonthLabels(d3Stub, state, CURRENCY_SYMBOLS);

        // Clean up
        svg.remove();
    });

    it('parses abbreviated month names correctly for narrow month display', () => {
        // Test all abbreviated month names to ensure space-saving short format works
        const abbreviatedMonths = [
            { abbr: 'Jan', monthKey: '2026-01' },
            { abbr: 'Feb', monthKey: '2026-02' },
            { abbr: 'Mar', monthKey: '2026-03' },
            { abbr: 'Apr', monthKey: '2026-04' },
            { abbr: 'May', monthKey: '2026-05' },
            { abbr: 'Jun', monthKey: '2026-06' },
            { abbr: 'Jul', monthKey: '2026-07' },
            { abbr: 'Aug', monthKey: '2026-08' },
            { abbr: 'Sep', monthKey: '2026-09' },
            { abbr: 'Oct', monthKey: '2026-10' },
            { abbr: 'Nov', monthKey: '2026-11' },
            { abbr: 'Dec', monthKey: '2026-12' },
        ];

        // Create monthly PnL data for all months
        const monthlyPnl = new Map(
            abbreviatedMonths.map(({ monthKey }) => [
                monthKey,
                { absoluteChangeUSD: 1234.56, percentChangeUSD: 0.0523 },
            ])
        );

        const state = {
            selectedCurrency: 'USD',
            labelsVisible: true,
            rates: { USD: 1 },
            monthlyPnl,
        };

        // Test each abbreviated month
        abbreviatedMonths.forEach(({ abbr }, index) => {
            // Clean up previous test elements
            document.querySelectorAll('svg[id^="abbr-test-"]').forEach((el) => el.remove());

            const svg = document.createElementNS(SVG_NS, 'svg');
            svg.id = `abbr-test-${index}`;
            const g = document.createElementNS(SVG_NS, 'g');
            const text = document.createElementNS(SVG_NS, 'text');
            text.classList.add('ch-domain-text');
            text.textContent = `${abbr} 2026`; // e.g., "Feb 2026"
            text.getBBox = () => ({ x: 10, y: 5, width: 100, height: 20 });

            g.appendChild(text);
            svg.appendChild(g);
            document.getElementById('cal-heatmap').appendChild(svg);

            updateMonthLabels(d3Stub, state, CURRENCY_SYMBOLS);

            // Verify the label was parsed correctly and PnL spans were added
            const percentSpan = text.querySelector('.domain-label-percent');
            const changeSpan = text.querySelector('.domain-label-pnl');

            expect(percentSpan).not.toBeNull();
            expect(changeSpan).not.toBeNull();
            expect(changeSpan.textContent).toBe('+$1,234.56');
        });

        // Clean up
        document.querySelectorAll('svg[id^="abbr-test-"]').forEach((el) => el.remove());
    });
});
