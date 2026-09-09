import { applyCurrencyColors, getValueFieldForCurrency } from '@pages/calendar/colorUtils.js';

jest.mock('@js/config.js', () => ({
    CALENDAR_CONFIG: {},
    CALENDAR_SELECTORS: { heatmap: '.heatmap' },
}));

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
                                cells.forEach((cell) =>
                                    cb.call(cell.domNode, cell.selection.datum())
                                );
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

    it('handles falsy d3Instance, state, byDate safely', () => {
        const byDate = new Map([['2025-01-01', { value: 0.01 }]]);
        expect(() => applyCurrencyColors(null, { selectedCurrency: 'USD' }, byDate)).not.toThrow();
        expect(() => applyCurrencyColors(createD3Stub([]), null, byDate)).not.toThrow();
        expect(() =>
            applyCurrencyColors(createD3Stub([]), { selectedCurrency: 'USD' }, null)
        ).not.toThrow();
        expect(() =>
            applyCurrencyColors(createD3Stub([]), { selectedCurrency: 'USD' }, {})
        ).not.toThrow();
    });

    it('handles falsy heatmapRoot safely', () => {
        const d3Stub = {
            scaleLinear: jest.fn(() => ({
                domain: jest.fn().mockReturnThis(),
                range: jest.fn().mockReturnThis(),
                clamp: jest.fn().mockReturnThis(),
            })),
            select: jest.fn(() => null),
        };
        const byDate = new Map();
        expect(() =>
            applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate)
        ).not.toThrow();
        d3Stub.select = jest.fn(() => ({}));
        expect(() =>
            applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate)
        ).not.toThrow();
    });

    it('handles undefined colorScale', () => {
        const cells = [makeCell('2025-01-01')];
        const d3Stub = createD3Stub(cells);
        delete d3Stub.scaleLinear;
        const byDate = new Map([['2025-01-01', { value: 0.01 }]]);
        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate);
        expect(cells[0].attrCalls).toContain(undefined);
    });

    it('handles custom scaleConfig correctly', () => {
        const cells = [makeCell('2025-01-01')];
        const d3Stub = createD3Stub(cells);
        const byDate = new Map([['2025-01-01', { value: 0.01 }]]);

        // Default CALENDAR_CONFIG.scale.color logic triggers the default domain/range setup.
        // As long as the d3Scale instance processes correctly, the mock stub returns 'POS'
        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate, undefined, null);
        expect(cells[0].attrCalls).toContain('POS');

        cells[0].attrCalls.length = 0;
        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate, undefined, {});
        expect(cells[0].attrCalls).toContain('POS');

        cells[0].attrCalls.length = 0;
        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate, undefined, {
            domain: [1],
            range: ['red'],
        });
        expect(cells[0].attrCalls).toContain('POS');

        cells[0].attrCalls.length = 0;
        const scaleConfig = {
            domain: [-1, 1],
            range: ['red', 'white', 'green'],
        };
        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate, undefined, scaleConfig);
        expect(cells[0].attrCalls).toContain('POS');
    });

    it('handles missing datum timestamp gracefully', () => {
        const cells = [makeCell('2025-01-01')];
        // Override datum to be malformed
        cells[0].selection.datum = jest.fn(() => ({}));

        const d3Stub = createD3Stub(cells);
        const byDate = new Map([['2025-01-01', { value: 0.01 }]]);
        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate);
        expect(cells[0].attrCalls.length).toBe(0);

        cells[0].selection.datum = jest.fn(() => null);
        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate);
        expect(cells[0].attrCalls.length).toBe(0);
    });

    it('extracts date from raw Date instance datum', () => {
        const cells = [makeCell('2025-01-01')];
        cells[0].selection.datum = jest.fn(() => new Date('2025-01-01T00:00:00Z'));

        const d3Stub = createD3Stub(cells);
        const byDate = new Map([['2025-01-01', { value: 0.01 }]]);
        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate);
        expect(cells[0].attrCalls).toContain('POS');
    });

    it('handles extractDateFromDatum invalid Date', () => {
        const cells = [makeCell('invalid date')];
        cells[0].selection.datum = jest.fn(() => new Date('invalid date'));

        const d3Stub = createD3Stub(cells);
        const byDate = new Map([['2025-01-01', { value: 0.01 }]]);
        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate);
        expect(cells[0].attrCalls.length).toBe(0); // Should return early and apply no color
    });

    it('handles missing or non-finite values in byDate gracefully', () => {
        const cells = [makeCell('2025-01-01')];
        const d3Stub = createD3Stub(cells);
        const byDate = new Map([
            ['2025-01-01', { value: NaN }], // NaN value
        ]);
        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate);
        expect(cells[0].attrCalls).toContain('NEU'); // Because value falls to 0

        cells[0].attrCalls.length = 0;
        const byDate2 = new Map([
            ['2025-01-01', {}], // Missing value
        ]);
        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate2);
        expect(cells[0].attrCalls).toContain('NEU'); // Falls to 0

        cells[0].attrCalls.length = 0;
        const byDate3 = new Map([
            // missing entry
        ]);
        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate3);
        expect(cells[0].attrCalls).toContain('NEU'); // Falls to 0

        cells[0].attrCalls.length = 0;
        const byDate4 = new Map([
            ['2025-01-01', null], // null entry
        ]);
        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate4);
        expect(cells[0].attrCalls).toContain('NEU'); // Falls to 0
    });

    it('tests fallback missing properties on scale cells', () => {
        const cells = [makeCell('2025-01-01')];
        const d3Stub = createD3Stub(cells);

        // Remove attr and style from cell
        d3Stub.select = jest.fn((selector) => {
            if (typeof selector === 'string') {
                return {
                    selectAll: jest.fn(() => ({
                        each: (cb) => {
                            cells.forEach((cell) => cb.call(cell.domNode, cell.selection.datum()));
                        },
                    })),
                };
            }
            if (selector && selector.__selection) {
                return {
                    datum: selector.__selection.datum,
                    attr: undefined,
                    style: undefined,
                };
            }
            return {
                datum: jest.fn().mockReturnValue({ t: Date.now() }),
            };
        });

        const byDate = new Map([['2025-01-01', { value: 0.01 }]]);
        expect(() =>
            applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate)
        ).not.toThrow();
    });

    it('tests missing cell in applyColorToCell fallback', () => {
        const cells = [makeCell('2025-01-01')];
        const d3Stub = createD3Stub(cells);

        d3Stub.select = jest.fn((selector) => {
            if (typeof selector === 'string') {
                return {
                    selectAll: jest.fn(() => ({
                        each: (cb) => {
                            cells.forEach((cell) => cb.call(cell.domNode, cell.selection.datum()));
                        },
                    })),
                };
            }
            if (selector && selector.__selection) {
                return null; // Return null for cell
            }
            return {
                datum: jest.fn().mockReturnValue({ t: Date.now() }),
            };
        });

        const byDate = new Map([['2025-01-01', { value: 0.01 }]]);
        expect(() =>
            applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate)
        ).not.toThrow();
    });

    it('handles cell without datum in each block', () => {
        const cells = [makeCell('2025-01-01')];
        const d3Stub = createD3Stub(cells);

        d3Stub.select = jest.fn((selector) => {
            if (typeof selector === 'string') {
                return {
                    selectAll: jest.fn(() => ({
                        each: (cb) => {
                            // Missing datum from argument
                            cells.forEach((cell) => cb.call(cell.domNode));
                        },
                    })),
                };
            }
            if (selector && selector.__selection) {
                return {
                    attr: selector.__selection.attr,
                    style: selector.__selection.style,
                    // No datum function
                };
            }
            return {
                datum: jest.fn().mockReturnValue({ t: Date.now() }),
            };
        });

        const byDate = new Map([['2025-01-01', { value: 0.01 }]]);
        applyCurrencyColors(d3Stub, { selectedCurrency: 'USD' }, byDate);
        expect(cells[0].attrCalls.length).toBe(0);
    });
});
