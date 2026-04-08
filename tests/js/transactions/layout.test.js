import { adjustMobilePanels } from '../../../js/transactions/layout.js';

describe('adjustMobilePanels', () => {
    let tableContainer, plotSection, chartContainer, legend;

    beforeEach(() => {
        document.body.innerHTML = '';

        // Mock window dimensions
        Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });
        Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });

        // Setup DOM elements
        tableContainer = document.createElement('div');
        tableContainer.className = 'table-responsive-container';

        plotSection = document.createElement('div');
        plotSection.id = 'runningAmountSection';

        chartContainer = document.createElement('div');
        chartContainer.className = 'chart-container';

        legend = document.createElement('div');
        legend.className = 'chart-legend';

        plotSection.appendChild(chartContainer);
        plotSection.appendChild(legend);

        document.body.appendChild(tableContainer);
        document.body.appendChild(plotSection);

        // Mock getBoundingClientRect
        const rect = { top: 100, bottom: 200, left: 0, right: 100, width: 100, height: 100 };
        tableContainer.getBoundingClientRect = () => rect;
        plotSection.getBoundingClientRect = () => rect;

        // Mock getComputedStyle
        window.getComputedStyle = jest.fn().mockReturnValue({
            paddingTop: '10px',
            paddingBottom: '10px',
            marginTop: '5px'
        });

        // Mock offsetHeight
        Object.defineProperty(legend, 'offsetHeight', { value: 20, writable: true });
    });

    it('resets heights for desktop (>768px)', () => {
        window.innerWidth = 800;
        tableContainer.style.height = '500px';
        plotSection.style.height = '500px';
        chartContainer.style.height = '400px';

        adjustMobilePanels();

        expect(tableContainer.style.height).toBe('');
        expect(plotSection.style.height).toBe('');
        expect(chartContainer.style.height).toBe('');
    });

    it('handles mobile view with missing elements', () => {
        document.body.innerHTML = '';
        expect(() => adjustMobilePanels()).not.toThrow();
    });

    it('sets available height for visible tableContainer in mobile', () => {
        adjustMobilePanels();
        // viewport = 800, top = 100, spacing = 16 => 800 - 100 - 16 = 684
        expect(tableContainer.style.height).toBe('684px');
    });

    it('resets height if panel is hidden', () => {
        tableContainer.classList.add('is-hidden');
        tableContainer.style.height = '500px';

        adjustMobilePanels();

        expect(tableContainer.style.height).toBe('');
    });

    it('calculates chart container height inside visible plot section', () => {
        // cardHeight = 684
        // paddings = 10+10 = 20
        // legend height = 20
        // legend margin = 5
        // constant subtraction = 8
        // innerAvailable = 684 - 20 - 20 - 5 - 8 = 631
        adjustMobilePanels();
        expect(plotSection.style.height).toBe('684px');
        expect(chartContainer.style.height).toBe('631px');
    });

    it('uses fallback math.max for small heights', () => {
        window.innerHeight = 200;
        // 200 - 100 - 16 = 84 < 200 => height should be 200px
        adjustMobilePanels();
        expect(tableContainer.style.height).toBe('200px');
        expect(plotSection.style.height).toBe('200px');
        // chart inner available => 200 - 20 - 20 - 5 - 8 = 147 < 160 => 160px
        expect(chartContainer.style.height).toBe('160px');
    });

    it('handles missing legend', () => {
        legend.remove();
        adjustMobilePanels();
        // cardHeight = 684
        // paddings = 20
        // legend missing = 0 height, 0 margin
        // inner = 684 - 20 - 0 - 0 - 8 = 656
        expect(chartContainer.style.height).toBe('656px');
    });

    it('handles hidden plotSection and clears chart container height', () => {
        plotSection.classList.add('is-hidden');
        chartContainer.style.height = '400px';
        plotSection.style.height = '400px';

        adjustMobilePanels();

        expect(chartContainer.style.height).toBe('');
        expect(plotSection.style.height).toBe('');
    });
});
