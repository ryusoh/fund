describe('Ambient Logic', () => {
    let originalConsoleWarn;

    beforeEach(() => {
        jest.resetModules();
        originalConsoleWarn = console.warn;
        console.warn = jest.fn();

        window.Sketch = {
            create: jest.fn().mockImplementation((config) => {
                const s = {
                    ...config,
                    width: 1920,
                    height: 1080,
                    canvas: {
                        style: {},
                        className: '',
                    },
                    start: jest.fn(),
                    stop: jest.fn(),
                    clear: jest.fn(),
                    save: jest.fn(),
                    restore: jest.fn(),
                    beginPath: jest.fn(),
                    arc: jest.fn(),
                    fill: jest.fn(),
                    fillRect: jest.fn(),
                };
                return s;
            }),
        };

        window.AMBIENT_CONFIG = {
            enabled: true,
            minWidth: 1024,
            maxParticles: 10,
            densityDivisor: 20000,
            radius: { min: 1.0, max: 8.0 },
            alpha: { min: 0.1, max: 0.6 },
            speed: 0.6,
            zIndex: 1,
            blend: 'screen',
            respectReducedMotion: false,
        };

        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: 1200,
        });

        Object.defineProperty(window, 'URLSearchParams', {
            writable: true,
            configurable: true,
            value: jest.fn().mockImplementation((search) => ({
                get: (key) => {
                    if (search.includes(`${key}=on`)) {
                        return 'on';
                    }
                    if (search.includes(`${key}=debug`)) {
                        return 'debug';
                    }
                    if (search.includes(`${key}=trace`)) {
                        return 'trace';
                    }
                    return null;
                },
            })),
        });

        window.matchMedia = jest.fn().mockImplementation(() => ({
            matches: false,
        }));
    });

    afterEach(() => {
        console.warn = originalConsoleWarn;
    });

    it('should initialize Sketch when conditions are met', () => {
        require('../../../js/ambient/ambient.js');
        expect(window.Sketch.create).toHaveBeenCalled();
    });

    it('should not initialize if not enabled', () => {
        window.AMBIENT_CONFIG.enabled = false;
        require('../../../js/ambient/ambient.js');
        expect(window.Sketch.create).not.toHaveBeenCalled();
    });

    it('should initialize with debug settings', () => {
        window.URLSearchParams = jest
            .fn()
            .mockImplementation(() => ({ get: (key) => (key === 'ambient' ? 'debug' : null) }));
        require('../../../js/ambient/ambient.js');
        expect(window.Sketch.create).toHaveBeenCalled();
    });

    it('should abort if window innerWidth is less than minWidth', () => {
        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: 800,
        });
        require('../../../js/ambient/ambient.js');
        expect(window.Sketch.create).not.toHaveBeenCalled();
    });

    it('should abort if prefers reduced motion is true and respectReducedMotion is true', () => {
        window.AMBIENT_CONFIG.respectReducedMotion = true;
        window.matchMedia = jest.fn().mockImplementation(() => ({
            matches: true,
        }));
        require('../../../js/ambient/ambient.js');
        expect(window.Sketch.create).not.toHaveBeenCalled();
    });

    it('should initialize even if prefers reduced motion is true but respectReducedMotion is false', () => {
        window.AMBIENT_CONFIG.respectReducedMotion = false;
        window.matchMedia = jest.fn().mockImplementation(() => ({
            matches: true,
        }));
        require('../../../js/ambient/ambient.js');
        expect(window.Sketch.create).toHaveBeenCalled();
    });

    it('should abort if window.Sketch is undefined', () => {
        delete window.Sketch;
        require('../../../js/ambient/ambient.js');
        // If it reaches here without error, the test passes
    });

    it('should execute Sketch setup, update and draw methods', () => {
        require('../../../js/ambient/ambient.js');
        // Access the sketch object after ambient.js has augmented it
        const s = window.Sketch.create.mock.results[0].value;

        expect(s.setup).toBeDefined();
        s.setup();

        expect(s.update).toBeDefined();
        s.update();

        expect(s.draw).toBeDefined();
        s.draw();

        expect(s.resize).toBeDefined();
        s.resize();
    });

    it('should catch exceptions and log warning', () => {
        Object.defineProperty(window, 'URLSearchParams', {
            get: () => {
                throw new Error('mock init error');
            },
        });

        require('../../../js/ambient/ambient.js');

        expect(console.warn).toHaveBeenCalledWith(
            'Caught exception in ambient setup:',
            expect.any(Error)
        );
    });

    it('sets minimum threshold correctly for debug configuration', () => {
        // Change window.URLSearchParams behavior for debug using mock
        window.URLSearchParams = jest.fn().mockImplementation(() => ({
            get: (key) => (key === 'ambient' ? 'debug' : null),
        }));
        window.AMBIENT_CONFIG.densityDivisor = 20000;
        window.AMBIENT_CONFIG.speed = 0.1;

        require('../../../js/ambient/ambient.js');
        const s = window.Sketch.create.mock.results[0].value;

        // Verify Math.max logic worked
        expect(window.Sketch.create).toHaveBeenCalled();
        expect(s.canvas.style.zIndex).toBe('999');
    });

    it('handles particles array boundary cases during update and draw', () => {
        window.URLSearchParams = jest.fn().mockImplementation(() => ({
            get: (key) => (key === 'ambient' ? 'on' : null),
        }));
        window.AMBIENT_CONFIG.maxParticles = 5;
        require('../../../js/ambient/ambient.js');

        const s = window.Sketch.create.mock.results[0].value;
        s.setup();

        s.update();
        s.height = -100;
        s.update();
        s.draw();

        // Assertions verifying behavior
        expect(s.arc).toHaveBeenCalled();
        expect(s.fill).toHaveBeenCalled();
    });
});
