import { jest } from '@jest/globals';

// Mock requestAnimationFrame
global.requestAnimationFrame = (callback) => {
    callback();
    return 0;
};

describe('Terminal Crosshair Multi-line Support', () => {
    let updateTerminalCrosshair;

    beforeEach(async () => {
        document.body.innerHTML = '<div id="terminal"></div>';
        jest.resetModules();
        const terminalModule = await import('@js/transactions/terminal.js');
        updateTerminalCrosshair = terminalModule.updateTerminalCrosshair;
        jest.useFakeTimers();
    });

    test('updateTerminalCrosshair renders newline values as breakdowns', () => {
        const snapshot = {
            dateLabel: 'Jan 01, 2024',
            series: [
                {
                    key: 'portfolioPE',
                    label: 'P/E',
                    color: '#ffffff',
                    formatted: '25.0x\n(AAPL:30 MSFT:28)',
                },
            ],
        };

        updateTerminalCrosshair(snapshot, null);

        const list = document.getElementById('terminalCrosshairList');
        expect(list).not.toBeNull();

        const rows = list.querySelectorAll('.terminal-crosshair-row');
        expect(rows.length).toBe(1);

        const mainValue = rows[0].querySelector('.terminal-crosshair-value');
        expect(mainValue.textContent).toBe('25.0x');

        const breakdown = rows[0].querySelector('.terminal-crosshair-breakdown');
        expect(breakdown).not.toBeNull();
        expect(breakdown.textContent).toBe('(AAPL:30 MSFT:28)');

        // Also check if it's rendered as expected in the innerHTML
        expect(rows[0].innerHTML).toContain('terminal-crosshair-breakdown');
    });

    test('updateTerminalCrosshair renders single line values normally', () => {
        const snapshot = {
            dateLabel: 'Jan 01, 2024',
            series: [
                {
                    key: 'benchmark',
                    label: 'S&P 500',
                    color: '#999999',
                    formatted: '22.0x',
                },
            ],
        };

        updateTerminalCrosshair(snapshot, null);

        const list = document.getElementById('terminalCrosshairList');
        const rows = list.querySelectorAll('.terminal-crosshair-row');

        const mainValue = rows[0].querySelector('.terminal-crosshair-value');
        expect(mainValue.textContent).toBe('22.0x');

        const breakdown = rows[0].querySelector('.terminal-crosshair-breakdown');
        expect(breakdown).toBeNull();
    });
});
