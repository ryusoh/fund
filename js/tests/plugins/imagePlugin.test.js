import { imagePlugin } from '@plugins/imagePlugin.js';

// Mock drawImage used by the plugin
jest.mock('../../charts/imageDrawer.js', () => ({
  drawImage: jest.fn(),
}));

describe('imagePlugin', () => {
  let mockChart;
  let OriginalImage;
  let createdImages;

  beforeEach(() => {
    // Mock global Image to control onload timing
    OriginalImage = global.Image;
    createdImages = [];
    global.Image = class MockImage {
      constructor() {
        this.onload = null;
        this.src = '';
        createdImages.push(this);
      }
    };

    const ctx = {
      save: jest.fn(),
      restore: jest.fn(),
      drawImage: jest.fn(),
    };
    mockChart = {
      ctx,
      data: {
        labels: ['AAA'],
        datasets: [{ data: [100], images: [{ src: 'http://example.com/logo.png', scale: 1 }] }],
      },
      getDatasetMeta: jest.fn(() => ({ data: [{}] })),
      draw: jest.fn(),
    };
  });

  it('should early return when no images', () => {
    mockChart.data.datasets[0].images = [];
    imagePlugin.afterDatasetsDraw(mockChart, {}, {});
    expect(mockChart.draw).not.toHaveBeenCalled();
  });

  it('should draw when image is cached and showLogos is true', async () => {
    mockChart.showLogos = true;
    mockChart.imagePlugin_loadedImages = { 'http://example.com/logo.png': {} };
    imagePlugin.afterDatasetsDraw(mockChart, {}, {});
    // drawImage is called by the plugin (mocked in module mock)
    const { drawImage } = await import('../../charts/imageDrawer.js');
    expect(drawImage).toHaveBeenCalled();
  });

  it('should draw when hoveredSliceIndex is set', async () => {
    mockChart.hoveredSliceIndex = 0;
    mockChart.imagePlugin_loadedImages = { 'http://example.com/logo.png': {} };
    imagePlugin.afterDatasetsDraw(mockChart, {}, {});
    const { drawImage } = await import('../../charts/imageDrawer.js');
    expect(drawImage).toHaveBeenCalled();
  });

  it('should not draw when neither showLogos nor hoveredSliceIndex is set', async () => {
    mockChart.imagePlugin_loadedImages = { 'http://example.com/logo.png': {} };
    imagePlugin.afterDatasetsDraw(mockChart, {}, {});
    const { drawImage } = await import('../../charts/imageDrawer.js');
    drawImage.mockClear();
    // Call again after clearing to ensure no draw happens in this pass
    imagePlugin.afterDatasetsDraw(mockChart, {}, {});
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('should handle empty meta data array', async () => {
    mockChart.getDatasetMeta.mockReturnValue({ data: [] });
    mockChart.showLogos = true;
    mockChart.imagePlugin_loadedImages = { 'http://example.com/logo.png': {} };
    const { drawImage } = await import('../../charts/imageDrawer.js');
    drawImage.mockClear();
    imagePlugin.afterDatasetsDraw(mockChart, {}, {});
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('should cache image and trigger redraw on image load, then draw on next pass', async () => {
    const { drawImage } = await import('../../charts/imageDrawer.js');
    mockChart.showLogos = true;
    // No cache initially
    expect(mockChart.imagePlugin_loadedImages).toBeUndefined();

    // First pass: plugin should create Image(), set src, set onload, but not draw yet
    drawImage.mockClear();
    imagePlugin.afterDatasetsDraw(mockChart, {}, {});
    expect(createdImages.length).toBe(1);
    expect(mockChart.draw).not.toHaveBeenCalled();
    expect(drawImage).not.toHaveBeenCalled();
    // Cache still empty until onload
    expect(mockChart.imagePlugin_loadedImages).toBeDefined();
    expect(Object.keys(mockChart.imagePlugin_loadedImages)).toHaveLength(0);

    // Simulate image finished loading
    createdImages[0].onload();
    expect(mockChart.draw).toHaveBeenCalled();
    // Cache should now contain the image
    expect(Object.keys(mockChart.imagePlugin_loadedImages)).toContain('http://example.com/logo.png');

    // Second pass: with cache present, drawImage should be used
    imagePlugin.afterDatasetsDraw(mockChart, {}, {});
    expect(drawImage).toHaveBeenCalled();
  });

  afterEach(() => {
    // Restore Image
    global.Image = OriginalImage;
  });
});
