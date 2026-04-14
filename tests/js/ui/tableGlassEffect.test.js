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
        // Mock getBoundingClientRect for row height calculation in tests
        // Canvas top is at 0 (relative to container 0).
        // Row top is at 100.
        // relativeTop = 100 - 0 = 100.
        Object.defineProperty(row1, 'getBoundingClientRect', {
            value: () => ({ top: 100, height: 50, left: 0, width: 800 }),
        });
        Object.defineProperty(row1, 'offsetHeight', {
            value: 50,
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
        // Mock canvas getBoundingClientRect to allow relative calc
        // eslint-disable-next-line no-undef
        HTMLCanvasElement.prototype.getBoundingClientRect = jest.fn(() => ({
            width: 800,
            height: 400,
            top: 0,
            left: 0,
        }));

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

        // Mock elementFromPoint for hover detection
        document.elementFromPoint = jest.fn(() => null);
    });

    afterEach(() => {
        document.body.removeChild(container);
        window.requestAnimationFrame = originalRequestAnimationFrame;
        window.cancelAnimationFrame = originalCancelAnimationFrame;
        jest.restoreAllMocks();
    });

    test('pauseResize sets resizePaused to true', () => {
        const effect = new TableGlassEffect('.table-responsive-container');
        expect(effect.resizePaused).toBe(false);
        effect.pauseResize();
        expect(effect.resizePaused).toBe(true);
    });

    test('resumeResize sets resizePaused to false and calls resize', () => {
        const effect = new TableGlassEffect('.table-responsive-container');
        effect.resize = jest.fn();
        effect.resizePaused = true;
        effect.resumeResize();
        expect(effect.resizePaused).toBe(false);
        expect(effect.resize).toHaveBeenCalled();
    });

    test('resize returns immediately if resizePaused is true', () => {
        const effect = new TableGlassEffect('.table-responsive-container');
        effect.resizePaused = true;
        effect.canvas.style.top = '123px';
        effect.resize();
        expect(effect.canvas.style.top).toBe('123px'); // Doesn't change
    });

    it('should initialize and append canvas', () => {
        const effect = new TableGlassEffect('.table-responsive-container');
        const canvas = container.querySelector('canvas');
        expect(canvas).toBeTruthy();
        expect(canvas.style.position).toBe('absolute');
        effect.dispose();
    });

    it('should not draw spotlight effect if hoveredRowIndex is -1', () => {
        const effect = new TableGlassEffect('.table-responsive-container', {
            rowHoverEffect: { enabled: true },
        });

        effect.state.hoveredRowIndex = -1;
        const mockCtx = effect.ctx;
        mockCtx.fillRect = jest.fn();

        effect.drawRowHoverEffect();
        expect(mockCtx.fillRect).not.toHaveBeenCalled();
    });

    it('should calculate getPointAtProgress correctly for different distances', () => {
        const effect = new TableGlassEffect('.table-responsive-container');
        effect.width = 100;
        effect.height = 50;
        const radius = 10;

        const w = 100,
            h = 50,
            r = 10;
        const lineW = w - 2 * r; // 80
        const lineH = h - 2 * r; // 30
        const cornerLen = (Math.PI * r) / 2; // ~15.7
        const perimeter = 2 * lineW + 2 * lineH + 4 * cornerLen;

        const distRightEdge = lineW + cornerLen + lineH / 2;
        const progressRight = distRightEdge / perimeter;
        const ptRightEdge = effect.getPointAtProgress(progressRight, radius);
        expect(ptRightEdge.x).toBe(100);

        const distBottomEdge = lineW + cornerLen + lineH + cornerLen + lineW / 2;
        const progressBottom = distBottomEdge / perimeter;
        const ptBottomEdge = effect.getPointAtProgress(progressBottom, radius);
        expect(ptBottomEdge.y).toBe(50);
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

    it('should abort init if options.enabled is false', () => {
        const effect = new TableGlassEffect('.table-responsive-container', { enabled: false });
        expect(effect.canvas).toBeUndefined(); // canvas is created in init(), which is skipped
        expect(container.querySelector('canvas')).toBeFalsy();
    });

    it('should handle missing tbody in resize', () => {
        // Clear all tbody from the container
        container.querySelectorAll('tbody').forEach((el) => el.remove());

        const effect = new TableGlassEffect('.table-responsive-container', {
            rowHoverEffect: { enabled: true },
        });

        // This should not throw and rows should remain empty or unpopulated
        effect.resize();

        // No error thrown and hover tracking does not crash
        expect(effect.rows).toEqual([]);
        effect.dispose();
    });

    it('should reset pointer and hoveredRowIndex on mouseleave', () => {
        const effect = new TableGlassEffect('.table-responsive-container');

        // First simulate mouse enter
        effect.handleMouseMove({ clientX: 200, clientY: 100 });
        expect(effect.state.pointer.x).not.toBe(0);

        // Then simulate mouse leave
        effect.handleMouseLeave();
        expect(effect.state.pointer.x).toBe(0);
        expect(effect.state.pointer.y).toBe(0);
        expect(effect.state.hoveredRowIndex).toBe(-1);

        effect.dispose();
    });

    it('should not draw electric trails if electric.enabled is false', () => {
        const effect = new TableGlassEffect('.table-responsive-container', {
            threeD: { electric: { enabled: false } },
        });

        const mockCtx = effect.ctx;
        // override stroke just in case
        mockCtx.stroke = jest.fn();

        effect.drawElectricTrails(8);

        // because it's disabled, nothing should have been drawn
        expect(mockCtx.stroke).not.toHaveBeenCalled();
        effect.dispose();
    });

    it('should not draw particles if particlesEnabled is false', () => {
        const effect = new TableGlassEffect('.table-responsive-container', {
            threeD: { electric: { particlesEnabled: false } },
        });

        const mockCtx = effect.ctx;
        mockCtx.fill = jest.fn();

        effect.drawParticles(8);

        expect(mockCtx.fill).not.toHaveBeenCalled();
        effect.dispose();
    });

    it('should draw electric trails with default palette fallback if palette is empty', () => {
        const effect = new TableGlassEffect('.table-responsive-container', {
            threeD: { electric: { colors: {} } },
        });

        const mockCtx = effect.ctx;
        mockCtx.stroke = jest.fn();

        effect.drawElectricTrails(8);

        // Ensure stroke was called, meaning the fallback palette color was used
        expect(mockCtx.stroke).toHaveBeenCalled();
        effect.dispose();
    });

    it('should use default threeD options for reflection and glow', () => {
        const effect = new TableGlassEffect('.table-responsive-container', {
            threeD: { ambientGlow: {}, reflection: {} },
        });

        const mockCtx = effect.ctx;
        mockCtx.createLinearGradient = jest.fn(() => ({
            addColorStop: jest.fn(),
        }));

        // Both these calls use fallbacks for missing config properties
        effect.drawAmbientGlow(8);
        effect.drawReflection(8);

        expect(mockCtx.createLinearGradient).toHaveBeenCalledTimes(2);

        // Let's do an update step to ensure speed fallbacks are hit
        // Need to provide a valid time sequence to advance delta correctly
        effect.update(1000); // Set lastTime = 1000
        effect.update(2000); // delta = 1, should advance phase

        expect(effect.state.phase).not.toBe(0);

        effect.dispose();
    });

    it('should handle startLoop and multiple frames', () => {
        jest.useFakeTimers();
        const effect = new TableGlassEffect('.table-responsive-container');

        effect.draw = jest.fn();
        effect.update = jest.fn();

        // Advance timers to trigger recursive loop
        jest.advanceTimersByTime(100);

        expect(effect.update).toHaveBeenCalled();
        expect(effect.draw).toHaveBeenCalled();

        effect.dispose();
        jest.useRealTimers();
    });

    it('should resolve point at progress for rounded rectangle', () => {
        const effect = new TableGlassEffect('.table-responsive-container');
        effect.width = 100;
        effect.height = 50;

        const p1 = effect.getPointAtProgress(0.1, 10); // dist = 0.1 * 300 = 30
        expect(p1.x).toBeGreaterThan(0);

        // Cover bottom-right curve
        const p2 = effect.getPointAtProgress(0.6, 10);
        expect(p2).toBeDefined();

        // Cover left border
        const p3 = effect.getPointAtProgress(0.9, 10);
        expect(p3.x).toBeDefined();

        // Progress zero radius fallbacks
        const p4 = effect.getPointAtProgressZeroRadius(0.1);
        expect(p4.x).toBeCloseTo(30);

        const p5 = effect.getPointAtProgressZeroRadius(0.4); // dist = 120 (100 + 20)
        expect(p5.x).toBeCloseTo(100);
        expect(p5.y).toBeCloseTo(20);

        const p6 = effect.getPointAtProgressZeroRadius(0.6); // dist = 180 (100+50 + 30) -> leftwards
        expect(p6.x).toBeCloseTo(70);
        expect(p6.y).toBeCloseTo(50);

        const p7 = effect.getPointAtProgressZeroRadius(0.9); // dist = 270 (250 + 20) -> upwards
        expect(p7.x).toBeCloseTo(0);
        expect(p7.y).toBeCloseTo(30);

        // progress < 0
        const p8 = effect.getPointAtProgress(-0.1, 10);
        expect(p8).toBeDefined();

        effect.dispose();
    });

    it('should handle missing target in elementFromPoint during mousemove', () => {
        const effect = new TableGlassEffect('.table-responsive-container', {
            rowHoverEffect: { enabled: true },
        });
        document.elementFromPoint.mockReturnValue(null);
        effect.handleMouseMove({ clientX: 0, clientY: 0 });
        expect(effect.state.hoveredRowIndex).toBe(-1);

        document.elementFromPoint.mockReturnValue({ closest: () => null });
        effect.handleMouseMove({ clientX: 0, clientY: 0 });
        expect(effect.state.hoveredRowIndex).toBe(-1);

        effect.dispose();
    });

    it('should draw particles but skip those with life property', () => {
        const effect = new TableGlassEffect('.table-responsive-container', {
            threeD: { electric: { particlesEnabled: true } },
        });

        effect.state.energyParticles = [
            { progress: 0.1, size: 2, flickerOffset: 0 },
            { progress: 0.5, size: 2, flickerOffset: 1, life: 10 }, // Should skip
        ];

        const mockCtx = effect.ctx;
        mockCtx.fill = jest.fn();

        effect.drawParticles(8);
        expect(mockCtx.fill).toHaveBeenCalledTimes(1);

        effect.dispose();
    });

    it('should fix static container positioning', () => {
        container.style.position = 'static';
        const effect = new TableGlassEffect('.table-responsive-container');
        expect(container.style.position).toBe('relative');
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

        // Get the row element created in beforeEach
        const row1 = container.querySelector('tr');

        // Mock elementFromPoint to return this row when queried
        document.elementFromPoint.mockReturnValue({
            closest: jest.fn().mockReturnValue(row1),
        });

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
