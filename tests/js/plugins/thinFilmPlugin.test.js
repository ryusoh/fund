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
        delete global.window;
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
});
