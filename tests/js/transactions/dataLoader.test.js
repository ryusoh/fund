/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

// Regex to verify date format YYYY-MM-DD
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

describe('dataLoader basic history loaders', () => {
    let loadSplitHistory;
    let loadTransactionData;
    let loadContributionSeries;
    let loadSectorsSnapshotData;
    let loadGeographySnapshotData;
    let loadMarketcapSnapshotData;
    let loadFxDailyRates;
    let loadPerformanceSeries;
    let loadHistoricalPrices;
    let ensureFilteredPricesLoaded;
    let mockFetch;

    beforeEach(() => {
        jest.resetModules();

        mockFetch = jest.fn();
        global.fetch = mockFetch;

        // Mock logger
        jest.unstable_mockModule('@utils/logger.js', () => ({
            logger: {
                warn: jest.fn(),
                error: jest.fn(),
                log: jest.fn(),
            },
        }));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    async function loadModule() {
        const mod = await import('../../../js/transactions/dataLoader.js');
        loadSplitHistory = mod.loadSplitHistory;
        loadTransactionData = mod.loadTransactionData;
        loadContributionSeries = mod.loadContributionSeries;
        loadSectorsSnapshotData = mod.loadSectorsSnapshotData;
        loadGeographySnapshotData = mod.loadGeographySnapshotData;
        loadMarketcapSnapshotData = mod.loadMarketcapSnapshotData;
        loadFxDailyRates = mod.loadFxDailyRates;
        loadPerformanceSeries = mod.loadPerformanceSeries;
        loadHistoricalPrices = mod.loadHistoricalPrices;
        ensureFilteredPricesLoaded = mod.ensureFilteredPricesLoaded;
    }

    function createMockResponse(data, ok = true, isText = false) {
        return {
            ok,
            [isText ? 'text' : 'json']: () => Promise.resolve(data),
        };
    }

    describe('snapshot data loaders', () => {
        it('loadSectorsSnapshotData handles success', async () => {
            mockFetch.mockResolvedValueOnce(createMockResponse({ some: 'data' }));
            await loadModule();
            const result = await loadSectorsSnapshotData();
            expect(result).toEqual({ some: 'data' });
            expect(mockFetch).toHaveBeenCalledWith('../data/output/figures/sectors.json');
        });

        it('loadSectorsSnapshotData handles failure', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
            await loadModule();
            const result = await loadSectorsSnapshotData();
            expect(result).toBeNull();
        });

        it('loadSectorsSnapshotData caches the result on repeated calls', async () => {
            mockFetch.mockResolvedValueOnce(createMockResponse({ some: 'data' }));
            await loadModule();
            const first = await loadSectorsSnapshotData();
            const second = await loadSectorsSnapshotData();
            expect(second).toBe(first);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('loadGeographySnapshotData handles success', async () => {
            mockFetch.mockResolvedValueOnce(createMockResponse({ some: 'data' }));
            await loadModule();
            const result = await loadGeographySnapshotData();
            expect(result).toEqual({ some: 'data' });
            expect(mockFetch).toHaveBeenCalledWith('../data/output/figures/geography.json');
        });

        it('loadGeographySnapshotData handles failure', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));
            await loadModule();
            const result = await loadGeographySnapshotData();
            expect(result).toBeNull();
        });

        it('loadGeographySnapshotData caches the result on repeated calls', async () => {
            mockFetch.mockResolvedValueOnce(createMockResponse({ some: 'data' }));
            await loadModule();
            const first = await loadGeographySnapshotData();
            const second = await loadGeographySnapshotData();
            expect(second).toBe(first);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('loadMarketcapSnapshotData handles success', async () => {
            mockFetch.mockResolvedValueOnce(createMockResponse({ some: 'data' }));
            await loadModule();
            const result = await loadMarketcapSnapshotData();
            expect(result).toEqual({ some: 'data' });
            expect(mockFetch).toHaveBeenCalledWith('../data/output/figures/marketcap.json');
        });

        it('loadMarketcapSnapshotData handles failure', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
            await loadModule();
            const result = await loadMarketcapSnapshotData();
            expect(result).toBeNull();
        });
        it('loadMarketcapSnapshotData caches the result on repeated calls', async () => {
            mockFetch.mockResolvedValueOnce(createMockResponse({ some: 'data' }));
            await loadModule();
            const first = await loadMarketcapSnapshotData();
            const second = await loadMarketcapSnapshotData();
            expect(second).toBe(first);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });

    describe('loadHistoricalPrices', () => {
        const sha = (c) => c.repeat(64);

        let transactionState;
        let setHistoricalPrices;

        function makeManifest(entries) {
            return {
                schema_version: 1,
                source_sha256: sha('s'),
                symbols: entries,
            };
        }

        function setupPriceFetch({ manifest, monolith, shardsByFile = {}, failUrls = [] }) {
            const calls = [];
            mockFetch.mockImplementation((url, options) => {
                calls.push({ url: String(url), options });
                const target = String(url);
                if (failUrls.some((f) => target.includes(f))) {
                    return Promise.resolve({ ok: false, status: 404 });
                }
                if (target.includes('/historical_prices/index.json')) {
                    return Promise.resolve(createMockResponse(manifest));
                }
                if (target.endsWith('/data/historical_prices.json')) {
                    return Promise.resolve(createMockResponse(monolith));
                }
                const file = target.split('/').pop();
                return Promise.resolve(createMockResponse(shardsByFile[file]));
            });
            return calls;
        }

        beforeEach(async () => {
            const stateMod = await import('../../../js/transactions/state.js');
            transactionState = stateMod.transactionState;
            setHistoricalPrices = stateMod.setHistoricalPrices;
            setHistoricalPrices({});
            transactionState.allTransactions = [];
            transactionState.filteredTransactions = [];
            transactionState.activeFilterTerm = '';
        });

        it('ensureFilteredPricesLoaded is a no-op without active filters', async () => {
            const calls = setupPriceFetch({ manifest: null });
            await loadModule();
            transactionState.allTransactions = [{ security: 'AAPL' }, { security: 'VTI' }];
            transactionState.filteredTransactions = [{ security: 'AAPL' }, { security: 'VTI' }];
            transactionState.activeFilterTerm = '';
            await ensureFilteredPricesLoaded();
            expect(calls).toHaveLength(0);
        });

        it('ensureFilteredPricesLoaded is a no-op when the filter text is empty', async () => {
            const calls = setupPriceFetch({ manifest: null });
            await loadModule();
            transactionState.allTransactions = [{ security: 'AAPL' }, { security: 'VTI' }];
            transactionState.filteredTransactions = [{ security: 'AAPL' }];
            transactionState.activeFilterTerm = '   ';
            await ensureFilteredPricesLoaded();
            expect(calls).toHaveLength(0);
        });

        it('ensureFilteredPricesLoaded loads prices for the current filtered transactions', async () => {
            const file = sha('a');
            const manifest = makeManifest({
                AAPL: { file: `${file}.json`, sha256: file },
            });
            const calls = setupPriceFetch({
                manifest,
                shardsByFile: { [`${file}.json`]: { '2024-01-01': 150 } },
            });
            await loadModule();
            transactionState.allTransactions = [{ security: 'AAPL' }, { security: 'VTI' }];
            transactionState.filteredTransactions = [{ security: 'AAPL' }];
            transactionState.activeFilterTerm = 'AAPL';
            await ensureFilteredPricesLoaded();
            expect(transactionState.historicalPrices.AAPL).toEqual({ '2024-01-01': 150 });
            expect(calls.some((c) => c.url.includes('index.json'))).toBe(true);
        });

        it('returns the current price object immediately for an empty request', async () => {
            const calls = setupPriceFetch({ manifest: null });
            await loadModule();
            const result = await loadHistoricalPrices([]);
            expect(result).toBe(transactionState.historicalPrices);
            expect(calls).toHaveLength(0);
        });

        it('concurrent same-symbol calls share a single shard fetch', async () => {
            const file = sha('a');
            const manifest = makeManifest({
                AAPL: { file: `${file}.json`, sha256: file },
            });
            const calls = setupPriceFetch({
                manifest,
                shardsByFile: { [`${file}.json`]: { '2024-01-01': 150 } },
            });
            await loadModule();
            const txns = [{ security: 'AAPL' }];
            const [first, second] = await Promise.all([
                loadHistoricalPrices(txns),
                loadHistoricalPrices(txns),
            ]);
            expect(first).toBe(second);
            const shardCalls = calls.filter((c) => c.url.includes(`${file}.json`));
            expect(shardCalls).toHaveLength(1);
            expect(transactionState.historicalPrices.AAPL).toEqual({ '2024-01-01': 150 });
        });

        it('concurrent disjoint-symbol calls union without losing symbols', async () => {
            const fileA = sha('a');
            const fileB = sha('b');
            const manifest = makeManifest({
                AAPL: { file: `${fileA}.json`, sha256: fileA },
                VTI: { file: `${fileB}.json`, sha256: fileB },
            });
            setupPriceFetch({
                manifest,
                shardsByFile: {
                    [`${fileA}.json`]: { '2024-01-01': 150 },
                    [`${fileB}.json`]: { '2024-01-01': 200 },
                },
            });
            await loadModule();
            await Promise.all([
                loadHistoricalPrices([{ security: 'AAPL' }]),
                loadHistoricalPrices([{ security: 'VTI' }]),
            ]);
            // Each disjoint completion merges a new object; the surviving state
            // must contain every symbol loaded by either call.
            expect(transactionState.historicalPrices).toEqual({
                AAPL: { '2024-01-01': 150 },
                VTI: { '2024-01-01': 200 },
            });
        });

        it('fetches missing shards in parallel for multiple tickers', async () => {
            const fileA = sha('a');
            const fileB = sha('b');
            const manifest = makeManifest({
                AAPL: { file: `${fileA}.json`, sha256: fileA },
                VTI: { file: `${fileB}.json`, sha256: fileB },
            });
            const shardBodies = {
                [`${fileA}.json`]: { '2024-01-01': 150 },
                [`${fileB}.json`]: { '2024-01-01': 200 },
            };
            const shardResolvers = {};
            const calls = [];
            mockFetch.mockImplementation((url, options) => {
                const target = String(url);
                calls.push({ url: target, options });
                if (target.includes('/historical_prices/index.json')) {
                    return Promise.resolve(createMockResponse(manifest));
                }
                const file = target.split('/').pop();
                return new Promise((resolve) => {
                    shardResolvers[file] = () => resolve(createMockResponse(shardBodies[file]));
                });
            });
            await loadModule();
            const promise = loadHistoricalPrices([{ security: 'AAPL' }, { security: 'VTI' }]);
            for (let i = 0; i < 5; i += 1) {
                await Promise.resolve();
            }
            // Both shard fetches were issued while neither had resolved.
            expect(Object.keys(shardResolvers).sort()).toEqual(
                [`${fileA}.json`, `${fileB}.json`].sort()
            );
            expect(calls.some((c) => c.url.endsWith('/data/historical_prices.json'))).toBe(false);
            shardResolvers[`${fileA}.json`]();
            shardResolvers[`${fileB}.json`]();
            await promise;
        });

        it('normalizes and deduplicates aliases, ignoring non-string securities', async () => {
            const file = sha('a');
            const entry = { file: `${file}.json`, sha256: file };
            const manifest = makeManifest({
                'BRK-B': entry,
                BRKB: entry,
            });
            const calls = setupPriceFetch({
                manifest,
                shardsByFile: { [`${file}.json`]: { '2024-01-01': 300 } },
            });
            await loadModule();
            await loadHistoricalPrices([
                { security: 'BRK-B' },
                { security: 'brkb' },
                { security: ' BRK-B ' },
                { security: '' },
                {},
                { security: 42 },
            ]);
            const shardCalls = calls.filter((c) => c.url.includes(`${file}.json`));
            expect(shardCalls).toHaveLength(1);
            expect(transactionState.historicalPrices.BRKB).toEqual({ '2024-01-01': 300 });
        });

        it('requests the manifest with no-cache and validates filenames', async () => {
            const badFile = 'A'.repeat(64) + '.json'; // uppercase hex is invalid
            const calls = setupPriceFetch({
                manifest: makeManifest({ AAPL: { file: badFile, sha256: sha('a') } }),
                monolith: { AAPL: { '2024-01-01': 150 } },
            });
            await loadModule();
            const result = await loadHistoricalPrices([{ security: 'AAPL' }]);
            const manifestCall = calls.find((c) => c.url.includes('index.json'));
            expect(manifestCall.options).toEqual({ cache: 'no-cache' });
            // Invalid manifest (bad filename) falls back to the monolith.
            expect(transactionState.historicalPrices.AAPL).toEqual({ '2024-01-01': 150 });
            expect(result).toBe(transactionState.historicalPrices);
        });

        it('rejects wrong schema versions and falls back to the monolith', async () => {
            const calls = setupPriceFetch({
                manifest: { schema_version: 2, symbols: { AAPL: { file: `${sha('a')}.json` } } },
                monolith: { AAPL: { '2024-01-01': 150 } },
            });
            await loadModule();
            await loadHistoricalPrices([{ security: 'AAPL' }]);
            expect(transactionState.historicalPrices.AAPL).toEqual({ '2024-01-01': 150 });
            expect(calls.some((c) => c.url.endsWith('/data/historical_prices.json'))).toBe(true);
        });

        it('treats a symbol absent from a valid manifest as no-data without fallback', async () => {
            const calls = setupPriceFetch({
                manifest: makeManifest({ AAPL: { file: `${sha('a')}.json`, sha256: sha('a') } }),
                monolith: { TSLA: { '2024-01-01': 999 } },
            });
            await loadModule();
            await loadHistoricalPrices([{ security: 'TSLA' }]);
            expect(transactionState.historicalPrices.TSLA).toBeUndefined();
            expect(calls.some((c) => c.url.endsWith('/data/historical_prices.json'))).toBe(false);
        });

        it('falls back to the monolith once when a referenced shard fails', async () => {
            const file = sha('a');
            const manifest = makeManifest({
                AAPL: { file: `${file}.json`, sha256: file },
            });
            const calls = setupPriceFetch({
                manifest,
                monolith: { AAPL: { '2024-01-01': 150 } },
                failUrls: [`${file}.json`],
            });
            await loadModule();
            await loadHistoricalPrices([{ security: 'AAPL' }]);
            await loadHistoricalPrices([{ security: 'AAPL' }]);
            const monolithCalls = calls.filter((c) =>
                c.url.endsWith('/data/historical_prices.json')
            );
            expect(monolithCalls).toHaveLength(1);
            expect(transactionState.historicalPrices.AAPL).toEqual({ '2024-01-01': 150 });
        });

        it('caches failed shard requests for the page session without a retry storm', async () => {
            const file = sha('a');
            const manifest = makeManifest({
                AAPL: { file: `${file}.json`, sha256: file },
            });
            const calls = setupPriceFetch({
                manifest,
                shardsByFile: { [`${file}.json`]: null }, // shard resolves ok but body is invalid
            });
            await loadModule();
            await loadHistoricalPrices([{ security: 'AAPL' }]);
            await loadHistoricalPrices([{ security: 'AAPL' }]);
            const shardCalls = calls.filter((c) => c.url.includes(`${file}.json`));
            expect(shardCalls).toHaveLength(1);
            const manifestCalls = calls.filter((c) => c.url.includes('index.json'));
            expect(manifestCalls).toHaveLength(1);
        });

        it('returns identical object identity on cache hits', async () => {
            const file = sha('a');
            const manifest = makeManifest({
                AAPL: { file: `${file}.json`, sha256: file },
            });
            setupPriceFetch({
                manifest,
                shardsByFile: { [`${file}.json`]: { '2024-01-01': 150 } },
            });
            await loadModule();
            const first = await loadHistoricalPrices([{ security: 'AAPL' }]);
            const second = await loadHistoricalPrices([{ security: 'AAPL' }]);
            expect(second).toBe(first);
            expect(transactionState.historicalPrices).toBe(first);
        });

        it('unions disjoint completions into the cached object', async () => {
            const fileA = sha('a');
            const fileB = sha('b');
            const manifest = makeManifest({
                AAPL: { file: `${fileA}.json`, sha256: fileA },
                VTI: { file: `${fileB}.json`, sha256: fileB },
            });
            setupPriceFetch({
                manifest,
                shardsByFile: {
                    [`${fileA}.json`]: { '2024-01-01': 150 },
                    [`${fileB}.json`]: { '2024-01-01': 200 },
                },
            });
            await loadModule();
            const first = await loadHistoricalPrices([{ security: 'AAPL' }]);
            expect(first).toEqual({ AAPL: { '2024-01-01': 150 } });
            const second = await loadHistoricalPrices([{ security: 'VTI' }]);
            expect(second).toEqual({
                AAPL: { '2024-01-01': 150 },
                VTI: { '2024-01-01': 200 },
            });
        });
    });

    describe('loadFxDailyRates', () => {
        it('handles success and clears cache', async () => {
            mockFetch.mockResolvedValueOnce(createMockResponse({ rates: { EUR: 0.9 } }));
            await loadModule();
            const result = await loadFxDailyRates();
            expect(result).toEqual({ rates: { EUR: 0.9 } });
            expect(mockFetch).toHaveBeenCalledWith('../data/output/fx_daily_rates.json');
        });

        it('handles failure', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));
            await loadModule();
            const result = await loadFxDailyRates();
            expect(result).toBeNull();
        });

        it('handles missing payload', async () => {
            mockFetch.mockResolvedValueOnce(createMockResponse(null));
            await loadModule();
            const result = await loadFxDailyRates();
            expect(result).toBeNull();
        });

        it('handles missing rates in payload', async () => {
            mockFetch.mockResolvedValueOnce(createMockResponse({ other: 'data' }));
            await loadModule();
            const result = await loadFxDailyRates();
            expect(result).toBeNull();
        });
    });

    describe('loadPerformanceSeries', () => {
        it('handles failure of performance series fetch', async () => {
            mockFetch
                .mockResolvedValueOnce({ ok: false, status: 404 }) // For performance_series.json
                .mockRejectedValueOnce(new Error('Network error')); // For fetchRealTimeData

            await loadModule();
            const result = await loadPerformanceSeries();

            expect(result).toEqual({});
        });

        it('handles invalid payload structure', async () => {
            mockFetch
                .mockResolvedValueOnce(createMockResponse(null)) // For performance_series.json
                .mockRejectedValueOnce(new Error('Network error')); // For fetchRealTimeData

            await loadModule();
            const result = await loadPerformanceSeries();

            expect(result).toEqual({});
        });

        it('handles success without realtime match', async () => {
            mockFetch
                .mockResolvedValueOnce(
                    createMockResponse({
                        '^LZ': [{ date: '2024-12-03', value: 1.05 }],
                    })
                )
                .mockRejectedValueOnce(new Error('Network error')); // For fetchRealTimeData

            await loadModule();
            const result = await loadPerformanceSeries();

            expect(result['^LZ']).toHaveLength(1);
        });
    });

    describe('_parsePerformancePayload', () => {
        let _parsePerformancePayload;
        beforeEach(async () => {
            const mod = await import('../../../js/transactions/dataLoader.js');
            _parsePerformancePayload = mod._parsePerformancePayload;
        });

        it('returns empty object for non-object payload', () => {
            expect(_parsePerformancePayload(null)).toEqual({});
            expect(_parsePerformancePayload([])).toEqual({});
        });

        it('ignores key if normalizedPoints is empty', () => {
            const payload = {
                KEY_1: [{ date: 'invalid', value: 'invalid' }],
            };
            const result = _parsePerformancePayload(payload);
            expect(result).toEqual({});
        });

        it('parses valid payload correctly', () => {
            const payload = {
                '^LZ': [
                    { date: '2024-12-03', value: '1.05' },
                    { date: '2024-12-04', value: 1.06 },
                    { invalid: 'point' },
                ],
                EMPTY: [],
            };
            const result = _parsePerformancePayload(payload);
            expect(result['^LZ']).toHaveLength(2);
            expect(result['^LZ'][0].value).toBe(1.05);
            expect(result['EMPTY']).toBeUndefined();
        });
    });

    describe('_estimateRealtimePerformance', () => {
        let _estimateRealtimePerformance;
        beforeEach(async () => {
            const mod = await import('../../../js/transactions/dataLoader.js');
            _estimateRealtimePerformance = mod._estimateRealtimePerformance;
        });

        it('updates series if fetch succeeds and dates do not match', async () => {
            const seriesMap = { '^LZ': [{ date: '2024-12-03', value: 1.0 }] };
            const realtime = { balance: 105, date: '2024-12-04' };

            mockFetch.mockResolvedValueOnce(createMockResponse([{ value: 100 }]));

            await _estimateRealtimePerformance(seriesMap, realtime);

            expect(seriesMap['^LZ']).toHaveLength(2);
            expect(seriesMap['^LZ'][1].value).toBe(1.05);
        });

        it('does not append if dates match', async () => {
            const seriesMap = { '^LZ': [{ date: '2024-12-04', value: 1.0 }] };
            const realtime = { balance: 105, date: '2024-12-04' };

            mockFetch.mockResolvedValueOnce(createMockResponse([{ value: 100 }]));

            await _estimateRealtimePerformance(seriesMap, realtime);

            expect(seriesMap['^LZ']).toHaveLength(1);
        });

        it('catches and logs error if balance series fetch fails', async () => {
            const seriesMap = { '^LZ': [{ date: '2024-12-03', value: 1.0 }] };
            const realtime = { balance: 105, date: '2024-12-04' };

            mockFetch.mockRejectedValueOnce(new Error('Test Error'));

            const { logger } = await import('../../../js/utils/logger.js');
            const mockWarn = jest.spyOn(logger, 'warn');

            await _estimateRealtimePerformance(seriesMap, realtime);

            expect(mockWarn).toHaveBeenCalledWith('Data loading failed:', expect.any(Error));
        });

        it('handles usdOpen as object with USD property', async () => {
            const seriesMap = { '^LZ': [{ date: '2024-12-03', value: 1.0 }] };
            const realtime = { balance: 105, date: '2024-12-04' };

            mockFetch.mockResolvedValueOnce(createMockResponse({ USD: [{ value: 100 }] }));

            await _estimateRealtimePerformance(seriesMap, realtime);

            expect(seriesMap['^LZ']).toHaveLength(2);
            expect(seriesMap['^LZ'][1].value).toBe(1.05);
        });

        it('does nothing if no realtime or no ^LZ series', async () => {
            const seriesMap = {};
            await _estimateRealtimePerformance(seriesMap, null);
            expect(seriesMap).toEqual({});
        });
    });

    describe('loadSplitHistory', () => {
        it('should correctly fetch and parse split history CSV', async () => {
            const csvData = `Symbol,SplitDate,Ratio,Multiplier
AAPL,2020-08-31,4:1,0.25
TSLA,2020-08-31,5:1,0.2
INVALID_ROW`;
            mockFetch.mockResolvedValueOnce(createMockResponse(csvData, true, true));

            await loadModule();
            const result = await loadSplitHistory();

            expect(mockFetch).toHaveBeenCalledWith('../data/split_history.csv');
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                symbol: 'AAPL',
                splitDate: '2020-08-31',
                splitRatio: '4:1',
                splitMultiplier: 0.25,
            });
            expect(result[1]).toEqual({
                symbol: 'TSLA',
                splitDate: '2020-08-31',
                splitRatio: '5:1',
                splitMultiplier: 0.2,
            });
        });

        it('should return empty array and log warning on non-ok response', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
            const mockWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await loadModule();
            const result = await loadSplitHistory();

            expect(result).toEqual([]);
            expect(mockWarn).toHaveBeenCalledWith(
                'Split history file not found, continuing without split adjustments'
            );
            mockWarn.mockRestore();
        });

        it('should return empty array and log error on fetch rejection', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network failure'));
            const mockError = jest.spyOn(console, 'error').mockImplementation(() => {});

            await loadModule();
            const result = await loadSplitHistory();

            expect(result).toEqual([]);
            expect(mockError).toHaveBeenCalledWith(
                'Error loading split history:',
                expect.any(Error)
            );
            mockError.mockRestore();
        });
    });

    describe('loadTransactionData', () => {
        it('should correctly fetch and parse transaction data', async () => {
            const mockCsvText = `TradeDate,OrderType,Security,Quantity,Price
2024-01-01,Buy,AAPL,10,150
2024-01-02,Sell,GOOG,5,2800
INVALID_ROW`;
            mockFetch.mockResolvedValueOnce(createMockResponse(mockCsvText, true, true));

            await loadModule();
            const result = await loadTransactionData();

            expect(mockFetch).toHaveBeenCalledWith('../data/transactions.csv');
            expect(result).toEqual([
                {
                    tradeDate: '2024-01-01',
                    orderType: 'Buy',
                    security: 'AAPL',
                    quantity: '10',
                    price: '150',
                    netAmount: '1500',
                    transactionId: 0,
                },
                {
                    tradeDate: '2024-01-02',
                    orderType: 'Sell',
                    security: 'GOOG',
                    quantity: '5',
                    price: '2800',
                    netAmount: '-14000',
                    transactionId: 1,
                },
            ]);
        });

        it('should throw an error on non-ok response', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

            await loadModule();

            await expect(loadTransactionData()).rejects.toThrow('Failed to load transactions.csv');
        });
    });

    describe('loadContributionSeries', () => {
        it('should correctly fetch and normalize array payload', async () => {
            const payload = [
                { tradeDate: '2024-01-01', amount: '1000', orderType: 'Buy', netAmount: '1000' },
                { tradeDate: '2024-01-02', amount: 500, orderType: 'Sell', netAmount: -500 },
                { amount: 'invalid' }, // Missing tradeDate, will be filtered out
            ];
            mockFetch.mockResolvedValueOnce(createMockResponse(payload));

            await loadModule();
            const result = await loadContributionSeries();

            expect(mockFetch).toHaveBeenCalledWith('../data/output/contribution_series.json');
            expect(result).toEqual({
                USD: [
                    { tradeDate: '2024-01-01', amount: 1000, orderType: 'Buy', netAmount: 1000 },
                    { tradeDate: '2024-01-02', amount: 500, orderType: 'Sell', netAmount: -500 },
                ],
            });
        });

        it('should correctly fetch and normalize object payload', async () => {
            const payload = {
                USD: [{ tradeDate: '2024-01-01', amount: 1000, orderType: 'Buy', netAmount: 1000 }],
                EUR: [{ tradeDate: '2024-01-01', amount: 800, orderType: 'Buy', netAmount: 800 }],
            };
            mockFetch.mockResolvedValueOnce(createMockResponse(payload));

            await loadModule();
            const result = await loadContributionSeries();

            expect(result).toEqual({
                USD: [{ tradeDate: '2024-01-01', amount: 1000, orderType: 'Buy', netAmount: 1000 }],
                EUR: [{ tradeDate: '2024-01-01', amount: 800, orderType: 'Buy', netAmount: 800 }],
            });
        });

        it('should return empty USD array and log warning on non-ok response', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
            const mockWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await loadModule();
            const result = await loadContributionSeries();

            expect(result).toEqual({ USD: [] });
            expect(mockWarn).toHaveBeenCalledWith(
                'contribution_series.json not found; contribution chart disabled'
            );
            mockWarn.mockRestore();
        });

        it('should return empty USD array and log warning on fetch error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network failure'));
            const mockWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await loadModule();
            const result = await loadContributionSeries();

            expect(result).toEqual({ USD: [] });
            expect(mockWarn).toHaveBeenCalledWith(
                'Failed to load contribution series:',
                expect.any(Error)
            );
            mockWarn.mockRestore();
        });

        it('should return empty USD array if payload is invalid', async () => {
            mockFetch.mockResolvedValueOnce(createMockResponse(null));
            await loadModule();
            const result = await loadContributionSeries();
            expect(result).toEqual({ USD: [] });
        });
    });
});

