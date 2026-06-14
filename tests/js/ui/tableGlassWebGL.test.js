import { TableGlassWebGL } from '../../../js/ui/tableGlassWebGL.js';

describe('TableGlassWebGL', () => {
    let mockParentEffect;

    beforeEach(() => {
        mockParentEffect = {
            container: document.createElement('div'),
            canvas: document.createElement('canvas'),
            height: 500,
            options: { excludeHeader: false },
            _scrollable: false,
        };
        mockParentEffect.container.appendChild(mockParentEffect.canvas);

        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
            function (type, _options) {
                if (type === 'webgl' || type === 'experimental-webgl') {
                    return {
                        createShader: jest.fn(() => ({})),
                        shaderSource: jest.fn(),
                        compileShader: jest.fn(),
                        getShaderParameter: jest.fn(() => true), // Mock compile success
                        createProgram: jest.fn(() => ({})),
                        attachShader: jest.fn(),
                        linkProgram: jest.fn(),
                        getProgramParameter: jest.fn(() => true), // Mock link success
                        createBuffer: jest.fn(() => ({})),
                        bindBuffer: jest.fn(),
                        bufferData: jest.fn(),
                        getAttribLocation: jest.fn(() => 0),
                        enableVertexAttribArray: jest.fn(),
                        vertexAttribPointer: jest.fn(),
                        getUniformLocation: jest.fn(() => ({})),
                        enable: jest.fn(),
                        blendFunc: jest.fn(),
                        viewport: jest.fn(),
                        clearColor: jest.fn(),
                        clear: jest.fn(),
                        useProgram: jest.fn(),
                        uniform2f: jest.fn(),
                        uniform1f: jest.fn(),
                        drawArrays: jest.fn(),
                        getExtension: jest.fn(),
                        COLOR_BUFFER_BIT: 16384,
                        VERTEX_SHADER: 35633,
                        FRAGMENT_SHADER: 35632,
                        COMPILE_STATUS: 35713,
                        LINK_STATUS: 35714,
                        ARRAY_BUFFER: 34962,
                        STATIC_DRAW: 35044,
                        FLOAT: 5126,
                        BLEND: 3042,
                        SRC_ALPHA: 770,
                        ONE: 1,
                        TRIANGLES: 4,
                    };
                }
                return originalGetContext.call(this, type, _options);
            }
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('exits early when WebGL is unavailable', () => {
        HTMLCanvasElement.prototype.getContext.mockImplementationOnce(() => null);

        const webgl = new TableGlassWebGL(mockParentEffect);
        expect(webgl.gl).toBeNull();
    });

    test('initializes WebGL successfully', () => {
        const webgl = new TableGlassWebGL(mockParentEffect);
        expect(webgl.gl).not.toBeNull();
        expect(webgl.program).not.toBeUndefined();
    });

    test('handles compile error gracefully', () => {
        HTMLCanvasElement.prototype.getContext.mockImplementationOnce(function () {
            return {
                createShader: jest.fn(() => ({})),
                shaderSource: jest.fn(),
                compileShader: jest.fn(),
                getShaderParameter: jest.fn(() => false), // Mock compile FAILURE
                getShaderInfoLog: jest.fn(() => 'Test compile error'),
                deleteShader: jest.fn(),
                createProgram: jest.fn(() => ({})), // Add these so it doesn't crash later
                attachShader: jest.fn(),
                linkProgram: jest.fn(),
                getProgramParameter: jest.fn(() => true),
                createBuffer: jest.fn(() => ({})),
                bindBuffer: jest.fn(),
                bufferData: jest.fn(),
                getAttribLocation: jest.fn(() => 0),
                enableVertexAttribArray: jest.fn(),
                vertexAttribPointer: jest.fn(),
                getUniformLocation: jest.fn(() => ({})),
                enable: jest.fn(),
                blendFunc: jest.fn(),
                VERTEX_SHADER: 35633,
                FRAGMENT_SHADER: 35632,
                COMPILE_STATUS: 35713,
                LINK_STATUS: 35714,
            };
        });

        const webgl = new TableGlassWebGL(mockParentEffect);
        // Should handle compile error and proceed or gracefully degrade
        expect(webgl).toBeDefined();
    });

    test('handles link error gracefully', () => {
        HTMLCanvasElement.prototype.getContext.mockImplementationOnce(function () {
            return {
                createShader: jest.fn(() => ({})),
                shaderSource: jest.fn(),
                compileShader: jest.fn(),
                getShaderParameter: jest.fn(() => true), // Mock compile success
                createProgram: jest.fn(() => ({})),
                attachShader: jest.fn(),
                linkProgram: jest.fn(),
                getProgramParameter: jest.fn(() => false), // Mock link FAILURE
                getProgramInfoLog: jest.fn(() => 'Test link error'),
                VERTEX_SHADER: 35633,
                FRAGMENT_SHADER: 35632,
                COMPILE_STATUS: 35713,
                LINK_STATUS: 35714,
            };
        });

        const webgl = new TableGlassWebGL(mockParentEffect);
        expect(webgl.uniforms).toBeUndefined();
    });

    test('resize updates viewport and canvas size', () => {
        const webgl = new TableGlassWebGL(mockParentEffect);
        webgl.resize(800, 600, 2);

        expect(webgl.canvas.style.width).toBe('800px');
        expect(webgl.canvas.style.height).toBe('600px');
        expect(webgl.canvas.width).toBe(1600);
        expect(webgl.canvas.height).toBe(1200);
        expect(webgl.gl.viewport).toHaveBeenCalledWith(0, 0, 1600, 1200);
    });

    test('resize handles missing gl context', () => {
        HTMLCanvasElement.prototype.getContext.mockImplementationOnce(() => null);
        const webgl = new TableGlassWebGL(mockParentEffect);
        expect(() => webgl.resize(800, 600, 2)).not.toThrow();
    });

    test('draw exits early if missing requirements', () => {
        const webgl = new TableGlassWebGL(mockParentEffect);

        // Missing rowHoverEffect enabled
        webgl.draw({}, { rowHoverEffect: { enabled: false } }, 800, 600, 1, []);
        expect(webgl.gl.clear).not.toHaveBeenCalled();

        // Empty rows
        webgl.draw({}, { rowHoverEffect: { enabled: true } }, 800, 600, 1, []);
        expect(webgl.gl.clear).not.toHaveBeenCalled();

        // Null rows
        webgl.draw({}, { rowHoverEffect: { enabled: true } }, 800, 600, 1, null);
        expect(webgl.gl.clear).not.toHaveBeenCalled();
    });

    test('draw handles fade out with no hover', () => {
        const webgl = new TableGlassWebGL(mockParentEffect);
        const state = { spotlightAlpha: 0.0, hoveredRowIndex: -1 };
        const options = { rowHoverEffect: { enabled: true } };
        const rows = [{ top: 0, height: 20, left: 0, width: 100 }];

        webgl.draw(state, options, 800, 600, 1, rows);

        expect(webgl.gl.clear).toHaveBeenCalled();
        expect(webgl.gl.useProgram).not.toHaveBeenCalled(); // Should clear and exit
    });

    test('draw executes WebGL drawArrays with correct uniforms', () => {
        const webgl = new TableGlassWebGL(mockParentEffect);
        const state = {
            spotlightAlpha: 1.0,
            hoveredRowIndex: 1,
            pointerSmoothed: { x: 0, y: 0 },
            continuousPhase: 10.5,
            pointerVelocity: 5.0,
        };
        const options = {
            rowHoverEffect: { enabled: true },
            oilSpotlight: { radius: 300, boostMultiplier: 1.5, blueMixFactor: 0.8 },
        };
        const rows = [
            { top: 10, height: 20, left: 5, width: 100 },
            { top: 30, height: 20, left: 5, width: 100 },
        ];

        webgl.draw(state, options, 800, 600, 1, rows);

        expect(webgl.gl.useProgram).toHaveBeenCalledWith(webgl.program);
        expect(webgl.gl.uniform2f).toHaveBeenCalledWith(webgl.uniforms.resolution, 800, 600);
        // smoothed 0,0 maps to center (width/2, height/2)
        expect(webgl.gl.uniform2f).toHaveBeenCalledWith(webgl.uniforms.pointer, 400, 300);
        expect(webgl.gl.uniform1f).toHaveBeenCalledWith(webgl.uniforms.time, 10.5);
        expect(webgl.gl.uniform1f).toHaveBeenCalledWith(webgl.uniforms.spotlightRadius, 300);
        expect(webgl.gl.uniform1f).toHaveBeenCalledWith(webgl.uniforms.pointerVelocity, 5.0);
        expect(webgl.gl.uniform1f).toHaveBeenCalledWith(webgl.uniforms.tbodyTop, 10);
        expect(webgl.gl.uniform1f).toHaveBeenCalledWith(webgl.uniforms.tbodyBottom, 50); // 30 + 20
        expect(webgl.gl.drawArrays).toHaveBeenCalledWith(webgl.gl.TRIANGLES, 0, 6);
    });

    test('dispose removes canvas and loses context', () => {
        const webgl = new TableGlassWebGL(mockParentEffect);

        const mockLoseContext = jest.fn();
        webgl.gl.getExtension.mockImplementationOnce(() => ({ loseContext: mockLoseContext }));

        webgl.dispose();

        expect(webgl.canvas.parentNode).toBeNull();
        expect(mockLoseContext).toHaveBeenCalled();
    });
});
