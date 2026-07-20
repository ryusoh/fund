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

    it('handles various edge cases', () => {
        const cells = [makeCell('2025-01-01')];
        const d3Stub = createD3Stub(cells);
        const byDate = new Map();

        // Should return early if d3Instance, state or byDate is not provided/valid
        applyCurrencyColors(null, { selectedCurrency: 'USD' }, byDate);
        applyCurrencyColors(d3Stub, null, byDate);
        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, null);
        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, {});

        // Test with undefined selector element
        const d3StubMissingSelector = {
            ...d3Stub,
            select: jest.fn(() => null),
        };
        applyCurrencyColors(d3StubMissingSelector, { selectedCurrency: 'USD' }, byDate);

        // Test scaleConfig
        const scaleConfig = { domain: [-0.05, 0.05], range: ['red', 'white', 'blue'] };
        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate, undefined, scaleConfig);

        // Test bad scaleConfig
        const badScaleConfig = { domain: 'bad', range: 'bad' };
        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate, undefined, badScaleConfig);
    });

    it('extracts date from datum correctly and safely applies colors', () => {
        const cells = [
            makeCell('2025-01-01'), // normal cell
            {
                ...makeCell('2025-01-02'),
                selection: { datum: jest.fn(() => null), attr: jest.fn(), style: jest.fn() },
            }, // null datum
            {
                ...makeCell('2025-01-03'),
                selection: {
                    datum: jest.fn(() => new Date('invalid')),
                    attr: jest.fn(),
                    style: jest.fn(),
                },
            }, // invalid date
            {
                ...makeCell('2025-01-04'),
                selection: {
                    datum: jest.fn(() => ({ t: null })),
                    attr: jest.fn(),
                    style: jest.fn(),
                },
            }, // no t property
            {
                ...makeCell('2025-01-05'),
                selection: {
                    datum: jest.fn(() => new Date('2025-01-05')),
                    attr: jest.fn(),
                    style: jest.fn(),
                },
            }, // date directly
        ];

        cells[0].domNode.__selection.datum = jest.fn(() => ({
            t: new Date('2025-01-01').getTime(),
        }));

        const d3Stub = createD3Stub(cells);
        const byDate = new Map([
            ['2025-01-01', { value: 0 }],
            ['2025-01-05', undefined], // testing missing entry value
        ]);

        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate);

        // Assert we got coverage without crashing
        expect(cells[0].attrCalls.length).toBeGreaterThan(0);
    });

    it('handles resolving d3 scale issues', () => {
        const cells = [makeCell('2025-01-01')];
        const d3Stub = createD3Stub(cells);
        d3Stub.scaleLinear = null;

        const byDate = new Map([['2025-01-01', { value: 1 }]]);
        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate);

        expect(cells[0].attrCalls).toContain(undefined);
    });
});
