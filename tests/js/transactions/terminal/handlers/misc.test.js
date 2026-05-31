import {
    handleClearCommand,
    handleLabelCommand,
    handleMarketcapCommand,
    handleGeographyCommand,
    handleSectorsCommand,
} from '../../../../../js/transactions/terminal/handlers/misc.js';
import { transactionState, setActiveChart, setChartDateRange } from '../../../../../js/transactions/state.js';

jest.mock('../../../../../js/transactions/state.js', () => ({
    transactionState: {
        activeChart: null,
    },
    setActiveChart: jest.fn(),
    setChartDateRange: jest.fn(),
    setCompositionFilterTickers: jest.fn(),
    setCompositionAssetClassFilter: jest.fn(),
}));

jest.mock('../../../../../js/transactions/terminal/snapshots.js', () => ({
    getSectorsSnapshotLine: jest.fn().mockResolvedValue('Mocked sectors summary'),
    getGeographySnapshotLine: jest.fn().mockResolvedValue('Mocked geography summary'),
    getMarketcapSnapshotLine: jest.fn().mockResolvedValue('Mocked marketcap summary'),
}));

describe('Misc Command Handlers', () => {
    let appendMessageMock;
    let chartManagerMock;

    beforeEach(() => {
        jest.clearAllMocks();
        appendMessageMock = jest.fn();
        chartManagerMock = { update: jest.fn() };
        document.body.innerHTML = `
            <div id="runningAmountSection" class="is-hidden"></div>
        `;
    });

    describe('handleMarketcapCommand', () => {
        it('should show market cap chart if not visible', async () => {
            transactionState.activeChart = 'marketcap';
            await handleMarketcapCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('marketcap');
            expect(
                document.getElementById('runningAmountSection').classList.contains('is-hidden')
            ).toBe(false);
            expect(appendMessageMock).toHaveBeenCalledWith(
                expect.stringContaining('Showing market cap chart.\nMocked marketcap summary')
            );
        });

        it('should handle already active', async () => {
            transactionState.activeChart = 'marketcap';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleMarketcapCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(appendMessageMock).toHaveBeenCalledWith('Market cap chart is already active.');
        });

        it('should switch from composition', async () => {
            transactionState.activeChart = 'composition';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleMarketcapCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('marketcap');
            expect(appendMessageMock).toHaveBeenCalledWith(
                expect.stringContaining('Switched to market cap chart.\nMocked marketcap summary')
            );
        });

        it('should switch from compositionAbs to marketcapAbs', async () => {
            transactionState.activeChart = 'compositionAbs';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleMarketcapCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('marketcapAbs');
            expect(appendMessageMock).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Switched to market cap chart (absolute view).\nMocked marketcap summary'
                )
            );
        });

        it('should switch from sectors to marketcap', async () => {
            transactionState.activeChart = 'sectors';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleMarketcapCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('marketcap');
        });

        it('should switch from sectorsAbs to marketcapAbs', async () => {
            transactionState.activeChart = 'sectorsAbs';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleMarketcapCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('marketcapAbs');
        });

        it('should switch from geography to marketcap', async () => {
            transactionState.activeChart = 'geography';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleMarketcapCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('marketcap');
        });

        it('should switch from geographyAbs to marketcapAbs', async () => {
            transactionState.activeChart = 'geographyAbs';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleMarketcapCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('marketcapAbs');
        });

        it('should return error if composition chart is hidden', async () => {
            transactionState.activeChart = 'composition';
            await handleMarketcapCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(appendMessageMock).toHaveBeenCalledWith(
                'Composition chart must be visible. Use `plot composition` first.'
            );
        });

        it('should return error if invalid chart is active', async () => {
            transactionState.activeChart = 'yield';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleMarketcapCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(appendMessageMock).toHaveBeenCalledWith(
                'Composition, Sectors, Geography, or Market Cap chart must be active. Use `plot composition`, `plot sectors`, `plot geography`, or `plot marketcap` first.'
            );
        });
    });

    describe('handleGeographyCommand', () => {
        it('should show geography chart if not visible', async () => {
            transactionState.activeChart = 'geography';
            await handleGeographyCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('geography');
        });

        it('should switch from composition to geography', async () => {
            transactionState.activeChart = 'composition';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleGeographyCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('geography');
        });

        it('should switch from compositionAbs to geographyAbs', async () => {
            transactionState.activeChart = 'compositionAbs';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleGeographyCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('geographyAbs');
        });

        it('should switch from sectors to geography', async () => {
            transactionState.activeChart = 'sectors';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleGeographyCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('geography');
        });

        it('should switch from sectorsAbs to geographyAbs', async () => {
            transactionState.activeChart = 'sectorsAbs';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleGeographyCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('geographyAbs');
            expect(appendMessageMock).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Switched to geography chart (absolute view).\nMocked geography summary'
                )
            );
        });

        it('should switch from marketcap to geography', async () => {
            transactionState.activeChart = 'marketcap';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleGeographyCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('geography');
        });

        it('should switch from marketcapAbs to geographyAbs', async () => {
            transactionState.activeChart = 'marketcapAbs';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleGeographyCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('geographyAbs');
        });

        it('should return error if invalid chart active', async () => {
            transactionState.activeChart = 'yield';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleGeographyCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(appendMessageMock).toHaveBeenCalledWith(
                'Composition, Sectors, Geography, or Market Cap chart must be active. Use `plot composition`, `plot sectors`, `plot geography`, or `plot marketcap` first.'
            );
        });
    });

    describe('handleSectorsCommand', () => {
        it('should show sectors chart if not visible', async () => {
            transactionState.activeChart = 'sectors';
            await handleSectorsCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('sectors');
        });

        it('should switch from composition to sectors', async () => {
            transactionState.activeChart = 'composition';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleSectorsCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('sectors');
        });

        it('should switch from compositionAbs to sectorsAbs', async () => {
            transactionState.activeChart = 'compositionAbs';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleSectorsCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('sectorsAbs');
        });

        it('should switch from marketcap to sectors', async () => {
            transactionState.activeChart = 'marketcap';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleSectorsCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('sectors');
        });

        it('should switch from marketcapAbs to sectorsAbs', async () => {
            transactionState.activeChart = 'marketcapAbs';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleSectorsCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('sectorsAbs');
            expect(appendMessageMock).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Switched to sector allocation chart (absolute view).\nMocked sectors summary'
                )
            );
        });

        it('should switch from geography to sectors', async () => {
            transactionState.activeChart = 'geography';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleSectorsCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('sectors');
        });

        it('should switch from geographyAbs to sectorsAbs', async () => {
            transactionState.activeChart = 'geographyAbs';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleSectorsCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(setActiveChart).toHaveBeenCalledWith('sectorsAbs');
        });

        it('should return error if invalid chart active', async () => {
            transactionState.activeChart = 'yield';
            document.getElementById('runningAmountSection').classList.remove('is-hidden');
            await handleSectorsCommand([], {
                appendMessage: appendMessageMock,
                chartManager: chartManagerMock,
            });
            expect(appendMessageMock).toHaveBeenCalledWith(
                'Composition, Sectors, Geography, or Market Cap chart must be active. Use `plot composition`, `plot sectors`, `plot geography`, or `plot marketcap` first.'
            );
        });
    });
});

