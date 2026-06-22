import {
    renderAsciiTable,
    getDynamicStatsText,
    getStatsText,
    getHoldingsText,
    getHoldingsDebugText,
    getFinancialStatsText,
    getTechnicalStatsText,
    getCagrText,
    getAnnualReturnText,
    getRatioText,
    getDurationStatsText,
    getLifespanStatsText,
    getConcentrationText,
} from '../../../js/transactions/terminalStats.js';

describe('terminalStats.js', () => {
    it('exports all expected functions correctly', () => {
        expect(typeof renderAsciiTable).toBe('function');
        expect(typeof getDynamicStatsText).toBe('function');
        expect(typeof getStatsText).toBe('function');
        expect(typeof getHoldingsText).toBe('function');
        expect(typeof getHoldingsDebugText).toBe('function');
        expect(typeof getFinancialStatsText).toBe('function');
        expect(typeof getTechnicalStatsText).toBe('function');
        expect(typeof getCagrText).toBe('function');
        expect(typeof getAnnualReturnText).toBe('function');
        expect(typeof getRatioText).toBe('function');
        expect(typeof getDurationStatsText).toBe('function');
        expect(typeof getLifespanStatsText).toBe('function');
        expect(typeof getConcentrationText).toBe('function');
    });
});
