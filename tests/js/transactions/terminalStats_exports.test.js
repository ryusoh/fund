import * as terminalStats from '../../../js/transactions/terminalStats.js';

describe('terminalStats index', () => {
    it('should export all required functions', () => {
        expect(typeof terminalStats.renderAsciiTable).toBe('function');
        expect(typeof terminalStats.getDynamicStatsText).toBe('function');
        expect(typeof terminalStats.getStatsText).toBe('function');
        expect(typeof terminalStats.getHoldingsText).toBe('function');
        expect(typeof terminalStats.getHoldingsDebugText).toBe('function');
        expect(typeof terminalStats.getFinancialStatsText).toBe('function');
        expect(typeof terminalStats.getTechnicalStatsText).toBe('function');
        expect(typeof terminalStats.getCagrText).toBe('function');
        expect(typeof terminalStats.getAnnualReturnText).toBe('function');
        expect(typeof terminalStats.getRatioText).toBe('function');
        expect(typeof terminalStats.getDurationStatsText).toBe('function');
        expect(typeof terminalStats.getLifespanStatsText).toBe('function');
        expect(typeof terminalStats.getConcentrationText).toBe('function');
    });
});
