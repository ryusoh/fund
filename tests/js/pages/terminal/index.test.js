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
        jest.mock('../../../../js/transactions/utils.js', () => ({
            convertValueToCurrency: jest.fn((value, date, currency) => {
                if (currency === 'EUR') {
                    return value * 0.9;
                }
                return value;
            }),
            formatCurrency: jest.fn(),
            isDarkTheme: jest.fn(),
        }));

        jest.mock('../../../../js/transactions/state.js', () => ({
            setAllTransactions: jest.fn(),
            setFilteredTransactions: jest.fn(),
            setSplitHistory: jest.fn(),
            setPortfolioSeriesMap: jest.fn(),
            setRunningAmountSeriesMap: jest.fn(),
            setFxRatesByCurrency: jest.fn(),
            setSelectedCurrency: jest.fn(),
            setPortfolioSeries: jest.fn(),
            setRunningAmountSeries: jest.fn(),
            setPerformanceSeries: jest.fn(),
            setChartDateRange: jest.fn(),
            setActiveChart: jest.fn(),
            cycleCurrency: jest.fn(),
            trackTransactionDataLoad: jest.fn(),
            whenTransactionDataReady: jest.fn(() => Promise.resolve()),
            transactionState: {
                runningAmountSeriesByCurrency: {},
                portfolioSeriesByCurrency: {},
            },
        }));

        jest.mock('../../../../js/transactions/dataLoader.js', () => ({
            loadTransactionData: jest.fn().mockResolvedValue([]),
            loadSplitHistory: jest.fn().mockResolvedValue([]),
            loadPortfolioSeries: jest.fn().mockResolvedValue({}),
            loadContributionSeries: jest.fn().mockResolvedValue({}),
            loadPerformanceSeries: jest.fn().mockResolvedValue([]),
            loadFxDailyRates: jest.fn().mockResolvedValue(null),
        }));

        const module = await import('@pages/terminal/index.js');
        buildFxRateMaps = module.__terminalTesting.buildFxRateMaps;
        ensureSyntheticStart = module.__terminalTesting.ensureSyntheticStart;
        convertCurrencySeries = module.__terminalTesting.convertCurrencySeries;
    });

    afterEach(() => {
        jest.restoreAllMocks();
        delete window.matchMedia;
    });

    describe('mobile chart-first view', () => {
        function setupMatchMedia(matches) {
            window.matchMedia = jest.fn().mockImplementation((query) => ({
                matches,
                media: query,
                addEventListener: jest.fn(),
                removeEventListener: jest.fn(),
                dispatchEvent: jest.fn(),
            }));
        }

        async function importFresh() {
            jest.resetModules();
            document.body.insertAdjacentHTML(
                'beforeend',
                '<div id="currencyToggleContainer"></div>' +
                    '<div class="transaction-container">' +
                    '<section id="runningAmountSection" class="is-hidden"></section>' +
                    '</div>'
            );
            await import('@pages/terminal/index.js');
            // flush the whenTransactionDataReady().then(...) callback
            await Promise.resolve();
            await Promise.resolve();
        }

        it('reveals the chart section on mobile once data is ready', async () => {
            setupMatchMedia(true);
            await importFresh();
            expect(
                document.getElementById('runningAmountSection').classList.contains('is-hidden')
            ).toBe(false);
        });

        it('keeps the chart section hidden on desktop', async () => {
            setupMatchMedia(false);
            await importFresh();
            expect(
                document.getElementById('runningAmountSection').classList.contains('is-hidden')
            ).toBe(true);
        });

        it('currency switcher remains on body', async () => {
            setupMatchMedia(true);
            await importFresh();
            expect(document.getElementById('currencyToggleContainer').parentElement).toBe(
                document.body
            );
        });
    });

    describe('initial data load registration', () => {
        it('registers the in-flight data load so terminal commands can await it', () => {
            const stateModule = require('../../../../js/transactions/state.js');
            expect(stateModule.trackTransactionDataLoad).toHaveBeenCalledTimes(1);
            const registered = stateModule.trackTransactionDataLoad.mock.calls[0][0];
            expect(typeof registered.then).toBe('function');
        });
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

describe('convertCurrencySeries explicit coverage', () => {
    let convertCurrencySeries;
    beforeAll(async () => {
        const module = await import('@pages/terminal/index.js');
        convertCurrencySeries = module.__terminalTesting.convertCurrencySeries;
    });

    it('returns early if not array', () => {
        const result = convertCurrencySeries({}, 'CAD');
        expect(result).toEqual({});
    });

    it('returns early if target is USD', () => {
        const result = convertCurrencySeries([{ amount: 100 }], 'USD');
        expect(result).toEqual([{ amount: 100 }]);
    });
});

describe('ensureSyntheticStart additional coverage', () => {
    let ensureSyntheticStart;
    beforeAll(async () => {
        const module = await import('@pages/terminal/index.js');
        ensureSyntheticStart = module.__terminalTesting.ensureSyntheticStart;
    });

    it('handles series as an object mapping keys to arrays', () => {
        const series = {
            a: [{ date: '2023-01-02', value: 100 }],
            b: [{ date: '2023-01-02', value: 200 }],
        };
        const result = ensureSyntheticStart(series, { dateKey: 'date', valueKey: 'value' });
        expect(result.a[0].synthetic).toBe(true);
        expect(result.a[0].date).toBe('2023-01-01');
        expect(result.b[0].synthetic).toBe(true);
        expect(result.b[0].date).toBe('2023-01-01');
    });

    it('returns empty array if series is falsy or empty', () => {
        expect(ensureSyntheticStart(null, { dateKey: 'date', valueKey: 'value' })).toEqual([]);
        expect(ensureSyntheticStart([], { dateKey: 'date', valueKey: 'value' })).toEqual([]);
    });

    it('returns series if first value is not finite', () => {
        const series = [{ date: '2023-01-01', value: NaN }];
        expect(ensureSyntheticStart(series, { dateKey: 'date', valueKey: 'value' })).toBe(series);
    });

    it('preserves Date objects properly when zeroing', () => {
        const firstDate = new Date('2023-01-02T00:00:00Z');
        const series = [{ date: firstDate, value: 0 }];
        const result = ensureSyntheticStart(series, { dateKey: 'date', valueKey: 'value' });
        expect(result[0].date).toEqual(firstDate);
        expect(result[0].synthetic).toBe(true);
    });

    it('returns original series if already synthetic start and value is 0', () => {
        const series = [{ date: '2023-01-01', value: 0, synthetic: true }];
        expect(ensureSyntheticStart(series, { dateKey: 'date', valueKey: 'value' })).toBe(series);
    });

    it('handles valueKey != amount and base has amount', () => {
        const series = [{ date: '2023-01-02', otherValue: 100, amount: 50 }];
        const result = ensureSyntheticStart(series, { dateKey: 'date', valueKey: 'otherValue' });
        expect(result[0].otherValue).toBe(0);
        expect(result[0].amount).toBe(0);
    });

    it('handles valueKey == amount', () => {
        const series = [{ date: '2023-01-02', amount: 100 }];
        const result = ensureSyntheticStart(series, { dateKey: 'date', valueKey: 'amount' });
        expect(result[0].amount).toBe(0);
    });

    it('handles valueKey != value and base has value', () => {
        const series = [{ date: '2023-01-02', otherValue: 100, value: 50 }];
        const result = ensureSyntheticStart(series, { dateKey: 'date', valueKey: 'otherValue' });
        expect(result[0].otherValue).toBe(0);
        expect(result[0].value).toBe(0);
    });

    it('handles valueKey == value', () => {
        const series = [{ date: '2023-01-02', value: 100 }];
        const result = ensureSyntheticStart(series, { dateKey: 'date', valueKey: 'value' });
        expect(result[0].value).toBe(0);
    });

    it('removes transactionId if present', () => {
        const series = [{ date: '2023-01-02', value: 100, transactionId: 'foo' }];
        const result = ensureSyntheticStart(series, { dateKey: 'date', valueKey: 'value' });
        expect(result[0].transactionId).toBeUndefined();
    });

    it('returns series if firstDate is invalid', () => {
        const series = [{ date: 'invalid', value: 100 }];
        expect(ensureSyntheticStart(series, { dateKey: 'date', valueKey: 'value' })).toBe(series);
    });
});

describe('buildFxRateMaps coverage', () => {
    let buildFxRateMaps;
    beforeAll(async () => {
        const module = await import('@pages/terminal/index.js');
        buildFxRateMaps = module.__terminalTesting.buildFxRateMaps;
    });

    it('returns empty object if no payload', () => {
        expect(buildFxRateMaps(null)).toEqual({});
        expect(buildFxRateMaps('invalid')).toEqual({});
        expect(buildFxRateMaps({})).toEqual({});
    });

    it('buildFxRateMaps skips empty dates or invalid rate values', () => {
        const payload = {
            rates: {
                '2023-01-01': null, // covered: if (!rateMap) continue
                '2023-01-02': {
                    EUR: 'invalid', // covered: if (!Number.isFinite(rateNumber)) continue
                    CAD: 1.3,
                },
            },
        };
        const result = buildFxRateMaps(payload);
        expect(result.CAD.map.get('2023-01-02')).toBe(1.3);
        expect(result.EUR).toBeUndefined();
    });

    it('buildFxRateMaps handles multiple entries and dates', () => {
        const payload = {
            rates: {
                '2023-01-02': { CAD: 1.3 },
                '2023-01-01': { CAD: 1.2, USD: 1.0 },
                'invalid-date': { CAD: 1.4 }, // handles Number.isNaN(timestamp)
            },
        };
        const result = buildFxRateMaps(payload);
        expect(result.CAD.sorted.length).toBe(3);
        expect(result.CAD.map.has('invalid-date')).toBe(true);
        expect(result.CAD.map.get('invalid-date')).toBe(1.4);
        expect(result.USD.map.get('2023-01-01')).toBe(1.0);
    });
});
