const mockCalHeatmapInstance = {
    paint: jest.fn(() => Promise.resolve()),
    previous: jest.fn(() => Promise.resolve()),
    next: jest.fn(() => Promise.resolve()),
    jumpTo: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
};

export default function CalHeatmap() {
    return mockCalHeatmapInstance;
}

export { mockCalHeatmapInstance };
