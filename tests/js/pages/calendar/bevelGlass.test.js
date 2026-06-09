import {
    applyBevelGlass,
    clearBevelGlass,
    destroyBevelGlass,
} from '@pages/calendar/bevelGlassPlugin.js';

const NS = 'http://www.w3.org/2000/svg';

function buildSvgDom(cellDates) {
    const container = document.createElement('div');
    container.id = 'cal-heatmap';
    const svg = document.createElementNS(NS, 'svg');
    container.appendChild(svg);

    const rects = [];
    for (const dateStr of cellDates) {
        const g = document.createElementNS(NS, 'g');
        g.__data__ = { t: new Date(`${dateStr}T00:00:00Z`).getTime() };
        const rect = document.createElementNS(NS, 'rect');
        rect.classList.add('ch-subdomain-bg');
        g.appendChild(rect);
        svg.appendChild(g);
        rects.push(rect);
    }

    document.body.appendChild(container);
    return { container, svg, rects };
}

function makeD3Stub() {
    return {
        select: jest.fn((el) => {
            const selection = {
                selectAll: jest.fn((sel) => {
                    const nodes = Array.from(el.querySelectorAll(sel));
                    return {
                        attr: jest.fn(function (name, value) {
                            for (const node of nodes) {
                                node.setAttribute(name, String(value));
                            }
                            return this;
                        }),
                        each: jest.fn((cb) => {
                            for (const node of nodes) {
                                cb.call(node);
                            }
                        }),
                    };
                }),
            };
            return selection;
        }),
    };
}

