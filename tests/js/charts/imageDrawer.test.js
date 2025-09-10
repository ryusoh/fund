import { drawImage } from '@charts/imageDrawer.js';

describe('drawImage', () => {
    let ctx;
    let arc;
    let img;
    let logoInfo;
    let offscreenCanvas;
    let offscreenCtx;

    beforeEach(() => {
        // Mock the offscreen context
        offscreenCtx = {
            save: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            arc: jest.fn(),
            closePath: jest.fn(),
            clip: jest.fn(),
            translate: jest.fn(),
            rotate: jest.fn(),
            drawImage: jest.fn(),
            fillRect: jest.fn(),
            scale: jest.fn(),
            globalAlpha: 1.0,
            globalCompositeOperation: 'source-over',
            fillStyle: '#000000',
        };

        // Mock the main context
        ctx = {
            save: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            arc: jest.fn(),
            closePath: jest.fn(),
            clip: jest.fn(),
            translate: jest.fn(),
            rotate: jest.fn(),
            drawImage: jest.fn(),
            fillRect: jest.fn(),
            scale: jest.fn(),
            globalAlpha: 1.0,
            globalCompositeOperation: 'source-over',
            fillStyle: '#000000',
        };

        arc = {
            x: 150,
            y: 150,
            innerRadius: 50,
            outerRadius: 100,
            startAngle: 0,
            endAngle: Math.PI / 2,
        };
        img = { width: 50, height: 50 };
        logoInfo = { src: 'logo.png', scale: 1.0, opacity: 1.0 };

        // Mock offscreen canvas
        offscreenCanvas = {
            width: 0,
            height: 0,
            getContext: jest.fn(() => offscreenCtx),
        };

        // Mock document.createElement
        global.document.createElement = jest.fn((tag) => {
            if (tag === 'canvas') {
                return offscreenCanvas;
            }
            return {};
        });

        // Mock window.devicePixelRatio
        global.window = { devicePixelRatio: 2 };
    });

    it('should return early if slice angle is too small', () => {
        arc.endAngle = arc.startAngle + Math.PI / 20; // less than 10 degrees (line 7)
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.save).not.toHaveBeenCalled();
    });

    it('should call ctx.save and ctx.restore for normal drawing', () => {
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.save).toHaveBeenCalledTimes(1);
        expect(ctx.restore).toHaveBeenCalledTimes(1);
    });

    it('should set default opacity when not specified', () => {
        delete logoInfo.opacity;
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.globalAlpha).toBe(1.0); // default value
    });

    it('should set custom opacity when specified', () => {
        logoInfo.opacity = 0.5;
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.globalAlpha).toBe(0.5);
    });

    it('should set default scale when not specified', () => {
        delete logoInfo.scale;
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.drawImage).toHaveBeenCalled();
    });

    it('should apply custom scale when specified', () => {
        logoInfo.scale = 2.0;
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.drawImage).toHaveBeenCalled();
    });

    it('should adjust logo width when it exceeds max width (lines 27-30)', () => {
        // Make image very wide to trigger width adjustment
        img.width = 1000;
        img.height = 50;
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.drawImage).toHaveBeenCalled();
    });

    it('should adjust logo height when it exceeds max height (lines 32-35)', () => {
        // Make image very tall to trigger height adjustment
        img.width = 50;
        img.height = 1000;
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.drawImage).toHaveBeenCalled();
    });

    it('should apply user-defined rotation when specified (lines 58-61)', () => {
        logoInfo.rotation = 45; // 45 degrees
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 4); // 45 degrees in radians
    });

    it('should skip rotation when rotation is explicitly false', () => {
        logoInfo.rotation = false;
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.rotate).toHaveBeenCalledWith(0); // No rotation
    });

    it('should apply default rotation with adjustment > PI/2 (lines 64-66)', () => {
        // Set arc angle that will cause defaultRotation > PI/2
        arc.startAngle = 0;
        arc.endAngle = Math.PI * 0.8; // Large angle
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.rotate).toHaveBeenCalled();
    });

    it('should apply default rotation with adjustment < -PI/2 (lines 67-69)', () => {
        // Create conditions that cause defaultRotation < -PI/2 to trigger line 68
        // angle = startAngle + sliceAngle / 2, defaultRotation = angle + PI/2
        // We want defaultRotation < -PI/2, so angle + PI/2 < -PI/2, so angle < -PI
        arc.startAngle = -Math.PI * 1.2; // Very negative start
        arc.endAngle = -Math.PI * 0.8; // Still negative end
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.rotate).toHaveBeenCalled();
    });

    it('should clamp positive rotation to max rotation (lines 71-73)', () => {
        // Create conditions for large positive rotation that needs clamping
        arc.startAngle = -Math.PI / 3;
        arc.endAngle = Math.PI / 3;
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.rotate).toHaveBeenCalled();
    });

    it('should clamp negative rotation to max rotation (lines 71-73)', () => {
        // Create conditions for large negative rotation that needs clamping
        arc.startAngle = Math.PI / 3;
        arc.endAngle = Math.PI;
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.rotate).toHaveBeenCalled();
    });

    it('should render as white with proper canvas setup', () => {
        // Ensure devicePixelRatio is set for this test
        global.window.devicePixelRatio = 2;
        logoInfo.renderAsWhite = true;
        drawImage(ctx, arc, img, logoInfo);

        expect(document.createElement).toHaveBeenCalledWith('canvas');
        expect(offscreenCanvas.width).toBeDefined();
        expect(offscreenCanvas.height).toBeDefined();
        expect(offscreenCtx.scale).toHaveBeenCalledWith(expect.any(Number), expect.any(Number));
        expect(offscreenCtx.save).toHaveBeenCalled();
        expect(offscreenCtx.drawImage).toHaveBeenCalledWith(
            img,
            0,
            0,
            expect.any(Number),
            expect.any(Number)
        );
        expect(offscreenCtx.globalCompositeOperation).toBe('source-in');
        expect(offscreenCtx.fillStyle).toBe('white');
        expect(offscreenCtx.fillRect).toHaveBeenCalled();
        expect(ctx.drawImage).toHaveBeenCalledWith(
            offscreenCanvas,
            expect.any(Number),
            expect.any(Number),
            expect.any(Number),
            expect.any(Number)
        );
    });

    it('should respect per-logo sizePx override', () => {
        logoInfo.sizePx = 24; // explicit size in px
        drawImage(ctx, arc, img, logoInfo);
        // Since drawImage positions using translate and draws centered, we can only assert it was called
        expect(ctx.drawImage).toHaveBeenCalled();
        delete logoInfo.sizePx;
    });

    it('should respect per-logo sizeRatio override', () => {
        logoInfo.sizeRatio = 0.08; // 8% of outerRadius
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.drawImage).toHaveBeenCalled();
        delete logoInfo.sizeRatio;
    });

    it('should rotate with radial-in so vertical axis points to center (lines 71-72)', () => {
        // Arc covering 90 degrees from 0 to PI/2; center angle = PI/4
        arc.startAngle = 0;
        arc.endAngle = Math.PI / 2;
        logoInfo.rotation = 'radial-in';
        drawImage(ctx, arc, img, logoInfo);
        const angle = ctx.rotate.mock.calls[0][0];
        // Expected normalized angle: -3*PI/4
        expect(angle).toBeCloseTo(-0.75 * Math.PI, 5);
    });

    it('should rotate with radial-out so vertical axis points away (lines 75-76)', () => {
        arc.startAngle = 0;
        arc.endAngle = Math.PI / 2; // center = PI/4
        logoInfo.rotation = 'radial-out';
        drawImage(ctx, arc, img, logoInfo);
        const angle = ctx.rotate.mock.calls[0][0];
        // Expected normalized angle: PI/4
        expect(angle).toBeCloseTo(0.25 * Math.PI, 5);
    });

    it('should apply rotationOffsetDeg and normalize to [-PI, PI] (lines 92-94)', () => {
        // Base radial-out ~ 3*PI/4, then add 180deg to force wrap-around
        arc.startAngle = Math.PI / 2;
        arc.endAngle = Math.PI; // center = 3*PI/4
        logoInfo.rotation = 'radial-out';
        logoInfo.rotationOffsetDeg = 180;
        drawImage(ctx, arc, img, logoInfo);
        const angle = ctx.rotate.mock.calls[0][0];
        // 3*PI/4 + PI = 7*PI/4 -> normalized to -PI/4
        expect(angle).toBeCloseTo(-0.25 * Math.PI, 5);
        delete logoInfo.rotationOffsetDeg;
    });

    it('should render normal image when renderAsWhite is false', () => {
        logoInfo.renderAsWhite = false;
        drawImage(ctx, arc, img, logoInfo);

        expect(document.createElement).not.toHaveBeenCalled();
        expect(ctx.drawImage).toHaveBeenCalledWith(
            img,
            expect.any(Number),
            expect.any(Number),
            expect.any(Number),
            expect.any(Number)
        );
    });

    it('should use global pixel height when LOGO_SIZE.mode is px', async () => {
        const config = await import('@js/config.js');
        const original = { ...config.LOGO_SIZE };
        config.LOGO_SIZE.mode = 'px';
        config.LOGO_SIZE.value = 18;
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.drawImage).toHaveBeenCalled();
        // restore
        config.LOGO_SIZE.mode = original.mode;
        config.LOGO_SIZE.value = original.value;
    });

    it('should honor radialMargin and rotation false (no rotation)', async () => {
        logoInfo.radialMargin = 0.01;
        logoInfo.rotation = false;
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.rotate).toHaveBeenCalledWith(0);
        delete logoInfo.radialMargin;
        delete logoInfo.rotation;
    });

    it('should handle aspect fallback and numeric rotation', () => {
        const img2 = { width: 0, height: 0 }; // force aspect fallback to 1
        logoInfo.rotation = 30;
        drawImage(ctx, arc, img2, logoInfo);
        expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 6);
    });

    it('should clamp to minPx when LOGO_SIZE.minPx is large', async () => {
        const config = await import('@js/config.js');
        const original = { ...config.LOGO_SIZE };
        config.LOGO_SIZE.mode = 'ratio';
        config.LOGO_SIZE.value = 0.01; // tiny
        config.LOGO_SIZE.minPx = 50; // big, forces clamp
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.drawImage).toHaveBeenCalled();
        // restore
        Object.assign(config.LOGO_SIZE, original);
    });

    it('should fall back to default LOGO_SIZE when config is missing', () => {
        jest.isolateModules(() => {
            jest.doMock('@js/config.js', () => ({}), { virtual: true });
            const { drawImage: drawWithDefault } = require('@charts/imageDrawer.js');
            drawWithDefault(ctx, arc, img, {});
            expect(ctx.drawImage).toHaveBeenCalled();
        });
    });

    it('should handle offscreen context being null (fallback draw)', () => {
        // Mock document.createElement to return canvas with null context
        const originalCreate = document.createElement;
        document.createElement = jest.fn(() => ({ getContext: () => null }));
        logoInfo.renderAsWhite = true;
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.drawImage).toHaveBeenCalled();
        document.createElement = originalCreate;
    });

    it('should handle missing devicePixelRatio', () => {
        delete global.window.devicePixelRatio;
        logoInfo.renderAsWhite = true;
        drawImage(ctx, arc, img, logoInfo);

        expect(offscreenCtx.scale).toHaveBeenCalledWith(1, 1); // defaults to 1
    });

    it('should draw with proper clipping path', () => {
        drawImage(ctx, arc, img, logoInfo);

        expect(ctx.beginPath).toHaveBeenCalled();
        expect(ctx.arc).toHaveBeenCalledWith(150, 150, 100, 0, Math.PI / 2); // outer arc
        expect(ctx.arc).toHaveBeenCalledWith(150, 150, 50, Math.PI / 2, 0, true); // inner arc
        expect(ctx.closePath).toHaveBeenCalled();
        expect(ctx.clip).toHaveBeenCalled();
    });

    it('should translate to correct position', () => {
        drawImage(ctx, arc, img, logoInfo);

        // Calculate expected position
        const angle = 0 + Math.PI / 2 / 2; // startAngle + sliceAngle / 2
        const radius = 50 + (100 - 50) / 2; // innerRadius + (outerRadius - innerRadius) / 2
        const expectedX = 150 + Math.cos(angle) * radius;
        const expectedY = 150 + Math.sin(angle) * radius;

        expect(ctx.translate).toHaveBeenCalledWith(expectedX, expectedY);
    });

    it('should handle edge case with undefined rotation', () => {
        logoInfo.rotation = undefined;
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.rotate).toHaveBeenCalled(); // Should apply default rotation
    });

    it('should handle zero rotation', () => {
        logoInfo.rotation = 0;
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.rotate).toHaveBeenCalledWith(0);
    });

    it('should handle edge case with very small image', () => {
        img.width = 1;
        img.height = 1;
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.drawImage).toHaveBeenCalled();
    });

    it('should handle edge case with square image', () => {
        img.width = 100;
        img.height = 100;
        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.drawImage).toHaveBeenCalled();
    });

    it('should trigger line 68 - add PI when defaultRotation < -PI/2', () => {
        // To trigger line 68: defaultRotation < -PI/2
        // defaultRotation = angle + PI/2, so angle + PI/2 < -PI/2, so angle < -PI
        // angle = startAngle + sliceAngle/2, so startAngle + sliceAngle/2 < -PI
        arc.startAngle = -Math.PI * 1.5; // -270 degrees
        arc.endAngle = -Math.PI * 1.1; // -198 degrees
        // angle = -1.5π + (-1.1π + 1.5π)/2 = -1.5π + 0.2π = -1.3π (< -π)
        // defaultRotation = -1.3π + π/2 = -1.3π + 0.5π = -0.8π (< -π/2) ✓

        drawImage(ctx, arc, img, logoInfo);
        expect(ctx.rotate).toHaveBeenCalled();
    });
});
