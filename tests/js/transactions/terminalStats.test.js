import { jest } from '@jest/globals';
import * as terminalStats from '../../../js/transactions/terminalStats.js';
import * as formatting from '../../../js/transactions/terminal/stats/formatting.js';
import * as transactions from '../../../js/transactions/terminal/stats/transactions.js';
import * as holdings from '../../../js/transactions/terminal/stats/holdings.js';
import * as financial from '../../../js/transactions/terminal/stats/financial.js';
import * as staticStats from '../../../js/transactions/terminal/stats/static.js';
import * as analysis from '../../../js/transactions/terminal/stats/analysis.js';

jest.mock('../../../js/transactions/terminal/stats/formatting.js', () => ({
    renderAsciiTable: jest.fn(() => 'ascii_table'),
}));

jest.mock('../../../js/transactions/terminal/stats/transactions.js', () => ({
    getDynamicStatsText: jest.fn(() => 'dynamic_stats'),
    getStatsText: jest.fn(() => 'stats_text'),
}));

jest.mock('../../../js/transactions/terminal/stats/holdings.js', () => ({
    getHoldingsText: jest.fn(() => 'holdings_text'),
    getHoldingsDebugText: jest.fn(() => 'holdings_debug'),
}));

jest.mock('../../../js/transactions/terminal/stats/financial.js', () => ({
    getFinancialStatsText: jest.fn(() => 'financial_stats'),
    getTechnicalStatsText: jest.fn(() => 'technical_stats'),
}));

jest.mock('../../../js/transactions/terminal/stats/static.js', () => ({
    getCagrText: jest.fn(() => 'cagr_text'),
    getAnnualReturnText: jest.fn(() => 'annual_return'),
    getRatioText: jest.fn(() => 'ratio_text'),
}));

jest.mock('../../../js/transactions/terminal/stats/analysis.js', () => ({
    getDurationStatsText: jest.fn(() => 'duration_stats'),
    getLifespanStatsText: jest.fn(() => 'lifespan_stats'),
    getConcentrationText: jest.fn(() => 'concentration_text'),
}));

describe('terminalStats index', () => {
    it('exports formatting functions correctly', () => {
        expect(terminalStats.renderAsciiTable()).toBe('ascii_table');
        expect(formatting.renderAsciiTable).toHaveBeenCalled();
    });

    it('exports transactions functions correctly', () => {
        expect(terminalStats.getDynamicStatsText()).toBe('dynamic_stats');
        expect(transactions.getDynamicStatsText).toHaveBeenCalled();
        expect(terminalStats.getStatsText()).toBe('stats_text');
        expect(transactions.getStatsText).toHaveBeenCalled();
    });

    it('exports holdings functions correctly', () => {
        expect(terminalStats.getHoldingsText()).toBe('holdings_text');
        expect(holdings.getHoldingsText).toHaveBeenCalled();
        expect(terminalStats.getHoldingsDebugText()).toBe('holdings_debug');
        expect(holdings.getHoldingsDebugText).toHaveBeenCalled();
    });

    it('exports financial functions correctly', () => {
        expect(terminalStats.getFinancialStatsText()).toBe('financial_stats');
        expect(financial.getFinancialStatsText).toHaveBeenCalled();
        expect(terminalStats.getTechnicalStatsText()).toBe('technical_stats');
        expect(financial.getTechnicalStatsText).toHaveBeenCalled();
    });

    it('exports static functions correctly', () => {
        expect(terminalStats.getCagrText()).toBe('cagr_text');
        expect(staticStats.getCagrText).toHaveBeenCalled();
        expect(terminalStats.getAnnualReturnText()).toBe('annual_return');
        expect(staticStats.getAnnualReturnText).toHaveBeenCalled();
        expect(terminalStats.getRatioText()).toBe('ratio_text');
        expect(staticStats.getRatioText).toHaveBeenCalled();
    });

    it('exports analysis functions correctly', () => {
        expect(terminalStats.getDurationStatsText()).toBe('duration_stats');
        expect(analysis.getDurationStatsText).toHaveBeenCalled();
        expect(terminalStats.getLifespanStatsText()).toBe('lifespan_stats');
        expect(analysis.getLifespanStatsText).toHaveBeenCalled();
        expect(terminalStats.getConcentrationText()).toBe('concentration_text');
        expect(analysis.getConcentrationText).toHaveBeenCalled();
    });
});
