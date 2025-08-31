import { waveAnimationPlugin } from '@plugins/waveAnimationPlugin.js';

describe('waveAnimationPlugin', () => {
    let mockChart;
    let mockCanvas;
    let originalRequestAnimationFrame;
    let originalCancelAnimationFrame;
    let animationFrameCallback;
    let animateCallback;

    beforeEach(() => {
        originalRequestAnimationFrame = global.requestAnimationFrame;
        originalCancelAnimationFrame = global.cancelAnimationFrame;

        global.requestAnimationFrame = jest.fn((callback) => {
            animationFrameCallback = callback;
            animateCallback = callback;
            return 1;
        });
        global.cancelAnimationFrame = jest.fn();

        mockCanvas = document.createElement('canvas');
        document.body.appendChild(mockCanvas);

        mockChart = {
            config: { type: 'doughnut' },
            canvas: mockCanvas,
            width: 400,
            height: 400,
            getDatasetMeta: jest.fn(() => ({
                data: [{ outerRadius: 100, innerRadius: 50, x: 200, y: 200 }],
            })),
            ctx: {
                save: jest.fn(),
                restore: jest.fn(),
                beginPath: jest.fn(),
                rect: jest.fn(),
                arc: jest.fn(),
                clip: jest.fn(),
                fill: jest.fn(),
                fillStyle: '',
            },
            draw: jest.fn(),
        };
    });

    afterEach(() => {
        global.requestAnimationFrame = originalRequestAnimationFrame;
        global.cancelAnimationFrame = originalCancelAnimationFrame;
        if (mockCanvas.parentNode) {
            document.body.removeChild(mockCanvas);
        }
        jest.clearAllMocks();
    });

    it('should have the correct ID', () => {
        expect(waveAnimationPlugin.id).toBe('waveCenterAnimation');
    });

    it('should initialize waveAnimation state in beforeInit', () => {
        waveAnimationPlugin.beforeInit(mockChart);

        expect(mockChart.waveAnimation).toBeDefined();
        expect(mockChart.waveAnimation.waves).toEqual([]);
        expect(mockChart.waveAnimation.lastSpawnTime).toBe(0);
        expect(mockChart.waveAnimation.animationFrameId).toBeNull();
        expect(mockChart.waveAnimation.config).toBeDefined();
    });

    it('should stop animation in afterDestroy', () => {
        mockChart.waveAnimation = {
            animationFrameId: 123,
            waves: [],
            lastSpawnTime: 0,
            config: {},
        };

        waveAnimationPlugin.afterDestroy(mockChart);

        expect(global.cancelAnimationFrame).toHaveBeenCalledWith(123);
        expect(mockChart.waveAnimation.animationFrameId).toBeNull();
    });

    it('should return early for non-doughnut charts', () => {
        mockChart.config.type = 'bar';
        mockChart.waveAnimation = { waves: [] };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});

        expect(mockChart.ctx.save).not.toHaveBeenCalled();
    });

    it('should start animation when outerRadius > 0 and no animation running', () => {
        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: { BASE_COLOR_RGB_TRIPLET: '255, 0, 0' },
        };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});

        expect(global.requestAnimationFrame).toHaveBeenCalled();
    });

    it('should stop animation when outerRadius <= 0 and no waves', () => {
        mockChart.getDatasetMeta.mockReturnValue({
            data: [{ outerRadius: 0, x: 200, y: 200 }],
        });
        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: 123,
            config: { BASE_COLOR_RGB_TRIPLET: '255, 0, 0' },
        };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});

        expect(global.cancelAnimationFrame).toHaveBeenCalledWith(123);
    });

    it('should draw waves when they exist', () => {
        mockChart.waveAnimation = {
            waves: [{ radius: 150, opacity: 0.3, targetRadius: 200 }],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: { BASE_COLOR_RGB_TRIPLET: '255, 0, 0' },
        };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});

        expect(mockChart.ctx.save).toHaveBeenCalled();
        expect(mockChart.ctx.restore).toHaveBeenCalled();
    });

    it('should handle animation frame callback - stop when canvas removed', () => {
        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: {
                MAX_WAVES: 3,
                SPAWN_INTERVAL: 100,
                SPEED: 2,
                EXPANSION_DISTANCE: 50,
                SPAWN_OPACITY: 0.8,
                TARGET_OPACITY_FADE: 0.01,
                BASE_COLOR_RGB_TRIPLET: '255, 0, 0',
            },
        };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});
        // Remove canvas from DOM to trigger stop condition
        document.body.removeChild(mockCanvas);
        mockChart.canvas = null;
        if (animationFrameCallback) {
            animationFrameCallback();
        }
        expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should spawn waves when conditions are met', () => {
        const mockDateNow = jest.spyOn(Date, 'now').mockReturnValue(1000);
        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: {
                MAX_WAVES: 3,
                SPAWN_INTERVAL: 100,
                SPEED: 2,
                EXPANSION_DISTANCE: 50,
                SPAWN_OPACITY: 0.8,
                TARGET_OPACITY_FADE: 0.01,
                BASE_COLOR_RGB_TRIPLET: '255, 0, 0',
                spawnOpacity: 0.8,
            },
        };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});
        if (animateCallback) {
            animateCallback();
        }
        expect(mockChart.waveAnimation.waves.length).toBeGreaterThan(0);
        mockDateNow.mockRestore();
    });

    it('should handle waves with missing spawnRadius', () => {
        mockChart.waveAnimation = {
            waves: [{ radius: 100, opacity: 0.8, targetRadius: 150 }],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: {
                MAX_WAVES: 3,
                SPAWN_INTERVAL: 100,
                SPEED: 2,
                EXPANSION_DISTANCE: 50,
                SPAWN_OPACITY: 0.8,
                TARGET_OPACITY_FADE: 0.01,
                BASE_COLOR_RGB_TRIPLET: '255, 0, 0',
            },
        };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});
        if (animateCallback) {
            animateCallback();
        }
        expect(mockChart.draw).toHaveBeenCalled();
    });

    it('should handle zero EXPANSION_DISTANCE', () => {
        mockChart.waveAnimation = {
            waves: [{ radius: 100, opacity: 0.8, targetRadius: 150, spawnRadius: 100 }],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: {
                MAX_WAVES: 3,
                SPAWN_INTERVAL: 100,
                SPEED: 2,
                EXPANSION_DISTANCE: 0,
                SPAWN_OPACITY: 0.8,
                TARGET_OPACITY_FADE: 0.01,
                BASE_COLOR_RGB_TRIPLET: '255, 0, 0',
            },
        };
        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});
        if (animateCallback) {
            animateCallback();
        }
        expect(mockChart.waveAnimation.waves.length).toBe(0);
    });

    it('should stop when no active waves and cannot spawn', () => {
        mockChart.getDatasetMeta.mockReturnValue({ data: [{ outerRadius: 0, x: 200, y: 200 }] });
        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: {
                MAX_WAVES: 3,
                SPAWN_INTERVAL: 100,
                SPEED: 2,
                EXPANSION_DISTANCE: 50,
                SPAWN_OPACITY: 0.8,
                TARGET_OPACITY_FADE: 0.01,
                BASE_COLOR_RGB_TRIPLET: '255, 0, 0',
            },
        };
        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});
        if (animateCallback) {
            animateCallback();
        }
        expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should hit line 37: stop when outerRadius>0 but MAX_WAVES=0 and no waves', () => {
        let rafId = 0;
        global.requestAnimationFrame = jest.fn((callback) => {
            animationFrameCallback = callback;
            return ++rafId; // non-zero id
        });

        mockChart.getDatasetMeta.mockReturnValue({ data: [{ outerRadius: 50, x: 100, y: 100 }] });
        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: {
                MAX_WAVES: 0, // prevent spawning
                SPAWN_INTERVAL: 1000,
                SPEED: 1,
                EXPANSION_DISTANCE: 10,
                SPAWN_OPACITY: 0.5,
                TARGET_OPACITY_FADE: 0.1,
                BASE_COLOR_RGB_TRIPLET: '0, 0, 0',
                spawnOpacity: 0.5,
            },
        };

        // Start animation
        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});

        // First frame: should find outerRadius>0 but cannot spawn (MAX_WAVES=0), waves.length stays 0
        if (animationFrameCallback) {
            animationFrameCallback();
        }

        // Should stop the animation inside the else branch at line 37
        expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should cover forceStartAnimation positive path and animate (lines 112 and 30)', () => {
        let rafCalled = false;
        let cb112;
        global.requestAnimationFrame = jest.fn((cb) => {
            rafCalled = true;
            cb112 = cb;
            return 1;
        });

        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: {
                BASE_COLOR_RGB_TRIPLET: '0,0,0',
                MAX_WAVES: 2,
                SPAWN_INTERVAL: 10,
                SPEED: 1,
                EXPANSION_DISTANCE: 10,
                SPAWN_OPACITY: 0.5,
                TARGET_OPACITY_FADE: 0.1,
                spawnOpacity: 0.5,
            },
        };

        // Need a valid outerRadius so animate() runs past early-return and hits updateWaveState (line 30)
        mockChart.getDatasetMeta.mockReturnValue({ data: [{ outerRadius: 40, x: 100, y: 100 }] });
        waveAnimationPlugin.forceStartAnimation(mockChart);
        expect(rafCalled).toBe(true);
        // Invoke the animation callback once to exercise line 30
        const mockNow = jest.spyOn(Date, 'now').mockReturnValue(1000);
        if (cb112) {
            cb112();
        }
        // updateWaveState should have set lastSpawnTime due to spawn conditions
        expect(mockChart.waveAnimation.lastSpawnTime).toBe(1000);
        mockNow.mockRestore();
    });

    it('should exercise line 30 false branch: start with outerRadius>0 then run with 0 and waves present', () => {
        let cb;
        global.requestAnimationFrame = jest.fn((callback) => {
            cb = callback;
            return 1;
        });

        // Start with outerRadius > 0 so _startWaveAnimation is invoked
        mockChart.getDatasetMeta.mockReturnValue({ data: [{ outerRadius: 50, x: 100, y: 100 }] });
        mockChart.waveAnimation = {
            waves: [{ radius: 5, opacity: 0.5, targetRadius: 20, spawnRadius: 5 }],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: {
                MAX_WAVES: 1,
                SPAWN_INTERVAL: 1000,
                SPEED: 1,
                EXPANSION_DISTANCE: 10,
                SPAWN_OPACITY: 0.5,
                TARGET_OPACITY_FADE: 0.1,
                BASE_COLOR_RGB_TRIPLET: '0, 0, 0',
                spawnOpacity: 0.5,
            },
        };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});
        // Now switch to outerRadius 0 for the animation frame to hit the ternary false branch
        mockChart.getDatasetMeta.mockReturnValue({ data: [{ outerRadius: 0, x: 100, y: 100 }] });
        mockChart.draw.mockClear();
        if (cb) {
            cb();
        }
        expect(mockChart.draw).toHaveBeenCalled();
    });

    it('should cover forceStartAnimation false branch: no waveAnimation (line 112)', () => {
        let rafCalled = false;
        global.requestAnimationFrame = jest.fn(() => {
            rafCalled = true;
            return 1;
        });
        mockChart.waveAnimation = null;
        waveAnimationPlugin.forceStartAnimation(mockChart);
        expect(rafCalled).toBe(false);
    });

    it('should cover forceStartAnimation early return when already running (line 7)', () => {
        let rafCalled = false;
        global.requestAnimationFrame = jest.fn(() => {
            rafCalled = true;
            return 1;
        });

        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: 999, // already running
            config: { BASE_COLOR_RGB_TRIPLET: '0,0,0' },
        };

        waveAnimationPlugin.forceStartAnimation(mockChart);
        expect(rafCalled).toBe(false);
    });

    it('should cover updateWaveState path (line 30) by running animate with outerRadius>0', () => {
        let cb;
        global.requestAnimationFrame = jest.fn((callback) => {
            cb = callback;
            return 1;
        });

        mockChart.getDatasetMeta.mockReturnValue({ data: [{ outerRadius: 80, x: 100, y: 100 }] });
        mockChart.waveAnimation = {
            waves: [{ radius: 10, opacity: 0.5, targetRadius: 50, spawnRadius: 10 }],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: {
                MAX_WAVES: 2,
                SPAWN_INTERVAL: 100,
                SPEED: 1,
                EXPANSION_DISTANCE: 20,
                SPAWN_OPACITY: 0.8,
                TARGET_OPACITY_FADE: 0.01,
                BASE_COLOR_RGB_TRIPLET: '0, 0, 0',
                spawnOpacity: 0.8,
            },
        };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});
        expect(typeof cb).toBe('function');
        mockChart.draw.mockClear();
        if (cb) {
            cb();
        }
        // draw() is called after updateWaveState, indicating line 30 path executed
        expect(mockChart.draw).toHaveBeenCalled();
    });

    it('should cover updateWaveState early return with null animState (line 53)', () => {
        let cb;
        global.requestAnimationFrame = jest.fn((callback) => {
            cb = callback;
            return 1;
        });

        mockChart.getDatasetMeta.mockReturnValue({ data: [{ outerRadius: 60, x: 100, y: 100 }] });
        mockChart.waveAnimation = {
            waves: [{ radius: 10, opacity: 0.5, targetRadius: 50, spawnRadius: 10 }],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: {
                MAX_WAVES: 2,
                SPAWN_INTERVAL: 100,
                SPEED: 1,
                EXPANSION_DISTANCE: 20,
                SPAWN_OPACITY: 0.8,
                TARGET_OPACITY_FADE: 0.01,
                BASE_COLOR_RGB_TRIPLET: '0, 0, 0',
                spawnOpacity: 0.8,
            },
        };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});
        // Null out waveAnimation before running animate to hit the guard inside updateWaveState
        mockChart.waveAnimation = null;
        mockChart.draw.mockClear();
        if (cb) {
            cb();
        }
        // draw() still called after updateWaveState returns early
        expect(mockChart.draw).toHaveBeenCalled();
    });

    it('should not start animation if already running', () => {
        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: 999,
            config: { BASE_COLOR_RGB_TRIPLET: '255, 0, 0' },
        };
        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});
        expect(global.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('should handle empty meta data array during animation', () => {
        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: { BASE_COLOR_RGB_TRIPLET: '255, 0, 0' },
        };
        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});
        mockChart.getDatasetMeta.mockReturnValue({ data: [] });
        if (animateCallback) {
            animateCallback();
        }
        expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should handle _stopWaveAnimation defensive guard (line 45)', () => {
        const chart = {
            waveAnimation: null, // This will trigger the defensive guard
        };

        // This should not throw an error
        expect(() => {
            waveAnimationPlugin.afterDestroy(chart);
        }).not.toThrow();
    });

    it('should handle missing chart metadata with fallbacks (lines 122-123)', () => {
        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: { BASE_COLOR_RGB_TRIPLET: '255, 0, 0' },
        };

        // Mock chart with missing metadata to trigger optional chaining fallbacks
        mockChart.getDatasetMeta = jest.fn(() => ({
            data: [{}], // Empty object without x, y properties
        }));

        const args = { index: 0 };
        const options = {};

        // This should handle the missing x, y gracefully with || 0 fallbacks
        expect(() => {
            waveAnimationPlugin.beforeDatasetsDraw(mockChart, args, options);
        }).not.toThrow();

        // Should use fallback values of 0 for centerX and centerY
        expect(mockChart.ctx.save).toHaveBeenCalled();
    });
});
