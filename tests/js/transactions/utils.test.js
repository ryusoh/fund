import {
    formatCurrency,
    formatCurrencyInlineValue,
    formatCurrencyInline,
    formatCurrencyCompact,
    parseCSVLine,
    convertBetweenCurrencies,
    convertValueToCurrency,
    clearFxRateCache
} from '@js/transactions/utils.js';
import { transactionState } from '@js/transactions/state.js';

describe('formatCurrencyCompact', () => {
    test('uses B suffix for KRW when value exceeds one billion', () => {
        expect(formatCurrencyCompact(1_786_120_000, { currency: 'KRW' })).toBe('₩1.79B');
    });

    test('handles negative billions with USD', () => {
        expect(formatCurrencyCompact(-2_300_000_000, { currency: 'USD' })).toBe('-$2.30B');
    });

    test('formats integer thousands without decimals in USD', () => {
        expect(formatCurrencyCompact(50_000, { currency: 'USD' })).toBe('$50k');
        expect(formatCurrencyCompact(40_000, { currency: 'USD' })).toBe('$40k');
        expect(formatCurrencyCompact(100_000, { currency: 'USD' })).toBe('$100k');
        expect(formatCurrencyCompact(-50_000, { currency: 'USD' })).toBe('-$50k');
    });

    test('maintains decimals for non-integer thousands in USD', () => {
        expect(formatCurrencyCompact(10_500, { currency: 'USD' })).toBe('$10.5k');
        expect(formatCurrencyCompact(50_100, { currency: 'USD' })).toBe('$50.1k');
    });

    test('formats integer millions without decimals in USD', () => {
        expect(formatCurrencyCompact(1_000_000, { currency: 'USD' })).toBe('$1M');
        expect(formatCurrencyCompact(20_000_000, { currency: 'USD' })).toBe('$20M');
    });

    test('maintains decimals for non-integer millions in USD', () => {
        expect(formatCurrencyCompact(1_250_000, { currency: 'USD' })).toBe('$1.25M');
        expect(formatCurrencyCompact(1_500_000, { currency: 'USD' })).toBe('$1.50M');
    });

    test('formats integer billions without decimals in USD', () => {
        expect(formatCurrencyCompact(1_000_000_000, { currency: 'USD' })).toBe('$1B');
    });

    test('formats trillions with T suffix in USD and CJK currencies', () => {
        expect(formatCurrencyCompact(3_500_000_000_000, { currency: 'USD' })).toBe('$3.50T');
        expect(formatCurrencyCompact(1_000_000_000_000, { currency: 'USD' })).toBe('$1T');
        expect(formatCurrencyCompact(2_345_000_000_000, { currency: 'JPY' })).toBe('¥2.35T');
    });

    test('formats zero as integer in USD', () => {
        expect(formatCurrencyCompact(0, { currency: 'USD' })).toBe('$0');
        expect(formatCurrencyCompact(0.004, { currency: 'USD' })).toBe('$0');
    });
});

