import * as terminalStats from '../../../js/transactions/terminalStats.js';

describe('terminalStats exports', () => {
    it('exports renderAsciiTable', () => {
        expect(typeof terminalStats.renderAsciiTable).toBe('function');
    });

    it('exports getDynamicStatsText', () => {
        expect(typeof terminalStats.getDynamicStatsText).toBe('function');
    });

    it('exports getStatsText', () => {
        expect(typeof terminalStats.getStatsText).toBe('function');
    });

    it('exports getHoldingsText', () => {
        expect(typeof terminalStats.getHoldingsText).toBe('function');
    });

    it('exports getHoldingsDebugText', () => {
        expect(typeof terminalStats.getHoldingsDebugText).toBe('function');
    });

    it('exports getFinancialStatsText', () => {
        expect(typeof terminalStats.getFinancialStatsText).toBe('function');
    });

    it('exports getTechnicalStatsText', () => {
        expect(typeof terminalStats.getTechnicalStatsText).toBe('function');
    });

    it('exports getCagrText', () => {
        expect(typeof terminalStats.getCagrText).toBe('function');
    });

    it('exports getAnnualReturnText', () => {
        expect(typeof terminalStats.getAnnualReturnText).toBe('function');
    });

    it('exports getRatioText', () => {
        expect(typeof terminalStats.getRatioText).toBe('function');
    });

    it('exports getDurationStatsText', () => {
        expect(typeof terminalStats.getDurationStatsText).toBe('function');
    });

    it('exports getLifespanStatsText', () => {
        expect(typeof terminalStats.getLifespanStatsText).toBe('function');
    });

    it('exports getConcentrationText', () => {
        expect(typeof terminalStats.getConcentrationText).toBe('function');
    });
});
