import { applyCurrencyColors, getValueFieldForCurrency } from '@pages/calendar/colorUtils.js';

describe('colorUtils', () => {
    const makeCell = (dateStr) => {
        const attrCalls = [];
        const styleCalls = [];
        const selection = {
            datum: jest.fn(() => ({ t: new Date(`${dateStr}T00:00:00Z`).getTime() })),
            attr: jest.fn((name, value) => {
                if (name === 'fill') {
                    attrCalls.push(value);
                }
                return selection;
            }),
            style: jest.fn((name, value) => {
                if (name === 'fill') {
                    styleCalls.push(value);
                }
                return selection;
            }),
        };
        const domNode = { __selection: selection };
        return { selection, domNode, attrCalls, styleCalls };
    };

    const createD3Stub = (cells) => {
        const scaleFn = jest.fn((value) => {
            if (value < 0) {
                return 'NEG';
            }
            if (value > 0) {
                return 'POS';
            }
            return 'NEU';
        });
        scaleFn.domain = jest.fn(() => scaleFn);
        scaleFn.range = jest.fn(() => scaleFn);
        scaleFn.clamp = jest.fn(() => scaleFn);

        return {
            scaleLinear: jest.fn(() => scaleFn),
            select: jest.fn((selector) => {
                if (typeof selector === 'string') {
                    return {
                        selectAll: jest.fn(() => ({
                            each: (cb) => {
                                cells.forEach((cell) => cb.call(cell.domNode));
                            },
                        })),
                    };
                }
                if (selector && selector.__selection) {
                    return selector.__selection;
                }
                return {
                    datum: jest.fn().mockReturnValue({ t: Date.now() }),
                    attr: jest.fn().mockReturnThis(),
                    style: jest.fn().mockReturnThis(),
                };
            }),
        };
    };

    it('maps currencies to value fields', () => {
        expect(getValueFieldForCurrency('USD')).toBe('valueUSD');
        expect(getValueFieldForCurrency('CNY')).toBe('valueCNY');
        expect(getValueFieldForCurrency('JPY')).toBe('valueJPY');
        expect(getValueFieldForCurrency('KRW')).toBe('valueKRW');
        expect(getValueFieldForCurrency('UNKNOWN')).toBe('valueUSD');
    });

    it('applies currency-specific colors to heatmap cells', () => {
        const cells = [makeCell('2025-01-01'), makeCell('2025-01-02')];
        const d3Stub = createD3Stub(cells);
        const byDate = new Map([
            ['2025-01-01', { value: 0.01, valueUSD: 0.01, valueCNY: -0.02 }],
            ['2025-01-02', { value: 0.02, valueUSD: 0.02, valueCNY: 0.03 }],
        ]);

        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate);
        expect(cells[0].attrCalls).toContain('POS');
        expect(cells[1].attrCalls).toContain('POS');

        cells.forEach((cell) => {
            cell.attrCalls.length = 0;
            cell.styleCalls.length = 0;
        });

        applyCurrencyColors(d3Stub, { selectedCurrency: 'CNY' }, byDate);
        expect(cells[0].attrCalls).toContain('NEG');
        expect(cells[1].attrCalls).toContain('POS');
        expect(cells[0].styleCalls).toContain('NEG');
    });
});
