import {
    buildRangeSummary,
    sortCrosshairSnapshot,
    isVolumeBarKey,
    crosshairState,
} from '../../../../js/transactions/chart/interaction.js';
import { formatCurrencyInline } from '../../../../js/transactions/utils.js';

jest.mock('../../../../js/transactions/utils.js', () => ({
    formatCurrencyInline: jest.fn((val) => `$${val.toFixed(2)}`),
    formatPercentInline: jest.fn((val) => `${val.toFixed(2)}%`),
}));

describe('Interaction logic', () => {
    describe('buildRangeSummary', () => {
        it('calculates the correct delta for the contribution series containing a dividend drop', () => {
            // Mock a layout object that represents the contribution chart
            const mockContributionSeries = {
                key: 'contribution',
                label: 'Contribution',
                // Simulate contribution growing, then dropping by dividend, then growing
                // Jan 1: 1000
                // Jan 2: 2000
                // Jan 3: 1500 (500 dividend payout)
                getValueAtTime: jest.fn((time) => {
                    if (time === 100) {
                        return 1000;
                    }
                    if (time === 200) {
                        return 2000;
                    }
                    if (time === 300) {
                        return 1500;
                    }
                    return 0;
                }),
                formatDelta: (delta) => formatCurrencyInline(delta),
            };

            const layout = {
                minTime: 0,
                maxTime: 1000,
                valueType: 'currency',
                series: [mockContributionSeries],
            };

            // Range from Jan 1 (100) to Jan 3 (300)
            const summary = buildRangeSummary(layout, 100, 300);

            // Expected delta: End Value (1500) - Start Value (1000) = +500
            // Even though we added 1000 on Jan 2, the dividend subtracted 500 on Jan 3,
            // so the net change is 500.

            expect(summary).not.toBeNull();
            expect(summary.entries.length).toBe(1);

            const entry = summary.entries[0];
            expect(entry.key).toBe('contribution');
            expect(entry.delta).toBe(500);
            expect(entry.deltaFormatted).toBe('$500.00');
        });
    });

    describe('sortCrosshairSnapshot', () => {
        it('sorts standard keys in a fixed order: contribution, balance, appreciation, buy, sell', () => {
            const snapshot = [
                { key: 'sellVolume', value: 1000, isBuySellBar: true },
                { key: 'appreciation', value: -500, isBuySellBar: false },
                { key: 'contribution', value: 200, isBuySellBar: false },
                { key: 'buyVolume', value: 10, isBuySellBar: true },
                { key: 'balance', value: 300, isBuySellBar: false },
            ];

            sortCrosshairSnapshot(snapshot);

            expect(snapshot[0].key).toBe('contribution');
            expect(snapshot[1].key).toBe('balance');
            expect(snapshot[2].key).toBe('appreciation');
            expect(snapshot[3].key).toBe('buyVolume');
            expect(snapshot[4].key).toBe('sellVolume');
        });

        it('orders volume keys after line-series keys in fixed order', () => {
            const snapshot = [
                { key: 'sellVolume', value: 1000, isBuySellBar: true },
                { key: 'buyVolume', value: 10, isBuySellBar: true },
                { key: 'contribution', value: 200, isBuySellBar: false },
            ];

            sortCrosshairSnapshot(snapshot);

            expect(snapshot.map((s) => s.key)).toEqual(['contribution', 'buyVolume', 'sellVolume']);
        });

        it('sorts regular unknown series by absolute value descending after fixed keys', () => {
            const snapshot = [
                { key: 'seriesB', value: -300, isBuySellBar: false },
                { key: 'contribution', value: 100, isBuySellBar: false },
                { key: 'seriesA', value: 500, isBuySellBar: false },
                { key: 'seriesC', value: 100, isBuySellBar: false },
            ];

            sortCrosshairSnapshot(snapshot);

            expect(snapshot[0].key).toBe('contribution'); // Fixed keys first
            expect(snapshot[1].key).toBe('seriesA'); // abs: 500
            expect(snapshot[2].key).toBe('seriesB'); // abs: 300
            expect(snapshot[3].key).toBe('seriesC'); // abs: 100
        });
    });

    describe('isVolumeBarKey', () => {
        it('classifies buy and sell volume-bar series keys', () => {
            expect(isVolumeBarKey('buyVolume')).toBe(true);
            expect(isVolumeBarKey('sellVolume')).toBe(true);
        });

        it('rejects non-volume series keys', () => {
            expect(isVolumeBarKey('contribution')).toBe(false);
            expect(isVolumeBarKey('balance')).toBe(false);
            expect(isVolumeBarKey('dividendVolume')).toBe(false);
        });
    });

    describe('attachCrosshairEvents', () => {
        let canvas;
        let chartManager;
        let container;

        beforeEach(() => {
            jest.resetModules();

            // Setup DOM elements
            container = document.createElement('div');
            container.className = 'chart-container';

            canvas = document.createElement('canvas');
            canvas.getBoundingClientRect = jest.fn(() => ({
                left: 10,
                top: 10,
                width: 500,
                height: 300,
                right: 510,
                bottom: 310,
            }));

            container.appendChild(canvas);
            document.body.appendChild(container);

            chartManager = {
                redraw: jest.fn(),
            };

            crosshairState.dragging = false;
            crosshairState.active = false;
            crosshairState.hoverTime = null;
        });

        afterEach(() => {
            document.body.innerHTML = '';
            jest.clearAllMocks();
        });

        it('should bind pointer events and handle a simple lifecycle', async () => {
            jest.mock('../../../../js/transactions/state.js', () => ({
                transactionState: {
                    activeChart: 'contribution',
                },
            }));
            jest.mock('../../../../js/transactions/chart/state.js', () => ({
                chartLayouts: {
                    contribution: {
                        key: 'contribution',
                        chartBounds: { left: 0, right: 500, top: 0, bottom: 300 },
                        invertX: jest.fn(() => 1000),
                    },
                },
            }));

            // Dynamic import to get the mocked state
            const interactionMod = await import('../../../../js/transactions/chart/interaction.js');

            interactionMod.attachCrosshairEvents(canvas, chartManager);

            // Pointer down
            const pointerDownEvent = document.createEvent('Event');
            pointerDownEvent.initEvent('pointerdown', true, true);
            pointerDownEvent.clientX = 50;
            pointerDownEvent.clientY = 50;
            pointerDownEvent.pointerId = 1;
            canvas.dispatchEvent(pointerDownEvent);

            expect(interactionMod.crosshairState.active).toBe(true);
            expect(interactionMod.crosshairState.dragging).toBe(true);
            expect(chartManager.redraw).toHaveBeenCalled();

            // Pointer move
            const pointerMoveEvent = document.createEvent('Event');
            pointerMoveEvent.initEvent('pointermove', true, true);
            pointerMoveEvent.clientX = 100;
            pointerMoveEvent.clientY = 50;
            canvas.dispatchEvent(pointerMoveEvent);

            expect(interactionMod.crosshairState.rangeEnd).toBe(1000);

            // Pointer up
            const pointerUpEvent = document.createEvent('Event');
            pointerUpEvent.initEvent('pointerup', true, true);
            pointerUpEvent.clientX = 100;
            pointerUpEvent.clientY = 50;
            pointerUpEvent.pointerId = 1;
            canvas.dispatchEvent(pointerUpEvent);

            expect(interactionMod.crosshairState.dragging).toBe(false);

            // Pointer leave
            const pointerLeaveEvent = document.createEvent('Event');
            pointerLeaveEvent.initEvent('pointerleave', true, true);
            canvas.dispatchEvent(pointerLeaveEvent);
        });

        it('should handle interaction with no range functionality on layout', async () => {
            jest.mock('../../../../js/transactions/state.js', () => ({
                transactionState: {
                    activeChart: 'composition',
                },
            }));
            jest.mock('../../../../js/transactions/chart/state.js', () => ({
                chartLayouts: {
                    composition: {
                        key: 'composition',
                        chartBounds: { left: 0, right: 500, top: 0, bottom: 300 },
                        invertX: jest.fn(() => 1000),
                    },
                },
            }));

            // Dynamic import to get the mocked state
            const interactionMod = await import('../../../../js/transactions/chart/interaction.js');

            interactionMod.attachCrosshairEvents(canvas, chartManager);

            // Pointer down
            const pointerDownEvent = document.createEvent('Event');
            pointerDownEvent.initEvent('pointerdown', true, true);
            pointerDownEvent.clientX = 50;
            pointerDownEvent.clientY = 50;
            pointerDownEvent.pointerId = 1;
            canvas.dispatchEvent(pointerDownEvent);

            expect(interactionMod.crosshairState.rangeStart).toBe(null);

            // Pointer move
            const pointerMoveEvent = document.createEvent('Event');
            pointerMoveEvent.initEvent('pointermove', true, true);
            pointerMoveEvent.clientX = 100;
            pointerMoveEvent.clientY = 50;
            canvas.dispatchEvent(pointerMoveEvent);

            expect(interactionMod.crosshairState.rangeEnd).toBe(null);

            // Double click
            const dblClickEvent = document.createEvent('Event');
            dblClickEvent.initEvent('dblclick', true, true);
            canvas.dispatchEvent(dblClickEvent);
            expect(interactionMod.crosshairState.active).toBe(false);
        });
    });
});
