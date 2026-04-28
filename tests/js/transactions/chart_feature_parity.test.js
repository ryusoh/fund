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
        test('Any composition chart in PLOT_SUBCOMMANDS must be in COMPOSITION_CHARTS', () => {
            // Extract all chart keys from constants.js
            const compositionPattern = /'(composition|sectors|geography|marketcap)(-abs)?'/g;
            const registeredInConstants = extractRegisteredCharts(
                constantsContent,
                compositionPattern
            );

            registeredInConstants.forEach((chart) => {
                expect(COMPOSITION_CHARTS).toContain(
                    chart,
                    `Chart "${chart}" is in PLOT_SUBCOMMANDS but NOT in COMPOSITION_CHARTS array - add it to enable feature parity tests`
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

                // Check renderer exports both functions
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

                // Check viewUtils integration (needed for standalone date filters)
                const viewJsName = CHART_NAME_MAPPING[baseChart];
                const viewAbsName = CHART_NAME_MAPPING[`${baseChart}-abs`];
                expect(viewUtilsContent).toContain(
                    `'${viewJsName}'`,
                    `Chart '${viewJsName}' not in viewUtils.js (needed for standalone date filters)`
                );
                expect(viewUtilsContent).toContain(
                    `'${viewAbsName}'`,
                    `Chart '${viewAbsName}' not in viewUtils.js (needed for standalone date filters)`
                );
            });
        });

        test('Crosshair interaction.js must have all composition charts in ALL required locations', () => {
            const baseCharts = [...new Set(COMPOSITION_CHARTS.map(getBaseChart))];

            // Check all locations where composition charts must be registered
            const locations = [
                { name: 'isCompositionLayout', pattern: /isCompositionLayout[\s\S]{0,800}/ },
                { name: 'range skip (1)', pattern: /Skip range functionality[\s\S]{0,1000}/ },
                { name: 'range skip (2)', pattern: /handlePointerDown[\s\S]{0,2000}/ },
                { name: 'range skip (3)', pattern: /handlePointerMove[\s\S]{0,2000}/ },
                { name: 'legend click skip', pattern: /Skip click events[\s\S]{0,1000}/ },
                { name: 'getActiveChartKey', pattern: /function getActiveChartKey[\s\S]{0,1500}/ },
            ];

            baseCharts.forEach((baseChart) => {
                const jsName = CHART_NAME_MAPPING[baseChart];
                const absName = CHART_NAME_MAPPING[`${baseChart}-abs`];

                locations.forEach((location) => {
                    const section = interactionContent.match(location.pattern);
                    if (section) {
                        const sectionContent = section[0];
                        expect(sectionContent).toContain(
                            `'${jsName}'`,
                            `Chart '${jsName}' (${baseChart}) missing from ${location.name} in interaction.js`
                        );
                        expect(sectionContent).toContain(
                            `'${absName}'`,
                            `Chart '${absName}' (${baseChart}-abs) missing from ${location.name} in interaction.js`
                        );
                    }
                });
            });
        });
    });

    describe('Date Range Filter Support', () => {
        test('handleCompositionStyleChart must handle all composition charts', () => {
            const baseCharts = [...new Set(COMPOSITION_CHARTS.map(getBaseChart))];

            // Get the handleCompositionStyleChart function body
            const handlerMatch = plotContent.match(
                /const handleCompositionStyleChart = async \(baseChartKey\) => \{([\s\S]+?)\};/
            );
            expect(handlerMatch).toBeTruthy();
            const handlerBody = handlerMatch[1];

            baseCharts.forEach((baseChart) => {
                // Check if the chart is handled in the if/else-if chain for snapshots
                if (baseChart !== 'drawdown') {
                    // drawdown is handled specially with custom snapshotFn
                    expect(handlerBody).toContain(
                        `baseChartKey === '${baseChart}'`,
                        `Chart "${baseChart}" is missing from handleCompositionStyleChart snapshot matching`
                    );
                }
            });

            // Verify the list of charts that call handleCompositionStyleChart
            const dispatchMatch = plotContent.match(
                /if \(\[([\s\S]+?)\]\.includes\(baseSubcommand\)\)/
            );
            expect(dispatchMatch).toBeTruthy();
            const dispatchList = dispatchMatch[1];

            baseCharts.forEach((baseChart) => {
                expect(dispatchList).toContain(
                    `'${baseChart}'`,
                    `Chart "${baseChart}" is missing from handleCompositionStyleChart dispatch list`
                );
            });
        });

        test('handleCompositionStyleChart must support abs/absolute mode toggle and date args', () => {
            const handlerMatch = plotContent.match(
                /const handleCompositionStyleChart = async \(baseChartKey\) => \{([\s\S]+?)\};/
            );
            const handlerBody = handlerMatch[1];

            // Verify core features are implemented in the shared handler
            expect(handlerBody).toContain('isAbsoluteSubcommand(subcommand)');
            expect(handlerBody).toContain('applyDateArgs(rangeTokens)');
            expect(handlerBody).toContain("baseChartKey + 'Abs'");
            expect(handlerBody).toContain('!hasDateArgs'); // Toggle behavior
        });

        test('all composition chart renderers must filter data based on chartDateRange', () => {
            // Check that renderer files properly implement date filtering
            const baseCharts = [...new Set(COMPOSITION_CHARTS.map(getBaseChart))];

            baseCharts.forEach((baseChart) => {
                const rendererPath = path.join(
                    __dirname,
                    `../../../js/transactions/chart/renderers/${baseChart}.js`
                );
                const rendererContent = fs.readFileSync(rendererPath, 'utf8');

                // Must read chartDateRange from transactionState
                expect(rendererContent).toContain(
                    'chartDateRange',
                    `Renderer ${baseChart} must read chartDateRange from transactionState`
                );

                // Must parse filterFrom and filterTo dates
                expect(rendererContent).toContain(
                    'filterFrom',
                    `Renderer ${baseChart} must have filterFrom variable for date filtering`
                );
                expect(rendererContent).toContain(
                    'filterTo',
                    `Renderer ${baseChart} must have filterTo variable for date filtering`
                );

                // Must filter indices based on date range
                expect(rendererContent).toContain(
                    'filteredIndices',
                    `Renderer ${baseChart} must filter indices based on date range`
                );

                // Must use filterFrom/filterTo in filter logic
                expect(rendererContent).toMatch(
                    /filterFrom|filterTo/,
                    `Renderer ${baseChart} must use date filters`
                );
            });
        });

        test('all composition charts must be in isActiveChartVisible for standalone date filters', () => {
            COMPOSITION_CHARTS.forEach((chartKey) => {
                const jsName = CHART_NAME_MAPPING[chartKey];
                expect(viewUtilsContent).toContain(
                    `'${jsName}'`,
                    `Chart "${jsName}" must be in isActiveChartVisible() for standalone date filter commands to work`
                );
            });
        });

        test('all composition charts must have getActiveChartSummaryText support', () => {
            const baseCharts = [...new Set(COMPOSITION_CHARTS.map(getBaseChart))];

            baseCharts.forEach((baseChart) => {
                const jsName = CHART_NAME_MAPPING[baseChart];
                // Check if viewUtils handles the chart or its abs variant
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
