require('@testing-library/jest-dom');

describe('twrr.js', () => {
    let mockFetch;
    let mockPlotlyReact;
    let container;

    beforeEach(() => {
        // Mock Plotly
        mockPlotlyReact = jest.fn().mockResolvedValue();
        window.Plotly = { react: mockPlotlyReact };

        // Setup DOM
        document.body.innerHTML = '<div id="twrr-chart"></div>';
        container = document.getElementById('twrr-chart');

        // Mock fetch
        mockFetch = jest.fn();
        global.fetch = mockFetch;

        // Ensure clean modules
        jest.resetModules();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        jest.restoreAllMocks();
    });

    it('renders chart with data successfully', async () => {
        const fakeData = [{ x: ['2023-01-01'], y: [100] }];
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValueOnce({ data: fakeData }),
        });

        // Load the module dynamically
        require('../../../../js/pages/performance/twrr.js');

        // Allow DOMContentLoaded and async functions to execute
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(mockFetch).toHaveBeenCalledWith('../data/output/figures/twrr.json', { cache: 'no-store' });
        expect(mockPlotlyReact).toHaveBeenCalledWith(
            container,
            fakeData,
            expect.any(Object),
            expect.any(Object)
        );
    });

    it('fails silently on network error', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
        });

        require('../../../../js/pages/performance/twrr.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        // It shouldn't crash, but plot shouldn't be called
        expect(mockPlotlyReact).not.toHaveBeenCalled();
    });

    it('fails silently if chart container is missing', async () => {
        document.body.innerHTML = ''; // Remove container

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValueOnce({ data: [] }),
        });

        require('../../../../js/pages/performance/twrr.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        // It shouldn't crash, but plot shouldn't be called
        expect(mockPlotlyReact).not.toHaveBeenCalled();
    });

    it('handles payload missing data array gracefully', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValueOnce({ data: 'not an array' }), // Invalid shape
        });

        require('../../../../js/pages/performance/twrr.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Should fall back to empty array
        expect(mockPlotlyReact).toHaveBeenCalledWith(
            container,
            [],
            expect.any(Object),
            expect.any(Object)
        );
    });
});
