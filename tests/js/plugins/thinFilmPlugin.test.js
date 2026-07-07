import { thinFilmPlugin } from '@plugins/thinFilmPlugin.js';

describe('thinFilmPlugin', () => {
    let chart;
    let mockGL;
    let mockOverlay;

    const createMockGL = () => ({
        createShader: jest.fn(() => 1),
        shaderSource: jest.fn(),
        compileShader: jest.fn(),
        getShaderParameter: jest.fn(() => true),
        getShaderInfoLog: jest.fn(() => ''),
        createProgram: jest.fn(() => 2),
        attachShader: jest.fn(),
        linkProgram: jest.fn(),
        getProgramParameter: jest.fn(() => true),
        getProgramInfoLog: jest.fn(() => ''),
        createBuffer: jest.fn(() => 3),
        bindBuffer: jest.fn(),
        bufferData: jest.fn(),
        getAttribLocation: jest.fn(() => 0),
        enableVertexAttribArray: jest.fn(),
        vertexAttribPointer: jest.fn(),
        getUniformLocation: jest.fn((prog, name) => name),
        viewport: jest.fn(),
        clearColor: jest.fn(),
        clear: jest.fn(),
        enable: jest.fn(),
        blendFunc: jest.fn(),
        useProgram: jest.fn(),
        uniform1f: jest.fn(),
        uniform2f: jest.fn(),
        uniform3f: jest.fn(),
        drawArrays: jest.fn(),
        getExtension: jest.fn(() => ({ loseContext: jest.fn() })),
        VERTEX_SHADER: 0x8b31,
        FRAGMENT_SHADER: 0x8b30,
        ARRAY_BUFFER: 0x8892,
        STATIC_DRAW: 0x88e4,
        FLOAT: 0x1406,
        COMPILE_STATUS: 0x8b81,
        LINK_STATUS: 0x8b82,
        COLOR_BUFFER_BIT: 0x4000,
        BLEND: 0x0be2,
        ONE: 1,
        ONE_MINUS_SRC_ALPHA: 0x0303,
        TRIANGLES: 0x0004,
    });

    beforeEach(() => {
        mockGL = createMockGL();
        mockOverlay = {
            width: 0,
            height: 0,
            style: {},
            getContext: jest.fn(() => mockGL),
            parentElement: null,
        };

        const mockCanvas = {
            parentElement: {
                appendChild: jest.fn(),
                style: {},
                children: [],
            },
            getBoundingClientRect: () => ({ width: 400, height: 400, top: 0, left: 0 }),
        };

        // Mock document.createElement to return our mock overlay
        jest.spyOn(document, 'createElement').mockReturnValue(mockOverlay);
        // getComputedStyle for parent positioning check
        jest.spyOn(window, 'getComputedStyle').mockReturnValue({ position: 'relative' });

        chart = {
            canvas: mockCanvas,
            options: { plugins: { glass3dPlugin: { squash: 0.9 } } },
            _cursorPos: { x: 200, y: 200 },
            getDatasetMeta: jest.fn(() => ({
                data: [
                    {
                        getProps: jest.fn(() => ({
                            x: 200,
                            y: 200,
                            startAngle: 0,
                            endAngle: Math.PI / 2,
                            outerRadius: 150,
                            innerRadius: 75,
                        })),
                    },
                ],
            })),
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
        if (chart._thinFilmState) {
            chart._thinFilmState = null;
        }
    });

    it('should have the correct plugin id', () => {
        expect(thinFilmPlugin.id).toBe('thinFilmPlugin');
    });

    it('should not render when no slice is hovered', () => {
        chart.hoveredSliceIndex = undefined;
        thinFilmPlugin.afterDatasetsDraw(chart);
        expect(mockGL.drawArrays).not.toHaveBeenCalled();
    });

    it('should create WebGL overlay and render when slice is hovered', () => {
        chart.hoveredSliceIndex = 0;
        thinFilmPlugin.afterDatasetsDraw(chart);

        // Should have created overlay canvas
        expect(document.createElement).toHaveBeenCalledWith('canvas');

        // Should have drawn the fullscreen quad
        expect(mockGL.drawArrays).toHaveBeenCalled();
        expect(mockGL.useProgram).toHaveBeenCalled();
    });

    it('should set correct uniforms for donut geometry', () => {
        chart.hoveredSliceIndex = 0;
        thinFilmPlugin.afterDatasetsDraw(chart);

        // Check that uniform2f was called with center coords
        const centerCall = mockGL.uniform2f.mock.calls.find((c) => c[0] === 'u_center');
        expect(centerCall).toBeTruthy();

        // Check film thickness base uniform
        const thicknessCall = mockGL.uniform1f.mock.calls.find(
            (c) => c[0] === 'u_filmThicknessBase'
        );
        expect(thicknessCall).toBeTruthy();
        expect(thicknessCall[1]).toBe(400.0);

        // Check refractive index
        const riCall = mockGL.uniform1f.mock.calls.find((c) => c[0] === 'u_refractiveIndex');
        expect(riCall).toBeTruthy();
        expect(riCall[1]).toBe(1.4);
    });

    it('should clear overlay when hover ends', () => {
        // First render to create state
        chart.hoveredSliceIndex = 0;
        thinFilmPlugin.afterDatasetsDraw(chart);

        // Now un-hover
        chart.hoveredSliceIndex = undefined;
        thinFilmPlugin.afterDatasetsDraw(chart);

        // Should have cleared
        const clearCalls = mockGL.clear.mock.calls;
        expect(clearCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('should use premultiplied alpha blending', () => {
        chart.hoveredSliceIndex = 0;
        thinFilmPlugin.afterDatasetsDraw(chart);

        expect(mockGL.enable).toHaveBeenCalledWith(mockGL.BLEND);
        expect(mockGL.blendFunc).toHaveBeenCalledWith(mockGL.ONE, mockGL.ONE_MINUS_SRC_ALPHA);
    });

    it('should reuse existing overlay on subsequent renders', () => {
        chart.hoveredSliceIndex = 0;
        thinFilmPlugin.afterDatasetsDraw(chart);
        const createCount = document.createElement.mock.calls.length;

        thinFilmPlugin.afterDatasetsDraw(chart);
        expect(document.createElement.mock.calls.length).toBe(createCount);
    });

    it('should clean up on destroy', () => {
        chart.hoveredSliceIndex = 0;
        thinFilmPlugin.afterDatasetsDraw(chart);

        const state = chart._thinFilmState;
        expect(state).toBeTruthy();

        // Simulate overlay having a parent
        state.overlay.parentElement = { removeChild: jest.fn() };

        thinFilmPlugin.destroy(chart);
        expect(chart._thinFilmState).toBeNull();
        expect(state.overlay.parentElement.removeChild).toHaveBeenCalled();
    });

    it('should not crash in non-browser environment', () => {
        const origWindow = global.window;
        global.window = undefined;
        expect(() => thinFilmPlugin.afterDatasetsDraw(chart)).not.toThrow();
        global.window = origWindow;
    });

    it('should handle missing cursor position gracefully', () => {
        chart.hoveredSliceIndex = 0;
        chart._cursorPos = null;
        thinFilmPlugin.afterDatasetsDraw(chart);
        expect(mockGL.drawArrays).toHaveBeenCalled();
    });

    it('should pass arc geometry as uniforms', () => {
        chart.hoveredSliceIndex = 0;
        thinFilmPlugin.afterDatasetsDraw(chart);

        const startCall = mockGL.uniform1f.mock.calls.find((c) => c[0] === 'u_startAngle');
        expect(startCall).toBeTruthy();
        expect(startCall[1]).toBe(0);

        const endCall = mockGL.uniform1f.mock.calls.find((c) => c[0] === 'u_endAngle');
        expect(endCall).toBeTruthy();
        expect(endCall[1]).toBeCloseTo(Math.PI / 2);
    });

    it('should position trail disruption at the HEAD (arcStart+arcSpan), not the tail', () => {
        // In drawElectricTrail: t=0 is tail (at arcStart), t=1 is head (at arcStart+arcSpan)
        // The disruption must match the bright head, not the dim tail.
        chart.hoveredSliceIndex = 0;
        chart.$glass3d = { continuousPhase: 0 };
        chart.options.plugins.glass3dPlugin = {
            electric: { arcCount: 1, width: 0.22, streakSpeedMultiplier: 1 },
        };
        thinFilmPlugin.afterDatasetsDraw(chart);

        const trailCall = mockGL.uniform3f.mock.calls.find((c) => c[0] === 'u_trailAngles');
        expect(trailCall).toBeTruthy();

        // arcSpan = width * 2π * 0.75
        const arcSpan = 0.22 * Math.PI * 2 * 0.75;
        // phase=0 → arcStart=0, head = arcStart + arcSpan
        const expectedHead = arcSpan;
        expect(trailCall[1]).toBeCloseTo(expectedHead, 2);
    });

    it('should pass trail width matching drawElectricTrail arcSpan', () => {
        chart.hoveredSliceIndex = 0;
        chart.$glass3d = { continuousPhase: 0.5 };
        thinFilmPlugin.afterDatasetsDraw(chart);

        const widthCall = mockGL.uniform1f.mock.calls.find((c) => c[0] === 'u_trailWidth');
        expect(widthCall).toBeTruthy();
        // Must match arcSpan = widthFactor * 2π * 0.75
        const expectedWidth = 0.22 * Math.PI * 2 * 0.75;
        expect(widthCall[1]).toBeCloseTo(expectedWidth, 4);
    });

    it('shader should not contain undefined smoothstep behavior (edge0 >= edge1)', () => {
        chart.hoveredSliceIndex = 0;
        thinFilmPlugin.afterDatasetsDraw(chart);

        const shaderSourceCall = mockGL.shaderSource.mock.calls.find((c) =>
            c[1].includes('u_trailAngles')
        );
        expect(shaderSourceCall).toBeTruthy();
        const shaderCode = shaderSourceCall[1];

        // WebGL GLSL spec: "Results are undefined if edge0 >= edge1".
        // Apple GPUs strictly enforce this and produce hard binary steps.
        // E.g., smoothstep(1.0, 0.0, x) is INVALID. Must be 1.0 - smoothstep(0.0, 1.0, x).
        const lines = shaderCode.split('\n');
        for (const line of lines) {
            // Find smoothstep(a, b, x)
            const match = line.match(/smoothstep\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,/);
            if (match) {
                const arg1 = parseFloat(match[1]);
                const arg2 = parseFloat(match[2]);
                if (!isNaN(arg1) && !isNaN(arg2)) {
                    expect(arg1).toBeLessThan(arg2); // Fail if arg1 >= arg2
                }
            }
        }
    });

    it('shader should constrain trail disruption to a narrow radial band matching the trail', () => {
        chart.hoveredSliceIndex = 0;
        thinFilmPlugin.afterDatasetsDraw(chart);

        const shaderSourceCall = mockGL.shaderSource.mock.calls.find((c) =>
            c[1].includes('u_trailAngles')
        );
        expect(shaderSourceCall).toBeTruthy();
        const shaderCode = shaderSourceCall[1];

        // The trail weaves radially: baseRadius=0.65, offset=sin(angle*2 + i*2.1)*0.08
        // The shader must compute this trailR and constrain the flow radially.
        // IT MUST NOT USE `angle` for this, because JS uses localPhase (constant for the arc).
        // It should derive it from headAngle or arcStart.
        expect(shaderCode).toMatch(/trailR\s*=\s*0\.65\s*\+\s*sin/);
        expect(shaderCode).not.toMatch(/sin\(\s*angle\s*\*\s*2\.0/); // This caused the desync!
        expect(shaderCode).toMatch(/radialFalloff\s*=/);
    });

    it('shader should explicitly skip inactive trails marked with negative angles', () => {
        chart.hoveredSliceIndex = 0;
        thinFilmPlugin.afterDatasetsDraw(chart);

        const shaderSourceCall = mockGL.shaderSource.mock.calls.find((c) =>
            c[1].includes('u_trailAngles')
        );
        expect(shaderSourceCall).toBeTruthy();
        const shaderCode = shaderSourceCall[1];

        // JS passes -100 for unused trails. The shader must skip them to prevent phantom wakes.
        expect(shaderCode).toMatch(/if\s*\(\s*headAngle\s*<\s*-50\.0\s*\)\s*continue\s*;/);
    });

    it('should handle missing glass3d state gracefully', () => {
        chart.hoveredSliceIndex = 0;
        chart.$glass3d = undefined;
        thinFilmPlugin.afterDatasetsDraw(chart);

        expect(mockGL.drawArrays).toHaveBeenCalled();
        const trailCall = mockGL.uniform3f.mock.calls.find((c) => c[0] === 'u_trailAngles');
        expect(trailCall).toBeTruthy();
    });

    it('shader should not have a hard divide at the trail head (needs bow wave)', () => {
        chart.hoveredSliceIndex = 0;
        thinFilmPlugin.afterDatasetsDraw(chart);

        // Find the fragment shader source
        const shaderSourceCall = mockGL.shaderSource.mock.calls.find((c) =>
            c[1].includes('u_trailAngles')
        );
        expect(shaderSourceCall).toBeTruthy();
        const shaderCode = shaderSourceCall[1];

        // To avoid a bright divide when angle passes headAngle, da must be mapped
        // to a continuous [-PI, PI] range rather than wrapping abruptly at 0 -> 2PI.
        // It must have both a bow wave (leading edge) and wake (trailing edge).
        expect(shaderCode).toMatch(/mod\(.+PI,\s*TWO_PI\)\s*-\s*PI/);
        expect(shaderCode).toMatch(/smoothstep/); // Should have a leading fade
    });

    describe('glass pane refraction (reflection band)', () => {
        const getFragmentShader = () => {
            chart.hoveredSliceIndex = 0;
            thinFilmPlugin.afterDatasetsDraw(chart);
            const call = mockGL.shaderSource.mock.calls.find((c) => c[1].includes('u_reflStart'));
            expect(call).toBeTruthy();
            return call[1];
        };

        // Transpile the shader's optical-refraction block to JS so the test
        // evaluates the REAL shader math, not a hand-written mirror of it.
        // GLSL built-ins are implemented per spec (smoothstep uses the spec
        // formula, so reversed-edge UB does not show up here — that case is
        // covered by the structural test below).
        const makeReflEvaluator = (shaderCode) => {
            const start = shaderCode.indexOf('float reflMid');
            const end = shaderCode.indexOf('vec2 noisePos');
            expect(start).toBeGreaterThan(-1);
            expect(end).toBeGreaterThan(start);
            const block = shaderCode
                .slice(start, end)
                .replace(/\/\/[^\n]*/g, '')
                .replace(/\bfloat\s+/g, 'let ');
            return new Function(
                'u_reflStart',
                'u_reflSpan',
                'angle',
                'r_norm',
                'tangential',
                'radial',
                `
                const PI = Math.PI, TWO_PI = Math.PI * 2;
                const abs = Math.abs, max = Math.max, min = Math.min, sign = Math.sign;
                const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
                const mod = (x, y) => x - y * Math.floor(x / y);
                const smoothstep = (e0, e1, x) => {
                    const t = clamp((x - e0) / (e1 - e0), 0, 1);
                    return t * t * (3 - 2 * t);
                };
                ${block}
                return { tangential, radial };
                `
            );
        };

        const REFL_SPAN = 0.2 * Math.PI * 2; // default reflection width
        const REFL_START = 1.0;

        it('lens displacement is continuous across the pane center (no full-width tear)', () => {
            // A lens deviates light continuously: zero at the optical center,
            // peaking mid-band. sign(dRefl) instead flips -1 -> +1 at the
            // center where the refraction is strongest, tearing the film
            // pattern across the full radial width of the band.
            const evalRefl = makeReflEvaluator(getFragmentShader());
            const mid = REFL_START + REFL_SPAN * 0.5;
            const eps = 1e-3;
            const before = evalRefl(REFL_START, REFL_SPAN, mid - eps, 0.5, 0, 0);
            const after = evalRefl(REFL_START, REFL_SPAN, mid + eps, 0.5, 0, 0);
            expect(Math.abs(after.tangential - before.tangential)).toBeLessThan(0.02);
        });

        it('lens displacement has no jump anywhere across the sweep', () => {
            const evalRefl = makeReflEvaluator(getFragmentShader());
            const steps = 2000;
            const from = REFL_START - REFL_SPAN;
            const to = REFL_START + REFL_SPAN * 2;
            let prev = null;
            let maxJump = 0;
            for (let s = 0; s <= steps; s++) {
                const angle = from + ((to - from) * s) / steps;
                const out = evalRefl(REFL_START, REFL_SPAN, angle, 0.5, 0, 0);
                if (prev !== null) {
                    maxJump = Math.max(maxJump, Math.abs(out.tangential - prev));
                }
                prev = out.tangential;
            }
            expect(maxJump).toBeLessThan(0.02);
        });

        it('lens displacement is odd around the pane center and still visibly strong', () => {
            const evalRefl = makeReflEvaluator(getFragmentShader());
            const mid = REFL_START + REFL_SPAN * 0.5;
            // Zero deviation for the chief ray through the lens center
            const center = evalRefl(REFL_START, REFL_SPAN, mid, 0.5, 0, 0);
            expect(Math.abs(center.tangential)).toBeLessThan(1e-6);

            let maxAbs = 0;
            for (let s = 0; s <= 200; s++) {
                const d = (REFL_SPAN * 0.5 * s) / 200;
                const plus = evalRefl(REFL_START, REFL_SPAN, mid + d, 0.5, 0, 0);
                const minus = evalRefl(REFL_START, REFL_SPAN, mid - d, 0.5, 0, 0);
                // Odd symmetry: same magnitude, opposite direction
                expect(plus.tangential).toBeCloseTo(-minus.tangential, 6);
                maxAbs = Math.max(maxAbs, Math.abs(plus.tangential));
            }
            // The fix must not silently kill the refraction effect
            expect(maxAbs).toBeGreaterThan(0.15);
        });

        it('reflection falloff must not use reversed smoothstep edges (UB on Apple GPUs)', () => {
            // smoothstep(u_reflSpan * 0.5, 0.0, x) has edge0 >= edge1, which is
            // undefined per the GLSL spec. Apple GPUs can degrade it to a hard
            // binary step, snapping the film pattern across the entire band
            // width as the pane sweeps through. The literal-args test above
            // cannot catch this because the edges are expressions.
            const shaderCode = getFragmentShader();
            expect(shaderCode).not.toMatch(/smoothstep\s*\(\s*u_reflSpan[^,]*,\s*0\.0\s*,/);
            expect(shaderCode).toMatch(/reflIntensity\s*=\s*1\.0\s*-\s*smoothstep\s*\(\s*0\.0\s*,/);
        });
    });

    describe('noise domain continuity (atan2 branch cut at 9 o’clock)', () => {
        const getFragmentShader = () => {
            chart.hoveredSliceIndex = 0;
            thinFilmPlugin.afterDatasetsDraw(chart);
            const call = mockGL.shaderSource.mock.calls.find((c) => c[1].includes('u_reflStart'));
            expect(call).toBeTruthy();
            return call[1];
        };

        // Transpile the shader block that builds the film-noise coordinates
        // (flowProfile through the glass-lens warp) so the test evaluates the
        // REAL shader math. `angle` is the raw atan2 output in (-PI, PI];
        // `a` is the wrap-safe arc-relative angle main() computes earlier.
        const makeNoiseDomainEvaluator = (shaderCode) => {
            const start = shaderCode.indexOf('float flowProfile');
            const end = shaderCode.indexOf('vec2 noisePos');
            expect(start).toBeGreaterThan(-1);
            expect(end).toBeGreaterThan(start);
            const block = shaderCode
                .slice(start, end)
                .replace(/\/\/[^\n]*/g, '')
                .replace(/\bfloat\s+/g, 'let ');
            return new Function(
                'angle',
                'a',
                'arcSpan',
                'r_norm',
                'u_outerRadius',
                'u_fluidAngle',
                'u_suctionVelocity',
                'u_reflStart',
                'u_reflSpan',
                `
                const PI = Math.PI, TWO_PI = Math.PI * 2;
                const abs = Math.abs, max = Math.max, min = Math.min,
                      sign = Math.sign, pow = Math.pow, sin = Math.sin;
                const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
                const mod = (x, y) => x - y * Math.floor(x / y);
                const smoothstep = (e0, e1, x) => {
                    const t = clamp((x - e0) / (e1 - e0), 0, 1);
                    return t * t * (3 - 2 * t);
                };
                ${block}
                return { tangential, radial };
                `
            );
        };

        // Mirror of the shader's wrap-safe arc containment math
        const TWO_PI = Math.PI * 2;
        const wrapA = (angle, startAngle) => {
            const x = angle - startAngle;
            return x - Math.floor(x / TWO_PI) * TWO_PI;
        };
        // atan2 representative of a physical direction theta: (-PI, PI]
        const atan2Angle = (theta) => {
            const x = (((theta + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI;
            return x - Math.PI;
        };

        // A hovered slice spanning the 9 o'clock direction (PI ~ 3.14 in [2.6, 4.0])
        const SLICE_START = 2.6;
        const SLICE_SPAN = 1.4;
        const SLICE_MID = SLICE_START + SLICE_SPAN / 2;
        const OUTER_RADIUS = 300;
        const REFL_START = 0.5; // pane parked away from 9 o'clock
        const REFL_SPAN = 0.2 * TWO_PI;

        const evalAtDirection = (evalNoise, theta, suction = 0) => {
            const angle = atan2Angle(theta);
            const a = wrapA(angle, SLICE_START);
            return evalNoise(
                angle,
                a,
                SLICE_SPAN,
                0.5,
                OUTER_RADIUS,
                SLICE_MID,
                suction,
                REFL_START,
                REFL_SPAN
            );
        };

        it('film coordinates are continuous across the 9 o’clock direction', () => {
            // atan2 flips +PI -> -PI at the negative x axis. Feeding that raw
            // angle into the noise domain shifts tangential by a full
            // outerRadius * 0.06 (~18 noise units) in one pixel: a hard,
            // full-band-width seam fixed at 9 o'clock on any slice that spans it.
            const evalNoise = makeNoiseDomainEvaluator(getFragmentShader());
            const eps = 1e-3;
            for (const suction of [0, 2.5]) {
                const above = evalAtDirection(evalNoise, Math.PI - eps, suction);
                const below = evalAtDirection(evalNoise, Math.PI + eps, suction);
                expect(Math.abs(above.tangential - below.tangential)).toBeLessThan(0.05);
                expect(Math.abs(above.radial - below.radial)).toBeLessThan(0.05);
            }
        });

        it('film coordinates have no jump anywhere inside the slice', () => {
            const evalNoise = makeNoiseDomainEvaluator(getFragmentShader());
            const steps = 2000;
            let prev = null;
            let maxJump = 0;
            // Sample strictly inside the arc: pixels exactly on the edges are
            // discarded by the shader's containment test before this block runs.
            for (let s = 0; s <= steps; s++) {
                const theta = SLICE_START + (SLICE_SPAN * (s + 0.5)) / (steps + 1);
                const out = evalAtDirection(evalNoise, theta);
                if (prev !== null) {
                    maxJump = Math.max(maxJump, Math.abs(out.tangential - prev.tangential));
                }
                prev = out;
            }
            // Natural tangential gradient is ~outerRadius*0.06/2PI per radian
            // (~0.002 per step here); anything near a noise-unit is a seam.
            expect(maxJump).toBeLessThan(0.05);
        });

        it('film pattern still rigidly tracks the slice as it rotates', () => {
            // Rotating the slice, the pane, and the query direction together
            // must reproduce the same coordinates: the oil must not slide
            // under the light (the original u_fluidAngle anchoring contract).
            const evalNoise = makeNoiseDomainEvaluator(getFragmentShader());
            const delta = 0.3;
            // Strictly interior samples: edge pixels are discarded by the shader
            for (let s = 0; s <= 20; s++) {
                const theta = SLICE_START + (SLICE_SPAN * (s + 0.5)) / 21;
                const angle0 = atan2Angle(theta);
                const base = evalNoise(
                    angle0,
                    wrapA(angle0, SLICE_START),
                    SLICE_SPAN,
                    0.5,
                    OUTER_RADIUS,
                    SLICE_MID,
                    0,
                    REFL_START,
                    REFL_SPAN
                );
                const angle1 = atan2Angle(theta + delta);
                const rotated = evalNoise(
                    angle1,
                    wrapA(angle1, SLICE_START + delta),
                    SLICE_SPAN,
                    0.5,
                    OUTER_RADIUS,
                    SLICE_MID + delta,
                    0,
                    REFL_START + delta,
                    REFL_SPAN
                );
                expect(rotated.tangential).toBeCloseTo(base.tangential, 4);
                expect(rotated.radial).toBeCloseTo(base.radial, 4);
            }
        });
    });

    it('shader should pass turbulence into filmNoise for duck-on-water effect', () => {
        chart.hoveredSliceIndex = 0;
        thinFilmPlugin.afterDatasetsDraw(chart);

        const shaderSourceCall = mockGL.shaderSource.mock.calls.find((c) =>
            c[1].includes('u_trailAngles')
        );
        expect(shaderSourceCall).toBeTruthy();
        const shaderCode = shaderSourceCall[1];

        // A proper physical disruption alters the fluid dynamics (turbulence).
        // It shouldn't just shift thickness or offset coordinates rigidly.
        // We expect filmNoise to take a turbulence parameter: filmNoise(vec2, float)
        expect(shaderCode).toMatch(/float\s+filmNoise\s*\(\s*vec2\s+\w+,\s*float\s+\w+\s*\)/);
        expect(shaderCode).toMatch(/filmNoise\s*\(\s*noisePos,\s*trailFlow\s*\)/);
    });
});
