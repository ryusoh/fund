import { handleCompositionCommand, handleSectorsCommand, handleGeographyCommand, handleMarketcapCommand, handleRollingCommand, handleAbsCommand, handlePercentageCommand, handleAllCommand, handleCumulativeCommand } from '../../../../../js/transactions/terminal/handlers/misc.js';
import { transactionState, setActiveChart } from '../../../../../js/transactions/state.js';

jest.mock('../../../../../js/transactions/terminal/snapshots.js', () => ({
    getGeographySnapshotLine: jest.fn().mockResolvedValue('Geo snapshot'),
    getMarketcapSnapshotLine: jest.fn().mockResolvedValue('MC snapshot'),
    getSectorsSnapshotLine: jest.fn().mockResolvedValue('Sector snapshot'),
    getCompositionSnapshotLine: jest.fn().mockResolvedValue('Comp snapshot'),
    getRollingSnapshotLine: jest.fn().mockResolvedValue('Rolling snapshot'),
    getContributionSummaryText: jest.fn().mockResolvedValue('Contr snapshot'),
    getPESnapshotLine: jest.fn().mockResolvedValue('PE snapshot'),
    getConcentrationSnapshotText: jest.fn().mockResolvedValue('Conc snapshot'),
    getFxSnapshotLine: jest.fn().mockReturnValue('Fx snapshot'),
    getPerformanceSnapshotLine: jest.fn().mockReturnValue('Perf snapshot'),
    getYieldSnapshotLine: jest.fn().mockResolvedValue('Yield snapshot')
}));

jest.mock('../../../../../js/transactions/state.js', () => {
    let _activeChart = 'composition';
    return {
        transactionState: {
            get activeChart() { return _activeChart; },
            set activeChart(val) { _activeChart = val; }
        },
        setActiveChart: jest.fn((val) => { _activeChart = val; }),
        setChartDateRange: jest.fn()
    };
});

