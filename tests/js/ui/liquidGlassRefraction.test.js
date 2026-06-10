import {
    LiquidGlassRefraction,
    supportsSvgBackdropFilter,
    roundedRectSDF,
    maxRefractionShift,
    refractionShift,
    dispersionRatios,
    causticConcentration,
    buildDisplacementMap,
} from '@ui/liquidGlassRefraction.js';

describe('liquidGlassRefraction math', () => {
    describe('roundedRectSDF', () => {
        const halfW = 100;
        const halfH = 50;
        const radius = 10;

        test('is negative inside the rect', () => {
            expect(roundedRectSDF(0, 0, halfW, halfH, radius)).toBeLessThan(0);
        });

        test('distance from center equals nearest edge distance', () => {
            // Nearest edge from center is the horizontal one: 50px away
            expect(roundedRectSDF(0, 0, halfW, halfH, radius)).toBeCloseTo(-50, 5);
        });

        test('is zero on the straight edge', () => {
            expect(roundedRectSDF(0, halfH, halfW, halfH, radius)).toBeCloseTo(0, 5);
            expect(roundedRectSDF(halfW, 0, halfW, halfH, radius)).toBeCloseTo(0, 5);
        });

        test('is positive outside', () => {
            expect(roundedRectSDF(halfW + 5, 0, halfW, halfH, radius)).toBeCloseTo(5, 5);
            expect(roundedRectSDF(halfW, halfH, halfW, halfH, radius)).toBeGreaterThan(0);
        });

        test('rounds the corner: sharp corner point lies outside', () => {
            // The rect corner (halfW, halfH) is outside the rounded shape by
            // r·(√2 − 1) along the diagonal.
            const d = roundedRectSDF(halfW, halfH, halfW, halfH, radius);
            expect(d).toBeCloseTo(radius * (Math.SQRT2 - 1), 5);
        });
    });

    describe('maxRefractionShift', () => {
        test('matches the critical-angle geometry', () => {
            // θt at grazing incidence = asin(1/n); lateral shift = T·tan(90° − θt)
            const ior = 1.5;
            const thickness = 28;
            const expected = thickness * Math.tan(Math.PI / 2 - Math.asin(1 / ior));
            expect(maxRefractionShift(ior, thickness)).toBeCloseTo(expected, 9);
        });

        test('scales linearly with thickness and grows with ior', () => {
            expect(maxRefractionShift(1.5, 56)).toBeCloseTo(2 * maxRefractionShift(1.5, 28), 9);
            expect(maxRefractionShift(1.7, 28)).toBeGreaterThan(maxRefractionShift(1.5, 28));
        });
    });

    describe('refractionShift', () => {
        const bezel = 14;
        const ior = 1.52;
        const thickness = 28;
        const max = maxRefractionShift(ior, thickness);

        test('is zero on the flat interior beyond the bezel', () => {
            expect(refractionShift(bezel, bezel, ior, thickness)).toBe(0);
            expect(refractionShift(bezel * 3, bezel, ior, thickness)).toBe(0);
        });

        test('clamps to the grazing-incidence maximum at the rim', () => {
            expect(refractionShift(0, bezel, ior, thickness)).toBeCloseTo(max, 9);
            expect(refractionShift(-1, bezel, ior, thickness)).toBeCloseTo(max, 9);
        });

        test('decreases monotonically from rim to interior', () => {
            let prev = Infinity;
            for (let d = 0.5; d < bezel; d += 0.5) {
                const s = refractionShift(d, bezel, ior, thickness);
                expect(s).toBeGreaterThan(0);
                expect(s).toBeLessThan(prev);
                prev = s;
            }
        });

        test('never exceeds the physical maximum', () => {
            for (let d = 0; d <= bezel; d += 0.25) {
                expect(refractionShift(d, bezel, ior, thickness)).toBeLessThanOrEqual(max + 1e-9);
            }
        });
    });

    describe('dispersionRatios', () => {
        test('red bends less, blue bends more', () => {
            const { r, g, b } = dispersionRatios(1.52, 32, 1);
            expect(r).toBeLessThan(1);
            expect(g).toBe(1);
            expect(b).toBeGreaterThan(1);
            // Symmetric split around the design wavelength
            expect(1 - r).toBeCloseTo(b - 1, 9);
        });

        test('zero gain disables dispersion', () => {
            const { r, g, b } = dispersionRatios(1.52, 32, 0);
            expect(r).toBe(1);
            expect(g).toBe(1);
            expect(b).toBe(1);
        });

        test('lower Abbe number means stronger dispersion', () => {
            const flint = dispersionRatios(1.52, 20, 1);
            const crown = dispersionRatios(1.52, 60, 1);
            expect(flint.b - flint.r).toBeGreaterThan(crown.b - crown.r);
        });
    });

    describe('causticConcentration', () => {
        const bezel = 14;
        const ior = 1.52;
        const thickness = 28;

        test('concentrates light near the rim', () => {
            expect(causticConcentration(1, bezel, ior, thickness)).toBeGreaterThan(1.5);
        });

        test('is neutral on the flat interior', () => {
            expect(causticConcentration(bezel * 2, bezel, ior, thickness)).toBeCloseTo(1, 6);
        });

        test('decays from rim toward interior', () => {
            const nearRim = causticConcentration(1, bezel, ior, thickness);
            const midBezel = causticConcentration(bezel * 0.6, bezel, ior, thickness);
            expect(nearRim).toBeGreaterThan(midBezel);
        });
    });

    describe('buildDisplacementMap', () => {
        const params = {
            width: 200,
            height: 100,
            radius: 12,
            bezelWidth: 14,
            ior: 1.52,
            thickness: 28,
            scale: 0.5,
        };

        const pixelAt = (map, x, y) => {
            const i = (y * map.width + x) * 4;
            return {
                r: map.data[i],
                g: map.data[i + 1],
                b: map.data[i + 2],
                a: map.data[i + 3],
            };
        };

        test('scales map dimensions', () => {
            const map = buildDisplacementMap(params);
            expect(map.width).toBe(100);
            expect(map.height).toBe(50);
            expect(map.data.length).toBe(100 * 50 * 4);
        });

        test('center is neutral (no displacement, no caustic)', () => {
            const map = buildDisplacementMap(params);
            const c = pixelAt(map, 50, 25);
            expect(Math.abs(c.r - 127.5)).toBeLessThanOrEqual(1);
            expect(Math.abs(c.g - 127.5)).toBeLessThanOrEqual(1);
            expect(c.b).toBe(0);
        });

        test('encodes the caustic mask in the blue channel at the rim', () => {
            const map = buildDisplacementMap(params);
            expect(pixelAt(map, 0, 25).b).toBeGreaterThan(0);
            expect(pixelAt(map, 50, 0).b).toBeGreaterThan(0);
        });

        test('edges displace inward toward the pane center', () => {
            const map = buildDisplacementMap(params);
            // Left edge, vertical middle: shift is +x (R above neutral)
            const left = pixelAt(map, 1, 25);
            expect(left.r).toBeGreaterThan(140);
            expect(Math.abs(left.g - 127.5)).toBeLessThanOrEqual(2);
            // Right edge: shift is −x
            const right = pixelAt(map, 98, 25);
            expect(right.r).toBeLessThan(115);
            // Top edge, horizontal middle: shift is +y
            const top = pixelAt(map, 50, 1);
            expect(top.g).toBeGreaterThan(140);
            // Bottom edge: shift is −y
            const bottom = pixelAt(map, 50, 48);
            expect(bottom.g).toBeLessThan(115);
        });

        test('map is fully opaque', () => {
            const map = buildDisplacementMap(params);
            for (let i = 3; i < map.data.length; i += 4) {
                expect(map.data[i]).toBe(255);
            }
        });

        test('reports the encoding normalisation', () => {
            const map = buildDisplacementMap(params);
            expect(map.maxShift).toBeCloseTo(maxRefractionShift(params.ior, params.thickness), 9);
        });

        describe('annulus shape (glass donut)', () => {
            // 200x200 box → outer radius 100, inner radius 50, ring width 50
            const ringParams = {
                width: 200,
                height: 200,
                radius: 0,
                bezelWidth: 10,
                ior: 1.52,
                thickness: 18,
                scale: 0.5,
                shape: 'annulus',
                innerRadiusRatio: 0.5,
            };

            test('hole center and mid-ring stay neutral', () => {
                const map = buildDisplacementMap(ringParams);
                const hole = pixelAt(map, 50, 50); // r = 0
                expect(Math.abs(hole.r - 127.5)).toBeLessThanOrEqual(1);
                expect(Math.abs(hole.g - 127.5)).toBeLessThanOrEqual(1);
                expect(hole.b).toBe(0);
                const band = pixelAt(map, 87, 50); // r ≈ 75, between the two bezels
                expect(Math.abs(band.r - 127.5)).toBeLessThanOrEqual(1);
                expect(band.b).toBe(0);
            });

            test('outer rim displaces inward, inner rim outward, both with caustics', () => {
                const map = buildDisplacementMap(ringParams);
                // The caustic band is only ~1.5 logical px wide, so it lives in
                // the outermost map pixel of each rim.
                // Right side, on the outer rim (logical r ≈ 99): shift −x
                const outer = pixelAt(map, 99, 50);
                expect(outer.r).toBeLessThan(115);
                expect(outer.b).toBeGreaterThan(0);
                // Right side, on the hole edge (logical r ≈ 51): shift +x
                const inner = pixelAt(map, 75, 50);
                expect(inner.r).toBeGreaterThan(140);
                expect(inner.b).toBeGreaterThan(0);
            });
        });
    });
});

