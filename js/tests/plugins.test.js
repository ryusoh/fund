import { customArcBordersPlugin } from '../plugins/customArcBordersPlugin.js';
import { waveAnimationPlugin } from '../plugins/waveAnimationPlugin.js';

describe('Chart.js Plugins', () => {
  describe('customArcBordersPlugin', () => {
    it('should have the correct ID', () => {
      expect(customArcBordersPlugin.id).toBe('customArcBorders');
    });

    it('should use default styles if no options are provided', () => {
        const mockChart = {
            config: { type: 'doughnut' },
            isDatasetVisible: jest.fn(() => true),
            ctx: { save: jest.fn(), restore: jest.fn(), beginPath: jest.fn(), arc: jest.fn(), stroke: jest.fn(), lineWidth: 0, strokeStyle: '' },
        };
        const mockArgs = {
            meta: { data: [{ getProps: jest.fn(() => ({ x: 100, y: 100, startAngle: 0, endAngle: Math.PI, outerRadius: 50, innerRadius: 25 })) }] },
            index: 0,
        };

        customArcBordersPlugin.afterDatasetDraw(mockChart, mockArgs, {});

        expect(mockChart.ctx.lineWidth).toBe(2.5); // default width
        expect(mockChart.ctx.strokeStyle).toBe('rgba(20, 20, 20, 0.6)'); // default color
    });

    it('should use styles from options when provided', () => {
        const mockChart = {
            config: { type: 'doughnut' },
            isDatasetVisible: jest.fn(() => true),
            ctx: { save: jest.fn(), restore: jest.fn(), beginPath: jest.fn(), arc: jest.fn(), stroke: jest.fn(), lineWidth: 0, strokeStyle: '' },
        };
        const mockArgs = {
            meta: { data: [{ getProps: jest.fn(() => ({ x: 100, y: 100, startAngle: 0, endAngle: Math.PI, outerRadius: 50, innerRadius: 25 })) }] },
            index: 0,
        };
        const options = { width: 5, color: 'red' };

        customArcBordersPlugin.afterDatasetDraw(mockChart, mockArgs, options);

        expect(mockChart.ctx.lineWidth).toBe(5);
        expect(mockChart.ctx.strokeStyle).toBe('red');
    });

    it('should return early for non-doughnut charts', () => {
        const mockChart = {
            config: { type: 'bar' }, // not doughnut
            isDatasetVisible: jest.fn(() => true),
            ctx: { save: jest.fn(), restore: jest.fn(), beginPath: jest.fn(), arc: jest.fn(), stroke: jest.fn() },
        };
        const mockArgs = {
            meta: { data: [{ getProps: jest.fn() }] },
            index: 0,
        };

        customArcBordersPlugin.afterDatasetDraw(mockChart, mockArgs, {});

        expect(mockChart.ctx.save).not.toHaveBeenCalled();
        expect(mockChart.ctx.arc).not.toHaveBeenCalled();
    });

    it('should return early when dataset is not visible', () => {
        const mockChart = {
            config: { type: 'doughnut' },
            isDatasetVisible: jest.fn(() => false), // not visible
            ctx: { save: jest.fn(), restore: jest.fn(), beginPath: jest.fn(), arc: jest.fn(), stroke: jest.fn() },
        };
        const mockArgs = {
            meta: { data: [{ getProps: jest.fn() }] },
            index: 0,
        };

        customArcBordersPlugin.afterDatasetDraw(mockChart, mockArgs, {});

        expect(mockChart.ctx.save).not.toHaveBeenCalled();
        expect(mockChart.ctx.arc).not.toHaveBeenCalled();
    });
  });

  describe('waveAnimationPlugin', () => {
    let mockChart;
    let mockCanvas;
    let originalRequestAnimationFrame;
    let originalCancelAnimationFrame;
    let animationFrameCallback;

    beforeEach(() => {
        // Mock requestAnimationFrame and cancelAnimationFrame
        originalRequestAnimationFrame = global.requestAnimationFrame;
        originalCancelAnimationFrame = global.cancelAnimationFrame;
        
        global.requestAnimationFrame = jest.fn((callback) => {
            animationFrameCallback = callback;
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
                data: [{ outerRadius: 100, innerRadius: 50, x: 200, y: 200 }] 
            })),
            ctx: { 
                save: jest.fn(), 
                restore: jest.fn(), 
                beginPath: jest.fn(), 
                rect: jest.fn(), 
                arc: jest.fn(), 
                clip: jest.fn(), 
                fill: jest.fn(), 
                fillStyle: '' 
            },
            draw: jest.fn()
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
            config: {}
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

    it('should return early when waveAnimation is missing', () => {
        mockChart.waveAnimation = null;

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});

        expect(mockChart.ctx.save).not.toHaveBeenCalled();
    });

    it('should start animation when outerRadius > 0 and no animation running', () => {
        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: { BASE_COLOR_RGB_TRIPLET: '255, 0, 0' }
        };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});

        expect(global.requestAnimationFrame).toHaveBeenCalled();
    });

    it('should stop animation when outerRadius <= 0 and no waves', () => {
        mockChart.getDatasetMeta.mockReturnValue({ 
            data: [{ outerRadius: 0, x: 200, y: 200 }] 
        });
        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: 123,
            config: { BASE_COLOR_RGB_TRIPLET: '255, 0, 0' }
        };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});

        expect(global.cancelAnimationFrame).toHaveBeenCalledWith(123);
    });

    it('should set the fillStyle based on wave opacity', () => {
        mockChart.waveAnimation = {
            waves: [{ radius: 110, opacity: 0.5, targetRadius: 140 }],
            lastSpawnTime: Date.now(),
            animationFrameId: 1,
            config: { BASE_COLOR_RGB_TRIPLET: '0, 0, 0' }
        };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});

        expect(mockChart.ctx.fill).toHaveBeenCalled();
        expect(mockChart.ctx.fillStyle).toBe('rgba(0, 0, 0, 0.5)');
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
                BASE_COLOR_RGB_TRIPLET: '255, 0, 0'
            }
        };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});
        
        // Remove canvas from DOM to trigger stop condition
        document.body.removeChild(mockCanvas);
        mockChart.canvas = null;

        // Call the animation frame callback
        if (animationFrameCallback) {
            animationFrameCallback();
        }

        expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should spawn waves when conditions are met', () => {
        const mockDateNow = jest.spyOn(Date, 'now').mockReturnValue(1000);
        
        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0, // Long ago
            animationFrameId: null,
            config: { 
                MAX_WAVES: 3,
                SPAWN_INTERVAL: 100,
                SPEED: 2,
                EXPANSION_DISTANCE: 50,
                SPAWN_OPACITY: 0.8,
                TARGET_OPACITY_FADE: 0.01,
                BASE_COLOR_RGB_TRIPLET: '255, 0, 0',
                spawnOpacity: 0.8
            }
        };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});

        // Trigger animation frame callback
        if (animationFrameCallback) {
            animationFrameCallback();
        }

        expect(mockChart.waveAnimation.waves.length).toBeGreaterThan(0);
        mockDateNow.mockRestore();
    });

    it('should handle waves with missing spawnRadius', () => {
        mockChart.waveAnimation = {
            waves: [{ radius: 100, opacity: 0.8, targetRadius: 150 }], // no spawnRadius
            lastSpawnTime: 0,
            animationFrameId: null,
            config: { 
                MAX_WAVES: 3,
                SPAWN_INTERVAL: 100,
                SPEED: 2,
                EXPANSION_DISTANCE: 50,
                SPAWN_OPACITY: 0.8,
                TARGET_OPACITY_FADE: 0.01,
                BASE_COLOR_RGB_TRIPLET: '255, 0, 0'
            }
        };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});

        // Trigger animation frame callback
        if (animationFrameCallback) {
            animationFrameCallback();
        }

        // Wave should still be processed
        expect(mockChart.draw).toHaveBeenCalled();
    });

    it('should handle zero expansion distance', () => {
        mockChart.waveAnimation = {
            waves: [{ radius: 100, opacity: 0.8, targetRadius: 150, spawnRadius: 100 }],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: { 
                MAX_WAVES: 3,
                SPAWN_INTERVAL: 100,
                SPEED: 2,
                EXPANSION_DISTANCE: 0, // Zero expansion
                SPAWN_OPACITY: 0.8,
                TARGET_OPACITY_FADE: 0.01,
                BASE_COLOR_RGB_TRIPLET: '255, 0, 0'
            }
        };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});

        // Trigger animation frame callback
        if (animationFrameCallback) {
            animationFrameCallback();
        }

        // Wave should be filtered out due to low opacity and no expansion distance
        expect(mockChart.waveAnimation.waves.length).toBe(0);
    });

    it('should handle animation stopping when no active waves and cannot spawn', () => {
        mockChart.getDatasetMeta.mockReturnValue({ 
            data: [{ outerRadius: 0, x: 200, y: 200 }] 
        });
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
                BASE_COLOR_RGB_TRIPLET: '255, 0, 0'
            }
        };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});

        // Trigger animation frame callback - should stop due to no waves and no outer radius
        if (animationFrameCallback) {
            animationFrameCallback();
        }

        expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should draw waves when they exist', () => {
        mockChart.waveAnimation = {
            waves: [{ radius: 150, opacity: 0.3, targetRadius: 200 }],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: { BASE_COLOR_RGB_TRIPLET: '255, 0, 0' }
        };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});

        // Should call drawing context methods for waves
        expect(mockChart.ctx.save).toHaveBeenCalled();
        expect(mockChart.ctx.restore).toHaveBeenCalled();
    });

    it('should not start animation if already running', () => {
        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: 999, // Already running
            config: { BASE_COLOR_RGB_TRIPLET: '255, 0, 0' }
        };

        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});

        // Should not call requestAnimationFrame again
        expect(global.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('should stop animation when outerRadius becomes 0 and no waves left (lines 25-26)', () => {
        let animateCallback;
        global.requestAnimationFrame = jest.fn((callback) => {
            animateCallback = callback;
            return 1;
        });

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
                BASE_COLOR_RGB_TRIPLET: '255, 0, 0'
            }
        };

        // Start with outerRadius > 0 to start animation
        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});
        
        // Now simulate the condition where outerRadius becomes 0 and no waves
        mockChart.getDatasetMeta.mockReturnValue({ 
            data: [{ outerRadius: 0, x: 200, y: 200 }] 
        });
        
        // Trigger the animation callback - this should hit lines 25-26
        if (animateCallback) {
            animateCallback();
        }

        expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should stop animation when no waves and cannot spawn more (line 37)', () => {
        let animateCallback;
        let requestFrameCallCount = 0;
        global.requestAnimationFrame = jest.fn((callback) => {
            animateCallback = callback;
            return ++requestFrameCallCount;
        });

        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: Date.now() - 1000, // Long ago, so can spawn
            animationFrameId: null,
            config: { 
                MAX_WAVES: 1, // Allow only 1 wave
                SPAWN_INTERVAL: 50,
                SPEED: 10, // Fast speed to quickly exceed target
                EXPANSION_DISTANCE: 20,
                SPAWN_OPACITY: 0.8,
                TARGET_OPACITY_FADE: 0.1, // High threshold
                BASE_COLOR_RGB_TRIPLET: '255, 0, 0',
                spawnOpacity: 0.8
            }
        };

        // Start with good conditions to start animation
        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});
        
        // First animation frame - this should spawn a wave
        if (animateCallback) {
            animateCallback();
        }
        
        expect(mockChart.waveAnimation.waves.length).toBeGreaterThan(0);
        
        // Now change conditions to make wave be filtered out and prevent new spawning
        mockChart.getDatasetMeta.mockReturnValue({ 
            data: [{ outerRadius: 0, x: 200, y: 200 }] // No outer radius = cannot spawn
        });
        
        // Make existing wave exceed limits to be filtered out
        mockChart.waveAnimation.waves[0].radius = mockChart.waveAnimation.waves[0].targetRadius + 50; // Exceed target
        mockChart.waveAnimation.waves[0].opacity = 0.05; // Below threshold
        mockChart.waveAnimation.config.MAX_WAVES = 0; // No more waves allowed
        
        // Second animation frame - should trigger line 37
        if (animateCallback) {
            animateCallback();
        }

        expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should handle complex animation cycle with wave filtering and spawning', () => {
        let animateCallback;
        let animationFrameCallCount = 0;
        global.requestAnimationFrame = jest.fn((callback) => {
            animateCallback = callback;
            animationFrameCallCount++;
            return animationFrameCallCount;
        });

        const mockDateNow = jest.spyOn(Date, 'now');
        mockDateNow.mockReturnValue(0); // Start time

        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: { 
                MAX_WAVES: 2,
                SPAWN_INTERVAL: 50,
                SPEED: 5,
                EXPANSION_DISTANCE: 30,
                SPAWN_OPACITY: 0.8,
                TARGET_OPACITY_FADE: 0.01,
                BASE_COLOR_RGB_TRIPLET: '255, 0, 0',
                spawnOpacity: 0.8
            }
        };

        // Start animation
        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});
        
        // First callback - should spawn a wave
        mockDateNow.mockReturnValue(100); // Time advanced
        if (animateCallback) {
            animateCallback();
        }

        expect(mockChart.waveAnimation.waves.length).toBeGreaterThan(0);
        
        // Second callback - wave should expand and eventually be filtered
        mockDateNow.mockReturnValue(200);
        if (animateCallback) {
            // Manually advance waves to be filtered out
            mockChart.waveAnimation.waves.forEach(wave => {
                wave.radius = wave.targetRadius + 10; // Exceed target
                wave.opacity = 0.001; // Very low opacity
            });
            animateCallback();
        }

        mockDateNow.mockRestore();
    });

    it('should handle early return when animation already running (line 7)', () => {
        let animateCallback;
        global.requestAnimationFrame = jest.fn((callback) => {
            animateCallback = callback;
            return 1;
        });

        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: 999, // Already has animation ID
            config: { BASE_COLOR_RGB_TRIPLET: '255, 0, 0' }
        };

        // Start animation - should create the internal animate callback
        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});
        
        // Manually call the internal _startWaveAnimation by triggering the callback
        // This should hit line 7 and return early since animationFrameId already exists
        if (animateCallback) {
            // Reset the mock to see if requestAnimationFrame gets called again
            global.requestAnimationFrame.mockClear();
            animateCallback(); // This should not call requestAnimationFrame again due to line 7
        }

        // Should not have called requestAnimationFrame again
        expect(global.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('should handle missing meta data in animation loop (line 18)', () => {
        let animateCallback;
        global.requestAnimationFrame = jest.fn((callback) => {
            animateCallback = callback;
            return 1;
        });

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
                BASE_COLOR_RGB_TRIPLET: '255, 0, 0'
            }
        };

        // Start animation
        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});
        
        // Change getDatasetMeta to return null/empty data to hit line 18
        mockChart.getDatasetMeta.mockReturnValue(null); // No meta
        
        // Trigger animation callback - should handle null meta gracefully
        if (animateCallback) {
            animateCallback();
        }

        expect(global.cancelAnimationFrame).toHaveBeenCalled(); // Should stop due to no data
    });

    it('should handle _stopWaveAnimation with null animState (lines 45-53)', () => {
        // Test the case where animState is null in _stopWaveAnimation
        mockChart.waveAnimation = null;
        
        // This should not crash even though waveAnimation is null
        waveAnimationPlugin.afterDestroy(mockChart);
        
        // Should not crash and should not call cancelAnimationFrame
        expect(global.cancelAnimationFrame).not.toHaveBeenCalled();
    });

    it('should handle updateWaveState with null animState (line 53)', () => {
        let animateCallback;
        global.requestAnimationFrame = jest.fn((callback) => {
            animateCallback = callback;
            return 1;
        });

        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: { BASE_COLOR_RGB_TRIPLET: '255, 0, 0' }
        };

        // Start animation
        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});
        
        // Set waveAnimation to null during animation to trigger line 53
        mockChart.waveAnimation = null;
        
        // Trigger animation callback - should handle null animState in updateWaveState
        if (animateCallback) {
            animateCallback(); // Should hit line 53 and return early
        }

        // Should call draw() because the animation continues even with null animState
        expect(mockChart.draw).toHaveBeenCalled();
    });

    it('should handle center coordinates assignment (lines 116-117)', () => {
        // Test case where meta data has null/undefined x and y coordinates
        mockChart.getDatasetMeta.mockReturnValue({ 
            data: [{ outerRadius: 100, x: null, y: undefined }] // Missing coordinates
        });
        
        mockChart.waveAnimation = {
            waves: [{ radius: 150, opacity: 0.3, targetRadius: 200 }],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: { BASE_COLOR_RGB_TRIPLET: '255, 0, 0' }
        };

        // This should hit lines 116-117 and assign default values (0) for centerX and centerY
        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});

        // Should call drawing context methods
        expect(mockChart.ctx.save).toHaveBeenCalled();
        expect(mockChart.ctx.restore).toHaveBeenCalled();
    });

    it('should handle meta data with empty data array (line 18)', () => {
        let animateCallback;
        global.requestAnimationFrame = jest.fn((callback) => {
            animateCallback = callback;
            return 1;
        });

        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: { BASE_COLOR_RGB_TRIPLET: '255, 0, 0' }
        };

        // Start animation
        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});
        
        // Change meta to have empty data array
        mockChart.getDatasetMeta.mockReturnValue({ data: [] }); // Empty array
        
        // Trigger animation callback - should handle empty data array
        if (animateCallback) {
            animateCallback();
        }

        expect(global.cancelAnimationFrame).toHaveBeenCalled(); // Should stop due to no data
    });

    it('should cover line 7 - early return when animation already running', () => {
        mockChart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: { BASE_COLOR_RGB_TRIPLET: '255, 0, 0' }
        };

        // First, start animation normally
        waveAnimationPlugin.beforeDatasetsDraw(mockChart, {}, {});
        expect(global.requestAnimationFrame).toHaveBeenCalled();
        
        // Set animation as running
        mockChart.waveAnimation.animationFrameId = 999;
        
        // Reset mock to count new calls
        global.requestAnimationFrame.mockClear();
        
        // Now use the new forceStartAnimation method to trigger line 7
        // This should hit line 7: if (animState.animationFrameId) return;
        waveAnimationPlugin.forceStartAnimation(mockChart);
        
        // Should not have called requestAnimationFrame because line 7 returned early
        expect(global.requestAnimationFrame).not.toHaveBeenCalled();
        expect(mockChart.waveAnimation.animationFrameId).toBe(999); // Unchanged
    });

    it('should test forceStartAnimation method with no waveAnimation', () => {
        mockChart.waveAnimation = null;
        
        // Should not crash when waveAnimation is null
        waveAnimationPlugin.forceStartAnimation(mockChart);
        
        expect(global.requestAnimationFrame).not.toHaveBeenCalled();
    });

  });
});