function todayDateStr() {
    const now = new Date();
    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('-');
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('bevelGlassPlugin', () => {
    describe('applyBevelGlass', () => {
        it('applies default gradient stroke to all cells', () => {
            const { svg, rects } = buildSvgDom(['2026-01-15', '2026-01-16']);
            const d3 = makeD3Stub();

            applyBevelGlass(d3, '#cal-heatmap');

            // Gradient defs created
            expect(svg.querySelector('#bgl-edge')).not.toBeNull();
            expect(svg.querySelector('#bgl-edge-today')).not.toBeNull();

            // All cells get default stroke
            for (const rect of rects) {
                expect(rect.getAttribute('stroke')).toBe('url(#bgl-edge)');
                expect(rect.getAttribute('stroke-width')).toBe('1.5');
            }
        });

        it('applies today gradient to the cell matching today', () => {
            const today = todayDateStr();
            const { rects } = buildSvgDom(['2026-01-15', today]);
            const d3 = makeD3Stub();

            applyBevelGlass(d3, '#cal-heatmap');

            // Non-today cell gets default
            expect(rects[0].getAttribute('stroke')).toBe('url(#bgl-edge)');
            expect(rects[0].getAttribute('stroke-width')).toBe('1.5');

            // Today cell gets today gradient and wider stroke
            expect(rects[1].getAttribute('stroke')).toBe('url(#bgl-edge-today)');
            expect(rects[1].getAttribute('stroke-width')).toBe('2');
        });

        it('today cell bevel is not blocked by highlight class', () => {
            const today = todayDateStr();
            const { rects } = buildSvgDom([today]);
            const d3 = makeD3Stub();

            // Simulate Cal-Heatmap adding the highlight class with inline stroke
            rects[0].classList.add('ch-subdomain-highlight');
            rects[0].setAttribute('stroke', 'rgba(255, 255, 255, 0.8)');
            rects[0].setAttribute('stroke-width', '1');

            applyBevelGlass(d3, '#cal-heatmap');

            // Bevel should override the highlight's flat stroke
            expect(rects[0].getAttribute('stroke')).toBe('url(#bgl-edge-today)');
            expect(rects[0].getAttribute('stroke-width')).toBe('2');
        });

        it('hovered cell bevel is not blocked by vendor hover stroke', () => {
            const { rects } = buildSvgDom(['2026-03-10']);
            const d3 = makeD3Stub();

            // Simulate Cal-Heatmap applying hover inline stroke (vendor CSS does this)
            rects[0].setAttribute('stroke', '#636e7b');
            rects[0].setAttribute('stroke-width', '1');

            applyBevelGlass(d3, '#cal-heatmap');

            // Bevel should override the vendor hover stroke
            expect(rects[0].getAttribute('stroke')).toBe('url(#bgl-edge)');
            expect(rects[0].getAttribute('stroke-width')).toBe('1.5');
        });

        it('highlight class cell that is also today gets today gradient', () => {
            const today = todayDateStr();
            const { rects } = buildSvgDom([today]);
            const d3 = makeD3Stub();

            // Simulate both highlight class AND vendor highlight inline stroke
            rects[0].classList.add('highlight');
            rects[0].setAttribute('stroke', '#768390');
            rects[0].setAttribute('stroke-width', '1');

            applyBevelGlass(d3, '#cal-heatmap');

            // Today detection should apply today gradient, overriding vendor highlight
            expect(rects[0].getAttribute('stroke')).toBe('url(#bgl-edge-today)');
            expect(rects[0].getAttribute('stroke-width')).toBe('2');
        });

        it('creates gradient defs only once per SVG', () => {
            buildSvgDom(['2026-01-15']);
            const d3 = makeD3Stub();

            applyBevelGlass(d3, '#cal-heatmap');
            applyBevelGlass(d3, '#cal-heatmap');

            const svg = document.querySelector('#cal-heatmap svg');
            expect(svg.querySelectorAll('#bgl-edge').length).toBe(1);
            expect(svg.querySelectorAll('#bgl-edge-today').length).toBe(1);
        });

        it('creates defs element if SVG has none', () => {
            const { svg } = buildSvgDom(['2026-01-15']);
            // Remove any existing defs
            const existingDefs = svg.querySelector('defs');
            if (existingDefs) {
                existingDefs.remove();
            }

            const d3 = makeD3Stub();
            applyBevelGlass(d3, '#cal-heatmap');

            expect(svg.querySelector('defs')).not.toBeNull();
            expect(svg.querySelector('defs #bgl-edge')).not.toBeNull();
        });

        it('does nothing if heatmap element is missing', () => {
            const d3 = makeD3Stub();
            // No element in DOM
            expect(() => applyBevelGlass(d3, '#nonexistent')).not.toThrow();
        });

        it('does nothing if SVG is missing', () => {
            const container = document.createElement('div');
            container.id = 'cal-heatmap';
            document.body.appendChild(container);
            const d3 = makeD3Stub();
            expect(() => applyBevelGlass(d3, '#cal-heatmap')).not.toThrow();
        });

        it('gradient has correct direction (upper-right to lower-left)', () => {
            buildSvgDom(['2026-01-15']);
            const d3 = makeD3Stub();

            applyBevelGlass(d3, '#cal-heatmap');

            const grad = document.querySelector('#bgl-edge');
            expect(grad.getAttribute('gradientUnits')).toBe('objectBoundingBox');
            expect(grad.getAttribute('x1')).toBe('1');
            expect(grad.getAttribute('y1')).toBe('0');
            expect(grad.getAttribute('x2')).toBe('0');
            expect(grad.getAttribute('y2')).toBe('1');
        });

        it('gradient stops go from white highlight to black shadow', () => {
            buildSvgDom(['2026-01-15']);
            const d3 = makeD3Stub();

            applyBevelGlass(d3, '#cal-heatmap');

            const grad = document.querySelector('#bgl-edge');
            const stops = grad.querySelectorAll('stop');
            expect(stops.length).toBe(4);

            // First stop: white highlight
            expect(stops[0].getAttribute('stop-color')).toBe('white');
            expect(parseFloat(stops[0].getAttribute('stop-opacity'))).toBeGreaterThan(0.4);

            // Last stop: black shadow
            expect(stops[3].getAttribute('stop-color')).toBe('black');
            expect(parseFloat(stops[3].getAttribute('stop-opacity'))).toBeGreaterThan(0.1);
        });

        it('today gradient is bolder than default gradient', () => {
            buildSvgDom(['2026-01-15']);
            const d3 = makeD3Stub();

            applyBevelGlass(d3, '#cal-heatmap');

            const defaultGrad = document.querySelector('#bgl-edge');
            const todayGrad = document.querySelector('#bgl-edge-today');

            const defaultHighlight = parseFloat(
                defaultGrad.querySelector('stop').getAttribute('stop-opacity')
            );
            const todayHighlight = parseFloat(
                todayGrad.querySelector('stop').getAttribute('stop-opacity')
            );
            expect(todayHighlight).toBeGreaterThan(defaultHighlight);
        });

        it('removes old canvas overlay from previous implementation', () => {
            const { container } = buildSvgDom(['2026-01-15']);
            const fakeCanvas = document.createElement('canvas');
            container.appendChild(fakeCanvas);
            container._bevelCanvas = fakeCanvas;

            const d3 = makeD3Stub();
            applyBevelGlass(d3, '#cal-heatmap');

            expect(container._bevelCanvas).toBeNull();
            expect(container.querySelector('canvas')).toBeNull();
        });
    });

    describe('nav bevel SVG filter', () => {
        it('injects the feSpecularLighting filter into the DOM', () => {
            buildSvgDom(['2026-01-15']);
            const d3 = makeD3Stub();

            applyBevelGlass(d3, '#cal-heatmap');

            const filter = document.querySelector('#bgl-nav-bevel');
            expect(filter).not.toBeNull();
            expect(filter.tagName.toLowerCase()).toBe('filter');
        });

        it('filter contains feSpecularLighting with correct light direction', () => {
            buildSvgDom(['2026-01-15']);
            const d3 = makeD3Stub();

            applyBevelGlass(d3, '#cal-heatmap');

            const spec = document.querySelector('#bgl-nav-bevel feSpecularLighting');
            expect(spec).not.toBeNull();

            const light = spec.querySelector('feDistantLight');
            expect(light).not.toBeNull();
            expect(light.getAttribute('azimuth')).toBe('315');
            expect(light.getAttribute('elevation')).toBe('62');
        });

        it('filter is only injected once across multiple calls', () => {
            buildSvgDom(['2026-01-15']);
            const d3 = makeD3Stub();

            applyBevelGlass(d3, '#cal-heatmap');
            applyBevelGlass(d3, '#cal-heatmap');

            expect(document.querySelectorAll('#bgl-nav-bevel').length).toBe(1);
        });
    });

    describe('clearBevelGlass / destroyBevelGlass', () => {
        it('clearBevelGlass is a no-op (strokes live on cells)', () => {
            expect(() => clearBevelGlass()).not.toThrow();
        });

        it('destroyBevelGlass is a no-op', () => {
            expect(() => destroyBevelGlass()).not.toThrow();
        });
    });
});

describe('bevel CSS rules', () => {
    const fs = require('fs');
    const path = require('path');
    const css = fs.readFileSync(path.resolve(process.cwd(), 'css/calendar.css'), 'utf-8');

    describe('cell highlight/hover stroke overrides', () => {
        it('overrides .ch-subdomain-highlight stroke with bevel gradient', () => {
            expect(css).toMatch(
                /\.ch-subdomain-highlight[\s\S]*?stroke:\s*url\(#bgl-edge-today\)\s*!important/
            );
        });

        it('overrides .ch-subdomain-bg.highlight stroke with bevel gradient', () => {
            expect(css).toMatch(
                /\.ch-subdomain-bg\.highlight[\s\S]*?stroke:\s*url\(#bgl-edge-today\)\s*!important/
            );
        });

        it('overrides .ch-subdomain-bg:hover stroke with default bevel gradient', () => {
            expect(css).toMatch(
                /\.ch-subdomain-bg:hover[\s\S]*?stroke:\s*url\(#bgl-edge\)\s*!important/
            );
        });

        it('highlight cells have a white glow filter (visible highlight around the cell)', () => {
            // Match the highlight rule block and check for a white glow drop-shadow (0 0 Npx white)
            const highlightBlock = css.match(/\.ch-subdomain-highlight[\s\S]*?\{([\s\S]*?)\}/);
            expect(highlightBlock).not.toBeNull();
            expect(highlightBlock[1]).toMatch(
                /drop-shadow\(0\s+0\s+\d+px\s+rgba\(255,\s*255,\s*255/
            );
        });

        it('hovered cells have a white glow filter', () => {
            const hoverBlock = css.match(/\.ch-subdomain-bg:hover\s*\{([\s\S]*?)\}/);
            expect(hoverBlock).not.toBeNull();
            expect(hoverBlock[1]).toMatch(/drop-shadow\(0\s+0\s+\d+px\s+rgba\(255,\s*255,\s*255/);
        });
    });

    describe('nav button bevel', () => {
        it('CSS references the SVG filter for icon bevel', () => {
            const iconRule = css.match(/\.cal-nav-btn\s*>\s*i\s*\{([^}]+)\}/);
            expect(iconRule).not.toBeNull();
            expect(iconRule[1]).toMatch(/filter:\s*url\(#bgl-nav-bevel\)/);
        });

        it('does not use gradient text fill or drop-shadow for bevel on icons', () => {
            const iconRule = css.match(/\.cal-nav-btn\s*>\s*i\s*\{([^}]+)\}/);
            expect(iconRule).not.toBeNull();
            expect(iconRule[1]).not.toMatch(/background-clip/);
            expect(iconRule[1]).not.toMatch(/drop-shadow/);
        });
    });
});
