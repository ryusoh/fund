jest.mock('../chart/imageDrawer.js', () => ({
  drawImage: jest.fn(),
}));

// Mock dependencies
jest.mock('../utils/colors.js', () => ({
  getBlueColorForSlice: jest.fn(),
  hexToRgba: jest.fn(),
}));
jest.mock('../ui/responsive.js', () => ({
  checkAndToggleVerticalScroll: jest.fn(),
}));

// Sophisticated mock for Chart.js
let chartOptions = {};
let mockChartInstance;

function setupMocks() {
    mockChartInstance = {
        update: jest.fn(),
        draw: jest.fn(),
        getDatasetMeta: jest.fn(() => ({
            data: [{ x: 150, y: 150, innerRadius: 50, outerRadius: 100, startAngle: 0, endAngle: 1.5 }],
        })),
        data: { labels: [], datasets: [{ data: [], backgroundColor: [], images: [] }] },
        destroy: jest.fn(() => {
            const index = chartInstances.indexOf(mockChartInstance);
            if (index > -1) {
                chartInstances.splice(index, 1);
            }
        }),
    };

    global.Chart = jest.fn((ctx, config) => {
        chartOptions = config.options;
        // Store the plugins array separately for imagePlugin tests
        chartOptions.pluginInstances = config.plugins || [];
        mockChartInstance.data = config.data;
        return mockChartInstance;
    });

    global.Image = jest.fn(() => ({
        set src(url) {
            if (this.onload) {
                this.onload();
            }
        },
        onload: null,
    }));
}

