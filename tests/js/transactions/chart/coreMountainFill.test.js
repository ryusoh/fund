/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';

function createFakeCanvas() {
    const ctx = {
        beginPath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        closePath: jest.fn(),
        createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
        fillRect: jest.fn(),
        clearRect: jest.fn(),
        fill: jest.fn(),
        fillStyle: '',
    };
    return {
        _width: 0,
        _height: 0,
        getContext: jest.fn(() => ctx),
        get width() {
            return this._width;
        },
        set width(value) {
            this._width = value;
        },
        get height() {
            return this._height;
        },
        set height(value) {
            this._height = value;
        },
    };
}

describe('drawMountainFill offscreen canvas resize behavior', () => {
    const bounds = { left: 0, top: 0, right: 100, bottom: 50 };
    const coords = [
        { x: 0, y: 25 },
        { x: 50, y: 10 },
        { x: 100, y: 25 },
    ];

    let drawMountainFill;
    let fakeCanvas;

    beforeEach(() => {
        jest.resetModules();
        fakeCanvas = createFakeCanvas();
        global.document = {
            createElement: jest.fn((tag) => {
                if (tag === 'canvas') {
                    return fakeCanvas;
                }
                return {};
            }),
            querySelector: jest.fn(() => null),
        };
        global.window = { innerWidth: 1024, innerHeight: 768 };
        jest.isolateModules(() => {
            const core = require('../../../../js/transactions/chart/core.js');
            drawMountainFill = core.drawMountainFill;
        });
    });

    afterEach(() => {
        delete global.document;
    });

    it('initializes the shared offscreen canvas on first call', () => {
        const ctx = { drawImage: jest.fn() };
        drawMountainFill(ctx, coords, 50, { color: '#fff', bounds });
        expect(fakeCanvas.getContext).toHaveBeenCalledWith('2d');
        expect(fakeCanvas.width).toBe(100);
        expect(fakeCanvas.height).toBe(50);
    });

    it('does not resize when dimensions are unchanged', () => {
        const ctx = { drawImage: jest.fn() };
        drawMountainFill(ctx, coords, 50, { color: '#fff', bounds });
        const widthSetter = jest.spyOn(fakeCanvas, 'width', 'set');
        const heightSetter = jest.spyOn(fakeCanvas, 'height', 'set');

        drawMountainFill(ctx, coords, 50, { color: '#fff', bounds });

        expect(widthSetter).not.toHaveBeenCalled();
        expect(heightSetter).not.toHaveBeenCalled();
        expect(fakeCanvas.width).toBe(100);
        expect(fakeCanvas.height).toBe(50);
    });

    it('resizes the canvas when dimensions change', () => {
        const ctx = { drawImage: jest.fn() };
        drawMountainFill(ctx, coords, 50, { color: '#fff', bounds });
        const widthSetter = jest.spyOn(fakeCanvas, 'width', 'set');
        const heightSetter = jest.spyOn(fakeCanvas, 'height', 'set');

        drawMountainFill(ctx, coords, 50, {
            color: '#fff',
            bounds: { left: 0, top: 0, right: 200, bottom: 100 },
        });

        expect(widthSetter).toHaveBeenCalledTimes(1);
        expect(heightSetter).toHaveBeenCalledTimes(1);
        expect(fakeCanvas.width).toBe(200);
        expect(fakeCanvas.height).toBe(100);
    });
});
