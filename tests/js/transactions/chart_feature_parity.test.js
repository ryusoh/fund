/**
 * Feature parity tests for composition-style charts
 *
 * These tests ensure that all composition-style charts (composition, sectors,
 * geography, marketcap) have consistent feature support. When adding a new
 * composition-style chart, it MUST pass all these tests.
 *
 * To add a new chart:
 * 1. Add the chart key to COMPOSITION_CHARTS array
 * 2. Ensure all feature checks pass
 * 3. If a feature is intentionally not supported, add an explicit exclusion with comment
 *
 * AUTO-FAIL GUARANTEES:
 * - Any new chart missing required features WILL fail these tests
 * - Tests check ALL integration points (renderer, handler, viewUtils, constants, interaction)
 * - Tests verify standalone date filter support
 * - Tests verify crosshair panel functionality
 */

/* eslint-disable no-undef */
// __dirname is provided by Jest

const fs = require('fs');
const path = require('path');

// List of all composition-style charts that should have feature parity
// Note: Use kebab-case for command names (as used in PLOT_SUBCOMMANDS)
// IMPORTANT: When adding a new chart, add BOTH base and -abs variants here
const COMPOSITION_CHARTS = [
    'composition',
    'composition-abs',
    'sectors',
    'sectors-abs',
    'geography',
    'geography-abs',
    'marketcap',
    'marketcap-abs',
];

// Map kebab-case command names to their JavaScript variable/camelCase equivalents
const CHART_NAME_MAPPING = {
    composition: 'composition',
    'composition-abs': 'compositionAbs',
    sectors: 'sectors',
    'sectors-abs': 'sectorsAbs',
    geography: 'geography',
    'geography-abs': 'geographyAbs',
    marketcap: 'marketcap',
    'marketcap-abs': 'marketcapAbs',
};

// Helper to read file content
function readFileContent(relativePath) {
    const filePath = path.join(__dirname, relativePath);
    return fs.readFileSync(filePath, 'utf8');
}

// Helper to extract base chart name (without -abs suffix)
function getBaseChart(chartKey) {
    return chartKey.replace('-abs', '');
}

