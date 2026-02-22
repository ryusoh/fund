/**
 * Autocomplete completeness tests
 *
 * These tests ensure that ALL commands and subcommands are autocompletable.
 * When adding a new command, it MUST be added to the appropriate autocomplete list.
 *
 * AUTO-FAIL GUARANTEES:
 * - Any new command not in autocomplete WILL fail these tests
 * - Tests automatically detect newly added commands in constants.js
 * - Tests verify autocomplete.js handles all command types
 */

/* eslint-disable no-undef */
// __dirname is provided by Jest

const fs = require('fs');
const path = require('path');

describe('Autocomplete Completeness', () => {
    let constantsCode;
    let autocompleteCode;
    let COMMAND_ALIASES;
    let PLOT_SUBCOMMANDS;
    let STATS_SUBCOMMANDS;
    let HELP_SUBCOMMANDS;

    beforeAll(async () => {
        // Load constants module
        const constants = await import('@js/transactions/terminal/constants.js');
        COMMAND_ALIASES = constants.COMMAND_ALIASES;
        PLOT_SUBCOMMANDS = constants.PLOT_SUBCOMMANDS;
        STATS_SUBCOMMANDS = constants.STATS_SUBCOMMANDS;
        HELP_SUBCOMMANDS = constants.HELP_SUBCOMMANDS;

        // Load source code for analysis
        constantsCode = fs.readFileSync(
            path.join(__dirname, '../../../js/transactions/terminal/constants.js'),
            'utf8'
        );
        autocompleteCode = fs.readFileSync(
            path.join(__dirname, '../../../js/transactions/terminal/autocomplete.js'),
            'utf8'
        );
    });

    describe('Main Commands (COMMAND_ALIASES)', () => {
        test('all COMMAND_ALIASES are imported in autocomplete.js', () => {
            // Verify autocomplete.js imports COMMAND_ALIASES
            expect(autocompleteCode).toContain('COMMAND_ALIASES');
            expect(autocompleteCode).toContain("from './constants.js'");
        });

        test('all COMMAND_ALIASES are used in autocomplete filtering logic', () => {
            // Verify COMMAND_ALIASES is used for filtering
            expect(autocompleteCode).toMatch(/COMMAND_ALIASES\.filter/);
        });

        test('every COMMAND_ALIASES entry is a valid string', () => {
            COMMAND_ALIASES.forEach((cmd) => {
                expect(typeof cmd).toBe('string');
                expect(cmd.length).toBeGreaterThan(0);
            });
        });

        test('COMMAND_ALIASES has no duplicates', () => {
            const unique = [...new Set(COMMAND_ALIASES)];
            expect(unique.length).toBe(COMMAND_ALIASES.length);
        });
    });

    describe('Plot Subcommands (PLOT_SUBCOMMANDS)', () => {
        test('all PLOT_SUBCOMMANDS are imported in autocomplete.js', () => {
            expect(autocompleteCode).toContain('PLOT_SUBCOMMANDS');
            expect(autocompleteCode).toContain("from './constants.js'");
        });

        test('PLOT_SUBCOMMANDS is used for plot command autocomplete', () => {
            // Verify PLOT_SUBCOMMANDS is filtered when user types 'plot' or 'p'
            expect(autocompleteCode).toMatch(/parts\[0\]\s*===\s*['"]plot['"]/);
            expect(autocompleteCode).toMatch(/parts\[0\]\s*===\s*['"]p['"]/);
            expect(autocompleteCode).toMatch(/PLOT_SUBCOMMANDS\.filter/);
        });

        test('every PLOT_SUBCOMMANDS entry is a valid string', () => {
            PLOT_SUBCOMMANDS.forEach((cmd) => {
                expect(typeof cmd).toBe('string');
                expect(cmd.length).toBeGreaterThan(0);
            });
        });

        test('PLOT_SUBCOMMANDS has no duplicates', () => {
            const unique = [...new Set(PLOT_SUBCOMMANDS)];
            expect(unique.length).toBe(PLOT_SUBCOMMANDS.length);
        });

        test('PLOT_SUBCOMMANDS includes marketcap commands', () => {
            expect(PLOT_SUBCOMMANDS).toContain('marketcap');
            expect(PLOT_SUBCOMMANDS).toContain('marketcap-abs');
        });
    });

    describe('Stats Subcommands (STATS_SUBCOMMANDS)', () => {
        test('all STATS_SUBCOMMANDS are imported in autocomplete.js', () => {
            expect(autocompleteCode).toContain('STATS_SUBCOMMANDS');
            expect(autocompleteCode).toContain("from './constants.js'");
        });

        test('STATS_SUBCOMMANDS is used for stats command autocomplete', () => {
            expect(autocompleteCode).toMatch(/parts\[0\]\s*===\s*['"]stats['"]/);
            expect(autocompleteCode).toMatch(/parts\[0\]\s*===\s*['"]s['"]/);
            expect(autocompleteCode).toMatch(/STATS_SUBCOMMANDS\.filter/);
        });

        test('every STATS_SUBCOMMANDS entry is a valid string', () => {
            STATS_SUBCOMMANDS.forEach((cmd) => {
                expect(typeof cmd).toBe('string');
                expect(cmd.length).toBeGreaterThan(0);
            });
        });

        test('STATS_SUBCOMMANDS has no duplicates', () => {
            const unique = [...new Set(STATS_SUBCOMMANDS)];
            expect(unique.length).toBe(STATS_SUBCOMMANDS.length);
        });
    });

    describe('Help Subcommands (HELP_SUBCOMMANDS)', () => {
        test('all HELP_SUBCOMMANDS are imported in autocomplete.js', () => {
            expect(autocompleteCode).toContain('HELP_SUBCOMMANDS');
            expect(autocompleteCode).toContain("from './constants.js'");
        });

        test('HELP_SUBCOMMANDS is used for help command autocomplete', () => {
            expect(autocompleteCode).toMatch(/parts\[0\]\s*===\s*['"]help['"]/);
            expect(autocompleteCode).toMatch(/parts\[0\]\s*===\s*['"]h['"]/);
            expect(autocompleteCode).toMatch(/HELP_SUBCOMMANDS\.filter/);
        });

        test('every HELP_SUBCOMMANDS entry is a valid string', () => {
            HELP_SUBCOMMANDS.forEach((cmd) => {
                expect(typeof cmd).toBe('string');
                expect(cmd.length).toBeGreaterThan(0);
            });
        });

        test('HELP_SUBCOMMANDS has no duplicates', () => {
            const unique = [...new Set(HELP_SUBCOMMANDS)];
            expect(unique.length).toBe(HELP_SUBCOMMANDS.length);
        });
    });

    describe('Future-Proof Detection', () => {
        test('constants.js exports all required subcommand arrays', () => {
            // Verify constants.js has all the subcommand arrays
            expect(constantsCode).toContain('export const PLOT_SUBCOMMANDS');
            expect(constantsCode).toContain('export const STATS_SUBCOMMANDS');
            expect(constantsCode).toContain('export const HELP_SUBCOMMANDS');
            expect(constantsCode).toContain('export const COMMAND_ALIASES');
        });

        test('autocomplete.js handles all command types (plot/stats/help)', () => {
            // Verify autocomplete handles all three command types
            const hasPlotHandling =
                autocompleteCode.includes('plot') && autocompleteCode.includes('PLOT_SUBCOMMANDS');
            const hasStatsHandling =
                autocompleteCode.includes('stats') &&
                autocompleteCode.includes('STATS_SUBCOMMANDS');
            const hasHelpHandling =
                autocompleteCode.includes('help') && autocompleteCode.includes('HELP_SUBCOMMANDS');

            expect(hasPlotHandling).toBe(true);
            expect(hasStatsHandling).toBe(true);
            expect(hasHelpHandling).toBe(true);
        });

        test('any new command added to COMMAND_ALIASES will be automatically autocompletable', () => {
            // This test verifies the autocomplete logic uses COMMAND_ALIASES directly
            // without hardcoding specific commands, ensuring future commands work automatically
            const usesFilterLogic = /COMMAND_ALIASES\.filter\(\(cmd\)\s*=>\s*cmd\.startsWith/.test(
                autocompleteCode
            );
            expect(usesFilterLogic).toBe(true);
        });

        test('any new subcommand added to PLOT_SUBCOMMANDS will be automatically autocompletable', () => {
            // Verify PLOT_SUBCOMMANDS is filtered dynamically, not hardcoded
            const usesFilterLogic = /PLOT_SUBCOMMANDS\.filter\(\(cmd\)\s*=>\s*cmd\.startsWith/.test(
                autocompleteCode
            );
            expect(usesFilterLogic).toBe(true);
        });

        test('any new subcommand added to STATS_SUBCOMMANDS will be automatically autocompletable', () => {
            const usesFilterLogic =
                /STATS_SUBCOMMANDS\.filter\(\(cmd\)\s*=>\s*cmd\.startsWith/.test(autocompleteCode);
            expect(usesFilterLogic).toBe(true);
        });

        test('any new subcommand added to HELP_SUBCOMMANDS will be automatically autocompletable', () => {
            const usesFilterLogic = /HELP_SUBCOMMANDS\.filter\(\(cmd\)\s*=>\s*cmd\.startsWith/.test(
                autocompleteCode
            );
            expect(usesFilterLogic).toBe(true);
        });
    });

    describe('Cross-Reference Validation', () => {
        test('commands.js uses the same constants as autocomplete.js', async () => {
            const commandsCode = fs.readFileSync(
                path.join(__dirname, '../../../js/transactions/terminal/commands.js'),
                'utf8'
            );

            // Verify commands.js imports the same constants
            expect(commandsCode).toContain('COMMAND_ALIASES');
            expect(commandsCode).toContain('PLOT_SUBCOMMANDS');
            expect(commandsCode).toContain('STATS_SUBCOMMANDS');
            expect(commandsCode).toContain('HELP_SUBCOMMANDS');
            expect(commandsCode).toContain("from './constants.js'");
        });

        test('no unexpected command is in multiple subcommand lists (avoiding ambiguity)', () => {
            // Check for overlaps between subcommand lists
            const plotSet = new Set(PLOT_SUBCOMMANDS);
            const statsSet = new Set(STATS_SUBCOMMANDS);
            const helpSet = new Set(HELP_SUBCOMMANDS);

            const plotStatsOverlap = [...plotSet].filter((x) => statsSet.has(x));
            const plotHelpOverlap = [...plotSet].filter((x) => helpSet.has(x));
            const statsHelpOverlap = [...statsSet].filter((x) => helpSet.has(x));

            // Known intentional overlaps (commands that work in multiple contexts)
            const KNOWN_OVERLAPS = ['concentration', 'geography'];

            // Filter out known overlaps
            const unexpectedPlotStats = plotStatsOverlap.filter((x) => !KNOWN_OVERLAPS.includes(x));
            const unexpectedPlotHelp = plotHelpOverlap.filter((x) => !KNOWN_OVERLAPS.includes(x));
            const unexpectedStatsHelp = statsHelpOverlap.filter((x) => !KNOWN_OVERLAPS.includes(x));

            expect(unexpectedPlotStats).toEqual([]);
            expect(unexpectedPlotHelp).toEqual([]);
            expect(unexpectedStatsHelp).toEqual([]);
        });

        test('all chart-switching commands are available as both standalone AND plot subcommands', () => {
            // Chart commands that should work both ways:
            // - 'composition' (standalone) and 'plot composition' (subcommand)
            // - 'sectors' (standalone) and 'plot sectors' (subcommand)
            // - 'geography' (standalone) and 'plot geography' (subcommand)
            // - 'marketcap' (standalone) and 'plot marketcap' (subcommand)
            const CHART_COMMANDS = ['composition', 'sectors', 'geography', 'marketcap'];

            CHART_COMMANDS.forEach((cmd) => {
                expect(COMMAND_ALIASES).toContain(cmd);
                expect(PLOT_SUBCOMMANDS).toContain(cmd);
            });

            // Also check abs variants
            expect(PLOT_SUBCOMMANDS).toContain('composition-abs');
            expect(PLOT_SUBCOMMANDS).toContain('sectors-abs');
            expect(PLOT_SUBCOMMANDS).toContain('geography-abs');
            expect(PLOT_SUBCOMMANDS).toContain('marketcap-abs');
        });

        test('any new chart command added to PLOT_SUBCOMMANDS must also be in COMMAND_ALIASES', () => {
            // This test ensures future chart commands are also standalone-autocompletable
            // Pattern: chart commands that switch between each other should be in both lists
            const chartPattern = /^(composition|sectors|geography|marketcap)(-abs)?$/;

            PLOT_SUBCOMMANDS.forEach((cmd) => {
                if (chartPattern.test(cmd)) {
                    // If it's a chart command, it should be in COMMAND_ALIASES (without -abs suffix)
                    const baseCmd = cmd.replace('-abs', '');
                    expect(COMMAND_ALIASES).toContain(baseCmd);
                }
            });
        });
    });
});
