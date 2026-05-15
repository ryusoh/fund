import { handleStatsCommand } from '../../../../../js/transactions/terminal/handlers/stats.js';
import * as terminalStats from '../../../../../js/transactions/terminalStats.js';
import * as geographySummary from '../../../../../js/transactions/terminal/handlers/geographySummary.js';

jest.mock('../../../../../js/transactions/terminalStats.js');
jest.mock('../../../../../js/transactions/terminal/handlers/geographySummary.js');
jest.mock('../../../../../js/transactions/state.js', () => ({
    transactionState: { selectedCurrency: 'USD' }
}));

describe('handleStatsCommand', () => {
    let appendMessage;

    beforeEach(() => {
        appendMessage = jest.fn();
        jest.clearAllMocks();
    });

    it('shows help when no args provided', async () => {
        await handleStatsCommand([], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('Stats commands:'));
    });

    it('handles transactions subcommand', async () => {
        terminalStats.getStatsText.mockResolvedValue('transactions text');
        await handleStatsCommand(['transactions'], { appendMessage });
        expect(terminalStats.getStatsText).toHaveBeenCalledWith('USD');
        expect(appendMessage).toHaveBeenCalledWith('transactions text');
    });

    it('handles holdings subcommand', async () => {
        terminalStats.getHoldingsText.mockResolvedValue('holdings text');
        await handleStatsCommand(['holdings'], { appendMessage });
        expect(terminalStats.getHoldingsText).toHaveBeenCalledWith('USD');
        expect(appendMessage).toHaveBeenCalledWith('holdings text');
    });

    it('handles holdings-debug subcommand', async () => {
        terminalStats.getHoldingsDebugText.mockResolvedValue('debug text');
        await handleStatsCommand(['holdings-debug'], { appendMessage });
        expect(terminalStats.getHoldingsDebugText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('debug text');
    });

    it('handles financial subcommand', async () => {
        terminalStats.getFinancialStatsText.mockResolvedValue('financial text');
        await handleStatsCommand(['financial'], { appendMessage });
        expect(terminalStats.getFinancialStatsText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('financial text');
    });

    it('handles technical subcommand', async () => {
        terminalStats.getTechnicalStatsText.mockResolvedValue('technical text');
        await handleStatsCommand(['technical'], { appendMessage });
        expect(terminalStats.getTechnicalStatsText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('technical text');
    });

    it('handles cagr subcommand', async () => {
        terminalStats.getCagrText.mockResolvedValue('cagr text');
        await handleStatsCommand(['cagr'], { appendMessage });
        expect(terminalStats.getCagrText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('cagr text');
    });

    it('handles return subcommand', async () => {
        terminalStats.getAnnualReturnText.mockResolvedValue('return text');
        await handleStatsCommand(['return'], { appendMessage });
        expect(terminalStats.getAnnualReturnText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('return text');
    });

    it('handles ratio subcommand', async () => {
        terminalStats.getRatioText.mockResolvedValue('ratio text');
        await handleStatsCommand(['ratio'], { appendMessage });
        expect(terminalStats.getRatioText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('ratio text');
    });

    it('handles duration subcommand', async () => {
        terminalStats.getDurationStatsText.mockResolvedValue('duration text');
        await handleStatsCommand(['duration'], { appendMessage });
        expect(terminalStats.getDurationStatsText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('duration text');
    });

    it('handles lifespan subcommand', async () => {
        terminalStats.getLifespanStatsText.mockResolvedValue('lifespan text');
        await handleStatsCommand(['lifespan'], { appendMessage });
        expect(terminalStats.getLifespanStatsText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('lifespan text');
    });

    it('handles concentration subcommand', async () => {
        terminalStats.getConcentrationText.mockResolvedValue('concentration text');
        await handleStatsCommand(['concentration'], { appendMessage });
        expect(terminalStats.getConcentrationText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('concentration text');
    });

    it('handles geography subcommand', async () => {
        geographySummary.getGeographySummaryText.mockResolvedValue('geography text');
        await handleStatsCommand(['geography'], { appendMessage });
        expect(geographySummary.getGeographySummaryText).toHaveBeenCalled();
        expect(appendMessage).toHaveBeenCalledWith('geography text');
    });

    it('handles unknown subcommand', async () => {
        await handleStatsCommand(['unknown'], { appendMessage });
        expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining('Unknown stats subcommand: unknown'));
    });
});