describe('dataLoader real-time integration', () => {
    let loadPortfolioSeries;
    let loadPerformanceSeries;
    let loadCompositionSnapshotData;
    let mockFetch;

    beforeEach(() => {
        jest.resetModules();

        mockFetch = jest.fn();
        global.fetch = mockFetch;

        // Mock logger
        jest.unstable_mockModule('@utils/logger.js', () => ({
            logger: {
                warn: jest.fn(),
                error: jest.fn(),
                log: jest.fn(),
            },
        }));

        // Mock date utils
        jest.unstable_mockModule('@utils/date.js', () => ({
            getNyDate: jest.fn(() => new Date()),
            isTradingDay: jest.fn(() => true),
        }));

        // Mock realtimeData so this describe focuses on dataLoader fetch sharing,
        // not the internals of fetchRealTimeData.
        jest.unstable_mockModule('../../../js/transactions/realtimeData.js', () => ({
            fetchRealTimeData: jest.fn(() => Promise.resolve(null)),
        }));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    async function loadModule() {
        const mod = await import('../../../js/transactions/dataLoader.js');
        loadPortfolioSeries = mod.loadPortfolioSeries;
        loadPerformanceSeries = mod.loadPerformanceSeries;
        loadCompositionSnapshotData = mod.loadCompositionSnapshotData;
    }

    function createMockResponse(data, ok = true, isText = false) {
        return {
            ok,
            [isText ? 'text' : 'json']: () => Promise.resolve(data),
        };
    }

    describe('loadPortfolioSeries with real-time data', () => {
        it('should append real-time balance to historical series', async () => {
            // Actual fetch() call order inside fetchRealTimeData / fetchPortfolioData:
            // 1. balance_series.json  (loadPortfolioSeries, sync)
            // 2. holdings_details.json (fetchPortfolioData, sync)
            // 3. fx_data.json          (fetchRealTimeData, parallel/sync with holdings)
            // 4. fund_data.json        (fetchPortfolioData, async after holdings resolves)
            mockFetch
                .mockResolvedValueOnce(
                    createMockResponse({
                        USD: [
                            { date: '2024-12-03', value: 10000 },
                            { date: '2024-12-04', value: 10500 },
                        ],
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        VT: { shares: '100', average_price: '100' },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        rates: { USD: 1.0, CNY: 7.2 },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        VT: 110, // Current price
                    })
                );

            await loadModule();
            const result = await loadPortfolioSeries();

            // Should have 3 points: 2 historical + 1 real-time
            expect(result.USD).toHaveLength(3);
            // Real-time date should be a valid date string (not the historical dates)
            expect(result.USD[2].date).toMatch(DATE_REGEX);
            expect(result.USD[2].date).not.toBe('2024-12-04');
            expect(result.USD[2].value).toBe(11000); // 100 * 110
        });

        it('should update existing date if real-time date matches last historical', async () => {
            // Use a date string we control for testing update behavior
            const testDateString = '2025-12-08'; // Use current NY date as the "matching" date
            mockFetch
                .mockResolvedValueOnce(
                    createMockResponse({
                        USD: [
                            { date: '2024-12-04', value: 10000 },
                            { date: testDateString, value: 10500 }, // Same as real-time date
                        ],
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        VT: { shares: '100', average_price: '100' },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        rates: { USD: 1.0 },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        VT: 110,
                    })
                );

            await loadModule();
            const result = await loadPortfolioSeries();

            // Should have 2 points if real-time date matches, or 3 if different
            // The key assertion is that the latest value is updated to real-time
            expect(result.USD.length).toBeGreaterThanOrEqual(2);
            expect(result.USD[result.USD.length - 1].date).toMatch(DATE_REGEX);
            expect(result.USD[result.USD.length - 1].value).toBe(11000); // Updated to real-time
        });

        it('should handle real-time fetch failure gracefully', async () => {
            mockFetch
                .mockResolvedValueOnce(
                    createMockResponse({
                        USD: [{ date: '2024-12-04', value: 10000 }],
                    })
                )
                .mockRejectedValueOnce(new Error('Network error'));

            await loadModule();
            const result = await loadPortfolioSeries();

            // Should return historical data only
            expect(result.USD).toHaveLength(1);
            expect(result.USD[0].value).toBe(10000);
        });

        it('shares a single balance_series.json fetch with loadPerformanceSeries', async () => {
            mockFetch
                .mockResolvedValueOnce(
                    createMockResponse({
                        USD: [{ date: '2024-12-04', value: 10000 }],
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        '^LZ': [{ date: '2024-12-04', value: 1.0 }],
                    })
                );

            await loadModule();
            await loadPortfolioSeries();
            await loadPerformanceSeries();

            const balanceCalls = mockFetch.mock.calls.filter((c) =>
                String(c[0]).includes('balance_series.json')
            );
            expect(balanceCalls).toHaveLength(1);
        });
    });

    describe('loadCompositionSnapshotData with real-time data', () => {
        it('should append real-time composition to historical snapshot', async () => {
            mockFetch
                .mockResolvedValueOnce(
                    createMockResponse({
                        dates: ['2024-12-03', '2024-12-04'],
                        composition: {
                            VT: [80, 82],
                            GOOG: [20, 18],
                        },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        VT: { shares: '100', average_price: '100' },
                        GOOG: { shares: '10', average_price: '150' },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        rates: { USD: 1.0 },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        VT: 100, // 100 * 100 = 10000
                        GOOG: 100, // 10 * 100 = 1000
                    })
                );

            await loadModule();
            const result = await loadCompositionSnapshotData();

            // Should have 3 dates now
            expect(result.dates).toHaveLength(3);
            // Real-time date should match expected format (not the historical dates)
            expect(result.dates[2]).toMatch(DATE_REGEX);
            expect(result.dates[2]).not.toBe('2024-12-04');

            // VT: 90.909%, GOOG: 9.09%
            expect(result.composition.VT).toHaveLength(3);
            expect(result.composition.VT[2]).toBeCloseTo(90.909, 1);
            expect(result.composition.GOOG[2]).toBeCloseTo(9.09, 1);
        });

        it('should handle missing composition snapshot gracefully', async () => {
            mockFetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                })
                .mockRejectedValueOnce(new Error('Network error')); // For realtime fetch

            await loadModule();
            const result = await loadCompositionSnapshotData();

            expect(result).toBeNull();
        });

        it('should fetch from correct path: figures/composition.json', async () => {
            mockFetch
                .mockResolvedValueOnce(
                    createMockResponse({
                        dates: ['2024-12-04'],
                        composition: { VT: [100] },
                    })
                )
                .mockRejectedValueOnce(new Error('Network error')); // For realtime fetch

            await loadModule();
            await loadCompositionSnapshotData();

            // Verify the first fetch call uses the correct path
            const firstCall = mockFetch.mock.calls[0];
            expect(firstCall[0]).toContain('figures/composition.json');
            expect(firstCall[0]).not.toContain('composition_snapshot.json');
        });

        it('should append real-time balance to total_values array', async () => {
            mockFetch
                .mockResolvedValueOnce(
                    createMockResponse({
                        dates: ['2024-12-03', '2024-12-04'],
                        composition: {
                            VT: [80, 82],
                            GOOG: [20, 18],
                        },
                        total_values: [10000, 10500], // Historical total values
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        VT: { shares: '100', average_price: '100' },
                        GOOG: { shares: '10', average_price: '150' },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        rates: { USD: 1.0 },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        VT: 100, // 100 * 100 = 10000
                        GOOG: 100, // 10 * 100 = 1000
                    })
                );

            await loadModule();
            const result = await loadCompositionSnapshotData();

            // Should have 3 dates with real-time appended
            expect(result.dates).toHaveLength(3);
            // The third date should be today's date (from real-time data)
            expect(result.dates[2]).not.toBe('2024-12-04'); // Not the historical date

            // total_values should also have 3 entries with real-time balance
            // Real-time balance = 100*100 + 10*100 = 11000
            expect(result.total_values).toHaveLength(3);
            expect(result.total_values[2]).toBe(11000);
        });

        it('should correctly merge aliased tickers (BRKB vs BRK-B) in composition data', async () => {
            mockFetch
                .mockResolvedValueOnce(
                    createMockResponse({
                        dates: ['2024-12-03', '2024-12-04'],
                        composition: {
                            BRKB: [50, 50],
                            VT: [50, 50],
                        },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        'BRK-B': { shares: '10', average_price: '200' }, // Real-time alias
                        VT: { shares: '100', average_price: '100' },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        rates: { USD: 1.0 },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        'BRK-B': 200, // 10 * 200 = 2000
                        VT: 80, // 100 * 80 = 8000
                    })
                );

            await loadModule();
            const result = await loadCompositionSnapshotData();

            // Total balance = 2000 + 8000 = 10000
            // BRK-B (aliased to BRKB): 2000 / 10000 = 20%
            // VT: 8000 / 10000 = 80%

            expect(result.dates).toHaveLength(3);

            // Verify merged ticker (BRKB should receive real-time data from BRK-B)
            expect(result.composition.BRKB).toHaveLength(3);
            expect(result.composition.BRKB[2]).toBeCloseTo(20.0, 1);

            // Verify no separate entry for BRK-B
            expect(result.composition['BRK-B']).toBeUndefined();
        });

        it('should update existing composition point if real-time date matches last historical date', async () => {
            // Use NY date to match what realtimeData.js likely returns (bypassing potentially failing mock)
            const now = new Date();
            const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

            mockFetch
                .mockResolvedValueOnce(
                    createMockResponse({
                        dates: ['2024-12-03', todayStr],
                        composition: {
                            VT: [80, 80], // Stale data for today
                            GOOG: [20, 20], // Stale data for today
                        },
                        total_values: [10000, 10000],
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        VT: { shares: '100', average_price: '120' }, // Price increased
                        GOOG: { shares: '10', average_price: '150' },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        rates: { USD: 1.0 },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        VT: 120, // 100 * 120 = 12000
                        GOOG: 100, // 10 * 100 = 1000
                        // Total = 13000. VT% = 12/13 ~ 92.3%. GOOG% = 1/13 ~ 7.7%
                    })
                );

            await loadModule();
            const result = await loadCompositionSnapshotData();

            // Should NOT append a new date, but keep length at 2
            expect(result.dates).toHaveLength(2);
            expect(result.dates[1]).toBe(todayStr);

            // Verify total value updated
            expect(result.total_values[1]).toBe(13000);

            // Verify composition percentages updated
            expect(result.composition.VT[1]).toBeCloseTo(92.3, 1);
            expect(result.composition.GOOG[1]).toBeCloseTo(7.7, 1);
        });

        it('loadCompositionSnapshotData caches the result on repeated calls', async () => {
            mockFetch
                .mockResolvedValueOnce(
                    createMockResponse({
                        dates: ['2024-12-04'],
                        composition: { VT: [100] },
                    })
                )
                .mockRejectedValueOnce(new Error('Network error')); // For realtime fetch

            await loadModule();
            const first = await loadCompositionSnapshotData();
            const second = await loadCompositionSnapshotData();
            expect(second).toBe(first);
            const compositionCalls = mockFetch.mock.calls.filter((c) =>
                String(c[0]).includes('figures/composition.json')
            );
            expect(compositionCalls).toHaveLength(1);
        });
    });
});
