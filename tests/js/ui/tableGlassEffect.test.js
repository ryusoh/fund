import { TableGlassEffect } from '@ui/tableGlassEffect.js';

describe('TableGlassEffect', () => {
    let container;
    let originalRequestAnimationFrame;
    let originalCancelAnimationFrame;

    beforeEach(() => {
        // Mock DOM elements
        container = document.createElement('div');
        container.className = 'table-responsive-container';
        container.getBoundingClientRect = jest.fn(() => ({
            width: 800,
            height: 400,
            top: 0,
            left: 0,
        }));
        // Mock layout properties
        Object.defineProperties(container, {
            clientWidth: { value: 800, configurable: true },
            clientHeight: { value: 400, configurable: true },
            scrollWidth: { value: 800, configurable: true },
        });

        document.body.appendChild(container);

        // Mock tbody and rows for hover effect
        const tbody = document.createElement('tbody');
        const row1 = document.createElement('tr');
        Object.defineProperty(row1, 'getBoundingClientRect', {
            value: () => ({ top: 100, height: 50, left: 0, width: 800 }),
        });
        tbody.appendChild(row1);
        container.appendChild(tbody);

        // Mock canvas context
        const mockCtx = {
            clearRect: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            closePath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            quadraticCurveTo: jest.fn(),
            clip: jest.fn(),
            createLinearGradient: jest.fn(() => ({
                addColorStop: jest.fn(),
            })),
            fill: jest.fn(),
            stroke: jest.fn(),
            scale: jest.fn(),
            arc: jest.fn(),
            setLineDash: jest.fn(),
        };

        // eslint-disable-next-line no-undef
        Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
            configurable: true,
            value: 800,
        });
        // eslint-disable-next-line no-undef
        Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
            configurable: true,
            value: 400,
        });

        // eslint-disable-next-line no-undef
        HTMLCanvasElement.prototype.getContext = jest.fn(() => mockCtx);

        // Mock RAF
        originalRequestAnimationFrame = window.requestAnimationFrame;
        originalCancelAnimationFrame = window.cancelAnimationFrame;
        window.requestAnimationFrame = jest.fn((cb) => setTimeout(cb, 0));
        window.cancelAnimationFrame = jest.fn((id) => clearTimeout(id));

        // Mock ResizeObserver
        global.ResizeObserver = class ResizeObserver {
            observe() {}
            disconnect() {}
        };
    });

    afterEach(() => {
        document.body.removeChild(container);
        window.requestAnimationFrame = originalRequestAnimationFrame;
        window.cancelAnimationFrame = originalCancelAnimationFrame;
        jest.restoreAllMocks();
    });

    it('should initialize and append canvas', () => {
        const effect = new TableGlassEffect('.table-responsive-container');
        const canvas = container.querySelector('canvas');
        expect(canvas).toBeTruthy();
        expect(canvas.style.position).toBe('absolute');
        effect.dispose();
    });

    it('should resize canvas on init', () => {
        const effect = new TableGlassEffect('.table-responsive-container');
        // Logic: Math.max(container.clientWidth, contentWidth + 2) => Math.max(800, 800 + 2) = 802
        expect(effect.width).toBe(802);
        expect(effect.height).toBe(400);
        effect.dispose();
    });

    it('should handle mouse movement', () => {
        const effect = new TableGlassEffect('.table-responsive-container');

        // Simulate mouse move - call handler directly for testing
        effect.handleMouseMove({
            clientX: 200,
            clientY: 100,
        });

        // x: (200 - 0) / 800 - 0.5 = 0.25 - 0.5 = -0.25. * 2 = -0.5
        expect(effect.state.pointer.x).toBeCloseTo(-0.5);

        effect.dispose();
    });

    it('should clean up on dispose', () => {
        const effect = new TableGlassEffect('.table-responsive-container');
        expect(container.querySelector('canvas')).toBeTruthy();

        effect.dispose();
        expect(container.querySelector('canvas')).toBeFalsy();
    });
    it('should respect excludeHeader option', () => {
        // Mock thead
        const thead = document.createElement('thead');
        Object.defineProperty(thead, 'offsetHeight', { value: 50 });
        container.appendChild(thead);

        const effect = new TableGlassEffect('.table-responsive-container', { excludeHeader: true });
        const canvas = container.querySelector('canvas');

        expect(canvas.style.top).toBe('50px');
        expect(canvas.style.height).toBe('calc(100% - 50px)');
        expect(canvas.style.borderRadius).toBe('0');

        effect.dispose();
    });
    it('should draw spotlight effect on hover', () => {
        const effect = new TableGlassEffect('.table-responsive-container', {
            rowHoverEffect: { enabled: true },
        });

        // Mock context methods used in drawRowHoverEffect
        const mockCtx = effect.ctx;
        mockCtx.createRadialGradient = jest.fn(() => ({
            addColorStop: jest.fn(),
        }));
        mockCtx.fillRect = jest.fn();

        // Simulate hover over the first row (top: 100, height: 50)
        // Canvas top might be 0 or adjusted. Let's assume default (0).
        // Row relative top is 100.
        // Mouse at 125 (middle of row)

        effect.handleMouseMove({
            clientX: 400, // Middle of width
            clientY: 125, // Middle of row
        });

        // Force draw
        effect.draw();

        // Check that createRadialGradient was called for the spotlight
        expect(mockCtx.createRadialGradient).toHaveBeenCalled();

        // Check that fillRect was called for the row background
        // Row top is 100, height 50.
        // Note: The mock row top is relative to viewport (100).
        // Container top is 0. Canvas top is 0.
        // So row.top in logic should be 100.
        expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 100, 802, 50);

        effect.dispose();
    });
});
