describe('Terminal index page', () => {
    let buildFxRateMaps;
    let ensureSyntheticStart;
    let convertCurrencySeries;

    beforeEach(async () => {
        jest.resetModules();
        document.body.innerHTML = `
            <div id="chart-container"></div>
            <div class="terminal-container"></div>
            <div class="table-responsive-container"></div>
        `;

        // Mock convertValueToCurrency so we can test convertCurrencySeries logic in isolation
        jest.mock('@js/transactions/utils.js', () => ({
            convertValueToCurrency: jest.fn((value, date, currency) => {
                if (currency === 'EUR') {
                    return value * 0.9;
                }
                return value;
            }),
            formatCurrency: jest.fn(),
            isDarkTheme: jest.fn(),
        }));

        const module = await import('@pages/terminal/index.js');
        buildFxRateMaps = module.__terminalTesting.buildFxRateMaps;
        ensureSyntheticStart = module.__terminalTesting.ensureSyntheticStart;
        convertCurrencySeries = module.__terminalTesting.convertCurrencySeries;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('buildFxRateMaps', () => {
        it('builds FX rate maps and sorts by timestamp', () => {
            const rawData = {
                rates: {
                    '2023-01-02': { eUR: 0.95, gbp: 0.8 },
                    '2023-01-01': { eUR: 0.94, gbp: 0.79 },
                },
            };
            const maps = buildFxRateMaps(rawData);

            expect(maps.EUR.sorted[0].date).toBe('2023-01-01');
            expect(maps.EUR.sorted[1].date).toBe('2023-01-02');
            expect(maps.EUR.map.get('2023-01-01')).toBe(0.94);

            // USD fallback
            expect(maps.USD.map.get('1970-01-01')).toBe(1);
        });

        it('ignores invalid rate numbers', () => {
            const rawData = {
                rates: {
                    '2023-01-01': { eUR: NaN, gbp: 'invalid' },
                },
            };
            const maps = buildFxRateMaps(rawData);
            expect(maps.EUR).toBeUndefined();
            expect(maps.GBP).toBeUndefined();
        });

        it('handles null/undefined payloads safely', () => {
            expect(buildFxRateMaps(null)).toEqual({});
            expect(buildFxRateMaps({ rates: null })).toEqual({});
        });
    });

    describe('ensureSyntheticStart', () => {
        it('prepends a synthetic start point exactly 1 day before the earliest value', () => {
            const seriesMap = {
                USD: [
                    { dateKey: '2023-01-02', valueKey: 100 },
                    { dateKey: '2023-01-03', valueKey: 110 },
                ],
            };
            const result = ensureSyntheticStart(seriesMap, {
                dateKey: 'dateKey',
                valueKey: 'valueKey',
                zeroProps: { extra: true },
            });

            expect(result.USD.length).toBe(3);
            expect(result.USD[0].dateKey).toBe('2023-01-01');
            expect(result.USD[0].valueKey).toBe(0);
            expect(result.USD[0].extra).toBe(true);
        });

        it('handles empty series correctly', () => {
            const result = ensureSyntheticStart({ USD: [] }, { dateKey: 'd', valueKey: 'v' });
            expect(result.USD).toEqual([]);
        });

        it('handles objects properly and returns arrays as expected', () => {
            const result = ensureSyntheticStart([], { dateKey: 'd', valueKey: 'v' });
            expect(result).toEqual([]);
        });

        it('handles missing or zero starting values', () => {
            const series = [{ d: '2023-01-02', v: 0 }];
            const result = ensureSyntheticStart(series, { dateKey: 'd', valueKey: 'v' });
            // Should update the date but keep the zero point
            expect(result.length).toBe(1);
            expect(result[0].d).toBeDefined();
        });
    });

    describe('convertCurrencySeries', () => {
        it('returns original series if target is USD or series is invalid', () => {
            const series = [{ date: '2023-01-01', value: 100 }];
            expect(convertCurrencySeries(series, 'USD')).toBe(series);
            expect(convertCurrencySeries(null, 'EUR')).toBe(null);
        });

        it('converts value property appropriately', () => {
            const series = [
                { date: '2023-01-01', value: 100 },
                { date: '2023-01-02', value: 200 },
            ];
            const result = convertCurrencySeries(series, 'EUR');
            expect(result[0].value).toBe(90);
            expect(result[1].value).toBe(180);
        });

        it('handles netAmount cumulatively', () => {
            const series = [
                { tradeDate: '2023-01-01', netAmount: 100, amount: 100 },
                { tradeDate: '2023-01-02', netAmount: -50, amount: 50 },
                { tradeDate: '2023-01-03', netAmount: 0, orderType: 'padding', synthetic: true },
            ];
            const result = convertCurrencySeries(series, 'EUR');
            expect(result[0].netAmount).toBe(90);
            expect(result[0].amount).toBe(90);

            expect(result[1].netAmount).toBe(-45);
            expect(result[1].amount).toBe(45); // 90 - 45 = 45

            expect(result[2].amount).toBe(45); // Padding should inherit cumulative
        });
    });
});
