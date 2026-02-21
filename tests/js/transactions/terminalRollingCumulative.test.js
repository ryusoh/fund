import { jest } from '@jest/globals';

describe('rolling/cumulative snapshot hints', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    test('getPerformanceSnapshotLine includes hint about rolling command', async () => {
        const { transactionState } = await import('@js/transactions/state.js');
        const { getPerformanceSnapshotLine } =
            await import('@js/transactions/terminal/snapshots.js');

        transactionState.activeChart = 'performance';
        transactionState.performanceSeries = {
            '^LZ': [
                { date: '2024-01-01', value: 1000 },
                { date: '2024-12-01', value: 1200 },
            ],
        };
        transactionState.selectedCurrency = 'USD';
        transactionState.chartVisibility = { '^LZ': true };

        const result = getPerformanceSnapshotLine({ includeHidden: true });
        expect(result).not.toBeNull();
        expect(result).toContain("Hint: type 'rolling' to switch to rolling performance chart");
    });

    test('getRollingSnapshotLine includes hint about cumulative command', async () => {
        const { transactionState } = await import('@js/transactions/state.js');
        const { getRollingSnapshotLine } = await import('@js/transactions/terminal/snapshots.js');

        transactionState.activeChart = 'rolling';
        transactionState.performanceSeries = {
            '^LZ': [
                { date: '2023-01-01', value: 1000 },
                { date: '2024-01-01', value: 1100 },
                { date: '2024-12-01', value: 1200 },
            ],
        };
        transactionState.selectedCurrency = 'USD';
        transactionState.chartVisibility = { '^LZ': true };

        const result = getRollingSnapshotLine({ includeHidden: true });
        expect(result).not.toBeNull();
        expect(result).toContain(
            "Hint: type 'cumulative' to switch to cumulative performance chart"
        );
    });
});

describe('rolling/cumulative autocomplete', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    test('rolling is included in COMMAND_ALIASES for autocomplete', async () => {
        const { COMMAND_ALIASES } = await import('@js/transactions/terminal/constants.js');
        expect(COMMAND_ALIASES).toContain('rolling');
    });

    test('cumulative is included in COMMAND_ALIASES for autocomplete', async () => {
        const { COMMAND_ALIASES } = await import('@js/transactions/terminal/constants.js');
        expect(COMMAND_ALIASES).toContain('cumulative');
    });

    test('rolling is in PLOT_SUBCOMMANDS', async () => {
        const { PLOT_SUBCOMMANDS } = await import('@js/transactions/terminal/constants.js');
        expect(PLOT_SUBCOMMANDS).toContain('rolling');
    });

    test('cumulative is not in PLOT_SUBCOMMANDS', async () => {
        const { PLOT_SUBCOMMANDS } = await import('@js/transactions/terminal/constants.js');
        expect(PLOT_SUBCOMMANDS).not.toContain('cumulative');
    });
});

describe('rolling/cumulative command handlers exist', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    test('handleRollingCommand is exported', async () => {
        const { handleRollingCommand } = await import('@js/transactions/terminal/handlers/misc.js');
        expect(typeof handleRollingCommand).toBe('function');
    });

    test('handleCumulativeCommand is exported', async () => {
        const { handleCumulativeCommand } =
            await import('@js/transactions/terminal/handlers/misc.js');
        expect(typeof handleCumulativeCommand).toBe('function');
    });

    test('commands.js has case for rolling', async () => {
        const fs = await import('fs');
        const commandsCode = fs.readFileSync('./js/transactions/terminal/commands.js', 'utf8');
        expect(commandsCode).toContain("case 'rolling':");
    });

    test('commands.js has case for cumulative', async () => {
        const fs = await import('fs');
        const commandsCode = fs.readFileSync('./js/transactions/terminal/commands.js', 'utf8');
        expect(commandsCode).toContain("case 'cumulative':");
    });
});

