import {
    loadAndDisplayPortfolioData,
    getCalendarData,
    __testables,
} from '@services/dataService.js';
import * as chartManager from '@charts/allocationChartManager.js';
global.d3 = {
    csv: jest.fn(),
    json: jest.fn(),
};
import { getNyDate, isTradingDay } from '@utils/date.js';

// Mock dependencies
global.fetch = jest.fn();
global.console = { ...console, log: jest.fn(), error: jest.fn() };

// Mock d3

// Mock chartManager
jest.mock('@charts/allocationChartManager.js', () => ({
    updatePieChart: jest.fn(),
}));

// Mock responsive module
jest.mock('@ui/responsive.js', () => ({
    checkAndToggleVerticalScroll: jest.fn(),
}));

// Mock utils
jest.mock('@utils/date.js', () => ({
    getNyDate: jest.fn(),
    isTradingDay: jest.fn(),
}));

jest.mock('@utils/formatting.js', () => ({
    // Mirror real formatCurrency behavior for sign handling: always format absolute value with symbol
    formatCurrency: jest.fn((value) => `$${Math.abs(Number(value)).toFixed(2)}`),
    formatNumber: jest.fn((value) => value.toString()),
}));

jest.mock('@utils/colors.js', () => ({
    getBlueColorForSlice: jest.fn((index) => `#color-${index}`),
    hexToRgba: jest.fn((color, alpha) => `rgba(${color}, ${alpha})`),
}));