describe('handleClearCommand', () => {
    let terminalOutput;
    let appendMessageMock;

    beforeEach(() => {
        terminalOutput = document.createElement('div');
        terminalOutput.id = 'terminalOutput';
        document.body.appendChild(terminalOutput);
        appendMessageMock = jest.fn();
    });

    afterEach(() => {
        if (terminalOutput) {
            terminalOutput.remove();
        }
        setChartDateRange.mockClear();
    });

    it('should call clearOutput if it is a function', () => {
        const clearOutputMock = jest.fn();
        const closeAllFilterDropdownsMock = jest.fn();
        const resetSortStateMock = jest.fn();
        const filterAndSortMock = jest.fn();
        const terminalInputMock = { value: 'some text' };

        handleClearCommand([], {
            clearOutput: clearOutputMock,
            closeAllFilterDropdowns: closeAllFilterDropdownsMock,
            resetSortState: resetSortStateMock,
            filterAndSort: filterAndSortMock,
            terminalInput: terminalInputMock,
            appendMessage: appendMessageMock,
        });

        expect(clearOutputMock).toHaveBeenCalled();
        expect(closeAllFilterDropdownsMock).toHaveBeenCalled();
        expect(resetSortStateMock).toHaveBeenCalled();
        expect(filterAndSortMock).toHaveBeenCalledWith('');
        expect(terminalInputMock.value).toBe('');
        expect(setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
    });

    it('should clear terminalOutput children if clearOutput is not a function (replaceChildren fallback)', () => {
        const closeAllFilterDropdownsMock = jest.fn();
        const resetSortStateMock = jest.fn();
        const filterAndSortMock = jest.fn();
        const terminalInputMock = { value: 'some text' };

        terminalOutput.appendChild(document.createElement('div'));
        terminalOutput.replaceChildren = jest.fn(); // Mock replaceChildren

        handleClearCommand([], {
            closeAllFilterDropdowns: closeAllFilterDropdownsMock,
            resetSortState: resetSortStateMock,
            filterAndSort: filterAndSortMock,
            terminalInput: terminalInputMock,
            appendMessage: appendMessageMock,
        });

        expect(terminalOutput.replaceChildren).toHaveBeenCalled();
        expect(closeAllFilterDropdownsMock).toHaveBeenCalled();
        expect(resetSortStateMock).toHaveBeenCalled();
        expect(setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
    });

    it('should clear terminalOutput textContent if clearOutput is not a function and replaceChildren does not exist (jsdom fallback)', () => {
        const closeAllFilterDropdownsMock = jest.fn();
        const resetSortStateMock = jest.fn();
        const filterAndSortMock = jest.fn();
        const terminalInputMock = { value: 'some text' };

        terminalOutput.appendChild(document.createElement('div'));
        // In jsdom, replaceChildren might exist, so we force it to undefined to test the fallback
        const originalReplaceChildren = terminalOutput.replaceChildren;
        terminalOutput.replaceChildren = undefined;

        handleClearCommand([], {
            closeAllFilterDropdowns: closeAllFilterDropdownsMock,
            resetSortState: resetSortStateMock,
            filterAndSort: filterAndSortMock,
            terminalInput: terminalInputMock,
            appendMessage: appendMessageMock,
        });

        expect(terminalOutput.textContent).toBe('');
        expect(closeAllFilterDropdownsMock).toHaveBeenCalled();
        expect(resetSortStateMock).toHaveBeenCalled();
        expect(setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });

        // Restore for other tests
        terminalOutput.replaceChildren = originalReplaceChildren;
    });
});

describe('handleLabelCommand', () => {
    let appendMessageMock;
    let chartManagerMock;

    beforeEach(() => {
        appendMessageMock = jest.fn();
        chartManagerMock = {
            redraw: jest.fn(),
        };
        // Reset transaction state before each test
        transactionState.showChartLabels = undefined;
    });

    it('should toggle showChartLabels to true if it is explicitly false', () => {
        // Let's set it to false explicitly first
        transactionState.showChartLabels = false;

        handleLabelCommand([], {
            appendMessage: appendMessageMock,
            chartManager: chartManagerMock
        });


        expect(transactionState.showChartLabels).toBe(true);
        expect(appendMessageMock).toHaveBeenCalledWith('Chart labels are now visible.');
        expect(chartManagerMock.redraw).toHaveBeenCalled();
    });

    it('should toggle showChartLabels to false if initially true', () => {
        transactionState.showChartLabels = true;

        handleLabelCommand([], {
            appendMessage: appendMessageMock,
            chartManager: chartManagerMock
        });


        expect(transactionState.showChartLabels).toBe(false);
        expect(appendMessageMock).toHaveBeenCalledWith('Chart labels are now hidden.');
        expect(chartManagerMock.redraw).toHaveBeenCalled();
    });

    it('should not throw if chartManager.redraw is not a function', () => {
        transactionState.showChartLabels = true;

        expect(() => {
            handleLabelCommand([], {
                appendMessage: appendMessageMock,
                chartManager: {} // No redraw function
            });
        }).not.toThrow();

        expect(transactionState.showChartLabels).toBe(false);
        expect(appendMessageMock).toHaveBeenCalledWith('Chart labels are now hidden.');
    });

    it('should not throw if chartManager is undefined', () => {
        transactionState.showChartLabels = true;

        expect(() => {
            handleLabelCommand([], {
                appendMessage: appendMessageMock,
            });
        }).not.toThrow();

        expect(transactionState.showChartLabels).toBe(false);
        expect(appendMessageMock).toHaveBeenCalledWith('Chart labels are now hidden.');
    });
});