describe('parseCSVLine', () => {
    test('parses simple comma separated values', () => {
        expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    test('handles values with spaces', () => {
        expect(parseCSVLine(' a , b , c ')).toEqual(['a', 'b', 'c']);
    });

    test('handles quoted values with commas', () => {
        expect(parseCSVLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
    });

    test('handles escaped quotes inside quoted values', () => {
        expect(parseCSVLine('a,"b,""c""",d')).toEqual(['a', 'b,"c"', 'd']);
    });

    test('handles empty values', () => {
        expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
    });
});

describe('convertBetweenCurrencies', () => {
    beforeEach(() => {
        transactionState.fxRatesByCurrency = {
            EUR: {
                sorted: [
                    { date: '2024-01-01', ts: new Date('2024-01-01').getTime() },
                    { date: '2024-01-02', ts: new Date('2024-01-02').getTime() },
                ],
                map: new Map([
                    ['2024-01-01', 0.9],
                    ['2024-01-02', 0.85]
                ])
            },
            JPY: {
                sorted: [
                    { date: '2024-01-01', ts: new Date('2024-01-01').getTime() }
                ],
                map: new Map([
                    ['2024-01-01', 150]
                ])
            }
        };
        transactionState.selectedCurrency = 'USD';
        clearFxRateCache();
    });

    afterEach(() => {
        transactionState.fxRatesByCurrency = {};
        clearFxRateCache();
    });

    test('returns 0 for invalid value', () => {
        expect(convertBetweenCurrencies(NaN, 'USD', '2024-01-01', 'EUR')).toBe(0);
    });

    test('returns original value if source and target currencies are the same', () => {
        expect(convertBetweenCurrencies(100, 'EUR', '2024-01-01', 'EUR')).toBe(100);
    });

    test('converts from USD to another currency', () => {
        expect(convertBetweenCurrencies(100, 'USD', '2024-01-01', 'EUR')).toBe(90);
    });

    test('converts from another currency to USD', () => {
        expect(convertBetweenCurrencies(90, 'EUR', '2024-01-01', 'USD')).toBe(100);
    });

    test('converts between two non-USD currencies', () => {
        expect(convertBetweenCurrencies(90, 'EUR', '2024-01-01', 'JPY')).toBe(15000);
    });

    test('handles missing fx rates by falling back to amount or USD amount', () => {
        expect(convertBetweenCurrencies(100, 'GBP', '2024-01-01', 'USD')).toBe(100);
        expect(convertBetweenCurrencies(100, 'USD', '2024-01-01', 'GBP')).toBe(100);
    });

    test('uses selected currency if toCurrency is omitted', () => {
        transactionState.selectedCurrency = 'EUR';
        expect(convertBetweenCurrencies(100, 'USD', '2024-01-01')).toBe(90);
    });
});

describe('convertValueToCurrency', () => {
    beforeEach(() => {
        transactionState.fxRatesByCurrency = {
            EUR: {
                sorted: [
                    { date: '2024-01-01', ts: new Date('2024-01-01').getTime() },
                    { date: '2024-01-02', ts: new Date('2024-01-02').getTime() },
                ],
                map: new Map([
                    ['2024-01-01', 0.9],
                    ['2024-01-02', 0.85]
                ])
            }
        };
        transactionState.selectedCurrency = 'USD';
        clearFxRateCache();
    });

    afterEach(() => {
        transactionState.fxRatesByCurrency = {};
        clearFxRateCache();
    });

    test('returns 0 for invalid value', () => {
        expect(convertValueToCurrency(NaN, '2024-01-01', 'EUR')).toBe(0);
    });

    test('returns original value if currency is USD', () => {
        expect(convertValueToCurrency(100, '2024-01-01', 'USD')).toBe(100);
    });

    test('returns original value if currency is omitted and selectedCurrency is USD', () => {
        expect(convertValueToCurrency(100, '2024-01-01')).toBe(100);
    });

    test('converts value to specified currency', () => {
        expect(convertValueToCurrency(100, '2024-01-01', 'EUR')).toBe(90);
    });

    test('handles Date objects for date parameter', () => {
        expect(convertValueToCurrency(100, new Date('2024-01-02'), 'EUR')).toBe(85);
    });
});

describe('formatCurrency', () => {
    beforeEach(() => {
        transactionState.selectedCurrency = 'USD';
        transactionState.currencySymbol = '$';
    });

    test('formats valid numbers properly with default currency', () => {
        expect(formatCurrency(1234.56)).toBe('$1,234.56');
        expect(formatCurrency(-1234.56)).toBe('-$1,234.56');
        expect(formatCurrency(0)).toBe('$0.00');
    });

    test('handles non-finite values by returning zero formatted', () => {
        expect(formatCurrency(NaN)).toBe('$0.00');
    });

    test('uses specific currency if provided', () => {
        expect(formatCurrency(100, { currency: 'CNY' })).toBe('¥100.00');
    });
});

describe('formatCurrencyInlineValue', () => {
    test('formats valid numbers with default zero digits', () => {
        expect(formatCurrencyInlineValue(1234.56)).toBe('$1,235');
    });

    test('respects specified digits', () => {
        expect(formatCurrencyInlineValue(1234.56, { digits: 1 })).toBe('$1,234.6');
    });

    test('uses specific currency if provided', () => {
        expect(formatCurrencyInlineValue(100, { currency: 'CNY' })).toBe('¥100');
    });
});

describe('formatCurrencyInline', () => {
    beforeEach(() => {
        transactionState.selectedCurrency = 'USD';
        transactionState.currencySymbol = '$';
    });

    test('handles non-finite values', () => {
        expect(formatCurrencyInline(NaN)).toBe('$0');
    });

    test('formats billions', () => {
        expect(formatCurrencyInline(1_200_000_000)).toBe('$1.20B');
    });

    test('formats millions', () => {
        expect(formatCurrencyInline(1_500_000)).toBe('$1.50M');
    });

    test('formats thousands', () => {
        expect(formatCurrencyInline(1_500)).toBe('$1.5k');
    });

    test('formats small values', () => {
        expect(formatCurrencyInline(5)).toBe('$5');
        expect(formatCurrencyInline(0.5)).toBe('$0.50');
    });

    test('formats negative values', () => {
        expect(formatCurrencyInline(-1_500)).toBe('-$1.5k');
    });
});

describe('parseCSVLine', () => {
    test('parses simple comma separated values', () => {
        expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    test('handles values with spaces', () => {
        expect(parseCSVLine(' a , b , c ')).toEqual(['a', 'b', 'c']);
    });

    test('handles quoted values with commas', () => {
        expect(parseCSVLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
    });

    test('handles escaped quotes inside quoted values', () => {
        expect(parseCSVLine('a,"b,""c""",d')).toEqual(['a', 'b,"c"', 'd']);
    });

    test('handles empty values', () => {
        expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
    });
});

describe('convertBetweenCurrencies', () => {
    beforeEach(() => {
        transactionState.fxRatesByCurrency = {
            EUR: {
                sorted: [
                    { date: '2024-01-01', ts: new Date('2024-01-01').getTime() },
                    { date: '2024-01-02', ts: new Date('2024-01-02').getTime() },
                ],
                map: new Map([
                    ['2024-01-01', 0.9],
                    ['2024-01-02', 0.85]
                ])
            },
            JPY: {
                sorted: [
                    { date: '2024-01-01', ts: new Date('2024-01-01').getTime() }
                ],
                map: new Map([
                    ['2024-01-01', 150]
                ])
            }
        };
        transactionState.selectedCurrency = 'USD';
        clearFxRateCache();
    });

    afterEach(() => {
        transactionState.fxRatesByCurrency = {};
        clearFxRateCache();
    });

    test('returns 0 for invalid value', () => {
        expect(convertBetweenCurrencies(NaN, 'USD', '2024-01-01', 'EUR')).toBe(0);
    });

    test('returns original value if source and target currencies are the same', () => {
        expect(convertBetweenCurrencies(100, 'EUR', '2024-01-01', 'EUR')).toBe(100);
    });

    test('converts from USD to another currency', () => {
        expect(convertBetweenCurrencies(100, 'USD', '2024-01-01', 'EUR')).toBe(90);
    });

    test('converts from another currency to USD', () => {
        expect(convertBetweenCurrencies(90, 'EUR', '2024-01-01', 'USD')).toBe(100);
    });

    test('converts between two non-USD currencies', () => {
        expect(convertBetweenCurrencies(90, 'EUR', '2024-01-01', 'JPY')).toBe(15000);
    });

    test('handles missing fx rates by falling back to amount or USD amount', () => {
        expect(convertBetweenCurrencies(100, 'GBP', '2024-01-01', 'USD')).toBe(100);
        expect(convertBetweenCurrencies(100, 'USD', '2024-01-01', 'GBP')).toBe(100);
    });

    test('uses selected currency if toCurrency is omitted', () => {
        transactionState.selectedCurrency = 'EUR';
        expect(convertBetweenCurrencies(100, 'USD', '2024-01-01')).toBe(90);
    });
});

describe('convertValueToCurrency', () => {
    beforeEach(() => {
        transactionState.fxRatesByCurrency = {
            EUR: {
                sorted: [
                    { date: '2024-01-01', ts: new Date('2024-01-01').getTime() },
                    { date: '2024-01-02', ts: new Date('2024-01-02').getTime() },
                ],
                map: new Map([
                    ['2024-01-01', 0.9],
                    ['2024-01-02', 0.85]
                ])
            }
        };
        transactionState.selectedCurrency = 'USD';
        clearFxRateCache();
    });

    afterEach(() => {
        transactionState.fxRatesByCurrency = {};
        clearFxRateCache();
    });

    test('returns 0 for invalid value', () => {
        expect(convertValueToCurrency(NaN, '2024-01-01', 'EUR')).toBe(0);
    });

    test('returns original value if currency is USD', () => {
        expect(convertValueToCurrency(100, '2024-01-01', 'USD')).toBe(100);
    });

    test('returns original value if currency is omitted and selectedCurrency is USD', () => {
        expect(convertValueToCurrency(100, '2024-01-01')).toBe(100);
    });

    test('converts value to specified currency', () => {
        expect(convertValueToCurrency(100, '2024-01-01', 'EUR')).toBe(90);
    });

    test('handles Date objects for date parameter', () => {
        expect(convertValueToCurrency(100, new Date('2024-01-02'), 'EUR')).toBe(85);
    });
});

describe('formatCurrency', () => {
    beforeEach(() => {
        transactionState.selectedCurrency = 'USD';
        transactionState.currencySymbol = '$';
    });

    test('formats valid numbers properly with default currency', () => {
        expect(formatCurrency(1234.56)).toBe('$1,234.56');
        expect(formatCurrency(-1234.56)).toBe('-$1,234.56');
        expect(formatCurrency(0)).toBe('$0.00');
    });

    test('handles non-finite values by returning zero formatted', () => {
        expect(formatCurrency(NaN)).toBe('$0.00');
    });

    test('uses specific currency if provided', () => {
        expect(formatCurrency(100, { currency: 'CNY' })).toBe('¥100.00');
    });
});

describe('formatCurrencyInlineValue', () => {
    test('formats valid numbers with default zero digits', () => {
        expect(formatCurrencyInlineValue(1234.56)).toBe('$1,235');
    });

    test('respects specified digits', () => {
        expect(formatCurrencyInlineValue(1234.56, { digits: 1 })).toBe('$1,234.6');
    });

    test('uses specific currency if provided', () => {
        expect(formatCurrencyInlineValue(100, { currency: 'CNY' })).toBe('¥100');
    });
});

describe('formatCurrencyInline', () => {
    beforeEach(() => {
        transactionState.selectedCurrency = 'USD';
        transactionState.currencySymbol = '$';
    });

    test('handles non-finite values', () => {
        expect(formatCurrencyInline(NaN)).toBe('$0');
    });

    test('formats billions', () => {
        expect(formatCurrencyInline(1_200_000_000)).toBe('$1.20B');
    });

    test('formats millions', () => {
        expect(formatCurrencyInline(1_500_000)).toBe('$1.50M');
    });

    test('formats thousands', () => {
        expect(formatCurrencyInline(1_500)).toBe('$1.5k');
    });

    test('formats small values', () => {
        expect(formatCurrencyInline(5)).toBe('$5');
        expect(formatCurrencyInline(0.5)).toBe('$0.50');
    });

    test('formats negative values', () => {
        expect(formatCurrencyInline(-1_500)).toBe('-$1.5k');
    });
});

describe('parseCSVLine', () => {
    test('parses simple comma separated values', () => {
        expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    test('handles values with spaces', () => {
        expect(parseCSVLine(' a , b , c ')).toEqual(['a', 'b', 'c']);
    });

    test('handles quoted values with commas', () => {
        expect(parseCSVLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
    });

    test('handles escaped quotes inside quoted values', () => {
        expect(parseCSVLine('a,"b,""c""",d')).toEqual(['a', 'b,"c"', 'd']);
    });

    test('handles empty values', () => {
        expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
    });
});

describe('convertBetweenCurrencies', () => {
    beforeEach(() => {
        transactionState.fxRatesByCurrency = {
            EUR: {
                sorted: [
                    { date: '2024-01-01', ts: new Date('2024-01-01').getTime() },
                    { date: '2024-01-02', ts: new Date('2024-01-02').getTime() },
                ],
                map: new Map([
                    ['2024-01-01', 0.9],
                    ['2024-01-02', 0.85]
                ])
            },
            JPY: {
                sorted: [
                    { date: '2024-01-01', ts: new Date('2024-01-01').getTime() }
                ],
                map: new Map([
                    ['2024-01-01', 150]
                ])
            }
        };
        transactionState.selectedCurrency = 'USD';
        clearFxRateCache();
    });

    afterEach(() => {
        transactionState.fxRatesByCurrency = {};
        clearFxRateCache();
    });

    test('returns 0 for invalid value', () => {
        expect(convertBetweenCurrencies(NaN, 'USD', '2024-01-01', 'EUR')).toBe(0);
    });

    test('returns original value if source and target currencies are the same', () => {
        expect(convertBetweenCurrencies(100, 'EUR', '2024-01-01', 'EUR')).toBe(100);
    });

    test('converts from USD to another currency', () => {
        expect(convertBetweenCurrencies(100, 'USD', '2024-01-01', 'EUR')).toBe(90);
    });

    test('converts from another currency to USD', () => {
        expect(convertBetweenCurrencies(90, 'EUR', '2024-01-01', 'USD')).toBe(100);
    });

    test('converts between two non-USD currencies', () => {
        expect(convertBetweenCurrencies(90, 'EUR', '2024-01-01', 'JPY')).toBe(15000);
    });

    test('handles missing fx rates by falling back to amount or USD amount', () => {
        expect(convertBetweenCurrencies(100, 'GBP', '2024-01-01', 'USD')).toBe(100);
        expect(convertBetweenCurrencies(100, 'USD', '2024-01-01', 'GBP')).toBe(100);
    });

    test('uses selected currency if toCurrency is omitted', () => {
        transactionState.selectedCurrency = 'EUR';
        expect(convertBetweenCurrencies(100, 'USD', '2024-01-01')).toBe(90);
    });
});

describe('convertValueToCurrency', () => {
    beforeEach(() => {
        transactionState.fxRatesByCurrency = {
            EUR: {
                sorted: [
                    { date: '2024-01-01', ts: new Date('2024-01-01').getTime() },
                    { date: '2024-01-02', ts: new Date('2024-01-02').getTime() },
                ],
                map: new Map([
                    ['2024-01-01', 0.9],
                    ['2024-01-02', 0.85]
                ])
            }
        };
        transactionState.selectedCurrency = 'USD';
        clearFxRateCache();
    });

    afterEach(() => {
        transactionState.fxRatesByCurrency = {};
        clearFxRateCache();
    });

    test('returns 0 for invalid value', () => {
        expect(convertValueToCurrency(NaN, '2024-01-01', 'EUR')).toBe(0);
    });

    test('returns original value if currency is USD', () => {
        expect(convertValueToCurrency(100, '2024-01-01', 'USD')).toBe(100);
    });

    test('returns original value if currency is omitted and selectedCurrency is USD', () => {
        expect(convertValueToCurrency(100, '2024-01-01')).toBe(100);
    });

    test('converts value to specified currency', () => {
        expect(convertValueToCurrency(100, '2024-01-01', 'EUR')).toBe(90);
    });

    test('handles Date objects for date parameter', () => {
        expect(convertValueToCurrency(100, new Date('2024-01-02'), 'EUR')).toBe(85);
    });
});

describe('formatCurrency', () => {
    beforeEach(() => {
        transactionState.selectedCurrency = 'USD';
        transactionState.currencySymbol = '$';
    });

    test('formats valid numbers properly with default currency', () => {
        expect(formatCurrency(1234.56)).toBe('$1,234.56');
        expect(formatCurrency(-1234.56)).toBe('-$1,234.56');
        expect(formatCurrency(0)).toBe('$0.00');
    });

    test('handles non-finite values by returning zero formatted', () => {
        expect(formatCurrency(NaN)).toBe('$0.00');
    });

    test('uses specific currency if provided', () => {
        expect(formatCurrency(100, { currency: 'CNY' })).toBe('¥100.00');
    });
});

describe('formatCurrencyInlineValue', () => {
    test('formats valid numbers with default zero digits', () => {
        expect(formatCurrencyInlineValue(1234.56)).toBe('$1,235');
    });

    test('respects specified digits', () => {
        expect(formatCurrencyInlineValue(1234.56, { digits: 1 })).toBe('$1,234.6');
    });

    test('uses specific currency if provided', () => {
        expect(formatCurrencyInlineValue(100, { currency: 'CNY' })).toBe('¥100');
    });
});

describe('formatCurrencyInline', () => {
    beforeEach(() => {
        transactionState.selectedCurrency = 'USD';
        transactionState.currencySymbol = '$';
    });

    test('handles non-finite values', () => {
        expect(formatCurrencyInline(NaN)).toBe('$0');
    });

    test('formats billions', () => {
        expect(formatCurrencyInline(1_200_000_000)).toBe('$1.20B');
    });

    test('formats millions', () => {
        expect(formatCurrencyInline(1_500_000)).toBe('$1.50M');
    });

    test('formats thousands', () => {
        expect(formatCurrencyInline(1_500)).toBe('$1.5k');
    });

    test('formats small values', () => {
        expect(formatCurrencyInline(5)).toBe('$5');
        expect(formatCurrencyInline(0.5)).toBe('$0.50');
    });

    test('formats negative values', () => {
        expect(formatCurrencyInline(-1_500)).toBe('-$1.5k');
    });
});

describe('parseCSVLine', () => {
    test('parses simple comma separated values', () => {
        expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    test('handles values with spaces', () => {
        expect(parseCSVLine(' a , b , c ')).toEqual(['a', 'b', 'c']);
    });

    test('handles quoted values with commas', () => {
        expect(parseCSVLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
    });

    test('handles escaped quotes inside quoted values', () => {
        expect(parseCSVLine('a,"b,""c""",d')).toEqual(['a', 'b,"c"', 'd']);
    });

    test('handles empty values', () => {
        expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
    });
});

describe('convertBetweenCurrencies', () => {
    beforeEach(() => {
        transactionState.fxRatesByCurrency = {
            EUR: {
                sorted: [
                    { date: '2024-01-01', ts: new Date('2024-01-01').getTime() },
                    { date: '2024-01-02', ts: new Date('2024-01-02').getTime() },
                ],
                map: new Map([
                    ['2024-01-01', 0.9],
                    ['2024-01-02', 0.85]
                ])
            },
            JPY: {
                sorted: [
                    { date: '2024-01-01', ts: new Date('2024-01-01').getTime() }
                ],
                map: new Map([
                    ['2024-01-01', 150]
                ])
            }
        };
        transactionState.selectedCurrency = 'USD';
        clearFxRateCache();
    });

    afterEach(() => {
        transactionState.fxRatesByCurrency = {};
        clearFxRateCache();
    });

    test('returns 0 for invalid value', () => {
        expect(convertBetweenCurrencies(NaN, 'USD', '2024-01-01', 'EUR')).toBe(0);
    });

    test('returns original value if source and target currencies are the same', () => {
        expect(convertBetweenCurrencies(100, 'EUR', '2024-01-01', 'EUR')).toBe(100);
    });

    test('converts from USD to another currency', () => {
        expect(convertBetweenCurrencies(100, 'USD', '2024-01-01', 'EUR')).toBe(90);
    });

    test('converts from another currency to USD', () => {
        expect(convertBetweenCurrencies(90, 'EUR', '2024-01-01', 'USD')).toBe(100);
    });

    test('converts between two non-USD currencies', () => {
        expect(convertBetweenCurrencies(90, 'EUR', '2024-01-01', 'JPY')).toBe(15000);
    });

    test('handles missing fx rates by falling back to amount or USD amount', () => {
        expect(convertBetweenCurrencies(100, 'GBP', '2024-01-01', 'USD')).toBe(100);
        expect(convertBetweenCurrencies(100, 'USD', '2024-01-01', 'GBP')).toBe(100);
    });

    test('uses selected currency if toCurrency is omitted', () => {
        transactionState.selectedCurrency = 'EUR';
        expect(convertBetweenCurrencies(100, 'USD', '2024-01-01')).toBe(90);
    });
});

describe('convertValueToCurrency', () => {
    beforeEach(() => {
        transactionState.fxRatesByCurrency = {
            EUR: {
                sorted: [
                    { date: '2024-01-01', ts: new Date('2024-01-01').getTime() },
                    { date: '2024-01-02', ts: new Date('2024-01-02').getTime() },
                ],
                map: new Map([
                    ['2024-01-01', 0.9],
                    ['2024-01-02', 0.85]
                ])
            }
        };
        transactionState.selectedCurrency = 'USD';
        clearFxRateCache();
    });

    afterEach(() => {
        transactionState.fxRatesByCurrency = {};
        clearFxRateCache();
    });

    test('returns 0 for invalid value', () => {
        expect(convertValueToCurrency(NaN, '2024-01-01', 'EUR')).toBe(0);
    });

    test('returns original value if currency is USD', () => {
        expect(convertValueToCurrency(100, '2024-01-01', 'USD')).toBe(100);
    });

    test('returns original value if currency is omitted and selectedCurrency is USD', () => {
        expect(convertValueToCurrency(100, '2024-01-01')).toBe(100);
    });

    test('converts value to specified currency', () => {
        expect(convertValueToCurrency(100, '2024-01-01', 'EUR')).toBe(90);
    });

    test('handles Date objects for date parameter', () => {
        expect(convertValueToCurrency(100, new Date('2024-01-02'), 'EUR')).toBe(85);
    });
});

describe('formatCurrency', () => {
    beforeEach(() => {
        transactionState.selectedCurrency = 'USD';
        transactionState.currencySymbol = '$';
    });

    test('formats valid numbers properly with default currency', () => {
        expect(formatCurrency(1234.56)).toBe('$1,234.56');
        expect(formatCurrency(-1234.56)).toBe('-$1,234.56');
        expect(formatCurrency(0)).toBe('$0.00');
    });

    test('handles non-finite values by returning zero formatted', () => {
        expect(formatCurrency(NaN)).toBe('$0.00');
    });

    test('uses specific currency if provided', () => {
        expect(formatCurrency(100, { currency: 'CNY' })).toBe('¥100.00');
    });
});

describe('formatCurrencyInlineValue', () => {
    test('formats valid numbers with default zero digits', () => {
        expect(formatCurrencyInlineValue(1234.56)).toBe('$1,235');
    });

    test('respects specified digits', () => {
        expect(formatCurrencyInlineValue(1234.56, { digits: 1 })).toBe('$1,234.6');
    });

    test('uses specific currency if provided', () => {
        expect(formatCurrencyInlineValue(100, { currency: 'CNY' })).toBe('¥100');
    });
});

describe('formatCurrencyInline', () => {
    beforeEach(() => {
        transactionState.selectedCurrency = 'USD';
        transactionState.currencySymbol = '$';
    });

    test('handles non-finite values', () => {
        expect(formatCurrencyInline(NaN)).toBe('$0');
    });

    test('formats billions', () => {
        expect(formatCurrencyInline(1_200_000_000)).toBe('$1.20B');
    });

    test('formats millions', () => {
        expect(formatCurrencyInline(1_500_000)).toBe('$1.50M');
    });

    test('formats thousands', () => {
        expect(formatCurrencyInline(1_500)).toBe('$1.5k');
    });

    test('formats small values', () => {
        expect(formatCurrencyInline(5)).toBe('$5');
        expect(formatCurrencyInline(0.5)).toBe('$0.50');
    });

    test('formats negative values', () => {
        expect(formatCurrencyInline(-1_500)).toBe('-$1.5k');
    });
});