describe('chartManager', () => {
  let data;
  let chartManager;

  beforeEach(() => {
    jest.resetModules(); // Reset modules before each test
    setupMocks();
    chartManager = require('../chart/chartManager.js');

    document.body.innerHTML = `
        <canvas id="fundPieChart"></canvas>
        <table><tbody>
            <tr data-ticker="AAPL"><td>AAPL</td></tr>
            <tr data-ticker="GOOG"><td>GOOG</td></tr>
        </tbody></table>
        <div class="footer-wrapper"></div>
    `;
    data = {
      labels: ['AAPL', 'GOOG'],
      datasets: [{
        data: [60, 40],
        backgroundColor: ['red', 'blue'],
        images: [{ src: 'aapl.png' }, { src: 'goog.png' }],
      }],
    };
  });

  describe('updatePieChart', () => {
    it('should create a new chart instance if one does not exist', () => {
      chartManager.updatePieChart(data);
      expect(global.Chart).toHaveBeenCalledTimes(1);
    });

    it('should update the existing chart instance if one exists', () => {
      chartManager.updatePieChart(data);
      const newData = { ...data, labels: ['TSLA', 'MSFT'] };
      chartManager.updatePieChart(newData);
      expect(global.Chart).toHaveBeenCalledTimes(1);
      expect(mockChartInstance.update).toHaveBeenCalledTimes(1);
      expect(mockChartInstance.data.labels).toEqual(['TSLA', 'MSFT']);
    });
  });

  describe('Chart Interactivity', () => {
    it('onClick: should toggle table persistence when clicking chart center', () => {
        chartManager.updatePieChart(data);
        const table = document.querySelector('table');
        const event = { x: 150, y: 150 };

        chartOptions.onClick(event, [], mockChartInstance);
        expect(table.classList.contains('hidden')).toBe(false);

        chartOptions.onClick(event, [], mockChartInstance);
        expect(table.classList.contains('hidden')).toBe(true);
    });

    it('onClick: should handle missing getDatasetMeta (lines 130-141)', () => {
        chartManager.updatePieChart(data);
        const table = document.querySelector('table');
        
        // Ensure table starts hidden
        table.classList.add('hidden');
        
        // Mock getDatasetMeta to return undefined
        mockChartInstance.getDatasetMeta = jest.fn(() => undefined);
        
        const event = { x: 150, y: 150 };
        chartOptions.onClick(event, [], mockChartInstance);
        
        // Should not crash and table should remain hidden (no center click detected)
        expect(table.classList.contains('hidden')).toBe(true);
    });

    it('onClick: should handle missing arc data (lines 130-141)', () => {
        chartManager.updatePieChart(data);
        const table = document.querySelector('table');
        
        // Ensure table starts hidden
        table.classList.add('hidden');
        
        // Mock getDatasetMeta to return meta with no data
        mockChartInstance.getDatasetMeta = jest.fn(() => ({ data: [] }));
        
        const event = { x: 150, y: 150 };
        chartOptions.onClick(event, [], mockChartInstance);
        
        // Should not crash and table should remain hidden
        expect(table.classList.contains('hidden')).toBe(true);
    });

    it('onClick: should handle arc with invalid properties (lines 132-140)', () => {
        chartManager.updatePieChart(data);
        const table = document.querySelector('table');
        
        // Ensure table starts hidden
        table.classList.add('hidden');
        
        // Mock getDatasetMeta to return arc with invalid properties
        mockChartInstance.getDatasetMeta = jest.fn(() => ({
            data: [{ x: 'invalid', y: 150, innerRadius: 50 }]
        }));
        
        const event = { x: 150, y: 150 };
        chartOptions.onClick(event, [], mockChartInstance);
        
        // Should not crash and table should remain hidden
        expect(table.classList.contains('hidden')).toBe(true);
    });

    it('onClick: should handle missing footer element (lines 152-157)', () => {
        chartManager.updatePieChart(data);
        
        // Remove footer element from DOM
        const footerElement = document.querySelector('.footer-wrapper');
        if (footerElement) footerElement.remove();
        
        const event = { x: 150, y: 150 };
        
        // Should not crash when footer element is null
        expect(() => {
            chartOptions.onClick(event, [], mockChartInstance);
        }).not.toThrow();
    });

    it('onClick: should handle click outside inner radius (line 137)', () => {
        chartManager.updatePieChart(data);
        const table = document.querySelector('table');
        
        // Ensure table starts hidden
        table.classList.add('hidden');
        
        // Click outside the inner radius but still within chart area
        // With innerRadius of 50, a click at distance > 50 should not trigger center logic
        const event = { x: 200, y: 200 }; // Distance from (150, 150) is about 70.7 > 50
        
        chartOptions.onClick(event, [], mockChartInstance);
        
        // Table should remain hidden since click was not over center
        expect(table.classList.contains('hidden')).toBe(true);
    });

    it('onClick: should handle missing footer in else branch (line 157)', () => {
        chartManager.updatePieChart(data);
        const table = document.querySelector('table');
        
        // Remove footer element from DOM to test null case
        const footerElement = document.querySelector('.footer-wrapper');
        if (footerElement) footerElement.remove();
        
        // First click to enable persistence
        const centerEvent = { x: 150, y: 150 };
        chartOptions.onClick(centerEvent, [], mockChartInstance);
        expect(table.classList.contains('hidden')).toBe(false);
        
        // Second click to disable persistence (this will hit line 157 with null footer)
        chartOptions.onClick(centerEvent, [], mockChartInstance);
        expect(table.classList.contains('hidden')).toBe(true);
    });

    it('onHover: should show specific row on slice hover', () => {
        chartManager.updatePieChart(data);
        const table = document.querySelector('table');
        const aaplRow = document.querySelector('tr[data-ticker="AAPL"]');
        const googRow = document.querySelector('tr[data-ticker="GOOG"]');
        const event = { x: 200, y: 200 };
        const activeElements = [{ index: 0 }];

        chartOptions.onHover(event, activeElements, mockChartInstance);

        expect(table.classList.contains('hidden')).toBe(false);
        expect(aaplRow.classList.contains('hidden')).toBe(false);
        expect(googRow.classList.contains('hidden')).toBe(true);
    });

    it('onHover: should return early if table is persisting on desktop (line 172)', () => {
        chartManager.updatePieChart(data);
        const table = document.querySelector('table');
        
        // Mock desktop environment
        Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
        
        // Set table persistence state
        const centerEvent = { x: 150, y: 150 };
        chartOptions.onClick(centerEvent, [], mockChartInstance); // Enable persistence
        
        table.classList.add('hidden'); // Manually hide to test if hover respects persistence
        
        const hoverEvent = { x: 200, y: 200 };
        const activeElements = [{ index: 0 }];
        chartOptions.onHover(hoverEvent, activeElements, mockChartInstance);
        
        // Table should remain hidden because persistence overrides hover
        expect(table.classList.contains('hidden')).toBe(true);
    });

    it('onHover: should detect hover over center (line 186)', () => {
        chartManager.updatePieChart(data);
        const table = document.querySelector('table');
        const event = { x: 150, y: 150 }; // Exact center coordinates
        
        // Mock desktop environment
        Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
        
        chartOptions.onHover(event, [], mockChartInstance);
        
        expect(table.classList.contains('hidden')).toBe(false);
    });

    it('onHover: should only show all rows on desktop when hovering center (line 195-197)', () => {
        chartManager.updatePieChart(data);
        const aaplRow = document.querySelector('tr[data-ticker="AAPL"]');
        const googRow = document.querySelector('tr[data-ticker="GOOG"]');
        const event = { x: 150, y: 150 }; // Center coordinates
        
        // Test mobile behavior - should not show all rows
        Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });
        
        chartOptions.onHover(event, [], mockChartInstance);
        
        expect(aaplRow.classList.contains('hidden')).toBe(true);
        expect(googRow.classList.contains('hidden')).toBe(true);
        
        // Test desktop behavior - should show all rows  
        Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
        
        chartOptions.onHover(event, [], mockChartInstance);
        
        expect(aaplRow.classList.contains('hidden')).toBe(false);
        expect(googRow.classList.contains('hidden')).toBe(false);
    });

    it('onHover: should hide table and rows when not hovering anything (lines 221-223)', () => {
        chartManager.updatePieChart(data);
        const table = document.querySelector('table');
        const aaplRow = document.querySelector('tr[data-ticker="AAPL"]');
        const googRow = document.querySelector('tr[data-ticker="GOOG"]');
        const footerWrapper = document.querySelector('.footer-wrapper');
        
        // First show the table
        table.classList.remove('hidden');
        aaplRow.classList.remove('hidden');
        googRow.classList.remove('hidden');
        footerWrapper.classList.remove('hidden');
        
        // Hover outside any active elements
        const event = { x: 50, y: 50 }; // Outside chart area
        chartOptions.onHover(event, [], mockChartInstance);
        
        expect(table.classList.contains('hidden')).toBe(true);
        expect(aaplRow.classList.contains('hidden')).toBe(true);
        expect(googRow.classList.contains('hidden')).toBe(true);
        expect(footerWrapper.classList.contains('hidden')).toBe(true);
    });

    it('onHover: should handle missing getDatasetMeta (lines 178-180)', () => {
        chartManager.updatePieChart(data);
        const table = document.querySelector('table');
        
        // Mock getDatasetMeta to return undefined
        mockChartInstance.getDatasetMeta = jest.fn(() => undefined);
        
        const event = { x: 150, y: 150 };
        
        expect(() => {
            chartOptions.onHover(event, [], mockChartInstance);
        }).not.toThrow();
        
        expect(table.classList.contains('hidden')).toBe(true);
    });

    it('onHover: should handle arc with invalid properties in hover (lines 178-180)', () => {
        chartManager.updatePieChart(data);
        
        // Mock getDatasetMeta to return arc with invalid properties
        mockChartInstance.getDatasetMeta = jest.fn(() => ({
            data: [{ x: undefined, y: 150, innerRadius: 50 }]
        }));
        
        const event = { x: 150, y: 150 };
        
        expect(() => {
            chartOptions.onHover(event, [], mockChartInstance);
        }).not.toThrow();
    });

    it('onHover: should handle missing ticker row (lines 207-208)', () => {
        chartManager.updatePieChart(data);
        
        // Remove the AAPL row from DOM so specificRowToShow will be null
        const aaplRow = document.querySelector('tr[data-ticker="AAPL"]');
        if (aaplRow) aaplRow.remove();
        
        const event = { x: 200, y: 200 };
        const activeElements = [{ index: 0 }]; // Should look for AAPL but won't find it
        
        expect(() => {
            chartOptions.onHover(event, activeElements, mockChartInstance);
        }).not.toThrow();
    });

    it('onHover: should handle invalid dataIndex (lines 205-206)', () => {
        chartManager.updatePieChart(data);
        
        const event = { x: 200, y: 200 };
        const activeElements = [{ index: -1 }]; // Invalid index
        
        expect(() => {
            chartOptions.onHover(event, activeElements, mockChartInstance);
        }).not.toThrow();
    });

    it('onHover: should handle missing footer element in hover (lines 219-223)', () => {
        chartManager.updatePieChart(data);
        
        // Remove footer element from DOM
        const footerElement = document.querySelector('.footer-wrapper');
        if (footerElement) footerElement.remove();
        
        const event = { x: 200, y: 200 };
        const activeElements = [{ index: 0 }];
        
        // Should not crash when footer element is null
        expect(() => {
            chartOptions.onHover(event, activeElements, mockChartInstance);
        }).not.toThrow();
        
        // And when hiding
        const outsideEvent = { x: 50, y: 50 };
        expect(() => {
            chartOptions.onHover(outsideEvent, [], mockChartInstance);
        }).not.toThrow();
    });
  });

  describe('imagePlugin', () => {
    it('should call drawImage when logos are shown', () => {
        chartManager.updatePieChart(data);
        const imagePlugin = chartOptions.pluginInstances.find(p => p.id === 'imagePlugin');
        const { drawImage } = require('../chart/imageDrawer.js');

        mockChartInstance.showLogos = true;
        mockChartInstance.imagePlugin_loadedImages = { 'aapl.png': new Image() }; // Pre-cache image

        imagePlugin.afterDatasetsDraw(mockChartInstance, null, {});
        
        expect(drawImage).toHaveBeenCalled();
    });

    it('should return early if no images in dataset (line 17)', () => {
        chartManager.updatePieChart({
            labels: ['AAPL'],
            datasets: [{ data: [100], backgroundColor: ['red'], images: null }]
        });
        const imagePlugin = chartOptions.pluginInstances.find(p => p.id === 'imagePlugin');
        const { drawImage } = require('../chart/imageDrawer.js');

        const result = imagePlugin.afterDatasetsDraw(mockChartInstance, null, {});
        
        expect(drawImage).not.toHaveBeenCalled();
        expect(result).toBeUndefined();
    });

    it('should return early if empty images array (line 17)', () => {
        chartManager.updatePieChart({
            labels: ['AAPL'],
            datasets: [{ data: [100], backgroundColor: ['red'], images: [] }]
        });
        const imagePlugin = chartOptions.pluginInstances.find(p => p.id === 'imagePlugin');
        const { drawImage } = require('../chart/imageDrawer.js');

        const result = imagePlugin.afterDatasetsDraw(mockChartInstance, null, {});
        
        expect(drawImage).not.toHaveBeenCalled();
        expect(result).toBeUndefined();
    });

    it('should return early when not showing logos and no hovered slice (line 24)', () => {
        chartManager.updatePieChart(data);
        const imagePlugin = chartOptions.pluginInstances.find(p => p.id === 'imagePlugin');
        const { drawImage } = require('../chart/imageDrawer.js');

        mockChartInstance.showLogos = false;
        mockChartInstance.hoveredSliceIndex = undefined;

        const result = imagePlugin.afterDatasetsDraw(mockChartInstance, null, {});
        
        expect(drawImage).not.toHaveBeenCalled();
        expect(result).toBeUndefined();
    });

    it('should return early when dataset meta has no data (line 35)', () => {
        chartManager.updatePieChart(data);
        const imagePlugin = chartOptions.pluginInstances.find(p => p.id === 'imagePlugin');
        const { drawImage } = require('../chart/imageDrawer.js');

        mockChartInstance.getDatasetMeta = jest.fn(() => ({ data: [] }));
        mockChartInstance.showLogos = true;

        const result = imagePlugin.afterDatasetsDraw(mockChartInstance, null, {});
        
        expect(drawImage).not.toHaveBeenCalled();
        expect(result).toBeUndefined();
    });

    it('should handle image loading for uncached images (lines 48-52)', () => {
        chartManager.updatePieChart(data);
        const imagePlugin = chartOptions.pluginInstances.find(p => p.id === 'imagePlugin');

        mockChartInstance.showLogos = true;
        mockChartInstance.imagePlugin_loadedImages = {}; // No cached images

        // Mock Image constructor to capture onload behavior
        const mockImg = {
            onload: null,
            set src(imageUrl) {
                // Simulate async image loading
                setTimeout(() => {
                    if (this.onload) {
                        this.onload();
                    }
                }, 0);
            }
        };
        global.Image = jest.fn(() => mockImg);

        imagePlugin.afterDatasetsDraw(mockChartInstance, null, {});
        
        // The image should start loading
        expect(global.Image).toHaveBeenCalled();
        expect(mockImg.onload).toBeDefined();
    });

    it('should draw image for hovered slice index', () => {
        chartManager.updatePieChart(data);
        const imagePlugin = chartOptions.pluginInstances.find(p => p.id === 'imagePlugin');
        const { drawImage } = require('../chart/imageDrawer.js');

        mockChartInstance.showLogos = false;
        mockChartInstance.hoveredSliceIndex = 0;
        mockChartInstance.imagePlugin_loadedImages = { 'aapl.png': new Image() };

        imagePlugin.afterDatasetsDraw(mockChartInstance, null, {});
        
        expect(drawImage).toHaveBeenCalled();
    });

    it('should trigger chart redraw when image loads (lines 51-52)', (done) => {
        chartManager.updatePieChart(data);
        const imagePlugin = chartOptions.pluginInstances.find(p => p.id === 'imagePlugin');

        mockChartInstance.showLogos = true;
        mockChartInstance.imagePlugin_loadedImages = {}; // No cached images
        mockChartInstance.draw = jest.fn();

        // Mock Image constructor with controllable onload
        let imageOnloadCallback = null;
        global.Image = jest.fn(() => ({
            onload: null,
            set src(imageUrl) {
                // Store the onload callback for manual triggering
                setTimeout(() => {
                    imageOnloadCallback = this.onload;
                    if (imageOnloadCallback) {
                        imageOnloadCallback(); // Trigger the onload
                        // Verify chart.draw() was called
                        expect(mockChartInstance.draw).toHaveBeenCalled();
                        done();
                    }
                }, 0);
            }
        }));

        imagePlugin.afterDatasetsDraw(mockChartInstance, null, {});
    });

    it('should handle missing logoInfo or src (lines 40-41)', () => {
        // Test with logoInfo that has no src property
        const dataWithoutSrc = {
            labels: ['AAPL'],
            datasets: [{
                data: [100],
                backgroundColor: ['red'],
                images: [{ }] // Missing src property
            }]
        };

        chartManager.updatePieChart(dataWithoutSrc);
        const imagePlugin = chartOptions.pluginInstances.find(p => p.id === 'imagePlugin');
        const { drawImage } = require('../chart/imageDrawer.js');

        mockChartInstance.showLogos = true;
        mockChartInstance.imagePlugin_loadedImages = {};

        imagePlugin.afterDatasetsDraw(mockChartInstance, null, {});
        
        expect(drawImage).not.toHaveBeenCalled();
    });

    it('should handle null logoInfo (lines 40-41)', () => {
        // Test with null logoInfo
        const dataWithNullLogo = {
            labels: ['AAPL'],
            datasets: [{
                data: [100],
                backgroundColor: ['red'],
                images: [null] // null logoInfo
            }]
        };

        chartManager.updatePieChart(dataWithNullLogo);
        const imagePlugin = chartOptions.pluginInstances.find(p => p.id === 'imagePlugin');
        const { drawImage } = require('../chart/imageDrawer.js');

        mockChartInstance.showLogos = true;
        mockChartInstance.imagePlugin_loadedImages = {};

        imagePlugin.afterDatasetsDraw(mockChartInstance, null, {});
        
        expect(drawImage).not.toHaveBeenCalled();
    });

    it('should skip logo when not showing logos and not hovered (line 39)', () => {
        chartManager.updatePieChart(data);
        const imagePlugin = chartOptions.pluginInstances.find(p => p.id === 'imagePlugin');
        const { drawImage } = require('../chart/imageDrawer.js');

        mockChartInstance.showLogos = false; // Not showing logos
        mockChartInstance.hoveredSliceIndex = 1; // Hovered on index 1, not 0
        mockChartInstance.imagePlugin_loadedImages = { 'aapl.png': new Image() };

        imagePlugin.afterDatasetsDraw(mockChartInstance, null, {});
        
        // Should not draw image for index 0 since it's not hovered and showLogos is false
        expect(drawImage).not.toHaveBeenCalled();
    });
  });


  describe('datalabels configuration', () => {
    it('should format datalabels correctly (lines 89-95)', () => {
        chartManager.updatePieChart(data);
        
        // Access the chart configuration that was passed to Chart constructor
        const chartConfig = global.Chart.mock.calls[0][1];
        const datalabelsConfig = chartConfig.options.plugins.datalabels;
        
        expect(datalabelsConfig).toBeDefined();
        expect(datalabelsConfig.formatter).toBeInstanceOf(Function);
        
        // Test the formatter function with typical values
        const mockContext = {
            chart: { data: { labels: ['AAPL', 'GOOG'] } },
            dataIndex: 0
        };
        
        const result = datalabelsConfig.formatter(25.50, mockContext);
        
        expect(result).toEqual([
            { text: 'AAPL' },
            { text: '25.50%' }
        ]);
    });

    it('should format datalabels with different values and indices', () => {
        chartManager.updatePieChart(data);
        
        const chartConfig = global.Chart.mock.calls[0][1];
        const datalabelsConfig = chartConfig.options.plugins.datalabels;
        
        // Test with second index
        const mockContext = {
            chart: { data: { labels: ['AAPL', 'GOOG', 'TSLA'] } },
            dataIndex: 1
        };
        
        const result = datalabelsConfig.formatter(42.75, mockContext);
        
        expect(result).toEqual([
            { text: 'GOOG' },
            { text: '42.75%' }
        ]);
    });

    it('should format datalabels with decimal precision', () => {
        chartManager.updatePieChart(data);
        
        const chartConfig = global.Chart.mock.calls[0][1];
        const datalabelsConfig = chartConfig.options.plugins.datalabels;
        
        const mockContext = {
            chart: { data: { labels: ['AAPL'] } },
            dataIndex: 0
        };
        
        // Test with value that has more decimal places
        const result = datalabelsConfig.formatter(33.333333, mockContext);
        
        expect(result).toEqual([
            { text: 'AAPL' },
            { text: '33.33%' }
        ]);
    });

    it('should test datalabels connector color function (lines 107-110)', () => {
        const { getBlueColorForSlice, hexToRgba } = require('../utils/colors.js');
        getBlueColorForSlice.mockReturnValue('#0066CC');
        hexToRgba.mockReturnValue('rgba(0, 102, 204, 0.5)');

        chartManager.updatePieChart(data);
        
        const chartConfig = global.Chart.mock.calls[0][1];
        const datalabelsConfig = chartConfig.options.plugins.datalabels;
        
        const mockContext = {
            dataIndex: 0,
            chart: { data: { labels: ['AAPL', 'GOOG'] } }
        };
        
        const color = datalabelsConfig.connector.color(mockContext);
        
        expect(getBlueColorForSlice).toHaveBeenCalledWith(0, 2);
        expect(hexToRgba).toHaveBeenCalledWith('#0066CC', 0.5);
        expect(color).toBe('rgba(0, 102, 204, 0.5)');
    });
  });

  describe('Chart Creation vs Update Logic', () => {
    it('should destroy existing chart instances properly', () => {
        // Create first chart instance
        chartManager.updatePieChart(data);
        const firstInstance = mockChartInstance;
        
        expect(global.Chart).toHaveBeenCalledTimes(1);
        expect(firstInstance.destroy).not.toHaveBeenCalled();
        
        // Update the same chart (should not create new instance)
        const newData = { ...data, labels: ['TSLA'] };
        chartManager.updatePieChart(newData);
        
        expect(global.Chart).toHaveBeenCalledTimes(1); // Still only 1 call
        expect(firstInstance.destroy).not.toHaveBeenCalled(); // Should not destroy on update
    });
  });
});

// Test chart instances tracking for proper cleanup
const chartInstances = [];