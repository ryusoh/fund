import { drawSortedStartLabels } from '../../../js/transactions/chart/renderers/contribution.js';

// Mock dependencies to avoid loading the full app state
jest.mock('../../../js/transactions/state.js', () => ({}));
jest.mock('../../../js/config.js', () => ({}));
jest.mock('../../../js/transactions/chart/config.js', () => ({}));
jest.mock('../../../js/transactions/chart/core.js', () => ({}));
jest.mock('../../../js/transactions/chart/animation.js', () => ({}));
jest.mock('../../../js/transactions/chart/interaction.js', () => ({}));
jest.mock('../../../js/transactions/chart/state.js', () => ({}));

describe('drawSortedStartLabels', () => {
    test('sorts labels by Y descending (Bottom Up) and draws them', () => {
        const drawSpy1 = jest.fn(() => ({ id: 'middle' }));
        const drawSpy2 = jest.fn(() => ({ id: 'top' }));
        const drawSpy3 = jest.fn(() => ({ id: 'bottom' }));

        const items = [
            { y: 50, draw: drawSpy1 }, // Middle
            { y: 10, draw: drawSpy2 }, // Top (Small Y)
            { y: 100, draw: drawSpy3 }, // Bottom (Large Y)
        ];

        const startLabelBounds = [];

        drawSortedStartLabels(items, startLabelBounds);

        // Expect Sorting: 100 (Bottom), 50 (Middle), 10 (Top).
        // Call Order: Spy3 -> Spy1 -> Spy2

        expect(drawSpy3).toHaveBeenCalled();
        expect(drawSpy1).toHaveBeenCalled();
        expect(drawSpy2).toHaveBeenCalled();

        // Ensure strictly ordered execution
        const order3 = drawSpy3.mock.invocationCallOrder[0];
        const order1 = drawSpy1.mock.invocationCallOrder[0];
        const order2 = drawSpy2.mock.invocationCallOrder[0];

        expect(order3).toBeLessThan(order1);
        expect(order1).toBeLessThan(order2);

        // Expect bounds push in correct order
        expect(startLabelBounds).toEqual([{ id: 'bottom' }, { id: 'middle' }, { id: 'top' }]);
    });

    test('handles empty input', () => {
        const bounds = [];
        drawSortedStartLabels([], bounds);
        expect(bounds.length).toBe(0);

        drawSortedStartLabels(null, bounds);
        expect(bounds.length).toBe(0);
    });
});
