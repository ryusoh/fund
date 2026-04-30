import * as terminalStats from '@js/transactions/terminalStats.js';
import * as formatting from '@js/transactions/terminal/stats/formatting.js';
import * as transactions from '@js/transactions/terminal/stats/transactions.js';
import * as holdings from '@js/transactions/terminal/stats/holdings.js';
import * as financial from '@js/transactions/terminal/stats/financial.js';
import * as staticStats from '@js/transactions/terminal/stats/static.js';
import * as analysis from '@js/transactions/terminal/stats/analysis.js';

describe('terminalStats exports', () => {
    it('re-exports formatting functions', () => {
        expect(terminalStats.renderAsciiTable).toBe(formatting.renderAsciiTable);
    });

    it('re-exports transactions functions', () => {
        expect(terminalStats.getDynamicStatsText).toBe(transactions.getDynamicStatsText);
        expect(terminalStats.getStatsText).toBe(transactions.getStatsText);
    });

    it('re-exports holdings functions', () => {
        expect(terminalStats.getHoldingsText).toBe(holdings.getHoldingsText);
        expect(terminalStats.getHoldingsDebugText).toBe(holdings.getHoldingsDebugText);
    });

    it('re-exports financial functions', () => {
        expect(terminalStats.getFinancialStatsText).toBe(financial.getFinancialStatsText);
        expect(terminalStats.getTechnicalStatsText).toBe(financial.getTechnicalStatsText);
    });

    it('re-exports static functions', () => {
        expect(terminalStats.getCagrText).toBe(staticStats.getCagrText);
        expect(terminalStats.getAnnualReturnText).toBe(staticStats.getAnnualReturnText);
        expect(terminalStats.getRatioText).toBe(staticStats.getRatioText);
    });

    it('re-exports analysis functions', () => {
        expect(terminalStats.getDurationStatsText).toBe(analysis.getDurationStatsText);
        expect(terminalStats.getLifespanStatsText).toBe(analysis.getLifespanStatsText);
        expect(terminalStats.getConcentrationText).toBe(analysis.getConcentrationText);
    });

    it('has expected module exports', () => {
        expect(typeof terminalStats).toBe('object');
        expect(Object.keys(terminalStats).length).toBeGreaterThan(0);
    });
});
