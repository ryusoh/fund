import { jest } from '@jest/globals';
import * as terminalStats from '../../../js/transactions/terminalStats.js';

describe('terminalStats exports', () => {
    test('exports all necessary functions', async () => {
        expect(terminalStats.renderAsciiTable).toBeDefined();
        expect(terminalStats.getDynamicStatsText).toBeDefined();
        expect(terminalStats.getStatsText).toBeDefined();
        expect(terminalStats.getHoldingsText).toBeDefined();
        expect(terminalStats.getHoldingsDebugText).toBeDefined();
        expect(terminalStats.getFinancialStatsText).toBeDefined();
        expect(terminalStats.getTechnicalStatsText).toBeDefined();
        expect(terminalStats.getCagrText).toBeDefined();
        expect(terminalStats.getAnnualReturnText).toBeDefined();
        expect(terminalStats.getRatioText).toBeDefined();
        expect(terminalStats.getDurationStatsText).toBeDefined();
        expect(terminalStats.getLifespanStatsText).toBeDefined();
        expect(terminalStats.getConcentrationText).toBeDefined();
    });
});
