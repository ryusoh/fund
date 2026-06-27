import { WebGLCaustics } from '../../../js/ui/webglCaustics.js';
import * as THREE from '../../../js/vendor/three.module.js';

jest.mock('../../../js/vendor/three.module.js', () => {
    return {
        WebGLRenderer: jest.fn().mockImplementation(function () {
            return {
                setSize: jest.fn(),
                setPixelRatio: jest.fn(),
                setRenderTarget: jest.fn(),
                render: jest.fn(),
                clear: jest.fn(),
                dispose: jest.fn(),
                domElement: { width: 100, height: 100, style: {} },
                capabilities: {
                    isWebGL2: false,
                },
                extensions: { get: jest.fn().mockReturnValue(true) },
            };
        }),
        WebGLRenderTarget: jest.fn().mockImplementation(() => ({
            texture: {},
            dispose: jest.fn(),
        })),
        Scene: jest.fn().mockImplementation(() => ({
            add: jest.fn(),
        })),
        Camera: jest.fn(),
        OrthographicCamera: jest.fn(),
        PlaneGeometry: jest.fn().mockImplementation(() => ({
            dispose: jest.fn(),
        })),
        ShaderMaterial: jest.fn().mockImplementation(() => ({
            uniforms: {
                u_obstacles: { value: null },
                texelSize: { value: null },
                uTarget: { value: null },
                aspectRatio: { value: 1 },
                point: { value: null },
                color: { value: null },
                radius: { value: 0 },
                uDye: { value: null },
                uVelocity: { value: null },
                u_time: { value: 0 },
                uSource: { value: null },
                dt: { value: 0 },
                dissipation: { value: 0 },
                uDivergence: { value: null },
                uPressure: { value: null },
            },
            dispose: jest.fn(),
        })),
        Mesh: jest.fn().mockImplementation(() => ({
            material: null,
        })),
        Vector2: jest.fn(),
        CanvasTexture: jest.fn().mockImplementation(() => ({
            needsUpdate: false,
        })),
        Clock: jest.fn().mockImplementation(() => ({
            start: jest.fn(),
            getDelta: jest.fn().mockReturnValue(0.016),
            elapsedTime: 1,
        })),
        HalfFloatType: 1013,
        FloatType: 1014,
        RGBAFormat: 1023,
        NearestFilter: 1003,
    };
});

describe('WebGLCaustics execution', () => {
    let element;
    let originalMatchMedia;
    let originalWebGLRenderingContext;

    beforeEach(() => {
        element = document.createElement('div');
        element.style.width = '100px';
        element.style.height = '100px';
        element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
        document.body.appendChild(element);

        const child1 = document.createElement('div');
        child1.className = 'ch-day';
        child1.getBoundingClientRect = () => ({ left: 10, top: 10, width: 10, height: 10 });
        element.appendChild(child1);

        originalMatchMedia = window.matchMedia;
        window.matchMedia = jest.fn().mockImplementation(() => ({ matches: false }));

        originalWebGLRenderingContext = window.WebGLRenderingContext;
        window.WebGLRenderingContext = {};

        const originalCreateElement = document.createElement;
        jest.spyOn(document, 'createElement').mockImplementation((tag) => {
            const canvas = originalCreateElement.call(document, tag);
            if (tag === 'canvas') {
                canvas.getContext = jest.fn((type) => {
                    if (type === 'webgl' || type === 'experimental-webgl') {
                        return {};
                    }
                    if (type === '2d') {
                        return { fillRect: jest.fn() };
                    }
                    return null;
                });
            }
            return canvas;
        });

        jest.spyOn(THREE, 'WebGLRenderer').mockImplementation(() => ({
            setSize: jest.fn(),
            setPixelRatio: jest.fn(),
            setRenderTarget: jest.fn(),
            render: jest.fn(),
            clear: jest.fn(),
            dispose: jest.fn(),
            domElement: document.createElement('canvas'),
            capabilities: {
                isWebGL2: false,
            },
            extensions: { get: jest.fn().mockReturnValue(true) },
        }));

        window.ResizeObserver = jest.fn().mockImplementation(() => ({
            observe: jest.fn(),
            unobserve: jest.fn(),
            disconnect: jest.fn(),
        }));
    });

    afterEach(() => {
        document.body.innerHTML = '';
        window.matchMedia = originalMatchMedia;
        window.WebGLRenderingContext = originalWebGLRenderingContext;
        jest.restoreAllMocks();
    });

    test('initializes and handles resize', () => {
        const caustics = new WebGLCaustics(element, { simResolution: 128 });
        expect(caustics.enabled).toBe(true);
        caustics.container = { clientWidth: 200, clientHeight: 200, style: {} };
        caustics.resize();
        expect(caustics.renderer.setSize).toHaveBeenCalledWith(200, 200);
        caustics.dispose();
    });

    test('updates obstacle map', () => {
        const caustics = new WebGLCaustics(element, { simResolution: 128 });
        caustics.container = { clientWidth: 200, clientHeight: 200, style: {} };
        caustics.updateObstacleMap();
        expect(caustics.obstacleTexture.needsUpdate).toBe(true);
        caustics.dispose();
    });

    test('splats and steps', () => {
        const caustics = new WebGLCaustics(element, { simResolution: 128 });
        caustics.container = { clientWidth: 200, clientHeight: 200, style: {} };
        caustics.pointer.moved = true;
        caustics.pointer.x = 0.5;
        caustics.pointer.y = 0.5;
        caustics.pointer.dx = 1;
        caustics.pointer.dy = 1;

        caustics.step();

        expect(caustics.pointer.moved).toBe(false);
        expect(caustics.renderer.render).toHaveBeenCalled();
        caustics.dispose();
    });

    test('start and stop loop', () => {
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => {
            return 1;
        });
        jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

        const caustics = new WebGLCaustics(element, { simResolution: 128 });
        caustics.container = { clientWidth: 200, clientHeight: 200, style: {} };
        caustics.start();
        expect(caustics.isRunning).toBe(true);

        caustics.stop();
        expect(caustics.isRunning).toBe(false);
        expect(window.cancelAnimationFrame).toHaveBeenCalled();
        caustics.dispose();
    });
});