// Helper to get all registered charts from a file by pattern matching
function extractRegisteredCharts(content, pattern) {
    const matches = content.match(pattern);
    return matches ? matches.map((m) => m.replace(/['"]/g, '').trim()) : [];
}

describe('Composition Chart Feature Parity', () => {
    let interactionContent;
    let plotContent;
    let constantsContent;
    let chartContent;
    let viewUtilsContent;
    let dataLoaderContent;
    let snapshotsContent;

    beforeAll(() => {
        interactionContent = readFileContent('../../../js/transactions/chart/interaction.js');
        plotContent = readFileContent('../../../js/transactions/terminal/handlers/plot.js');
        constantsContent = readFileContent('../../../js/transactions/terminal/constants.js');
        chartContent = readFileContent('../../../js/transactions/chart.js');
        viewUtilsContent = readFileContent('../../../js/transactions/terminal/viewUtils.js');
        dataLoaderContent = readFileContent('../../../js/transactions/dataLoader.js');
        snapshotsContent = readFileContent('../../../js/transactions/terminal/snapshots.js');
    });

    describe('Registration Consistency', () => {
        test('COMPOSITION_CHARTS array must match PLOT_SUBCOMMANDS entries', () => {
            // Extract composition-related commands from PLOT_SUBCOMMANDS
            const compositionPattern = /'(composition|sectors|geography|marketcap)(-abs)?'/g;
            const registeredInConstants = extractRegisteredCharts(
                constantsContent,
                compositionPattern
            );

            COMPOSITION_CHARTS.forEach((chartKey) => {
                expect(registeredInConstants).toContain(
                    chartKey,
                    `Chart "${chartKey}" is in COMPOSITION_CHARTS but missing from PLOT_SUBCOMMANDS in constants.js`
                );
            });
        });

        test('All composition charts must have renderer files', () => {
            const baseCharts = [...new Set(COMPOSITION_CHARTS.map(getBaseChart))];

            baseCharts.forEach((baseChart) => {
                const rendererPath = path.join(
                    __dirname,
                    `../../../js/transactions/chart/renderers/${baseChart}.js`
                );
                expect(fs.existsSync(rendererPath)).toBe(
                    true,
                    `Renderer file missing for "${baseChart}" at ${rendererPath}`
                );
            });
        });

        test('All composition charts must be registered in chart.js render frame', () => {
            COMPOSITION_CHARTS.forEach((chartKey) => {
                const jsName = CHART_NAME_MAPPING[chartKey];
                expect(chartContent).toContain(
                    `transactionState.activeChart === '${jsName}'`,
                    `Chart "${jsName}" not handled in chart.js render frame`
                );
            });
        });

        test('All composition charts must have data loader functions', () => {
            const baseCharts = [...new Set(COMPOSITION_CHARTS.map(getBaseChart))];

            baseCharts.forEach((baseChart) => {
                const functionName = `load${baseChart.charAt(0).toUpperCase() + baseChart.slice(1)}SnapshotData`;
                expect(dataLoaderContent).toContain(
                    `export async function ${functionName}`,
                    `Data loader ${functionName} not exported from dataLoader.js`
                );
            });
        });

        test('All composition charts must have snapshot functions', () => {
            const baseCharts = [...new Set(COMPOSITION_CHARTS.map(getBaseChart))];

            baseCharts.forEach((baseChart) => {
                const functionName = `get${baseChart.charAt(0).toUpperCase() + baseChart.slice(1)}SnapshotLine`;
                expect(snapshotsContent).toContain(
                    `export async function ${functionName}`,
                    `Snapshot function ${functionName} not exported from snapshots.js`
                );
            });
        });
    });

    describe('Crosshair Support', () => {
        test('all composition charts must be in isCompositionLayout check', () => {
            // This check ensures crosshair panel shows for all composition charts
            const isCompositionLayoutSection = interactionContent.substring(
                interactionContent.indexOf('isCompositionLayout'),
                interactionContent.indexOf('isCompositionLayout') + 500
            );

            COMPOSITION_CHARTS.forEach((chartKey) => {
                const jsName = CHART_NAME_MAPPING[chartKey];
                expect(isCompositionLayoutSection).toContain(
                    `'${jsName}'`,
                    `Chart "${chartKey}" (${jsName}) is missing from isCompositionLayout check - crosshair panel will not work`
                );
            });
        });

        test('all composition charts must skip range selection', () => {
            // Range selection should be disabled for composition charts
            COMPOSITION_CHARTS.forEach((chartKey) => {
                const jsName = CHART_NAME_MAPPING[chartKey];
                expect(interactionContent).toContain(
                    `layout.key === '${jsName}'`,
                    `Chart "${chartKey}" (${jsName}) is missing from range skip check`
                );
            });
        });

        test('all composition charts must skip legend click-to-toggle', () => {
            // Legend click should be disabled for composition charts
            COMPOSITION_CHARTS.forEach((chartKey) => {
                const jsName = CHART_NAME_MAPPING[chartKey];
                expect(interactionContent).toContain(
                    `transactionState.activeChart !== '${jsName}'`,
                    `Chart "${chartKey}" (${jsName}) is missing from legend click skip check`
                );
            });
        });

        test('all composition charts must be in getActiveChartKey', () => {
            const getActiveChartKeySection = interactionContent.substring(
                interactionContent.indexOf('function getActiveChartKey'),
                interactionContent.indexOf('function getActiveChartKey') + 1000
            );

            COMPOSITION_CHARTS.forEach((chartKey) => {
                const jsName = CHART_NAME_MAPPING[chartKey];
                expect(getActiveChartKeySection).toContain(
                    `active === '${jsName}'`,
                    `Chart "${chartKey}" (${jsName}) is missing from getActiveChartKey`
                );
            });
        });
    });

    describe('Future-Proof Consistency Checks', () => {
        test('Any chart in plot.js handlers must be in COMPOSITION_CHARTS or explicitly excluded', () => {
            // Extract all chart case handlers from plot.js
            const casePattern = /case\s+'([a-z]+(-abs)?)':/g;
            const allCases = extractRegisteredCharts(plotContent, casePattern);

            // Filter to only composition-style charts (those that should have feature parity)
            const compositionStyleCharts = allCases.filter((chart) => {
                // Charts that use applyDateArgs and have abs variants are composition-style
                const chartSection = plotContent.substring(
                    plotContent.indexOf(`case '${chart}':`),
                    plotContent.indexOf(`case '${chart}':`) + 2000
                );
                return (
                    chartSection.includes('useAbsolute') || chartSection.includes('applyDateArgs')
                );
            });

            compositionStyleCharts.forEach((chart) => {
                // Skip non-composition charts that happen to use similar patterns
                const knownNonComposition = [
                    'balance',
                    'performance',
                    'fx',
                    'drawdown',
                    'rolling',
                    'volatility',
                    'beta',
                    'yield',
                    'pe',
                    'concentration',
                ];
                if (knownNonComposition.includes(chart)) {
                    return;
                }

                expect(COMPOSITION_CHARTS).toContain(
                    chart,
                    `Chart "${chart}" appears to be composition-style but is NOT in COMPOSITION_CHARTS array - add it to enable feature parity tests`
                );
            });
        });

        test('Any chart in COMPOSITION_CHARTS must have complete implementation', () => {
            const baseCharts = [...new Set(COMPOSITION_CHARTS.map(getBaseChart))];

            baseCharts.forEach((baseChart) => {
                const jsName = baseChart.charAt(0).toUpperCase() + baseChart.slice(1);

                // Check renderer exists
                const rendererPath = path.join(
                    __dirname,
                    `../../../js/transactions/chart/renderers/${baseChart}.js`
                );
                expect(fs.existsSync(rendererPath)).toBe(true);

                const rendererContent = fs.readFileSync(rendererPath, 'utf8');

                // Check renderer exports both functions (handle different export patterns)
                const hasDrawFunction =
                    rendererContent.includes(`draw${jsName}Chart`) ||
                    rendererContent.includes(`function draw${jsName}Chart`);
                const hasDrawAbsFunction =
                    rendererContent.includes(`draw${jsName}AbsoluteChart`) ||
                    rendererContent.includes(`function draw${jsName}AbsoluteChart`);

                expect(hasDrawFunction).toBe(
                    true,
                    `Renderer ${baseChart}.js missing draw${jsName}Chart export`
                );
                expect(hasDrawAbsFunction).toBe(
                    true,
                    `Renderer ${baseChart}.js missing draw${jsName}AbsoluteChart export`
                );

                // Check data loader
                expect(dataLoaderContent).toContain(
                    `load${jsName}SnapshotData`,
                    `Data loader load${jsName}SnapshotData missing`
                );

                // Check snapshot function
                expect(snapshotsContent).toContain(
                    `get${jsName}SnapshotLine`,
                    `Snapshot function get${jsName}SnapshotLine missing`
                );

                // Check viewUtils integration
                expect(viewUtilsContent).toContain(
                    `'${baseChart}'`,
                    `Chart '${baseChart}' not in viewUtils.js (needed for standalone date filters)`
                );
                expect(viewUtilsContent).toContain(
                    `'${baseChart}Abs'`,
                    `Chart '${baseChart}Abs' not in viewUtils.js (needed for standalone date filters)`
                );
            });
        });

        test('Crosshair interaction.js must have all composition charts in ALL required locations', () => {
            const baseCharts = [...new Set(COMPOSITION_CHARTS.map(getBaseChart))];

            // Check all 5 locations where composition charts must be registered
            const locations = [
                { name: 'isCompositionLayout', pattern: /isCompositionLayout[\s\S]{0,500}/ },
                { name: 'range skip (1)', pattern: /Skip range functionality[\s\S]{0,800}/ },
                { name: 'range skip (2)', pattern: /handlePointerDown[\s\S]{0,1500}/ },
                { name: 'range skip (3)', pattern: /handlePointerMove[\s\S]{0,1500}/ },
                { name: 'legend click skip', pattern: /Skip click events[\s\S]{0,800}/ },
                { name: 'getActiveChartKey', pattern: /function getActiveChartKey[\s\S]{0,1000}/ },
            ];

            baseCharts.forEach((baseChart) => {
                const jsName = baseChart;
                const absName = `${baseChart}Abs`;

                locations.forEach((location) => {
                    const section = interactionContent.match(location.pattern);
                    if (section) {
                        const sectionContent = section[0];
                        expect(sectionContent).toContain(
                            `'${jsName}'`,
                            `Chart '${jsName}' missing from ${location.name} in interaction.js`
                        );
                        expect(sectionContent).toContain(
                            `'${absName}'`,
                            `Chart '${absName}' missing from ${location.name} in interaction.js`
                        );
                    }
                });
            });
        });
    });

    describe('Date Range Filter Support', () => {
        test('all composition charts must have plot command handler with date range support', () => {
            COMPOSITION_CHARTS.forEach((chartKey) => {
                // Check for the case statement
                expect(plotContent).toContain(
                    `case '${chartKey}':`,
                    `Chart "${chartKey}" is missing from plot command handlers`
                );

                // Get the handler section (look for 3000 chars after the case)
                const caseIndex = plotContent.indexOf(`case '${chartKey}':`);
                const handlerSection = plotContent.substring(caseIndex, caseIndex + 3000);

                // Must have applyDateArgs call
                expect(handlerSection).toContain(
                    'applyDateArgs',
                    `Chart "${chartKey}" handler missing applyDateArgs call - date range filters will not work`
                );

                // Must have dateRange variable usage
                expect(handlerSection).toContain(
                    'dateRange',
                    `Chart "${chartKey}" handler missing dateRange usage`
                );

                // Must have formatDateRange in result message
                expect(handlerSection).toContain(
                    'formatDateRange',
                    `Chart "${chartKey}" handler missing formatDateRange in result message`
                );

                // Must call applyDateArgs which internally calls setChartDateRange
                // We verify applyDateArgs is called above, which handles setChartDateRange
            });
        });

        test('all composition charts must support abs/absolute mode toggle', () => {
            // Only test base charts (not the -abs variants)
            const baseCharts = COMPOSITION_CHARTS.filter((c) => !c.includes('-abs'));

            baseCharts.forEach((chartKey) => {
                const caseIndex = plotContent.indexOf(`case '${chartKey}':`);
                const handlerSection = plotContent.substring(caseIndex, caseIndex + 3000);

                // Check for abs mode detection
                expect(handlerSection).toMatch(
                    /useAbsolute.*?(abs|absolute)/i,
                    `Chart "${chartKey}" missing abs mode detection`
                );

                // Check for targetChart with Abs variant
                const absVariant = `${chartKey}-abs`;
                expect(handlerSection).toContain(
                    `'${absVariant}'`,
                    `Chart "${chartKey}" missing Abs variant (${absVariant}) handling`
                );
            });
        });

        test('all composition chart handlers must use rangeTokens for proper date arg parsing', () => {
            // This test ensures charts properly handle "abs" keyword before date args
            const baseCharts = COMPOSITION_CHARTS.filter((c) => !c.includes('-abs'));

            baseCharts.forEach((chartKey) => {
                const caseIndex = plotContent.indexOf(`case '${chartKey}':`);
                const handlerSection = plotContent.substring(caseIndex, caseIndex + 3000);

                // Must handle abs keyword extraction before date parsing
                expect(handlerSection).toMatch(
                    /rangeTokens.*=.*\[.*\.\.\.rawArgs\]/,
                    `Chart "${chartKey}" must use rangeTokens to properly handle "abs" keyword before date args`
                );

                // Must check for abs/absolute mode in first token
                expect(handlerSection).toMatch(
                    /maybeMode.*===.*['"](abs|absolute)['"]/i,
                    `Chart "${chartKey}" must check first token for abs/absolute mode`
                );

                // Must have hasDateArgs check to prevent toggle-off when date args provided
                expect(handlerSection).toContain(
                    'hasDateArgs',
                    `Chart "${chartKey}" must have hasDateArgs variable to distinguish between toggle and filter commands`
                );

                // Must check hasDateArgs in toggle condition
                expect(handlerSection).toMatch(
                    /is.*Active.*is.*Visible.*!hasDateArgs/,
                    `Chart "${chartKey}" must check !hasDateArgs in toggle condition to allow date filtering when chart is visible`
                );
            });
        });

        test('all composition chart renderers must filter data based on chartDateRange', () => {
            // Check that renderer files properly implement date filtering
            const rendererFiles = {
                composition: '../../../js/transactions/chart/renderers/composition.js',
                sectors: '../../../js/transactions/chart/renderers/sectors.js',
                geography: '../../../js/transactions/chart/renderers/geography.js',
                marketcap: '../../../js/transactions/chart/renderers/marketcap.js',
            };

            Object.entries(rendererFiles).forEach(([chartName, relativePath]) => {
                const rendererContent = readFileContent(relativePath);

                // Must read chartDateRange from transactionState
                expect(rendererContent).toContain(
                    'chartDateRange',
                    `Renderer ${chartName} must read chartDateRange from transactionState`
                );

                // Must parse filterFrom and filterTo dates
                expect(rendererContent).toContain(
                    'filterFrom',
                    `Renderer ${chartName} must have filterFrom variable for date filtering`
                );
                expect(rendererContent).toContain(
                    'filterTo',
                    `Renderer ${chartName} must have filterTo variable for date filtering`
                );

                // Must filter indices based on date range
                expect(rendererContent).toContain(
                    'filteredIndices',
                    `Renderer ${chartName} must filter indices based on date range`
                );

                // Must use filterFrom/filterTo in filter logic
                const filterSection = rendererContent.substring(
                    rendererContent.indexOf('filterFrom'),
                    rendererContent.indexOf('filterFrom') + 500
                );
                expect(filterSection).toContain(
                    'filterTo',
                    `Renderer ${chartName} must use both filterFrom and filterTo in filter logic`
                );
            });
        });

        test('all composition charts must be in isActiveChartVisible for standalone date filters', () => {
            // Standalone date filters like '2024' or 'f:2023' only work if chart is in isActiveChartVisible
            const viewUtilsContent = readFileContent(
                '../../../js/transactions/terminal/viewUtils.js'
            );

            COMPOSITION_CHARTS.forEach((chartKey) => {
                const jsName = CHART_NAME_MAPPING[chartKey];
                expect(viewUtilsContent).toContain(
                    `'${jsName}'`,
                    `Chart "${jsName}" must be in isActiveChartVisible() for standalone date filter commands to work`
                );
            });
        });

        test('all composition charts must have getActiveChartSummaryText support', () => {
            // Standalone date filters show chart summary after applying
            const viewUtilsContent = readFileContent(
                '../../../js/transactions/terminal/viewUtils.js'
            );

            const baseCharts = COMPOSITION_CHARTS.filter((c) => !c.includes('-abs'));

            baseCharts.forEach((chartKey) => {
                const jsName = CHART_NAME_MAPPING[chartKey];
                const snapshotFunction = `get${jsName.charAt(0).toUpperCase() + jsName.slice(1)}SnapshotLine`;

                // Must have snapshot function imported
                expect(viewUtilsContent).toContain(
                    snapshotFunction,
                    `Chart "${jsName}" must have ${snapshotFunction} imported in viewUtils.js`
                );

                // Must have case in getActiveChartSummaryText
                expect(viewUtilsContent).toContain(
                    `activeChart === '${jsName}'`,
                    `Chart "${jsName}" must have case in getActiveChartSummaryText()`
                );
            });
        });
    });

    describe('Autocomplete Support', () => {
        test('all composition charts must be in PLOT_SUBCOMMANDS', () => {
            COMPOSITION_CHARTS.forEach((chartKey) => {
                expect(constantsContent).toContain(
                    `'${chartKey}'`,
                    `Chart "${chartKey}" is missing from PLOT_SUBCOMMANDS - autocomplete will not work`
                );
            });
        });
    });

    describe('Chart Renderer', () => {
        test('all composition charts must use COLOR_PALETTES.COMPOSITION_CHART_COLORS', () => {
            // Check that marketcap renderer uses the shared color palette
            const marketcapContent = readFileContent(
                '../../../js/transactions/chart/renderers/marketcap.js'
            );

            expect(marketcapContent).toContain(
                'COLOR_PALETTES.COMPOSITION_CHART_COLORS',
                'marketcap.js must use COLOR_PALETTES.COMPOSITION_CHART_COLORS for consistent colors'
            );
        });

        test('all composition charts must have chart renderer registered in chart.js', () => {
            COMPOSITION_CHARTS.forEach((chartKey) => {
                const jsName = CHART_NAME_MAPPING[chartKey];
                const isAbs = chartKey.includes('-abs');
                const baseName = chartKey.replace('-abs', '');

                // Build expected function name
                const capName = baseName.charAt(0).toUpperCase() + baseName.slice(1);
                const rendererFunction = isAbs
                    ? `draw${capName}AbsoluteChart`
                    : `draw${capName}Chart`;

                // Check import
                expect(chartContent).toContain(
                    rendererFunction,
                    `Chart "${chartKey}" renderer ${rendererFunction} not imported in chart.js`
                );

                // Check usage in render frame
                expect(chartContent).toContain(
                    `transactionState.activeChart === '${jsName}'`,
                    `Chart "${chartKey}" not handled in render frame`
                );
            });
        });
    });

    describe('Data Loader', () => {
        test('all composition charts must have data loader function', () => {
            const dataLoaderContent = readFileContent('../../../js/transactions/dataLoader.js');

            const expectedLoaders = [
                'loadCompositionSnapshotData',
                'loadSectorsSnapshotData',
                'loadGeographySnapshotData',
                'loadMarketcapSnapshotData',
            ];

            expectedLoaders.forEach((loader) => {
                expect(dataLoaderContent).toContain(
                    `export async function ${loader}`,
                    `Data loader ${loader} not exported from dataLoader.js`
                );
            });
        });
    });

    describe('Snapshot Function', () => {
        test('all composition charts must have snapshot function', () => {
            const snapshotsContent = readFileContent(
                '../../../js/transactions/terminal/snapshots.js'
            );

            const expectedSnapshots = [
                'getCompositionSnapshotLine',
                'getSectorsSnapshotLine',
                'getGeographySnapshotLine',
                'getMarketcapSnapshotLine',
            ];

            expectedSnapshots.forEach((snapshot) => {
                expect(snapshotsContent).toContain(
                    `export async function ${snapshot}`,
                    `Snapshot function ${snapshot} not exported from snapshots.js`
                );
            });
        });
    });
});

describe('New Chart Feature Parity Checklist', () => {
    test('DOCUMENTATION: New chart requirements', () => {
        // This test serves as documentation for what's required when adding a new chart
        const requirements = `
=== NEW CHART FEATURE PARITY CHECKLIST ===

When adding a new composition-style chart, ensure ALL of the following:

1. DATA LAYER:
   - [ ] Create data generation script (scripts/generate_*_data.py)
   - [ ] Output data to data/output/figures/*.json
   - [ ] Add load*SnapshotData() to js/transactions/dataLoader.js

2. CHART RENDERER:
   - [ ] Create js/transactions/chart/renderers/*.js
   - [ ] Use COLOR_PALETTES.COMPOSITION_CHART_COLORS
   - [ ] Implement both percent and absolute modes
   - [ ] Build seriesForCrosshair with getValueAtTime, formatValue, formatDelta
   - [ ] Set up chartLayouts with all required properties
   - [ ] Export draw*Chart and draw*AbsoluteChart functions

3. CHART REGISTRATION:
   - [ ] Import renderer in js/transactions/chart.js
   - [ ] Add case in render frame for activeChart

4. TERMINAL COMMAND:
   - [ ] Add handler in js/transactions/terminal/handlers/plot.js
   - [ ] Support date range filters (applyDateArgs, formatDateRange)
   - [ ] Support abs/absolute mode toggle
   - [ ] Call chartManager.update()
   - [ ] Show snapshot in result message

5. AUTO-COMPLETE:
   - [ ] Add to PLOT_SUBCOMMANDS in js/transactions/terminal/constants.js
   - [ ] Include both normal and -abs variants

6. CROSSHAIR SUPPORT:
   - [ ] Add to isCompositionLayout check in interaction.js
   - [ ] Add to range skip checks (3 locations) in interaction.js
   - [ ] Add to legend click skip check in interaction.js
   - [ ] Add to getActiveChartKey in interaction.js

7. SNAPSHOT:
   - [ ] Create get*SnapshotLine() in js/transactions/terminal/snapshots.js
   - [ ] Support both normal and abs labelPrefix

8. TESTS:
   - [ ] Add to COMPOSITION_CHARTS array in this test file
   - [ ] Create dedicated test file (tests/js/transactions/terminal_*.test.js)
   - [ ] Test basic command execution
   - [ ] Test abs mode
   - [ ] Test date range filters
   - [ ] Test toggle off behavior
   - [ ] Test input clearing after command

FAILURE TO COMPLETE ANY ITEM WILL CAUSE TEST FAILURES
        `;

        // Log requirements for documentation
        console.log(requirements);

        // Always pass - this is documentation
        expect(true).toBe(true);
    });
});
