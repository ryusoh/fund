import { imagePlugin } from '@plugins/imagePlugin.js';

// Mock drawImage used by the plugin
jest.mock('@charts/imageDrawer.js', () => ({
    drawImage: jest.fn(),
}));

describe('imagePlugin', () => {
    let mockChart;
    let OriginalImage;
    let createdImages;
    let originalNavigatorConn;

    beforeEach(() => {
        // Mock global Image to control onload timing
        OriginalImage = global.Image;
        createdImages = [];
        global.Image = class MockImage {
            constructor() {
                this.onload = null;
                this.onerror = null;
                this._src = '';
                createdImages.push(this);
            }
            set decoding(_v) {
                // default path: does not throw, so try-block executes fine
            }
            set src(v) {
                this._src = v;
            }
            get src() {
                return this._src;
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
                datasets: [
                    { data: [100], images: [{ src: 'http://example.com/logo.png', scale: 1 }] },
                ],
            },
            getDatasetMeta: jest.fn(() => ({ data: [{}] })),
            draw: jest.fn(),
        };

        // mock network connection by default to non-saving, decent network
        originalNavigatorConn = global.navigator && global.navigator.connection;
        if (!global.navigator) {
            global.navigator = {};
        }
        global.navigator.connection = { saveData: false, effectiveType: '4g' };
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
        const { drawImage } = await import('@charts/imageDrawer.js');
        expect(drawImage).toHaveBeenCalled();
    });

    it('should draw when hoveredSliceIndex is set', async () => {
        mockChart.hoveredSliceIndex = 0;
        mockChart.imagePlugin_loadedImages = { 'http://example.com/logo.png': {} };
        imagePlugin.afterDatasetsDraw(mockChart, {}, {});
        const { drawImage } = await import('@charts/imageDrawer.js');
        expect(drawImage).toHaveBeenCalled();
    });

    it('should not draw when neither showLogos nor hoveredSliceIndex is set', async () => {
        mockChart.imagePlugin_loadedImages = { 'http://example.com/logo.png': {} };
        imagePlugin.afterDatasetsDraw(mockChart, {}, {});
        const { drawImage } = await import('@charts/imageDrawer.js');
        drawImage.mockClear();
        // Call again after clearing to ensure no draw happens in this pass
        imagePlugin.afterDatasetsDraw(mockChart, {}, {});
        expect(drawImage).not.toHaveBeenCalled();
    });

    it('should handle empty meta data array', async () => {
        mockChart.getDatasetMeta.mockReturnValue({ data: [] });
        mockChart.showLogos = true;
        mockChart.imagePlugin_loadedImages = { 'http://example.com/logo.png': {} };
        const { drawImage } = await import('@charts/imageDrawer.js');
        drawImage.mockClear();
        imagePlugin.afterDatasetsDraw(mockChart, {}, {});
        expect(drawImage).not.toHaveBeenCalled();
    });

    it('should cache image and trigger redraw on image load, then draw on next pass', async () => {
        const { drawImage } = await import('@charts/imageDrawer.js');
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
        expect(Object.keys(mockChart.imagePlugin_loadedImages)).toContain(
            'http://example.com/logo.png'
        );

        // Second pass: with cache present, drawImage should be used
        imagePlugin.afterDatasetsDraw(mockChart, {}, {});
        expect(drawImage).toHaveBeenCalled();
    });

    afterEach(() => {
        // Restore Image
        global.Image = OriginalImage;
        // Restore navigator.connection
        if (originalNavigatorConn === undefined) {
            delete global.navigator.connection;
        } else {
            global.navigator.connection = originalNavigatorConn;
        }
    });

    it('preloads logos in background without drawing and handles onerror/onload (covers line 54)', async () => {
        // Prepare multiple images to hit different continue branches
        mockChart.data.datasets[0].images = [
            { src: 'http://example.com/a.png' },
            {}, // missing src -> continue
            { src: 'http://example.com/b.png' },
        ];
        mockChart.getDatasetMeta.mockReturnValue({ data: [{}] });
        // Initialize caches
        mockChart.imagePlugin_loadedImages = {};
        mockChart.imagePlugin_pendingLoads = new Set(['http://example.com/b.png']); // will skip b

        // First pass: background preload should enqueue only a.png
        imagePlugin.afterDatasetsDraw(mockChart, {}, {});
        expect(mockChart.draw).not.toHaveBeenCalled();
        const { drawImage } = await import('@charts/imageDrawer.js');
        drawImage.mockClear();
        expect(drawImage).not.toHaveBeenCalled();
        expect(createdImages.length).toBe(1);
        const preloaded = createdImages[0];
        expect(preloaded.src).toBe('http://example.com/a.png');
        // Simulate network error -> pendingLoads entry should be cleared (line 54)
        preloaded.onerror && preloaded.onerror();
        expect(mockChart.imagePlugin_pendingLoads.has('http://example.com/a.png')).toBe(false);

        // Second pass: since a.png is neither loaded nor pending, it should re-enqueue
        imagePlugin.afterDatasetsDraw(mockChart, {}, {});
        expect(createdImages.length).toBe(2);
        const preloaded2 = createdImages[1];
        expect(preloaded2.src).toBe('http://example.com/a.png');
        // Simulate success -> goes into loadedImages and is removed from pending
        preloaded2.onload && preloaded2.onload();
        expect(Object.keys(mockChart.imagePlugin_loadedImages)).toContain(
            'http://example.com/a.png'
        );
        expect(mockChart.imagePlugin_pendingLoads.has('http://example.com/a.png')).toBe(false);
        // Still no draw() because logos are not requested yet
        expect(mockChart.draw).not.toHaveBeenCalled();
    });

    it('respects Save-Data and does not preload (PRELOAD_LIMIT = 0)', () => {
        global.navigator.connection = { saveData: true, effectiveType: '4g' };
        mockChart.data.datasets[0].images = [
            { src: 'http://example.com/a.png' },
            { src: 'http://example.com/b.png' },
        ];
        imagePlugin.afterDatasetsDraw(mockChart, {}, {});
        expect(createdImages.length).toBe(0);
    });

    it('respects 2G effectiveType and does not preload (PRELOAD_LIMIT = 0)', () => {
        global.navigator.connection = { saveData: false, effectiveType: '2g' };
        mockChart.data.datasets[0].images = [
            { src: 'http://example.com/a.png' },
            { src: 'http://example.com/b.png' },
        ];
        imagePlugin.afterDatasetsDraw(mockChart, {}, {});
        expect(createdImages.length).toBe(0);
    });

    it('handles missing navigator (conn undefined) and still preloads', () => {
        // Remove navigator to exercise ternary false branch in line 33
        const hadNavigator = Object.prototype.hasOwnProperty.call(global, 'navigator');
        const savedNavigator = global.navigator;
        try {
            // Remove the property entirely so typeof navigator === 'undefined'
            delete global.navigator;
        } catch {}
        try {
            mockChart.data.datasets[0].images = [{ src: 'http://example.com/a.png' }];
            imagePlugin.afterDatasetsDraw(mockChart, {}, {});
            expect(createdImages.length).toBe(1);
        } finally {
            // restore navigator for subsequent tests
            if (hadNavigator) {
                global.navigator = savedNavigator;
            } else {
                try {
                    delete global.navigator;
                } catch {}
            }
        }
    });

    it('handles missing effectiveType (uses fallback in regex)', () => {
        global.navigator.connection = { saveData: false }; // no effectiveType
        mockChart.data.datasets[0].images = [{ src: 'http://example.com/a.png' }];
        const prevCount = createdImages.length;
        imagePlugin.afterDatasetsDraw(mockChart, {}, {});
        expect(createdImages.length).toBe(prevCount + 1);
    });

    it('handles decoding setter throwing (covers try/catch around decoding)', () => {
        // Replace Image with a version that throws on setting decoding
        const ThrowingImage = class {
            constructor() {
                this.onload = null;
                this.onerror = null;
                this._src = '';
                createdImages.push(this);
            }
            set decoding(_v) {
                throw new Error('decoding not supported');
            }
            set src(v) {
                this._src = v;
            }
            get src() {
                return this._src;
            }
        };
        global.Image = ThrowingImage;

        mockChart.data.datasets[0].images = [{ src: 'http://example.com/a.png' }];
        imagePlugin.afterDatasetsDraw(mockChart, {}, {});
        // Should not throw, and one image created
        expect(createdImages.length).toBe(1);
    });
});
