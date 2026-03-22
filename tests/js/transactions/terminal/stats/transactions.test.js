import { jest } from '@jest/globals';

describe('transactions.js test without mocks', () => {
    let originalFetch;
    let getDynamicStatsText;
    let transactionState;

    beforeEach(async () => {
        jest.resetModules();
        originalFetch = global.fetch;

        const tsModule = await import('@js/transactions/state.js');
        transactionState = tsModule.transactionState;
        transactionState.filteredTransactions = [];

        const module = await import('@js/transactions/terminal/stats/transactions.js');
        getDynamicStatsText = module.getDynamicStatsText;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        jest.clearAllMocks();
    });

    describe('getDynamicStatsText', () => {
        test('should return empty string if no transactions', async () => {
            transactionState.filteredTransactions = [];
            const result = await getDynamicStatsText();
            expect(result).toBe('');

            transactionState.filteredTransactions = null;
            const result2 = await getDynamicStatsText();
            expect(result2).toBe('');
        });

        test('should compute total buy, sell, and net invested', async () => {
            transactionState.filteredTransactions = [
                { netAmount: '100', orderType: 'Buy' },
                { netAmount: '-50', orderType: 'Sell' },
                { netAmount: 'invalid', orderType: 'Buy' },
                { netAmount: '20', orderType: 'Sell' },
            ];

            const result = await getDynamicStatsText('EUR');
            // The real formatter returns actual strings!
            expect(result).toContain('Transactions');
            expect(result).toContain('4'); // 4 transactions
            expect(result).toContain('Total Buy');
            expect(result).toContain('100');
            expect(result).toContain('Total Sell');
            expect(result).toContain('70');
            expect(result).toContain('Net Invested');
            expect(result).toContain('30');
            expect(result).toContain('FILTERED STATS');
        });

        test('should default to USD if currency is empty or invalid', async () => {
            transactionState.filteredTransactions = [{ netAmount: '10', orderType: 'Buy' }];

            const res = await getDynamicStatsText('   ');
            expect(res).toContain('10');
            // Format currency in USD should use USD symbols or so
        });
    });

    describe('getStatsText', () => {
        test('should fallback to txt if json fetch fails', async () => {
            global.fetch = jest.fn((url) => {
                if (url.endsWith('.txt')) {
                    return Promise.resolve({ ok: true, text: () => Promise.resolve('TXT STATS') });
                }
                return Promise.resolve({ ok: false });
            });

            jest.resetModules();
            const freshModule1 = await import('@js/transactions/terminal/stats/transactions.js');
            const result = await freshModule1.getStatsText();
            expect(result).toBe('TXT STATS');
        });

        test('should return error string if both fetch fail', async () => {
            global.fetch = jest.fn(() => Promise.resolve({ ok: false }));
            jest.resetModules();
            const freshModule2 = await import('@js/transactions/terminal/stats/transactions.js');
            const result = await freshModule2.getStatsText();
            expect(result).toBe('Error loading transaction stats.');
        });

        test('should fall through to catch block if fetch throws', async () => {
            global.fetch = jest.fn((url) => {
                if (url.endsWith('.json')) {
                    return Promise.reject(new Error('Network error'));
                }
                return Promise.resolve({ ok: false });
            });

            jest.resetModules();
            const freshModule3 = await import('@js/transactions/terminal/stats/transactions.js');
            const result = await freshModule3.getStatsText();
            expect(result).toBe('Error loading transaction stats.');
        });

        test('should return error string if fallback txt fetch throws', async () => {
            global.fetch = jest.fn((url) => {
                if (url.endsWith('.json')) {
                    return Promise.resolve({ ok: false });
                }
                return Promise.reject(new Error('Network error'));
            });

            jest.resetModules();
            const freshModule4 = await import('@js/transactions/terminal/stats/transactions.js');
            const result = await freshModule4.getStatsText();
            expect(result).toBe('Error loading transaction stats.');
        });

        test('should load stats from json successfully and render table', async () => {
            global.fetch = jest.fn((url) => {
                if (url.endsWith('.json')) {
                    return Promise.resolve({
                        ok: true,
                        json: () =>
                            Promise.resolve({
                                currency_values: {
                                    USD: {
                                        total_buy_amount: 100,
                                        total_sell_amount: 50,
                                        net_contributions: 50,
                                        realized_gain: 10,
                                    },
                                },
                                counts: { total_transactions: 5, buy_orders: 3, sell_orders: 2 },
                            }),
                    });
                }
                return Promise.resolve({ ok: false });
            });

            jest.resetModules();
            const freshModule = await import('@js/transactions/terminal/stats/transactions.js');
            const result = await freshModule.getStatsText('USD');
            expect(result).toContain('TRANSACTION STATS');
            expect(result).toContain('100');
            expect(result).toContain('Total Transactions');
            expect(result).toContain('5');
        });

        test('should use default counts and values if missing in json', async () => {
            global.fetch = jest.fn((url) => {
                if (url.endsWith('.json')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({}),
                    });
                }
                return Promise.resolve({ ok: false });
            });

            jest.resetModules();
            const freshModule5 = await import('@js/transactions/terminal/stats/transactions.js');
            const result = await freshModule5.getStatsText('EUR');
            expect(result).toContain('TRANSACTION STATS');
            expect(result).toContain('0'); // default values
        });

        test('should default to USD if requested currency is not in currency_values', async () => {
            global.fetch = jest.fn((url) => {
                if (url.endsWith('.json')) {
                    return Promise.resolve({
                        ok: true,
                        json: () =>
                            Promise.resolve({
                                currency_values: {
                                    USD: { total_buy_amount: 100 },
                                },
                            }),
                    });
                }
                return Promise.resolve({ ok: false });
            });

            jest.resetModules();
            const freshModule6 = await import('@js/transactions/terminal/stats/transactions.js');
            const result = await freshModule6.getStatsText('EUR');
            expect(result).toContain('TRANSACTION STATS');
            expect(result).toContain('100'); // it fell back to USD data which has 100
        });

        test('should use cache on subsequent calls', async () => {
            global.fetch = jest.fn((url) => {
                if (url.endsWith('.json')) {
                    return Promise.resolve({
                        ok: true,
                        json: () =>
                            Promise.resolve({
                                currency_values: {
                                    USD: { total_buy_amount: 100 },
                                },
                            }),
                    });
                }
                return Promise.resolve({ ok: false });
            });

            jest.resetModules();
            const freshModule7 = await import('@js/transactions/terminal/stats/transactions.js');
            await freshModule7.getStatsText('USD');
            expect(global.fetch).toHaveBeenCalledTimes(1);

            global.fetch.mockClear();
            await freshModule7.getStatsText('USD');
            expect(global.fetch).not.toHaveBeenCalled(); // cache hit
        });

        test('empty string passed to currency defaults to USD', async () => {
            global.fetch = jest.fn((url) => {
                if (url.endsWith('.json')) {
                    return Promise.resolve({
                        ok: true,
                        json: () =>
                            Promise.resolve({
                                currency_values: {
                                    USD: { total_buy_amount: 100 },
                                },
                            }),
                    });
                }
                return Promise.resolve({ ok: false });
            });

            jest.resetModules();
            const freshModule8 = await import('@js/transactions/terminal/stats/transactions.js');
            const result = await freshModule8.getStatsText('');
            expect(result).toContain('100');
        });
    });
});
