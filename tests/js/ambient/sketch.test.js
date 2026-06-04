/**
 * @jest-environment jsdom
 */

require('@js/ambient/sketch.js');

describe('Sketch', () => {
    let Sketch;

    beforeEach(() => {
        Sketch = window.Sketch;
        document.body.innerHTML = '';
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => setTimeout(cb, 0));
        jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => clearTimeout(id));

        // Mock getContext since jsdom doesn't support canvas fully without extra packages
        window.HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue({
            canvas: document.createElement('canvas'),
            clearRect: jest.fn(),
            fillRect: jest.fn(),
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('is attached to window correctly', () => {
        expect(typeof Sketch).toBe('object');
        expect(Sketch.create).toBeDefined();
    });

    it('can create a sketch context', () => {
        const context = Sketch.create({
            type: Sketch.CANVAS,
            autostart: false,
            globals: false,
        });
        expect(context).toBeDefined();
        expect(typeof context.start).toBe('function');
    });
});
