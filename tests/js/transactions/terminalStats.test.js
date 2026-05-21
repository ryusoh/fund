import { renderAsciiTable } from '@js/transactions/terminal/stats/formatting.js';
import { getDynamicStatsText, getStatsText } from '@js/transactions/terminal/stats/transactions.js';
import { getHoldingsText, getHoldingsDebugText } from '@js/transactions/terminal/stats/holdings.js';
import { getFinancialStatsText, getTechnicalStatsText } from '@js/transactions/terminal/stats/financial.js';
import { getCagrText, getAnnualReturnText, getRatioText } from '@js/transactions/terminal/stats/static.js';
import {
    getDurationStatsText,
    getLifespanStatsText,
    getConcentrationText,
} from '@js/transactions/terminal/stats/analysis.js';
import * as terminalStats from '@js/transactions/terminalStats.js';

describe('terminalStats.js exports', () => {
    it('should export formatting functions', () => {
        expect(terminalStats.renderAsciiTable).toBe(renderAsciiTable);
    });

    it('should export transactions functions', () => {
        expect(terminalStats.getDynamicStatsText).toBe(getDynamicStatsText);
        expect(terminalStats.getStatsText).toBe(getStatsText);
    });

    it('should export holdings functions', () => {
        expect(terminalStats.getHoldingsText).toBe(getHoldingsText);
        expect(terminalStats.getHoldingsDebugText).toBe(getHoldingsDebugText);
    });

    it('should export financial functions', () => {
        expect(terminalStats.getFinancialStatsText).toBe(getFinancialStatsText);
        expect(terminalStats.getTechnicalStatsText).toBe(getTechnicalStatsText);
    });

    it('should export static functions', () => {
        expect(terminalStats.getCagrText).toBe(getCagrText);
        expect(terminalStats.getAnnualReturnText).toBe(getAnnualReturnText);
        expect(terminalStats.getRatioText).toBe(getRatioText);
    });

    it('should export analysis functions', () => {
        expect(terminalStats.getDurationStatsText).toBe(getDurationStatsText);
        expect(terminalStats.getLifespanStatsText).toBe(getLifespanStatsText);
        expect(terminalStats.getConcentrationText).toBe(getConcentrationText);
    });
});
