import { __testables } from '@pages/calendar/index.js';

jest.mock('@services/dataService.js', () => ({
    getCalendarData: jest.fn(),
}));

jest.mock('@ui/currencyToggleManager.js', () => ({
    initCurrencyToggle: jest.fn(),
    cycleCurrency: jest.fn(),
    applyCurrencySelection: jest.fn(),
    getStoredCurrency: jest.fn(() => null),
}));

jest.mock('@ui/responsive.js', () => ({
    initCalendarResponsiveHandlers: jest.fn(),
}));

jest.mock('@ui/calendarMonthLabelManager.js', () => ({
    updateMonthLabels: jest.fn(),
}));

jest.mock('@ui/liquidGlassRefraction.js', () => ({
    LiquidGlassRefraction: jest.fn().mockImplementation(() => ({
        update: jest.fn(),
        dispose: jest.fn(),
    })),
}));

describe('initCalendarZoomPane', () => {
    let wrapper;

    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML = '';
        wrapper = document.createElement('main');
        wrapper.className = 'page-center-wrapper';
        wrapper.getBoundingClientRect = jest.fn(() => ({
            left: -340,
            top: 172,
            width: 2394,
            height: 762,
            right: 2054,
            bottom: 934,
        }));
        document.body.appendChild(wrapper);
    });

    afterEach(() => {
        jest.useRealTimers();
        const overlay = document.getElementById('calendar-zoom-lens');
        if (overlay) {
            overlay.remove();
        }
        document.body.innerHTML = '';
    });

    it('creates an unscaled overlay sized to the zoomed bounding box after settle time', async () => {
        __testables.initCalendarZoomPane();
        expect(document.getElementById('calendar-zoom-lens')).toBeNull();

        wrapper.classList.add('zoomed');
        await Promise.resolve();
        jest.advanceTimersByTime(300);
        expect(document.getElementById('calendar-zoom-lens')).toBeNull();

        jest.advanceTimersByTime(350);
        const overlay = document.getElementById('calendar-zoom-lens');
        expect(overlay).not.toBeNull();
        expect(overlay.style.position).toBe('fixed');
        expect(overlay.style.left).toBe('-340px');
        expect(overlay.style.top).toBe('172px');
        expect(overlay.style.width).toBe('2394px');
        expect(overlay.style.height).toBe('762px');
    });

    it('removes the overlay when zoomed class is removed', async () => {
        __testables.initCalendarZoomPane();
        wrapper.classList.add('zoomed');
        await Promise.resolve();
        jest.advanceTimersByTime(650);
        expect(document.getElementById('calendar-zoom-lens')).not.toBeNull();

        wrapper.classList.remove('zoomed');
        await Promise.resolve();
        expect(document.getElementById('calendar-zoom-lens')).toBeNull();
    });

    it('updates overlay geometry on window resize while zoomed', async () => {
        __testables.initCalendarZoomPane();
        wrapper.classList.add('zoomed');
        await Promise.resolve();
        jest.advanceTimersByTime(650);

        const overlay = document.getElementById('calendar-zoom-lens');
        expect(overlay).not.toBeNull();

        wrapper.getBoundingClientRect = jest.fn(() => ({
            left: -300,
            top: 150,
            width: 2000,
            height: 700,
            right: 1700,
            bottom: 850,
        }));

        window.dispatchEvent(new Event('resize'));
        expect(overlay.style.left).toBe('-300px');
        expect(overlay.style.top).toBe('150px');
        expect(overlay.style.width).toBe('2000px');
        expect(overlay.style.height).toBe('700px');
    });

    it('cleans up on beforeunload', async () => {
        __testables.initCalendarZoomPane();
        wrapper.classList.add('zoomed');
        await Promise.resolve();
        jest.advanceTimersByTime(650);
        expect(document.getElementById('calendar-zoom-lens')).not.toBeNull();

        window.dispatchEvent(new Event('beforeunload'));
        expect(document.getElementById('calendar-zoom-lens')).toBeNull();
    });
});
