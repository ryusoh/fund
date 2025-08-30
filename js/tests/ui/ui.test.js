import { initCurrencyToggle } from '@ui/currencyToggleManager.js';
import { initFooterToggle } from '@ui/footerToggle.js';
import { checkAndToggleVerticalScroll, alignToggleWithChartMobile, initCalendarResponsiveHandlers } from '@ui/responsive.js';

describe('UI components', () => {
  // ... (existing tests for currencyToggleManager and footerToggle)

  describe('responsive.js', () => {
    describe('checkAndToggleVerticalScroll', () => {
      it('should reset overflowY on desktop', () => {
        // ... (existing test)
      });

      it('should not change overflowY on mobile', () => {
        // Arrange
        Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 });
        document.documentElement.style.overflowY = 'hidden';

        // Act
        checkAndToggleVerticalScroll();

        // Assert
        expect(document.documentElement.style.overflowY).toBe('hidden');
      });
    });

    describe('alignToggleWithChartMobile', () => {
      beforeEach(() => {
        document.body.innerHTML = `
          <div id="currencyToggleContainer"></div>
          <div id="fundPieChartContainer"></div>
        `;
      });

      it('should align the toggle with the chart on mobile', () => {
        // ... (existing test)
      });

      it('should reset styles on desktop', () => {
        // Arrange
        Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
        const toggleContainer = document.getElementById('currencyToggleContainer');
        toggleContainer.style.top = '225px';
        toggleContainer.style.position = 'fixed';

        // Act
        alignToggleWithChartMobile();

        // Assert
        expect(toggleContainer.style.top).toBe('');
        expect(toggleContainer.style.position).toBe('');
      });
    });

    describe('initCalendarResponsiveHandlers', () => {
        it('should add a dblclick event listener to the today button', () => {
            // ... (existing test)
        });

        it('should align the calendar toggle on mobile', () => {
            // Arrange
            Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 });
            document.body.innerHTML = `
                <div id="currencyToggleContainer"></div>
                <div id="cal-heatmap"></div>
            `;
            const toggleContainer = document.getElementById('currencyToggleContainer');
            const heatmapContainer = document.getElementById('cal-heatmap');
            heatmapContainer.getBoundingClientRect = jest.fn(() => ({ top: 50, height: 200 }));
            Object.defineProperty(toggleContainer, 'offsetHeight', { configurable: true, value: 40 });

            // Act
            initCalendarResponsiveHandlers();
            // Manually trigger a resize to run the alignment logic
            window.dispatchEvent(new Event('resize'));

            // Assert
            // heatmapCenterY = 50 + 200 / 2 = 150
            // toggleTop = 150 - 40 / 2 = 130
            expect(toggleContainer.style.top).toBe('130px');
        });
    });
  });
});