describe('composition/sectors snapshot hints', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    test('getCompositionSnapshotLine hint includes sectors switch reference', async () => {
        const fs = await import('fs');
        const snapshotsCode = fs.readFileSync('./js/transactions/terminal/snapshots.js', 'utf8');
        expect(snapshotsCode).toContain("'sectors' or 'geography' to switch charts");
    });

    test('getSectorsSnapshotLine hint includes composition switch reference', async () => {
        const fs = await import('fs');
        const snapshotsCode = fs.readFileSync('./js/transactions/terminal/snapshots.js', 'utf8');
        expect(snapshotsCode).toContain("'composition' or 'geography' to switch charts");
    });

    test('getGeographySnapshotLine hint includes composition and sectors switch reference', async () => {
        const fs = await import('fs');
        const snapshotsCode = fs.readFileSync('./js/transactions/terminal/snapshots.js', 'utf8');
        expect(snapshotsCode).toContain("'composition' or 'sectors' to switch charts");
    });
});

describe('composition/sectors autocomplete', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    test('composition is included in COMMAND_ALIASES for autocomplete', async () => {
        const { COMMAND_ALIASES } = await import('@js/transactions/terminal/constants.js');
        expect(COMMAND_ALIASES).toContain('composition');
    });

    test('sectors is included in COMMAND_ALIASES for autocomplete', async () => {
        const { COMMAND_ALIASES } = await import('@js/transactions/terminal/constants.js');
        expect(COMMAND_ALIASES).toContain('sectors');
    });

    test('geography is included in COMMAND_ALIASES for autocomplete', async () => {
        const { COMMAND_ALIASES } = await import('@js/transactions/terminal/constants.js');
        expect(COMMAND_ALIASES).toContain('geography');
    });

    test('composition is in PLOT_SUBCOMMANDS', async () => {
        const { PLOT_SUBCOMMANDS } = await import('@js/transactions/terminal/constants.js');
        expect(PLOT_SUBCOMMANDS).toContain('composition');
    });

    test('sectors is in PLOT_SUBCOMMANDS', async () => {
        const { PLOT_SUBCOMMANDS } = await import('@js/transactions/terminal/constants.js');
        expect(PLOT_SUBCOMMANDS).toContain('sectors');
    });

    test('geography is in PLOT_SUBCOMMANDS', async () => {
        const { PLOT_SUBCOMMANDS } = await import('@js/transactions/terminal/constants.js');
        expect(PLOT_SUBCOMMANDS).toContain('geography');
    });
});

describe('composition/sectors command handlers exist', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    test('handleCompositionCommand is exported', async () => {
        const { handleCompositionCommand } =
            await import('@js/transactions/terminal/handlers/misc.js');
        expect(typeof handleCompositionCommand).toBe('function');
    });

    test('handleSectorsCommand is exported', async () => {
        const { handleSectorsCommand } = await import('@js/transactions/terminal/handlers/misc.js');
        expect(typeof handleSectorsCommand).toBe('function');
    });

    test('handleGeographyCommand is exported', async () => {
        const { handleGeographyCommand } =
            await import('@js/transactions/terminal/handlers/misc.js');
        expect(typeof handleGeographyCommand).toBe('function');
    });

    test('commands.js has case for composition', async () => {
        const fs = await import('fs');
        const commandsCode = fs.readFileSync('./js/transactions/terminal/commands.js', 'utf8');
        expect(commandsCode).toContain("case 'composition':");
    });

    test('commands.js has case for sectors', async () => {
        const fs = await import('fs');
        const commandsCode = fs.readFileSync('./js/transactions/terminal/commands.js', 'utf8');
        expect(commandsCode).toContain("case 'sectors':");
    });

    test('commands.js has case for geography', async () => {
        const fs = await import('fs');
        const commandsCode = fs.readFileSync('./js/transactions/terminal/commands.js', 'utf8');
        expect(commandsCode).toContain("case 'geography':");
    });
});
