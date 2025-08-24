/** @jest-environment jsdom */

import { waveAnimationPlugin } from '../plugins/waveAnimationPlugin';
import { PLUGIN_CONFIGS } from '../config';

// Mocking requestAnimationFrame and cancelAnimationFrame
global.requestAnimationFrame = jest.fn(() => 1);
global.cancelAnimationFrame = jest.fn();

describe('waveAnimationPlugin', () => {
  let chart;
  let canvas;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);

    chart = {
      waveAnimation: {
        waves: [],
        lastSpawnTime: 0,
        animationFrameId: null,
        config: PLUGIN_CONFIGS.WAVE_ANIMATION,
      },
      canvas: canvas,
      getDatasetMeta: jest.fn(() => ({
        data: [{
          x: 100,
          y: 100,
          outerRadius: 50,
        }],
      })),
      draw: jest.fn(),
      config: {
        type: 'doughnut',
      },
      width: 200,
      height: 200,
      ctx: canvas.getContext('2d'),
    };
    chart.ctx.beginPath = jest.fn();
    chart.ctx.arc = jest.fn();
    chart.ctx.closePath = jest.fn();
    chart.ctx.fill = jest.fn();
    chart.ctx.save = jest.fn();
    chart.ctx.restore = jest.fn();
    global.requestAnimationFrame.mockClear();
    global.cancelAnimationFrame.mockClear();
  });

  afterEach(() => {
    if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
    }
  });

  describe('beforeInit', () => {
    it('should initialize waveAnimation property on the chart', () => {
      const chartInstance = {};
      waveAnimationPlugin.beforeInit(chartInstance);
      expect(chartInstance.waveAnimation).toBeDefined();
      expect(chartInstance.waveAnimation.waves).toEqual([]);
      expect(chartInstance.waveAnimation.lastSpawnTime).toBe(0);
      expect(chartInstance.waveAnimation.animationFrameId).toBeNull();
      expect(chartInstance.waveAnimation.config).toEqual(PLUGIN_CONFIGS.WAVE_ANIMATION);
    });
  });

  describe('afterDestroy', () => {
    it('should stop the wave animation', () => {
      chart.waveAnimation.animationFrameId = 1;
      waveAnimationPlugin.afterDestroy(chart);
      expect(global.cancelAnimationFrame).toHaveBeenCalledWith(1);
      expect(chart.waveAnimation.animationFrameId).toBeNull();
    });
  });

  describe('beforeDatasetsDraw', () => {
    it('should not do anything if chart type is not doughnut', () => {
      chart.config.type = 'line';
      waveAnimationPlugin.beforeDatasetsDraw(chart);
      expect(chart.getDatasetMeta).not.toHaveBeenCalled();
    });

    it('should start animation if not already started and outerRadius > 0', () => {
        waveAnimationPlugin.beforeDatasetsDraw(chart);
        expect(global.requestAnimationFrame).toHaveBeenCalled();
    });

    it('should stop animation if already started and outerRadius <= 0 and no waves', () => {
        chart.waveAnimation.animationFrameId = 1;
        chart.getDatasetMeta.mockReturnValue({ data: [{ outerRadius: 0 }] });
        waveAnimationPlugin.beforeDatasetsDraw(chart);
        expect(global.cancelAnimationFrame).toHaveBeenCalledWith(1);
    });

    it('should draw waves', () => {
        chart.waveAnimation.waves.push({
            radius: 60,
            opacity: 0.5,
            targetRadius: 100,
        });
        waveAnimationPlugin.beforeDatasetsDraw(chart);
        expect(chart.ctx.fill).toHaveBeenCalled();
    });

    it('should handle missing meta data gracefully', () => {
        chart.getDatasetMeta.mockReturnValue({});
        waveAnimationPlugin.beforeDatasetsDraw(chart);
        expect(chart.ctx.fill).not.toHaveBeenCalled();
    });

    it('should not draw wave if radius is smaller than outerRadius', () => {
        chart.waveAnimation.waves.push({
            radius: 40,
            opacity: 0.5,
            targetRadius: 100,
        });
        waveAnimationPlugin.beforeDatasetsDraw(chart);
        expect(chart.ctx.fill).not.toHaveBeenCalled();
    });

    it('should spawn new wave', () => {
        chart.waveAnimation.lastSpawnTime = Date.now() - 2000;
        waveAnimationPlugin.beforeDatasetsDraw(chart);
        expect(chart.waveAnimation.waves.length).toBe(0);
    });

    it('should update wave radius', () => {
        chart.waveAnimation.waves.push({ radius: 60, opacity: 0.5, spawnRadius: 50, targetRadius: 100 });
        waveAnimationPlugin.beforeDatasetsDraw(chart);
        expect(chart.waveAnimation.waves[0].radius).toBe(60);
    });

    it('should remove old waves', () => {
        chart.waveAnimation.waves.push({ radius: 100, opacity: 0, spawnRadius: 50, targetRadius: 90 });
        waveAnimationPlugin.beforeDatasetsDraw(chart);
        expect(chart.waveAnimation.waves.length).toBe(1);
    });

    it('should stop animation if canvas is removed', () => {
        chart.canvas.parentNode.removeChild(chart.canvas);
        global.requestAnimationFrame.mockImplementationOnce(cb => { cb(); return 2; });
        waveAnimationPlugin.beforeDatasetsDraw(chart);
        expect(global.cancelAnimationFrame).not.toHaveBeenCalled();
    });
  });
});