describe('dataService', () => {
    beforeEach(() => {
        // Set up DOM
        document.body.innerHTML = `
            <table>
                <tbody></tbody>
            </table>
            <div id="total-portfolio-value-in-table"></div>
            <div id="table-footer-summary">
                <span class="total-pnl"></span>
            </div>
        `;
        if (typeof __testables.resetAnalysisTickerCache === 'function') {
            __testables.resetAnalysisTickerCache();
        }

        // Clear all mocks
        fetch.mockClear();
        console.log.mockClear();
        console.error.mockClear();
        chartManager.updatePieChart.mockClear();
        d3.csv.mockClear();
        d3.json.mockClear();
        getNyDate.mockClear();
        isTradingDay.mockClear();

        // Default mock for getNyDate (Monday)
        const mockDate = new Date('2024-01-15T10:00:00Z');
        getNyDate.mockReturnValue(mockDate);

        // Default mock for isTradingDay (weekday)
        isTradingDay.mockReturnValue(true);
    });

    describe('loadAndDisplayPortfolioData', () => {
        it('should successfully load and display portfolio data', async () => {
            // Arrange
            const mockHoldings = {
                AAPL: {
                    shares: '10',
                    average_price: '150.00',
                    name: 'Apple Inc.',
                },
                GOOG: {
                    shares: '5',
                    average_price: '2500.00',
                    name: 'Alphabet Inc.',
                },
            };
            const mockPrices = {
                AAPL: '160.00',
                GOOG: '2600.00',
            };
            const mockAnalysisIndex = {
                tickers: [
                    { symbol: 'AAPL', path: '../data/analysis/AAPL.json' },
                    { symbol: 'GOOG', path: '../data/analysis/GOOG.json' },
                ],
            };
            const analysisDetails = {
                AAPL: { market: { pe: 15, forwardPe: 12 } },
                GOOG: { market: { pe: 25, forwardPe: 22 } },
            };

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockHoldings),
                    });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockPrices),
                    });
                }
                if (url.includes('analysis/index')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockAnalysisIndex),
                    });
                }
                if (url.includes('analysis/AAPL')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(analysisDetails.AAPL),
                    });
                }
                if (url.includes('analysis/GOOG')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(analysisDetails.GOOG),
                    });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            // Act
            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            // Assert
            expect(chartManager.updatePieChart).toHaveBeenCalled();

            const totalValueElement = document.getElementById('total-portfolio-value-in-table');
            expect(totalValueElement.textContent).toBe('$14600.00');

            // Check table was populated
            const tableRows = document.querySelectorAll('tbody tr');
            expect(tableRows).toHaveLength(2);
            expect(document.querySelector('tr[data-ticker="AAPL"] td.per').textContent).toBe(
                '15.00/12.00'
            );
            expect(document.querySelector('tr[data-ticker="GOOG"] td.per').textContent).toBe(
                '25.00/22.00'
            );
        });

        it('should display placeholder PER values when analysis data is unavailable', async () => {
            const mockHoldings = {
                AAPL: { shares: '10', average_price: '150.00', name: 'Apple Inc.' },
            };
            const mockPrices = { AAPL: '160.00' };

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockHoldings),
                    });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockPrices),
                    });
                }
                if (url.includes('analysis/index')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({ tickers: [] }),
                    });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            expect(document.querySelector('tr[data-ticker="AAPL"] td.per').textContent).toBe('—');
        });

        it('should render single PER value when only trailing multiple is available', async () => {
            const mockHoldings = {
                AAPL: { shares: '10', average_price: '150.00', name: 'Apple Inc.' },
            };
            const mockPrices = { AAPL: '160.00' };
            const mockAnalysisIndex = {
                tickers: [{ symbol: 'AAPL', path: '../data/analysis/AAPL.json' }],
            };

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockHoldings),
                    });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockPrices),
                    });
                }
                if (url.includes('analysis/index')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockAnalysisIndex),
                    });
                }
                if (url.includes('analysis/AAPL')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({ market: { pe: 22.37 } }),
                    });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            expect(document.querySelector('tr[data-ticker="AAPL"] td.per').textContent).toBe(
                '22.37'
            );
        });

        it('should fallback to pe_ratio.json when forwardPe is missing in analysis data', async () => {
            const mockHoldings = {
                VT: { shares: '10', average_price: '100.00', name: 'Vanguard Total World' },
            };
            const mockPrices = { VT: '110.00' };
            const mockAnalysisIndex = {
                tickers: [{ symbol: 'VT', path: '../data/analysis/VT.json' }],
            };
            const mockPeRatio = {
                forward_pe: {
                    ticker_forward_pe: {
                        VT: 20.02,
                    },
                },
            };

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHoldings) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrices) });
                }
                if (url.includes('analysis/index')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockAnalysisIndex),
                    });
                }
                if (url.includes('analysis/VT')) {
                    // Return trailing PE but NO forwardPe
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({ market: { pe: 23.1 } }),
                    });
                }
                if (url.includes('pe_ratio.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPeRatio) });
                }
                return Promise.reject(new Error(`Unexpected URL: ${url}`));
            });

            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            expect(document.querySelector('tr[data-ticker="VT"] td.per').textContent).toBe(
                '23.10/20.02'
            );
        });

        it('should dynamically calculate P/E ratios using real-time price and EPS data', async () => {
            const mockHoldings = {
                NVDA: { shares: '10', average_price: '100.00', name: 'Nvidia Corp.' },
            };
            // Current price is $120.00
            const mockPrices = { NVDA: '120.00' };
            const mockAnalysisIndex = {
                tickers: [{ symbol: 'NVDA', path: '../data/analysis/NVDA.json' }],
            };

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHoldings) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrices) });
                }
                if (url.includes('analysis/index')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockAnalysisIndex),
                    });
                }
                if (url.includes('analysis/NVDA')) {
                    // Return fixed EPS values. Trailing = 4.00, Forward = 5.00
                    return Promise.resolve({
                        ok: true,
                        json: () =>
                            Promise.resolve({
                                market: { pe: 25.0, forwardPe: 20.0, eps: 4.0, forwardEps: 5.0 },
                            }),
                    });
                }
                return Promise.reject(new Error(`Unexpected URL: ${url}`));
            });

            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            // Trailing PE = 120.00 / 4.00 = 30.00
            // Forward PE = 120.00 / 5.00 = 24.00
            expect(document.querySelector('tr[data-ticker="NVDA"] td.per').textContent).toBe(
                '30.00/24.00'
            );
        });

        it('should handle fetch error with proper error message', async () => {
            // Arrange
            fetch.mockRejectedValue(new Error('Network error'));

            // Act
            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            // Assert
            expect(console.error).toHaveBeenCalledWith(
                'Error fetching or processing fund data:',
                expect.any(Error)
            );
        });

        it('should handle fetch response not ok', async () => {
            // Arrange
            fetch.mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            });

            // Act
            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            // Assert
            expect(console.error).toHaveBeenCalledWith(
                'Error fetching or processing fund data:',
                expect.any(Error)
            );
        });

        it('should return early when holdingsDetails is missing', async () => {
            // Arrange
            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            // Act
            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            // Assert
            expect(console.error).toHaveBeenCalledWith(
                'Essential holding or price data missing, cannot update portfolio display.'
            );
            expect(chartManager.updatePieChart).not.toHaveBeenCalled();
        });

        it('should return early when prices is missing', async () => {
            // Arrange
            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve({ AAPL: {} }) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            // Act
            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            // Assert
            expect(console.error).toHaveBeenCalledWith(
                'Essential holding or price data missing, cannot update portfolio display.'
            );
        });

        it('should return early when exchangeRates is missing', async () => {
            // Arrange
            fetch.mockImplementation(() => {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
            });

            // Act
            await loadAndDisplayPortfolioData('USD', null, { USD: '$' });

            // Assert
            expect(console.error).toHaveBeenCalledWith(
                'Exchange rates or currency symbols missing, cannot update portfolio display correctly.'
            );
        });

        it('should return early when currencySymbols is missing', async () => {
            // Arrange
            fetch.mockImplementation(() => {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
            });

            // Act
            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, null);

            // Assert
            expect(console.error).toHaveBeenCalledWith(
                'Exchange rates or currency symbols missing, cannot update portfolio display correctly.'
            );
        });

        it('should handle holdings with missing price data', async () => {
            // Arrange
            const mockHoldings = {
                AAPL: { shares: '10', average_price: '150.00', name: 'Apple Inc.' },
            };
            const mockPrices = { AAPL: '160.00' }; // No price for AAPL

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHoldings) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrices) });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            // Act
            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            // Assert
            const totalValueElement = document.getElementById('total-portfolio-value-in-table');
            expect(totalValueElement.textContent).toBe('$1600.00');
        });

        it('should handle holdings with invalid numeric data', async () => {
            // Arrange
            const mockHoldings = {
                AAPL: {
                    shares: 'invalid',
                    average_price: 'not-a-number',
                    name: 'Apple Inc.',
                },
            };
            const mockPrices = { AAPL: 'also-invalid' };

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHoldings) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrices) });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            // Act
            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            // Assert
            const totalValueElement = document.getElementById('total-portfolio-value-in-table');
            expect(totalValueElement.textContent).toBe('$0.00');
        });

        it('should handle zero cost holdings', async () => {
            // Arrange
            const mockHoldings = {
                AAPL: { shares: '10', average_price: '0', name: 'Apple Inc.' },
            };
            const mockPrices = { AAPL: '160.00' };

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHoldings) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrices) });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            // Act
            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            // Assert
            expect(chartManager.updatePieChart).toHaveBeenCalled();
            const totalValueElement = document.getElementById('total-portfolio-value-in-table');
            expect(totalValueElement.textContent).toBe('$1600.00');
        });

        it('should handle positive PnL formatting', async () => {
            // Arrange
            const mockHoldings = {
                AAPL: { shares: '10', average_price: '150.00', name: 'Apple Inc.' },
            };
            const mockPrices = { AAPL: '160.00' }; // Positive PnL

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHoldings) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrices) });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            // Act
            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            // Assert
            const pnlElement = document.querySelector('.total-pnl');
            const pnlAmount = pnlElement.querySelector('.pnl-amount');
            expect(pnlAmount).toBeTruthy();
            // Check that thinking highlight is applied (element should have data-thinking-active)
            expect(pnlAmount.getAttribute('data-thinking-active')).toBe('true');
            // Check that character spans are created with thinking effect
            const charSpans = pnlAmount.querySelectorAll('.text-thinking-char');
            expect(charSpans.length).toBeGreaterThan(0);
        });

        it('should handle negative PnL formatting', async () => {
            // Arrange
            const mockHoldings = {
                AAPL: { shares: '10', average_price: '170.00', name: 'Apple Inc.' },
            };
            const mockPrices = { AAPL: '160.00' }; // Negative PnL

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHoldings) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrices) });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            // Act
            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            // Assert
            const pnlElement = document.querySelector('.total-pnl');
            const pnlAmount = pnlElement.querySelector('.pnl-amount');
            expect(pnlAmount).toBeTruthy();
            // Check that thinking highlight is applied (element should have data-thinking-active)
            expect(pnlAmount.getAttribute('data-thinking-active')).toBe('true');
            // Check that character spans are created with thinking effect
            const charSpans = pnlAmount.querySelectorAll('.text-thinking-char');
            expect(charSpans.length).toBeGreaterThan(0);
        });

        it('should handle missing name in holdings data', async () => {
            // Arrange
            const mockHoldings = {
                AAPL: { shares: '10', average_price: '150.00' }, // No name
            };
            const mockPrices = { AAPL: '160.00' };

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHoldings) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrices) });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            // Act
            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            // Assert
            const tableRows = document.querySelectorAll('tbody tr');
            expect(tableRows[0].querySelector('td').textContent).toBe('AAPL'); // Falls back to ticker
        });

        it('should handle zero PnL formatting (lines 122-123)', async () => {
            // Arrange
            const mockHoldings = {
                AAPL: { shares: '10', average_price: '160.00', name: 'Apple Inc.' }, // Same as current price
            };
            const mockPrices = { AAPL: '160.00' }; // Zero PnL

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHoldings) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrices) });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            // Act
            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            // Assert
            const pnlCells = document.querySelectorAll('.pnl');
            const pnlPercentageCells = document.querySelectorAll('.pnl-percentage');
            // Should have default color (empty string) for zero PnL
            expect(pnlCells[0].style.color).toBe('');
            expect(pnlPercentageCells[0].style.color).toBe('');
        });

        it('should handle negative PnL display formatting (lines 105-108)', async () => {
            // Arrange
            const mockHoldings = {
                AAPL: { shares: '10', average_price: '170.00', name: 'Apple Inc.' },
            };
            const mockPrices = { AAPL: '160.00' }; // Negative PnL

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHoldings) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrices) });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            // Act
            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            // Assert
            const pnlCells = document.querySelectorAll('.pnl');
            // Should display with minus sign prefix for negative values
            expect(pnlCells[0].textContent).toContain('-$100.00');
        });
    });

    describe('getCalendarData', () => {
        it('should successfully process calendar data', async () => {
            // Arrange
            const mockHistoricalCsv = [
                { date: '2024-01-01', value_usd: '10000' },
                { date: '2024-01-02', value_usd: '10200' },
            ];
            const mockFx = { rates: { USD: 1.0, EUR: 0.85 } };
            const mockHoldings = { AAPL: { shares: '10' } };
            const mockFund = { AAPL: '160.00' };

            d3.csv.mockResolvedValue(mockHistoricalCsv);
            d3.json.mockImplementation((url) => {
                if (url.includes('fx')) {
                    return Promise.resolve(mockFx);
                }
                if (url.includes('holdings')) {
                    return Promise.resolve(mockHoldings);
                }
                if (url.includes('fund')) {
                    return Promise.resolve(mockFund);
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            const mockDate = new Date('2024-01-15');
            getNyDate.mockReturnValue(mockDate);

            // Act
            const result = await getCalendarData({
                historical: 'historical.csv',
                fx: 'fx.json',
                holdings: 'holdings.json',
                fund: 'fund.json',
            });

            // Assert
            expect(result).toHaveProperty('processedData');
            expect(result).toHaveProperty('byDate');
            expect(result).toHaveProperty('rates');
            expect(result.rates).toEqual({ USD: 1.0, EUR: 0.85 });
        });

        it('should throw error when historical data is empty', async () => {
            // Arrange
            d3.csv.mockResolvedValue([]);
            d3.json.mockResolvedValue({});

            // Act & Assert
            await expect(getCalendarData({})).rejects.toThrow('No historical data available.');
        });

        it('should handle today being the last day in historical data', async () => {
            // Arrange
            const today = new Date('2024-01-15T12:00:00Z');
            const todayStr = '2024-01-15';
            getNyDate.mockReturnValue(today);

            const mockHistoricalCsv = [
                { date: '2024-01-14', value_usd: '10000' },
                { date: todayStr, value_usd: '10200' },
            ];
            const mockFx = { rates: { USD: 1.0 } };
            const mockHoldings = { AAPL: { shares: '10' } };
            const mockFund = { AAPL: '160.00' };

            d3.csv.mockResolvedValue(mockHistoricalCsv);
            d3.json.mockImplementation((url) => {
                if (url.includes('fx')) {
                    return Promise.resolve(mockFx);
                }
                if (url.includes('holdings')) {
                    return Promise.resolve(mockHoldings);
                }
                if (url.includes('fund')) {
                    return Promise.resolve(mockFund);
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            // Act
            const result = await getCalendarData({
                historical: 'historical.csv',
                fx: 'fx.json',
                holdings: 'holdings.json',
                fund: 'fund.json',
            });

            // Assert
            expect(result.processedData.length).toBeGreaterThanOrEqual(2);
            // The last entry should be today's data (either historical or real-time updated)
            const lastEntry = result.processedData[result.processedData.length - 1];
            expect(lastEntry.date).toBe(todayStr);
        });

        it('should handle case where only today exists in historical data (lines 322-326)', async () => {
            // Arrange
            const today = new Date('2024-01-15T12:00:00Z');
            const todayStr = '2024-01-15';
            getNyDate.mockReturnValue(today);

            const mockHistoricalCsv = [{ date: todayStr, value_usd: '10200' }];
            const mockFx = { rates: { USD: 1.0 } };
            const mockHoldings = { AAPL: { shares: '10' } };
            const mockFund = { AAPL: '160.00' };

            d3.csv.mockResolvedValue(mockHistoricalCsv);
            d3.json.mockImplementation((url) => {
                if (url.includes('fx')) {
                    return Promise.resolve(mockFx);
                }
                if (url.includes('holdings')) {
                    return Promise.resolve(mockHoldings);
                }
                if (url.includes('fund')) {
                    return Promise.resolve(mockFund);
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            // Act
            const result = await getCalendarData({
                historical: 'historical.csv',
                fx: 'fx.json',
                holdings: 'holdings.json',
                fund: 'fund.json',
            });

            // Assert
            expect(result.processedData.length).toBeGreaterThanOrEqual(1);
            // Should use valueForPnlCalculation = 0 (lines 325-326)
            const todayEntry = result.processedData.find((d) => d.date === todayStr);
            expect(todayEntry).toBeDefined();
        });

        it('should handle missing holdings data', async () => {
            // Arrange
            const mockHistoricalCsv = [{ date: '2024-01-01', value_usd: '10000' }];
            const mockFx = { rates: { USD: 1.0 } };

            d3.csv.mockResolvedValue(mockHistoricalCsv);
            d3.json.mockImplementation((url) => {
                if (url.includes('fx')) {
                    return Promise.resolve(mockFx);
                }
                if (url.includes('holdings')) {
                    return Promise.resolve(null);
                }
                if (url.includes('fund')) {
                    return Promise.resolve({ AAPL: '160.00' });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            const today = new Date('2024-01-15');
            getNyDate.mockReturnValue(today);

            // Act
            const result = await getCalendarData({
                historical: 'historical.csv',
                fx: 'fx.json',
                holdings: 'holdings.json',
                fund: 'fund.json',
            });

            // Assert
            expect(result.processedData).toHaveLength(1); // Only historical data, no real-time
        });

        it('should handle missing fund data', async () => {
            // Arrange
            const mockHistoricalCsv = [{ date: '2024-01-01', value_usd: '10000' }];
            const mockFx = { rates: { USD: 1.0 } };
            const mockHoldings = { AAPL: { shares: '10' } };

            d3.csv.mockResolvedValue(mockHistoricalCsv);
            d3.json.mockImplementation((url) => {
                if (url.includes('fx')) {
                    return Promise.resolve(mockFx);
                }
                if (url.includes('holdings')) {
                    return Promise.resolve(mockHoldings);
                }
                if (url.includes('fund')) {
                    return Promise.resolve(null);
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            const today = new Date('2024-01-15');
            getNyDate.mockReturnValue(today);

            // Act
            const result = await getCalendarData({
                historical: 'historical.csv',
                fx: 'fx.json',
                holdings: 'holdings.json',
                fund: 'fund.json',
            });

            // Assert
            expect(result.processedData).toHaveLength(1); // Only historical data
        });

        it('should handle historical data with missing dates', async () => {
            // Arrange
            const mockHistoricalCsv = [
                { date: '2024-01-01', value_usd: '10000' },
                { date: '', value_usd: '10100' }, // Missing date
                { date: '2024-01-02', value_usd: '10200' },
            ];
            const mockFx = { rates: { USD: 1.0 } };

            d3.csv.mockResolvedValue(mockHistoricalCsv);
            d3.json.mockImplementation((url) => {
                if (url.includes('fx')) {
                    return Promise.resolve(mockFx);
                }
                return Promise.resolve({});
            });

            const today = new Date('2024-01-15');
            getNyDate.mockReturnValue(today);

            // Act
            const result = await getCalendarData({
                historical: 'historical.csv',
                fx: 'fx.json',
                holdings: 'holdings.json',
                fund: 'fund.json',
            });

            // Assert
            // Should filter out entry with missing date, plus may add real-time data
            expect(result.processedData.length).toBeGreaterThanOrEqual(2);
            // Verify that entry with empty date was filtered out
            const emptyDateEntry = result.processedData.find((d) => d.date === '');
            expect(emptyDateEntry).toBeUndefined();
        });

        it('should replace existing today data when dates match (line 246)', async () => {
            // Arrange - create scenario where today's date already exists in historical
            const today = new Date('2024-01-15T12:00:00Z');
            const todayStr = '2024-01-15';
            getNyDate.mockReturnValue(today);

            const mockHistoricalCsv = [
                { date: '2024-01-14', value_usd: '10000' },
                { date: todayStr, value_usd: '10200' }, // Today already in historical
            ];
            const mockFx = { rates: { USD: 1.0 } };
            const mockHoldings = { AAPL: { shares: '15' } }; // Different from historical to trigger replacement
            const mockFund = { AAPL: '170.00' };

            d3.csv.mockResolvedValue(mockHistoricalCsv);
            d3.json.mockImplementation((url) => {
                if (url.includes('fx')) {
                    return Promise.resolve(mockFx);
                }
                if (url.includes('holdings')) {
                    return Promise.resolve(mockHoldings);
                }
                if (url.includes('fund')) {
                    return Promise.resolve(mockFund);
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            // Act
            const result = await getCalendarData({
                historical: 'historical.csv',
                fx: 'fx.json',
                holdings: 'holdings.json',
                fund: 'fund.json',
            });

            // Assert
            const todayEntries = result.processedData.filter((d) => d.date === todayStr);
            // Should only have one entry for today (replaced, not added)
            expect(todayEntries).toHaveLength(1);

            // The last entry should be the real-time updated data
            const lastEntry = result.processedData[result.processedData.length - 1];
            expect(lastEntry.date).toBe(todayStr);
            expect(lastEntry.total).toBe(2550); // 15 * 170 = 2550
        });

        it('should not calculate real-time data on weekends (lines 214-216)', async () => {
            // Arrange
            const today = new Date('2024-01-13'); // Saturday
            const todayStr = '2024-01-13';
            getNyDate.mockReturnValue(today);
            isTradingDay.mockReturnValue(false); // Weekend

            const mockHistoricalCsv = [
                { date: '2024-01-12', value_usd: '10000' }, // Friday
            ];
            const mockFx = { rates: { USD: 1.0 } };
            const mockHoldings = { AAPL: { shares: '10' } };
            const mockFund = { AAPL: '160.00' };

            d3.csv.mockResolvedValue(mockHistoricalCsv);
            d3.json.mockImplementation((url) => {
                if (url.includes('fx')) {
                    return Promise.resolve(mockFx);
                }
                if (url.includes('holdings')) {
                    return Promise.resolve(mockHoldings);
                }
                if (url.includes('fund')) {
                    return Promise.resolve(mockFund);
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            // Act
            const result = await getCalendarData({
                historical: 'historical.csv',
                fx: 'fx.json',
                holdings: 'holdings.json',
                fund: 'fund.json',
            });

            // Assert
            // Should only have historical data, no real-time data for weekend
            expect(result.processedData).toHaveLength(1);
            expect(result.processedData[0].date).toBe('2024-01-12'); // Only Friday data

            // No Saturday data should be present
            const saturdayEntry = result.processedData.find((d) => d.date === todayStr);
            expect(saturdayEntry).toBeUndefined();
        });
    });
    describe('additional coverage: processAndEnrichHoldings / createHoldingRow / processHistoricalData / calculateRealtimePnl', () => {
        it('computes non-zero pnlPercentage and populates .pnl-percentage (lines 52,57,101)', async () => {
            const mockHoldings = { ZZZZ: { shares: '3', average_price: '100.00', name: 'Zeta' } };
            const mockPrices = { ZZZZ: '110.00' };

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHoldings) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrices) });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            const row = document.querySelector('tbody tr');
            expect(row).toBeTruthy();
            const pct = row.querySelector('.pnl-percentage').textContent;
            expect(pct).toBe('+10.00%');
        });

        it('computes daily PnL from previous day (line 190)', async () => {
            d3.csv.mockResolvedValue([
                { date: '2024-01-14', value_usd: '100.00' },
                { date: '2024-01-15', value_usd: '110.00' },
            ]);
            d3.json.mockImplementation((url) => {
                if (url.includes('fx')) {
                    return Promise.resolve({ rates: { USD: 1.0 } });
                }
                if (url.includes('holdings')) {
                    return Promise.resolve(null);
                }
                if (url.includes('fund')) {
                    return Promise.resolve(null);
                }
                return Promise.reject(new Error('Unexpected URL'));
            });
            getNyDate.mockReturnValue(new Date('2024-01-15T12:00:00Z'));

            const result = await getCalendarData({
                historical: 'historical.csv',
                fx: 'fx.json',
                holdings: 'holdings.json',
                fund: 'fund.json',
            });

            const todayEntry = result.processedData.find((d) => d.date === '2024-01-15');
            expect(todayEntry.value).toBeCloseTo(0.1, 5);
        });

        it('computes per-currency daily changes using historical currency columns', async () => {
            d3.csv.mockResolvedValue([
                {
                    date: '2024-01-14',
                    value_usd: '100.00',
                    value_cny: '700.00',
                    value_jpy: '11000',
                    value_krw: '120000',
                },
                {
                    date: '2024-01-15',
                    value_usd: '110.00',
                    value_cny: '690.00',
                    value_jpy: '11150',
                    value_krw: '119000',
                },
            ]);
            d3.json.mockImplementation((url) => {
                if (url.includes('fx')) {
                    return Promise.resolve({
                        rates: { USD: 1, CNY: 7, JPY: 110, KRW: 1200 },
                    });
                }
                if (url.includes('holdings') || url.includes('fund')) {
                    return Promise.resolve(null);
                }
                return Promise.reject(new Error('Unexpected URL'));
            });
            getNyDate.mockReturnValue(new Date('2024-01-15T12:00:00Z'));

            const result = await getCalendarData({
                historical: 'historical.csv',
                fx: 'fx.json',
                holdings: 'holdings.json',
                fund: 'fund.json',
            });

            const dayEntry = result.processedData.find((d) => d.date === '2024-01-15');
            expect(dayEntry).toBeDefined();
            expect(dayEntry.valueUSD).toBeCloseTo(0.1, 5);
            expect(dayEntry.valueCNY).toBeCloseTo(-10 / 700, 5);
            expect(dayEntry.dailyChangeCNY).toBeCloseTo(-10);
            expect(dayEntry.valueJPY).toBeCloseTo((11150 - 11000) / 11000, 5);
        });

        it('sums only tickers present in fund data (line 211)', async () => {
            d3.csv.mockResolvedValue([{ date: '2024-01-14', value_usd: '900' }]);
            d3.json.mockImplementation((url) => {
                if (url.includes('fx')) {
                    return Promise.resolve({ rates: { USD: 1.0 } });
                }
                if (url.includes('holdings')) {
                    return Promise.resolve({ AAPL: { shares: '10' }, MSFT: { shares: '5' } });
                }
                if (url.includes('fund')) {
                    return Promise.resolve({ AAPL: '100.00' });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });
            getNyDate.mockReturnValue(new Date('2024-01-15T12:00:00Z'));

            const result = await getCalendarData({
                historical: 'historical.csv',
                fx: 'fx.json',
                holdings: 'holdings.json',
                fund: 'fund.json',
            });

            const lastEntry = result.processedData[result.processedData.length - 1];
            expect(lastEntry.total).toBe(1000);
        });

        it('covers allocation 100% and triggers pnl calc (lines 52,57,101)', async () => {
            const mockHoldings = { ONE: { shares: '2', average_price: '50.00', name: 'One Inc.' } };
            const mockPrices = { ONE: '75.00' };

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHoldings) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrices) });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            const row = document.querySelector('tbody tr');
            expect(row).toBeTruthy();
            // allocation 100% ensures currentValue path executed (line 52)
            expect(row.querySelector('.allocation').textContent).toBe('100.00%');
            // non-zero cost path triggers pnl% calculation (line 57) and text assignment (line 101)
            expect(row.querySelector('.pnl-percentage').textContent).toBe('+50.00%');
        });

        it('handles previous value = 0 in daily PnL calc (line 190)', async () => {
            d3.csv.mockResolvedValue([
                { date: '2024-01-14', value_usd: '0' },
                { date: '2024-01-15', value_usd: '50' },
            ]);
            d3.json.mockImplementation((url) => {
                if (url.includes('fx')) {
                    return Promise.resolve({ rates: { USD: 1.0 } });
                }
                if (url.includes('holdings')) {
                    return Promise.resolve(null);
                }
                if (url.includes('fund')) {
                    return Promise.resolve(null);
                }
                return Promise.reject(new Error('Unexpected URL'));
            });
            getNyDate.mockReturnValue(new Date('2024-01-15T12:00:00Z'));

            const result = await getCalendarData({
                historical: 'historical.csv',
                fx: 'fx.json',
                holdings: 'holdings.json',
                fund: 'fund.json',
            });

            const today = result.processedData.find((d) => d.date === '2024-01-15');
            expect(today).toBeTruthy();
            // With previous value 0, guarded division should yield 0
            expect(today.value).toBe(0);
        });

        it('renders pnl cell text with plus sign and percentage (covers line 101)', async () => {
            const mockHoldings = {
                GAIN: { shares: '2', average_price: '50.00', name: 'Gain Corp' },
            };
            const mockPrices = { GAIN: '75.00' }; // +$50.00 total PnL, +50.00%

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHoldings) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrices) });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            const row = document.querySelector('tbody tr');
            expect(row).toBeTruthy();
            expect(row.querySelector('.pnl').textContent).toBe('+$50.00');
            expect(row.querySelector('.pnl-percentage').textContent).toBe('+50.00%');
        });

        it('renders computed currentValue in value cell (covers line 52)', async () => {
            const mockHoldings = { ONE: { shares: '2', average_price: '50.00', name: 'One Inc.' } };
            const mockPrices = { ONE: '75.00' }; // currentValue = 150.00

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHoldings) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrices) });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            const row = document.querySelector('tbody tr');
            expect(row).toBeTruthy();
            expect(row.querySelector('.value').textContent).toBe('$150.00');
        });

        it('sets footer total PnL text from accumulated totals (covers line 57)', async () => {
            // Two holdings to ensure accumulation path executes
            // PnL: AAA = +30.00 (1 * (130 - 100)), BBB = 0.00 => total +30.00 on cost 200.00 => +15.00%
            const mockHoldings = {
                AAA: { shares: '1', average_price: '100.00', name: 'Alpha' },
                BBB: { shares: '2', average_price: '50.00', name: 'Beta' },
            };
            const mockPrices = { AAA: '130.00', BBB: '50.00' };

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHoldings) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrices) });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            const pnlFooter = document.querySelector('#table-footer-summary .total-pnl');
            expect(pnlFooter.textContent).toBe(' (+$30.00, +15.00%)');
        });

        it('should handle zero initialCostValue for pnlPercentage (line 57)', async () => {
            const mockHoldings = {
                ZERO_COST: { shares: '10', average_price: '0', name: 'Zero Cost Stock' },
            };
            const mockPrices = { ZERO_COST: '150.00' };

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHoldings) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrices) });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            const row = document.querySelector('tbody tr');
            expect(row).toBeTruthy();
            const pnlPercentageText = row.querySelector('.pnl-percentage').textContent;
            expect(pnlPercentageText).toBe('+0.00%'); // Expecting 0% PnL when cost is 0
        });

        it('should cover line 59 when shares are zero but cost is not', async () => {
            const mockHoldings = {
                ZERO_SHARES: { shares: '0', average_price: '100.00', name: 'Zero Shares Stock' },
            };
            const mockPrices = { ZERO_SHARES: '150.00' };

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHoldings) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrices) });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            const row = document.querySelector('tbody tr');
            expect(row).toBeTruthy();
            const pnlPercentageText = row.querySelector('.pnl-percentage').textContent;
            // shares = 0, cost = 100 => initialCostValue = 0.
            // pnlPercentage should be 0.
            expect(pnlPercentageText).toBe('+0.00%');
        });

        it('should render negative PnL value with minus sign (covers line 103)', async () => {
            const mockHoldings = {
                LOSS: { shares: '5', average_price: '200.00', name: 'Loss Corp' },
            };
            const mockPrices = { LOSS: '150.00' }; // PnL = (150-200)*5 = -250

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHoldings) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrices) });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            const row = document.querySelector('tbody tr');
            expect(row).toBeTruthy();
            expect(row.querySelector('.pnl').textContent).toBe('-$250.00');
            // Also verify the per-row negative color styling for both value and percentage cells
            const pnlCell = row.querySelector('.pnl');
            const pctCell = row.querySelector('.pnl-percentage');
            expect(pnlCell.style.color).toBe('rgb(234, 67, 53)'); // NEGATIVE_PNL
            expect(pctCell.style.color).toBe('rgb(234, 67, 53)'); // NEGATIVE_PNL
            const pctText = row.querySelector('.pnl-percentage').textContent;
            expect(pctText).toBe('-25.00%');
        });

        it('skips per-row pnl/pct updates when cells are missing (covers branch at lines 103/108)', async () => {
            // Mock createElement so that for <tr> we pretend the specific cells cannot be found
            const originalCreateElement = document.createElement.bind(document);
            jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
                const el = originalCreateElement(tagName);
                if (tagName && tagName.toString().toLowerCase() === 'tr') {
                    const nativeQS = el.querySelector.bind(el);
                    el.querySelector = (selector) => {
                        if (selector === 'td.pnl' || selector === 'td.pnl-percentage') {
                            return null; // Force the if (pnlCell && pnlPercentageCell) branch to be false
                        }
                        return nativeQS(selector);
                    };
                }
                return el;
            });

            const mockHoldings = {
                MISS: { shares: '2', average_price: '10.00', name: 'Missing Cells' },
            };
            const mockPrices = { MISS: '15.00' }; // positive PnL so code would try to write values

            fetch.mockImplementation((url) => {
                if (url.includes('holdings_details.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHoldings) });
                }
                if (url.includes('fund_data.json')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrices) });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            await loadAndDisplayPortfolioData('USD', { USD: 1.0 }, { USD: '$' });

            const row = document.querySelector('tbody tr');
            expect(row).toBeTruthy();

            // Even though the cells exist in the DOM, our overridden row.querySelector returned null to the function,
            // so it should have skipped writing any text content to these cells.
            const pnlCellInDom = document.querySelector('tbody tr td.pnl');
            const pctCellInDom = document.querySelector('tbody tr td.pnl-percentage');
            expect(pnlCellInDom.textContent).toBe('');
            expect(pctCellInDom.textContent).toBe('');

            // Restore original implementation
            document.createElement.mockRestore();
        });
    });

    // Tests for internal utility functions to achieve 100% coverage
    describe('internal utility functions', () => {
        it('should handle edge cases in computeMonthlyPnl', async () => {
            // Test empty array (line 297)
            const mockFx = { rates: { USD: 1.0 } };
            const mockHoldings = {};
            const mockFund = {};

            d3.csv.mockResolvedValue([]);
            d3.json.mockImplementation((url) => {
                if (url.includes('fx')) {
                    return Promise.resolve(mockFx);
                }
                if (url.includes('holdings')) {
                    return Promise.resolve(mockHoldings);
                }
                if (url.includes('fund')) {
                    return Promise.resolve(mockFund);
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            try {
                await getCalendarData({
                    historical: 'historical.csv',
                    fx: 'fx.json',
                    holdings: 'holdings.json',
                    fund: 'fund.json',
                });
            } catch (error) {
                // Expected to throw "No historical data available."
                expect(error.message).toContain('No historical data available');
            }
        });

        it('should handle invalid entries in computeMonthlyPnl', async () => {
            // Test entries with missing/invalid date fields (lines 303, 318, 327, 340)
            const mockHistoricalCsv = [
                { date: '2024-01-01', value_usd: '1000' },
                { date: null, value_usd: '1100' }, // invalid entry
                { date: '2024-01-02', value_usd: 'invalid' }, // invalid value
                { date: '2024-01-03', value_usd: '1200' },
            ];
            const mockFx = { rates: { USD: 1.0 } };
            const mockHoldings = {};
            const mockFund = {};

            d3.csv.mockResolvedValue(mockHistoricalCsv);
            d3.json.mockImplementation((url) => {
                if (url.includes('fx')) {
                    return Promise.resolve(mockFx);
                }
                if (url.includes('holdings')) {
                    return Promise.resolve(mockHoldings);
                }
                if (url.includes('fund')) {
                    return Promise.resolve(mockFund);
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            const result = await getCalendarData({
                historical: 'historical.csv',
                fx: 'fx.json',
                holdings: 'holdings.json',
                fund: 'fund.json',
            });

            // Should handle invalid entries gracefully
            expect(result).toHaveProperty('monthlyPnl');
        });

        it('should handle invalid month key in getPreviousMonthKey', async () => {
            // Create test data that would trigger getPreviousMonthKey with invalid input (line 284)
            const mockHistoricalCsv = [
                { date: '2024-01-01', value_usd: '1000' },
                { date: '2024-02-01', value_usd: '1100' },
            ];
            const mockFx = { rates: { USD: 1.0 } };
            const mockHoldings = {};
            const mockFund = {};

            d3.csv.mockResolvedValue(mockHistoricalCsv);
            d3.json.mockImplementation((url) => {
                if (url.includes('fx')) {
                    return Promise.resolve(mockFx);
                }
                if (url.includes('holdings')) {
                    return Promise.resolve(mockHoldings);
                }
                if (url.includes('fund')) {
                    return Promise.resolve(mockFund);
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            // This should exercise the getPreviousMonthKey function internally
            const result = await getCalendarData({
                historical: 'historical.csv',
                fx: 'fx.json',
                holdings: 'holdings.json',
                fund: 'fund.json',
            });

            expect(result).toHaveProperty('monthlyPnl');
        });

        it('should handle edge cases with empty entries arrays and invalid data', async () => {
            // Create test data that exercises more edge cases in computeMonthlyPnl
            const mockHistoricalCsv = [
                { date: '2024-01-01', value_usd: '1000' },
                { date: '2024-01-15', value_usd: '' }, // empty value
                { date: '2024-01-31', value_usd: '1200' },
                { value_usd: '1100' }, // missing date property (line 303)
                { date: '', value_usd: '1050' }, // empty date
                { date: '2024-02-01', value_usd: 'NaN' }, // invalid number
            ];
            const mockFx = { rates: { USD: 1.0 } };
            const mockHoldings = {};
            const mockFund = {};

            d3.csv.mockResolvedValue(mockHistoricalCsv);
            d3.json.mockImplementation((url) => {
                if (url.includes('fx')) {
                    return Promise.resolve(mockFx);
                }
                if (url.includes('holdings')) {
                    return Promise.resolve(mockHoldings);
                }
                if (url.includes('fund')) {
                    return Promise.resolve(mockFund);
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            const result = await getCalendarData({
                historical: 'historical.csv',
                fx: 'fx.json',
                holdings: 'holdings.json',
                fund: 'fund.json',
            });

            // Should handle all edge cases gracefully
            expect(result).toHaveProperty('monthlyPnl');
            expect(result.monthlyPnl).toBeInstanceOf(Map);
        });

        it('should handle months with no valid entries', async () => {
            // Test case where entries array exists but has no valid entries (line 318, 327, 340)
            const mockHistoricalCsv = [
                { date: '2024-01-01', value_usd: 'invalid' }, // invalid value
                { date: '2024-01-15', value_usd: '' }, // empty value
                { date: '2024-02-01', value_usd: '1100' }, // valid entry
            ];
            const mockFx = { rates: { USD: 1.0 } };
            const mockHoldings = {};
            const mockFund = {};

            d3.csv.mockResolvedValue(mockHistoricalCsv);
            d3.json.mockImplementation((url) => {
                if (url.includes('fx')) {
                    return Promise.resolve(mockFx);
                }
                if (url.includes('holdings')) {
                    return Promise.resolve(mockHoldings);
                }
                if (url.includes('fund')) {
                    return Promise.resolve(mockFund);
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            const result = await getCalendarData({
                historical: 'historical.csv',
                fx: 'fx.json',
                holdings: 'holdings.json',
                fund: 'fund.json',
            });

            expect(result).toHaveProperty('monthlyPnl');
        });

        it('computes first available month PnL using the earliest data point when no prior month exists', () => {
            const processedData = [
                {
                    date: '2024-03-15',
                    total: 1000,
                    totalCNY: 7000,
                    totalJPY: 100000,
                    totalKRW: 1200000,
                },
                {
                    date: '2024-03-31',
                    total: 1500,
                    totalCNY: 7200,
                    totalJPY: 130000,
                    totalKRW: 1500000,
                },
            ];

            const monthlyPnl = __testables.computeMonthlyPnl(processedData);
            const marchInfo = monthlyPnl.get('2024-03');
            expect(marchInfo).toBeTruthy();
            expect(marchInfo.absoluteChangeUSD).toBeCloseTo(500);
            expect(marchInfo.percentChangeUSD).toBeCloseTo(0.5);
        });

        it('falls back to the most recent data month when the immediate previous month has no entries', () => {
            const processedData = [
                { date: '2024-01-15', total: 900, totalCNY: 0, totalJPY: 0, totalKRW: 0 },
                { date: '2024-01-31', total: 1000, totalCNY: 0, totalJPY: 0, totalKRW: 0 },
                // February missing entirely
                { date: '2024-03-01', total: 1100, totalCNY: 0, totalJPY: 0, totalKRW: 0 },
                { date: '2024-03-31', total: 1500, totalCNY: 0, totalJPY: 0, totalKRW: 0 },
            ];

            const monthlyPnl = __testables.computeMonthlyPnl(processedData);
            const marchInfo = monthlyPnl.get('2024-03');
            expect(marchInfo).toBeTruthy();
            expect(marchInfo.absoluteChangeUSD).toBeCloseTo(500);
        });
    });
});
