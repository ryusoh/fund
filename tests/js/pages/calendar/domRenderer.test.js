import { DomRenderer } from '@pages/calendar/renderers/DomRenderer.js';

const RED = '244,67,54';
const GREEN = '76,175,80';

function makeConfig(overrides = {}) {
    return {
        itemSelector: '#cal-heatmap',
        range: 2,
        scale: {
            color: {
                domain: [-0.01, 0.01],
                range: [
                    'rgba(244, 67, 54, 0.95)',
                    'rgba(120, 120, 125, 0.5)',
                    'rgba(76, 175, 80, 0.95)',
                ],
            },
        },
        subDomain: { width: 45, height: 45, gutter: 6, radius: 3 },
        data: {
            source: [
                { date: '2025-01-15', valueUSD: 0.02 },
                { date: '2025-01-10', valueUSD: -0.02 },
            ],
            x: 'date',
            y: 'valueUSD',
        },
        // Jan 2025 visible window of 2 months: Jan..Feb; bounds Dec 2024..Feb 2025
        date: {
            start: new Date(2025, 0, 1),
            min: new Date(2024, 11, 1),
            max: new Date(2025, 1, 1),
            highlight: [new Date(Date.UTC(2025, 0, 15))],
        },
        onMinDomainReached: jest.fn(),
        onMaxDomainReached: jest.fn(),
        ...overrides,
    };
}

describe('DomRenderer', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="cal-heatmap"></div>';
        document.querySelectorAll('#domcal-styles').forEach((el) => el.remove());
    });

    it('paints one grid per visible month with a cell per day', async () => {
        const r = new DomRenderer();
        await r.paint(makeConfig());

        expect(document.querySelectorAll('.domcal-month')).toHaveLength(2);
        // Jan (31) + Feb (28, 2025 not a leap year) = 59 day cells
        expect(document.querySelectorAll('.domcal-cell')).toHaveLength(59);
        expect(document.querySelector('.domcal-month-label').textContent).toBe('Jan 2025');
    });

    it('colours cells by the diverging scale and marks today', async () => {
        const r = new DomRenderer();
        await r.paint(makeConfig());

        const up = document.querySelector('[data-date="2025-01-15"]');
        const down = document.querySelector('[data-date="2025-01-10"]');
        expect(up.style.backgroundImage).toContain(GREEN);
        expect(down.style.backgroundImage).toContain(RED);
        // highlight date is today
        expect(up.classList.contains('domcal-cell--today')).toBe(true);
        expect(down.classList.contains('domcal-cell--today')).toBe(false);
    });

    it('fires domain-reached callbacks for the current window', async () => {
        const config = makeConfig();
        const r = new DomRenderer();
        await r.paint(config);
        // window Jan..Feb: not at min (Dec), at max (Feb)
        expect(config.onMinDomainReached).toHaveBeenLastCalledWith(false);
        expect(config.onMaxDomainReached).toHaveBeenLastCalledWith(true);
    });

    it('clamps next at the max bound (no move) and emits on real navigation', async () => {
        const config = makeConfig();
        const r = new DomRenderer();
        const onDateChange = jest.fn();
        const onFill = jest.fn();
        r.on('date-change', onDateChange);
        r.on('fill', onFill);
        await r.paint(config);
        // paint itself emits date-change/fill; isolate navigation below
        onDateChange.mockClear();
        onFill.mockClear();

        // already at max window -> next is a no-op (no new date-change)
        await r.next();
        expect(onDateChange).not.toHaveBeenCalled();

        // previous moves the window back to Dec..Jan -> emits
        await r.previous();
        expect(onDateChange).toHaveBeenCalledTimes(1);
        expect(onFill).toHaveBeenCalledTimes(1);
        const payload = onDateChange.mock.calls[0][0];
        expect(payload.domain.start.getMonth()).toBe(11); // December
    });

    it('recolours cells for the active currency on renderState (no repaint)', async () => {
        const config = makeConfig({
            data: {
                source: [{ date: '2025-01-15', valueUSD: 0.02, valueCNY: -0.02 }],
                x: 'date',
                y: 'valueUSD',
            },
        });
        const r = new DomRenderer();
        await r.paint(config);
        const cell = document.querySelector('[data-date="2025-01-15"]');
        expect(cell.style.backgroundImage).toContain(GREEN); // USD positive

        const byDate = new Map([
            ['2025-01-15', { date: '2025-01-15', valueUSD: 0.02, valueCNY: -0.02 }],
        ]);
        r.renderState({ byDate, state: { selectedCurrency: 'CNY' }, currencySymbols: {} });
        expect(cell.style.backgroundImage).toContain(RED); // CNY negative
    });

    it('renders and clears per-cell labels via renderState', async () => {
        const r = new DomRenderer();
        await r.paint(makeConfig());
        const byDate = new Map([
            [
                '2025-01-15',
                {
                    date: '2025-01-15',
                    valueUSD: 0.02,
                    dailyChange: 5,
                    total: 1000,
                    dailyChangeUSD: 5,
                    totalUSD: 1000,
                },
            ],
        ]);
        const state = { selectedCurrency: 'USD', labelsVisible: true, rates: { USD: 1 } };
        r.renderState({ byDate, state, currencySymbols: { USD: '$' } });

        const cell = document.querySelector('[data-date="2025-01-15"]');
        expect(cell.classList.contains('domcal-cell--labeled')).toBe(true);
        expect(cell.querySelector('.domcal-line0').textContent).toBe('15');

        // Toggling labels off clears the cell content
        r.renderState({ byDate, state: { ...state, labelsVisible: false }, currencySymbols: {} });
        expect(cell.classList.contains('domcal-cell--labeled')).toBe(false);
        expect(cell.childElementCount).toBe(0);
    });

    it('jumpTo scrolls an out-of-view month into the window', async () => {
        const config = makeConfig({
            range: 1,
            date: {
                start: new Date(2025, 0, 1),
                min: new Date(2024, 0, 1),
                max: new Date(2025, 5, 1),
                highlight: [new Date(Date.UTC(2025, 0, 15))],
            },
        });
        const r = new DomRenderer();
        await r.paint(config);
        expect(document.querySelector('.domcal-month-label').textContent).toBe('Jan 2025');

        await r.jumpTo(new Date(2025, 3, 10)); // April
        expect(document.querySelector('.domcal-month-label').textContent).toBe('Apr 2025');
    });
});
