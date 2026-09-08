/**
 * The custom cursor eases toward the pointer with an exponential lerp. If the
 * ease alpha is applied per frame without scaling by elapsed time, the chase
 * speed becomes proportional to the frame rate: any jank (repaint-heavy pages
 * at high browser zoom, e.g. /calendar/) makes the cursor crawl. These tests
 * pin the easing to wall time — at half the frame rate the cursor must still
 * converge in the same number of milliseconds.
 */

/* eslint no-undef: "off" */

describe('CustomCursor frame-rate independent easing', () => {
    let CustomCursor;
    let originalMatchMedia;
    let originalRaf;
    let originalCancelRaf;
    let rafCallback;

    const FPS_60_MS = 1000 / 60;

    const driveFrames = (frameMs, count) => {
        let t = 0;
        for (let i = 0; i < count; i++) {
            t += frameMs;
            const cb = rafCallback;
            rafCallback = null;
            cb(t);
        }
    };

    beforeAll(async () => {
        // jsdom defines ontouchstart, which marks the environment as a touch
        // device and makes CustomCursor a no-op. Remove it before import.
        delete window.ontouchstart;
        originalMatchMedia = window.matchMedia;
        window.matchMedia = jest.fn().mockImplementation((query) => ({
            matches: false,
            media: query,
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            addListener: jest.fn(),
            removeListener: jest.fn(),
        }));
        window.gsap = { set: jest.fn() };
        ({ CustomCursor } = await import('../../../js/vendor/cursor.js'));
    });

    afterAll(() => {
        window.matchMedia = originalMatchMedia;
        delete window.gsap;
    });

    beforeEach(() => {
        document.body.innerHTML = '';
        originalRaf = window.requestAnimationFrame;
        originalCancelRaf = window.cancelAnimationFrame;
        rafCallback = null;
        window.requestAnimationFrame = jest.fn((cb) => {
            rafCallback = cb;
            return 1;
        });
        window.cancelAnimationFrame = jest.fn();
    });

    afterEach(() => {
        window.requestAnimationFrame = originalRaf;
        window.cancelAnimationFrame = originalCancelRaf;
    });

    const createCursor = () => new CustomCursor({ root: document.body, hoverTargets: '.none' });

    test('converges within the same wall time at 30fps as at 60fps', () => {
        const cursor = createCursor();
        cursor.coords.x.current = 1000;
        cursor.coords.x.value = 0;

        // 500ms at 30fps: with a fixed per-frame alpha this only advances 15
        // frames (0.6^15 ≈ 4.7e-4 remaining); time-scaled easing advances the
        // full 500ms (0.6^30 ≈ 2.2e-7 remaining).
        driveFrames(1000 / 30, 15);
        expect(cursor.coords.x.value).toBeGreaterThan(1000 * (1 - 1e-5));

        cursor.destroy();
    });

    test('still converges normally at 60fps', () => {
        const cursor = createCursor();
        cursor.coords.x.current = 1000;
        cursor.coords.x.value = 0;

        driveFrames(FPS_60_MS, 30);
        expect(cursor.coords.x.value).toBeGreaterThan(1000 * (1 - 1e-5));

        cursor.destroy();
    });

    test('first frame after init uses a single 60fps-frame step', () => {
        const cursor = createCursor();
        cursor.coords.x.current = 1000;
        cursor.coords.x.value = 0;

        driveFrames(FPS_60_MS, 1);
        // followEase defaults to 0.4: one frame at 60fps moves 40% of the gap
        expect(cursor.coords.x.value).toBeCloseTo(400, 0);

        cursor.destroy();
    });
});