describe('terminal/handlers/misc graph commands coverage', () => {
    let mockAppend;
    let mockChartManager;

    beforeEach(() => {
        mockAppend = jest.fn();
        mockChartManager = { update: jest.fn() };
        document.body.innerHTML = `
            <div id="runningAmountSection"></div>
            <div id="performanceSection"></div>
        `;
        setActiveChart('composition');
        transactionState.activeChart = 'composition';
        jest.clearAllMocks();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    const cases = [
        { name: 'composition', handler: handleCompositionCommand, snap: 'Comp snapshot' },
        { name: 'sectors', handler: handleSectorsCommand, snap: 'Sector snapshot' },
        { name: 'geography', handler: handleGeographyCommand, snap: 'Geo snapshot' },
        { name: 'marketcap', handler: handleMarketcapCommand, snap: 'MC snapshot' }
    ];

    for (const { name, handler, snap } of cases) {
        test(`handle ${name} from other charts`, async () => {
            const others = ['composition', 'sectors', 'geography', 'marketcap'].filter(c => c !== name);
            for (const other of others) {
                mockAppend.mockClear();
                setActiveChart(other);
                transactionState.activeChart = other;
                await handler([], { appendMessage: mockAppend, chartManager: mockChartManager });
                expect(setActiveChart).toHaveBeenCalledWith(name);
                expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining('Switched to'));
                expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining(snap));

                mockAppend.mockClear();
                setActiveChart(`${other}Abs`);
                transactionState.activeChart = `${other}Abs`;
                await handler([], { appendMessage: mockAppend, chartManager: mockChartManager });
                expect(setActiveChart).toHaveBeenCalledWith(`${name}Abs`);
                expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining('Switched to'));
                expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining(snap));
            }
        });

        test(`handle ${name} when already active and hidden`, async () => {
            mockAppend.mockClear();
            document.getElementById('runningAmountSection').classList.add('is-hidden');
            setActiveChart(name);
            transactionState.activeChart = name;
            await handler([], { appendMessage: mockAppend, chartManager: mockChartManager });
            expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining('Showing'));
            expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining(snap));
        });

        test(`handle ${name} when already active and visible`, async () => {
            mockAppend.mockClear();
            setActiveChart(name);
            transactionState.activeChart = name;
            await handler([], { appendMessage: mockAppend, chartManager: mockChartManager });
            expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining('already active'));
        });

        test(`handle ${name} from invalid chart`, async () => {
            mockAppend.mockClear();
            setActiveChart('invalid');
            transactionState.activeChart = 'invalid';
            await handler([], { appendMessage: mockAppend, chartManager: mockChartManager });
            expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining('must be active'));
        });
    }

    test('handleRollingCommand basic coverage', async () => {
        document.body.innerHTML = `
            <div id="runningAmountSection"></div>
            <div id="performanceSection"></div>
        `;
        setActiveChart('performance');
        transactionState.activeChart = 'performance';
        await handleRollingCommand([], { appendMessage: mockAppend, chartManager: mockChartManager });
        expect(setActiveChart).toHaveBeenCalledWith('rolling');
        expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining('Switched to'));

        mockAppend.mockClear();
        setActiveChart('invalid');
        transactionState.activeChart = 'invalid';
        await handleRollingCommand([], { appendMessage: mockAppend, chartManager: mockChartManager });
        expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining('must be active'));

        mockAppend.mockClear();
        setActiveChart('rolling');
        transactionState.activeChart = 'rolling';
        document.getElementById('runningAmountSection').classList.remove('is-hidden');
        await handleRollingCommand([], { appendMessage: mockAppend, chartManager: mockChartManager });
        expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining('already active'));

        mockAppend.mockClear();
        setActiveChart('rolling');
        transactionState.activeChart = 'rolling';
        document.getElementById('runningAmountSection').classList.add('is-hidden');
        await handleRollingCommand([], { appendMessage: mockAppend, chartManager: mockChartManager });
        expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining('Showing'));
    });

    test('handleAbsCommand switches valid charts to Abs', async () => {
        const charts = ['composition', 'sectors', 'geography', 'marketcap'];
        for (const chart of charts) {
            mockAppend.mockClear();
            setActiveChart(chart);
            transactionState.activeChart = chart;
            await handleAbsCommand([], { appendMessage: mockAppend, chartManager: mockChartManager });
            expect(setActiveChart).toHaveBeenCalledWith(`${chart}Abs`);
            expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining('absolute view'));
        }

        mockAppend.mockClear();
        setActiveChart('compositionAbs');
        transactionState.activeChart = 'compositionAbs';
        await handleAbsCommand([], { appendMessage: mockAppend, chartManager: mockChartManager });
        expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining('already showing absolute'));

        mockAppend.mockClear();
        setActiveChart('invalid');
        transactionState.activeChart = 'invalid';
        await handleAbsCommand([], { appendMessage: mockAppend, chartManager: mockChartManager });
        expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining('must be active'));
    });

    test('handlePercentageCommand switches valid charts from Abs', async () => {
        const charts = ['composition', 'sectors', 'geography', 'marketcap'];
        for (const chart of charts) {
            mockAppend.mockClear();
            setActiveChart(`${chart}Abs`);
            transactionState.activeChart = `${chart}Abs`;
            await handlePercentageCommand([], { appendMessage: mockAppend, chartManager: mockChartManager });
            expect(setActiveChart).toHaveBeenCalledWith(chart);
            expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining('percentage view'));
        }

        mockAppend.mockClear();
        setActiveChart('composition');
        transactionState.activeChart = 'composition';
        await handlePercentageCommand([], { appendMessage: mockAppend, chartManager: mockChartManager });
        expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining('already showing percentages'));

        mockAppend.mockClear();
        setActiveChart('invalid');
        transactionState.activeChart = 'invalid';
        await handlePercentageCommand([], { appendMessage: mockAppend, chartManager: mockChartManager });
        expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining('must be active'));
    });

    test('handleAllCommand reports status', async () => {
        const context = {
            appendMessage: mockAppend,
            filterAndSort: jest.fn(),
            closeAllFilterDropdowns: jest.fn(),
            resetSortState: jest.fn(),
            terminalInput: { value: '' },
            chartManager: mockChartManager,
            updateContextYearFromRange: jest.fn()
        };
        document.body.innerHTML = `
            <div id="runningAmountSection"></div>
            <div id="performanceSection"></div>
        `;
        document.getElementById('runningAmountSection').classList.remove('is-hidden');
        await handleAllCommand([], context);
        expect(context.filterAndSort).toHaveBeenCalledWith('');
        expect(mockAppend).toHaveBeenCalled();
    });

    test('handleCumulativeCommand basic coverage', async () => {
        setActiveChart('rolling');
        transactionState.activeChart = 'rolling';
        await handleCumulativeCommand([], { appendMessage: mockAppend, chartManager: mockChartManager });
        expect(setActiveChart).toHaveBeenCalledWith('performance');
        expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining('Switched to'));

        mockAppend.mockClear();
        setActiveChart('invalid');
        transactionState.activeChart = 'invalid';
        await handleCumulativeCommand([], { appendMessage: mockAppend, chartManager: mockChartManager });
        expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining('must be active'));

        mockAppend.mockClear();
        setActiveChart('performance');
        transactionState.activeChart = 'performance';
        document.getElementById('runningAmountSection').classList.remove('is-hidden');
        await handleCumulativeCommand([], { appendMessage: mockAppend, chartManager: mockChartManager });
        expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining('already active'));

        mockAppend.mockClear();
        setActiveChart('performance');
        transactionState.activeChart = 'performance';
        document.getElementById('runningAmountSection').classList.add('is-hidden');
        await handleCumulativeCommand([], { appendMessage: mockAppend, chartManager: mockChartManager });
        expect(mockAppend).toHaveBeenCalledWith(expect.stringContaining('Showing'));
    });

});
