const fs = require('fs');

const path = 'tests/js/transactions/dataLoader.test.js';
let content = fs.readFileSync(path, 'utf8');

// I need to add tests for loadSectorsSnapshotData, loadGeographySnapshotData, loadMarketcapSnapshotData, loadFxDailyRates, loadPerformanceSeries

// Let's modify the loadModule
content = content.replace(
    /loadContributionSeries = mod\.loadContributionSeries;\n    \}/,
    `loadContributionSeries = mod.loadContributionSeries;
        loadSectorsSnapshotData = mod.loadSectorsSnapshotData;
        loadGeographySnapshotData = mod.loadGeographySnapshotData;
        loadMarketcapSnapshotData = mod.loadMarketcapSnapshotData;
        loadFxDailyRates = mod.loadFxDailyRates;
        loadPerformanceSeries = mod.loadPerformanceSeries;
    }`
);

content = content.replace(
    /let loadContributionSeries;\n    let mockFetch;/,
    `let loadContributionSeries;
    let loadSectorsSnapshotData;
    let loadGeographySnapshotData;
    let loadMarketcapSnapshotData;
    let loadFxDailyRates;
    let loadPerformanceSeries;
    let mockFetch;`
);

const newTests = `
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
        beforeEach(() => {
            jest.unstable_mockModule('../../../js/transactions/realtimeData.js', () => ({
                fetchRealTimeData: jest.fn().mockResolvedValue({ balance: 11000, date: '2024-12-04' })
            }));
        });

        it('handles success without realtime match', async () => {
            mockFetch.mockResolvedValueOnce(createMockResponse({
                '^LZ': [
                    { date: '2024-12-03', value: 1.05 }
                ]
            }));

            // Mock the balance fetch
            mockFetch.mockResolvedValueOnce(createMockResponse({
                USD: [
                    { date: '2024-12-03', value: 10000 }
                ]
            }));

            await loadModule();
            const result = await loadPerformanceSeries();

            // We expect realtime logic to run and add a point
            // 11000 / 10000 = 1.1
            // 1.05 * 1.1 = 1.155
            expect(result['^LZ']).toHaveLength(2);
            expect(result['^LZ'][1].date).toBe('2024-12-04');
            expect(result['^LZ'][1].value).toBe(1.155);
        });

        it('handles failure of performance series fetch', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

            await loadModule();
            const result = await loadPerformanceSeries();

            expect(result).toEqual({});
        });

        it('handles invalid payload structure', async () => {
            mockFetch.mockResolvedValueOnce(createMockResponse(null));

            await loadModule();
            const result = await loadPerformanceSeries();

            expect(result).toEqual({});
        });

        it('handles realtime fetch failure gracefully', async () => {
            // override the mock
            jest.unstable_mockModule('../../../js/transactions/realtimeData.js', () => ({
                fetchRealTimeData: jest.fn().mockRejectedValue(new Error('Network error'))
            }));

            mockFetch.mockResolvedValueOnce(createMockResponse({
                '^LZ': [
                    { date: '2024-12-03', value: 1.05 }
                ]
            }));

            await loadModule();
            const result = await loadPerformanceSeries();

            expect(result['^LZ']).toHaveLength(1);
        });
    });
`;

content = content + newTests;
fs.writeFileSync(path, content);
