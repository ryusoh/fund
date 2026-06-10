import * as terminalStats from '../../../js/transactions/terminalStats.js';

jest.mock('../../../js/transactions/terminal/stats/formatting.js', () => ({
    renderAsciiTable: jest.fn(() => 'mockedAsciiTable'),
}));

jest.mock('../../../js/transactions/terminal/stats/transactions.js', () => ({
    getDynamicStatsText: jest.fn(() => 'mockedDynamic'),
    getStatsText: jest.fn(() => 'mockedStatsText'),
}));

jest.mock('../../../js/transactions/terminal/stats/holdings.js', () => ({
    getHoldingsText: jest.fn(() => 'mockedHoldingsText'),
    getHoldingsDebugText: jest.fn(() => 'mockedHoldingsDebugText'),
}));

jest.mock('../../../js/transactions/terminal/stats/financial.js', () => ({
    getFinancialStatsText: jest.fn(() => 'mockedFinancial'),
    getTechnicalStatsText: jest.fn(() => 'mockedTechnical'),
}));

jest.mock('../../../js/transactions/terminal/stats/static.js', () => ({
    getCagrText: jest.fn(() => 'mockedCagr'),
    getAnnualReturnText: jest.fn(() => 'mockedAnnual'),
    getRatioText: jest.fn(() => 'mockedRatio'),
}));

jest.mock('../../../js/transactions/terminal/stats/analysis.js', () => ({
    getDurationStatsText: jest.fn(() => 'mockedDuration'),
    getLifespanStatsText: jest.fn(() => 'mockedLifespan'),
    getConcentrationText: jest.fn(() => 'mockedConcentration'),
}));

describe('terminalStats exports', () => {
    it('executes formatting functions', () => {
        expect(terminalStats.renderAsciiTable()).toBe('mockedAsciiTable');
    });

    it('executes transactions functions', () => {
        expect(terminalStats.getDynamicStatsText()).toBe('mockedDynamic');
        expect(terminalStats.getStatsText()).toBe('mockedStatsText');
    });

    it('executes holdings functions', () => {
        expect(terminalStats.getHoldingsText()).toBe('mockedHoldingsText');
        expect(terminalStats.getHoldingsDebugText()).toBe('mockedHoldingsDebugText');
    });

    it('executes financial functions', () => {
        expect(terminalStats.getFinancialStatsText()).toBe('mockedFinancial');
        expect(terminalStats.getTechnicalStatsText()).toBe('mockedTechnical');
    });

    it('executes static functions', () => {
        expect(terminalStats.getCagrText()).toBe('mockedCagr');
        expect(terminalStats.getAnnualReturnText()).toBe('mockedAnnual');
        expect(terminalStats.getRatioText()).toBe('mockedRatio');
    });

    it('executes analysis functions', () => {
        expect(terminalStats.getDurationStatsText()).toBe('mockedDuration');
        expect(terminalStats.getLifespanStatsText()).toBe('mockedLifespan');
        expect(terminalStats.getConcentrationText()).toBe('mockedConcentration');
    });

    it('exports coverage dummy variable', () => {
        expect(terminalStats._coverage).toBe('terminalStats');
    });
});