describe('supportsSvgBackdropFilter', () => {
    test('is disabled outside Chromium (jsdom has no Chrome UA)', () => {
        expect(supportsSvgBackdropFilter()).toBe(false);
    });
});

describe('LiquidGlassRefraction lifecycle', () => {
    let element;
    let originalGetContext;
    let originalToDataURL;
    let originalRaf;
    let originalResizeObserver;

    beforeEach(() => {
        element = document.createElement('div');
        Object.defineProperties(element, {
            clientWidth: { value: 200, configurable: true },
            clientHeight: { value: 100, configurable: true },
        });
        document.body.appendChild(element);

        originalGetContext = HTMLCanvasElement.prototype.getContext;
        originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            putImageData: jest.fn(),
        }));
        HTMLCanvasElement.prototype.toDataURL = jest.fn(() => 'data:image/png;base64,AAAA');

        originalRaf = global.requestAnimationFrame;
        global.requestAnimationFrame = (cb) => {
            cb();
            return 1;
        };

        originalResizeObserver = global.ResizeObserver;
        global.ResizeObserver = class {
            observe() {}
            disconnect() {}
        };
    });

    afterEach(() => {
        if (element.parentNode) {
            element.parentNode.removeChild(element);
        }
        HTMLCanvasElement.prototype.getContext = originalGetContext;
        HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
        global.requestAnimationFrame = originalRaf;
        global.ResizeObserver = originalResizeObserver;
        document.querySelectorAll('svg').forEach((svg) => svg.remove());
    });

    test('stays inert when the browser is unsupported', () => {
        const effect = new LiquidGlassRefraction(element);
        expect(effect.enabled).toBe(false);
        expect(document.querySelector('svg')).toBeNull();
        expect(element.style.backdropFilter || '').toBe('');
        // dispose on a disabled instance is a no-op
        expect(() => effect.dispose()).not.toThrow();
    });

    test('builds the SVG filter chain and applies backdrop-filter when forced', () => {
        const effect = new LiquidGlassRefraction(element, { force: true, frost: 'blur(5px)' });

        expect(effect.enabled).toBe(true);
        const filter = document.querySelector('svg defs filter');
        expect(filter).not.toBeNull();
        expect(filter.querySelectorAll('feDisplacementMap')).toHaveLength(3);
        expect(filter.querySelectorAll('feColorMatrix')).toHaveLength(4);
        expect(filter.querySelectorAll('feComposite')).toHaveLength(3);

        expect(element.style.backdropFilter).toContain(`url(#${effect.filterId})`);
        expect(element.style.backdropFilter).toContain('blur(5px)');

        // Dispersion: red scale < green scale < blue scale
        const scales = Array.from(filter.querySelectorAll('feDisplacementMap')).map((node) =>
            parseFloat(node.getAttribute('scale'))
        );
        expect(scales[0]).toBeLessThan(scales[1]);
        expect(scales[1]).toBeLessThan(scales[2]);

        effect.dispose();
    });

    test('explicit radius option overrides the computed border-radius', () => {
        const effect = new LiquidGlassRefraction(element, {
            force: true,
            frost: '',
            radius: 24,
        });
        expect(effect._lastGeometry).toContain('200x100r24');
        effect.dispose();
    });

    test('rampMs thickens the lens in from zero strength', () => {
        // Queue-based rAF so the ramp can be pumped frame by frame
        const queue = [];
        global.requestAnimationFrame = (cb) => {
            queue.push(cb);
            return queue.length;
        };
        const pump = () => {
            queue.splice(0).forEach((cb) => cb());
        };
        let now = 1000;
        const nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => now);

        const effect = new LiquidGlassRefraction(element, {
            force: true,
            frost: '',
            rampMs: 400,
        });
        pump(); // run the scheduled first update

        const scales = () =>
            Array.from(document.querySelectorAll('svg defs filter feDisplacementMap')).map((n) =>
                parseFloat(n.getAttribute('scale'))
            );
        const caustic = document.querySelector('svg defs filter feComposite[k3="0"]');

        // Lens applied, but the slab starts at zero optical thickness
        expect(element.style.backdropFilter).toContain('url(#');
        expect(scales().every((s) => s === 0)).toBe(true);
        expect(parseFloat(caustic.getAttribute('k1'))).toBe(0);

        // Mid-ramp: partial displacement, partial caustics
        now = 1200; // t = 0.5
        pump();
        const mid = scales();
        expect(mid[1]).toBeGreaterThan(0);
        expect(mid[1]).toBeLessThan(effect._baseScale);

        // Past the end: full strength, ramp stops
        now = 1500;
        pump();
        expect(scales()[1]).toBeCloseTo(effect._baseScale, 6);
        expect(parseFloat(caustic.getAttribute('k1'))).toBeCloseTo(0.7, 6);
        expect(effect._rampActive).toBe(false);

        nowSpy.mockRestore();
        effect.dispose();
    });

    test('omits the caustic nodes when causticGain is zero', () => {
        const effect = new LiquidGlassRefraction(element, {
            force: true,
            frost: '',
            causticGain: 0,
        });
        const filter = document.querySelector('svg defs filter');
        expect(filter.querySelectorAll('feColorMatrix')).toHaveLength(3);
        expect(filter.querySelectorAll('feComposite')).toHaveLength(2);
        effect.dispose();
    });

    test('skips rebuild when geometry is unchanged', () => {
        const effect = new LiquidGlassRefraction(element, { force: true, frost: '' });
        const href = effect.feImage.getAttribute('href');
        expect(href).toContain('data:image/png');

        HTMLCanvasElement.prototype.toDataURL = jest.fn(() => 'data:image/png;base64,BBBB');
        effect.update();
        expect(effect.feImage.getAttribute('href')).toBe(href);

        effect.dispose();
    });

    test('dispose removes the filter, clears the style, and releases the shared svg', () => {
        const effect = new LiquidGlassRefraction(element, { force: true, frost: '' });
        expect(document.querySelector('svg')).not.toBeNull();
        expect(element.style.backdropFilter).not.toBe('');

        effect.dispose();

        expect(element.style.backdropFilter).toBe('');
        expect(document.querySelector('svg defs filter')).toBeNull();
        expect(document.querySelector('svg')).toBeNull();
    });

    test('multiple instances share one svg and release it with the last dispose', () => {
        const second = document.createElement('div');
        Object.defineProperties(second, {
            clientWidth: { value: 120, configurable: true },
            clientHeight: { value: 80, configurable: true },
        });
        document.body.appendChild(second);

        const a = new LiquidGlassRefraction(element, { force: true, frost: '' });
        const b = new LiquidGlassRefraction(second, { force: true, frost: '' });

        expect(document.querySelectorAll('svg')).toHaveLength(1);
        expect(document.querySelectorAll('svg defs filter')).toHaveLength(2);
        expect(a.filterId).not.toBe(b.filterId);

        a.dispose();
        expect(document.querySelector('svg')).not.toBeNull();
        b.dispose();
        expect(document.querySelector('svg')).toBeNull();

        second.remove();
    });
});
