/* global HTMLCanvasElement */
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
            createRadialGradient: jest.fn(() => ({
                addColorStop: jest.fn(),
            })),
            fillRect: jest.fn(),
            fill: jest.fn(),
            stroke: jest.fn(),
            scale: jest.fn(),
            arc: jest.fn(),
            setLineDash: jest.fn(),
            rect: jest.fn(),
        };

        Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
            configurable: true,
            value: 800,
        });
        Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
            configurable: true,
            value: 400,
        });
        // Mock canvas getBoundingClientRect to allow relative calc
        HTMLCanvasElement.prototype.getBoundingClientRect = jest.fn(() => ({
            width: 800,
            height: 400,
            top: 0,
            left: 0,
        }));

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
        expect(effect.state.pointer.x).toBe(-10);
        expect(effect.state.pointer.y).toBe(-10);
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

    it('should test electric trails opacity logic correctly', () => {
        const effect = new TableGlassEffect('.table-responsive-container', {
            threeD: { electric: { enabled: true, colors: { primary: 'rgba(255,0,0,1)' } } },
        });

        const mockCtx = effect.ctx;
        mockCtx.stroke = jest.fn();
        mockCtx.moveTo = jest.fn();
        mockCtx.lineTo = jest.fn();

        effect.drawElectricTrails(8);

        expect(mockCtx.stroke).toHaveBeenCalled();
        expect(mockCtx.globalAlpha).toBeDefined();

        effect.dispose();
    });

    it('should calculate scrollable correctly during resize', () => {
        const effect = new TableGlassEffect('.table-responsive-container');
        effect._scrollable = false;

        // Mock properties to trigger _scrollable true
        Object.defineProperty(effect.container, 'scrollHeight', { value: 1000 });
        Object.defineProperty(effect.container, 'clientHeight', { value: 500 });

        // Assume default getComputedStyle is returning '' for overflow, so we can't easily mock window.getComputedStyle without affecting everything.
        // Instead, mock it for this specific element.
        const originalGetComputedStyle = window.getComputedStyle;
        window.getComputedStyle = jest.fn((el) => {
            if (el === effect.container) {
                return { overflow: 'auto', overflowY: 'auto' };
            }
            return originalGetComputedStyle(el);
        });

        effect.resize();

        expect(effect._scrollable).toBe(true);
        expect(effect.canvas.style.position).toBe('sticky');

        // Reset and trigger toggle
        window.getComputedStyle = jest.fn((el) => {
            if (el === effect.container) {
                return { overflow: 'hidden', overflowY: 'hidden' };
            }
            return originalGetComputedStyle(el);
        });

        effect.resize();
        expect(effect._scrollable).toBe(false);
        expect(effect.canvas.style.position).toBe('absolute');

        window.getComputedStyle = originalGetComputedStyle;
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
        // Height is now set as explicit pixels (clientHeight - headerHeight) instead of calc()
        expect(canvas.style.height).toBe('350px');
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
        expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 100, 800, 50);

        effect.dispose();
    });

    it('should trigger resize when tbody children mutate (data refresh regression)', async () => {
        const effect = new TableGlassEffect('.table-responsive-container', {
            rowHoverEffect: { enabled: true },
        });

        jest.spyOn(effect, 'resize');

        const tbody = container.querySelector('tbody');
        const newRow = document.createElement('tr');
        Object.defineProperty(newRow, 'getBoundingClientRect', {
            value: () => ({ top: 150, height: 50, left: 0, width: 800 }),
        });

        // Mutate the DOM to simulate a data refresh replacing rows
        tbody.appendChild(newRow);

        // Wait for the MutationObserver microtask to fire
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(effect.resize).toHaveBeenCalled();

        effect.dispose();
    });

    describe('WebGL Boundary and Regression Constraints', () => {
        it('should pass exact physical bounding box coordinates to WebGL to prevent outward bleeding', () => {
            const effect = new TableGlassEffect('.table-responsive-container', {
                rowHoverEffect: { enabled: true },
            });

            // Mock a WebGL context to capture the uniform assignments
            const mockUniform1f = jest.fn();
            effect.webglLayer.gl = {
                clearColor: jest.fn(),
                clear: jest.fn(),
                useProgram: jest.fn(),
                uniform2f: jest.fn(),
                uniform1f: mockUniform1f,
                drawArrays: jest.fn(),
                COLOR_BUFFER_BIT: 16640,
                TRIANGLES: 4,
            };
            effect.webglLayer.program = {};
            effect.webglLayer.uniforms = {
                resolution: 'u_res',
                pointer: 'u_ptr',
                time: 'u_time',
                spotlightRadius: 'u_rad',
                tbodyTop: 'u_top',
                tbodyBottom: 'u_bottom',
                tbodyLeft: 'u_left',
                tbodyWidth: 'u_width',
            };

            effect.state.pointer = { x: 0, y: -0.375 };
            effect.state.hoveredRowIndex = 0;

            const drawSpy = jest.spyOn(effect.webglLayer, 'draw');

            // Trigger main draw loop (which now contains WebGL)
            effect.draw();

            expect(drawSpy).toHaveBeenCalled();

            // Assert that the exact bounds of the rows were extracted and passed as uniforms
            const firstRow = effect.rows[0];
            const lastRow = effect.rows[effect.rows.length - 1];

            expect(mockUniform1f).toHaveBeenCalledWith('u_top', firstRow.top);
            expect(mockUniform1f).toHaveBeenCalledWith('u_left', firstRow.left);
            expect(mockUniform1f).toHaveBeenCalledWith('u_width', firstRow.width);
            expect(mockUniform1f).toHaveBeenCalledWith('u_bottom', lastRow.top + lastRow.height);
        });

        it('should not throw if webglLayer is disposed before draw', () => {
            const effect = new TableGlassEffect('.table-responsive-container', {
                rowHoverEffect: { enabled: true },
            });
            effect.webglLayer.dispose();
            effect.webglLayer = null;

            expect(() => {
                effect.drawRowHoverEffect();
            }).not.toThrow();
        });

        it('should clear but not render the WebGL border when not hovering over data rows', () => {
            const effect = new TableGlassEffect('.table-responsive-container', {
                rowHoverEffect: { enabled: true },
            });

            const mockClear = jest.fn();
            const mockDrawArrays = jest.fn();
            const mockUseProgram = jest.fn();

            effect.webglLayer.gl = {
                clearColor: jest.fn(),
                clear: mockClear,
                useProgram: mockUseProgram,
                uniform2f: jest.fn(),
                uniform1f: jest.fn(),
                drawArrays: mockDrawArrays,
                COLOR_BUFFER_BIT: 16640,
                TRIANGLES: 4,
            };
            effect.webglLayer.program = {};
            effect.webglLayer.uniforms = {
                resolution: 'u_res',
                pointer: 'u_ptr',
                time: 'u_time',
                spotlightRadius: 'u_rad',
                tbodyTop: 'u_top',
                tbodyBottom: 'u_bottom',
                tbodyLeft: 'u_left',
                tbodyWidth: 'u_width',
            };

            const drawSpy = jest.spyOn(effect.webglLayer, 'draw');

            // 1. Mouse is off-screen (hoveredRowIndex = -1)
            effect.handleMouseLeave();
            effect.draw();

            expect(effect.state.hoveredRowIndex).toBe(-1);
            expect(drawSpy).toHaveBeenCalled();
            // It MUST clear the previous frame
            expect(mockClear).toHaveBeenCalled();
            // It MUST NOT render the ambient border
            expect(mockUseProgram).not.toHaveBeenCalled();
            expect(mockDrawArrays).not.toHaveBeenCalled();

            // 2. Mouse enters a valid data row (hoveredRowIndex = 0)
            mockClear.mockClear();
            effect.state.pointer = { x: 0, y: -0.375 }; // Maps to Y=125, which is inside row 0 (100 to 150)
            effect.state.hoveredRowIndex = 0; // The mouse event listener handles this in reality
            effect.draw(); // This runs the WebGL render

            expect(effect.state.hoveredRowIndex).toBe(0);
            expect(mockClear).toHaveBeenCalled();
            expect(mockUseProgram).toHaveBeenCalled();
            expect(mockDrawArrays).toHaveBeenCalled();
        });

        it('should initialize hoveredRowIndex to -1', () => {
            const effect = new TableGlassEffect('.table-responsive-container', {
                rowHoverEffect: { enabled: true },
            });
            expect(effect.state.hoveredRowIndex).toBe(-1);
            effect.dispose();
        });

        it('should treat header rows and footer rows as non-data rows and set hoveredRowIndex to -1 on hover', () => {
            const tbody = container.querySelector('tbody');

            // Create mocked elements for header, footer and summary rows
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            thead.appendChild(headerRow);
            container.appendChild(thead);

            const tfoot = document.createElement('tfoot');
            const footerRow = document.createElement('tr');
            tfoot.appendChild(footerRow);
            container.appendChild(tfoot);

            const summaryRow = document.createElement('tr');
            summaryRow.className = 'total-row';
            tbody.appendChild(summaryRow);

            const thRow = document.createElement('tr');
            const th = document.createElement('th');
            thRow.appendChild(th);
            tbody.appendChild(thRow);

            // Mock getBoundingClientRect and offsetHeight for the new rows to avoid NaN
            Object.defineProperty(summaryRow, 'getBoundingClientRect', {
                value: () => ({ top: 150, height: 50, left: 0, width: 800 }),
            });
            Object.defineProperty(thRow, 'getBoundingClientRect', {
                value: () => ({ top: 200, height: 50, left: 0, width: 800 }),
            });

            // Re-instantiate or trigger resize to pick up the new rows
            const effect = new TableGlassEffect('.table-responsive-container', {
                rowHoverEffect: { enabled: true },
            });

            const testCases = [headerRow, footerRow, summaryRow, thRow];

            testCases.forEach((el) => {
                document.elementFromPoint.mockReturnValue({
                    closest: jest.fn().mockReturnValue(el),
                });

                effect.handleMouseMove({ clientX: 400, clientY: 100 });
                expect(effect.state.hoveredRowIndex).toBe(-1);
            });

            effect.dispose();
        });

        it('should track and smooth pointerVelocity on mouse move', () => {
            const effect = new TableGlassEffect('.table-responsive-container');

            // Initial velocity should be 0 or undefined (will default to 0 on first update)
            expect(effect.state.pointerVelocity).toBeUndefined();

            // Mock lastPointer and set hoveredRowIndex to simulate hover
            effect.state.hoveredRowIndex = 0;
            effect.state.lastPointer = { x: 0, y: 0 };

            // Move pointer
            effect.state.pointer = { x: 0.5, y: 0.5 };

            // Run update to set lastTime = 1000
            effect.update(1000);

            // Move pointer more
            effect.state.pointer = { x: 1.0, y: 1.0 };

            // Run update with delta of 0.1s (1100ms)
            effect.update(1100);

            // Smooth velocity should become non-zero
            expect(effect.state.pointerVelocity).toBeGreaterThan(0);

            effect.dispose();
        });

        it('should pass u_pointerVelocity and oilSpotlight uniforms to WebGL', () => {
            const effect = new TableGlassEffect('.table-responsive-container', {
                rowHoverEffect: { enabled: true },
                oilSpotlight: {
                    radius: 400.0,
                    boostMultiplier: 1.2,
                    blueMixFactor: 0.7,
                },
            });

            const mockUniform1f = jest.fn();
            effect.webglLayer.gl = {
                clearColor: jest.fn(),
                clear: jest.fn(),
                useProgram: jest.fn(),
                uniform2f: jest.fn(),
                uniform1f: mockUniform1f,
                drawArrays: jest.fn(),
                COLOR_BUFFER_BIT: 16640,
                TRIANGLES: 4,
            };
            effect.webglLayer.program = {};
            effect.webglLayer.uniforms = {
                resolution: 'u_res',
                pointer: 'u_ptr',
                time: 'u_time',
                spotlightRadius: 'u_rad',
                tbodyTop: 'u_top',
                tbodyBottom: 'u_bottom',
                tbodyLeft: 'u_left',
                tbodyWidth: 'u_width',
                pointerVelocity: 'u_vel',
                oilBoostMultiplier: 'u_oil_boost',
                oilBlueMixFactor: 'u_oil_blue',
            };

            effect.state.pointerVelocity = 3.5;
            effect.state.hoveredRowIndex = 0;

            effect.draw();

            expect(mockUniform1f).toHaveBeenCalledWith('u_vel', 3.5);
            expect(mockUniform1f).toHaveBeenCalledWith('u_rad', 400.0);
            expect(mockUniform1f).toHaveBeenCalledWith('u_oil_boost', 1.2);
            expect(mockUniform1f).toHaveBeenCalledWith('u_oil_blue', 0.7);
            effect.dispose();
        });

        it('should compile fragment shader with native iridescence boost and no separate spotlight beam layer', () => {
            const mockCreateShader = jest.fn(() => ({}));
            const mockShaderSource = jest.fn();
            const mockCompileShader = jest.fn();
            const mockGetShaderParameter = jest.fn(() => true);
            const mockCreateProgram = jest.fn(() => ({}));
            const mockGetProgramParameter = jest.fn(() => true);

            const glMock = {
                createShader: mockCreateShader,
                shaderSource: mockShaderSource,
                compileShader: mockCompileShader,
                getShaderParameter: mockGetShaderParameter,
                createProgram: mockCreateProgram,
                attachShader: jest.fn(),
                linkProgram: jest.fn(),
                getProgramParameter: mockGetProgramParameter,
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
            };

            const originalGetContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = jest.fn((ctxType) => {
                if (ctxType === 'webgl') {
                    return glMock;
                }
                return originalGetContext(ctxType);
            });

            const effect = new TableGlassEffect('.table-responsive-container', {
                rowHoverEffect: { enabled: true },
            });

            HTMLCanvasElement.prototype.getContext = originalGetContext;

            // Find the fragment shader source code passed to gl.shaderSource
            let fragmentShaderSource = '';
            for (let i = 0; i < mockShaderSource.mock.calls.length; i++) {
                const call = mockShaderSource.mock.calls[i];
                const src = call[1];
                if (src.includes('void main()') && src.includes('precision highp float;')) {
                    fragmentShaderSource = src;
                    break;
                }
            }

            expect(fragmentShaderSource).toBeTruthy();

            // The fragment shader should not contain separate spotlight beam/glow variables
            expect(fragmentShaderSource).not.toMatch(/beamLight/);
            expect(fragmentShaderSource).not.toMatch(/beamGlow/);
            expect(fragmentShaderSource).not.toMatch(/beamColor/);

            // Verify that fragmentShaderSource does not contain "specularHighlight" in color calculation
            expect(fragmentShaderSource).not.toMatch(/\+\s*specularHighlight/);

            // Verify that filmVisibility is natively boosted by spotlightIntensity within the oil film itself with u_oilBoostMultiplier uniform
            expect(fragmentShaderSource).toMatch(
                /filmVisibility\s*=\s*totalIntensity\s*\*\s*fresnelMod\s*\*\s*2\.0\s*\*\s*\(\s*1\.0\s*\+\s*spotlightIntensity\s*\*\s*u_oilBoostMultiplier\)/
            );

            // Verify that glassBlue vector and finalFilmColor mixing are present to make the spotlight bluer with u_oilBlueMixFactor uniform
            expect(fragmentShaderSource).toMatch(/glassBlue\s*=\s*vec3\(0\.2,\s*0\.5,\s*1\.0\)/);
            expect(fragmentShaderSource).toMatch(
                /finalFilmColor\s*=\s*mix\(\s*filmColor,\s*glassBlue,\s*spotlightIntensity\s*\*\s*u_oilBlueMixFactor\)/
            );

            // Verify that final color is computed natively from finalFilmColor * filmVisibility
            expect(fragmentShaderSource).toMatch(
                /color\s*=\s*finalFilmColor\s*\*\s*filmVisibility/
            );

            effect.dispose();
        });
    });
});
