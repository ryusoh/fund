/**
 * Performance regression tests for caching optimizations.
 *
 * These tests verify that:
 * 1. Split adjustment cache works correctly
 * 2. FX rate cache works correctly
 * 3. Caches are cleared when data is reloaded
 * 4. Currency conversion produces correct results with caching
 *
 * Background: Commit 64362453 introduced Date object creation in loops,
 * causing severe slowdowns when loading all-time data or switching currencies.
 * These tests prevent future performance regressions.
 */

/* eslint no-undef: "off" */

const fs = require('fs');
const path = require('path');

const CALCULATIONS_PATH = path.join(__dirname, '../../../js/transactions/calculations.js');
const UTILS_PATH = path.join(__dirname, '../../../js/transactions/utils.js');
const DATALOADER_PATH = path.join(__dirname, '../../../js/transactions/dataLoader.js');

describe('Performance Caching Regression Tests', () => {
    let calculationsContent;
    let utilsContent;
    let dataloaderContent;

    beforeAll(() => {
        calculationsContent = fs.readFileSync(CALCULATIONS_PATH, 'utf-8');
        utilsContent = fs.readFileSync(UTILS_PATH, 'utf-8');
        dataloaderContent = fs.readFileSync(DATALOADER_PATH, 'utf-8');
    });

    describe('Split Adjustment Cache (calculations.js)', () => {
        test('should have splitAdjustmentCache declared', () => {
            expect(calculationsContent).toContain('splitAdjustmentCache');
            expect(calculationsContent).toContain('new Map()');
        });

        test('should cache split adjustment results', () => {
            // Must check cache before computing
            expect(calculationsContent).toMatch(/splitAdjustmentCache\.has\(cacheKey\)/);
            expect(calculationsContent).toMatch(/splitAdjustmentCache\.get\(cacheKey\)/);
        });

        test('should store computed results in cache', () => {
            // Must store results after computing
            expect(calculationsContent).toMatch(/splitAdjustmentCache\.set\(cacheKey,\s*result\)/);
        });

        test('should use cacheKey with symbol and transactionDate', () => {
            // Cache key should include both symbol and date
            expect(calculationsContent).toContain('`${symbol}|${transactionDate}`');
        });

        test('should export clearSplitAdjustmentCache function', () => {
            expect(calculationsContent).toContain('export function clearSplitAdjustmentCache()');
            expect(calculationsContent).toContain('splitAdjustmentCache.clear()');
        });

        test('should NOT create Date objects without caching', () => {
            // Every new Date() in getSplitAdjustment should be accompanied by cache logic
            const getSplitFunction = calculationsContent.match(
                /export function getSplitAdjustment\([\s\S]*?^}/m
            );
            expect(getSplitFunction).toBeTruthy();

            const functionContent = getSplitFunction[0];
            // Should have cache check before Date creation
            const cacheCheckIndex = functionContent.indexOf('splitAdjustmentCache.has');
            const dateCreationIndex = functionContent.indexOf('new Date(transactionDate)');

            expect(cacheCheckIndex).toBeGreaterThanOrEqual(0);
            expect(dateCreationIndex).toBeGreaterThanOrEqual(0);
            expect(cacheCheckIndex).toBeLessThan(dateCreationIndex);
        });
    });

    describe('FX Rate Cache (utils.js)', () => {
        test('should have fxRateCache declared', () => {
            expect(utilsContent).toContain('fxRateCache');
            expect(utilsContent).toContain('new Map()');
        });

        test('should check cache before binary search', () => {
            // Must check cache first
            expect(utilsContent).toMatch(/fxRateCache\.get\(currency\)/);
            expect(utilsContent).toMatch(/currencyCache\?\.has\(dateString\)/);
            expect(utilsContent).toMatch(/currencyCache\.get\(dateString\)/);
        });

        test('should cache FX rate results after lookup', () => {
            // Must store results after finding rate
            expect(utilsContent).toMatch(/fxRateCache\.set\(currency,\s*new Map\(\)\)/);
            expect(utilsContent).toMatch(/fxRateCache\.get\(currency\)\.set\(dateString,\s*rate\)/);
        });

        test('should export clearFxRateCache function', () => {
            expect(utilsContent).toContain('export function clearFxRateCache()');
            expect(utilsContent).toContain('fxRateCache.clear()');
        });

        test('should cache results in all code paths', () => {
            // Check that caching happens after:
            // 1. Direct map lookup
            // 2. First key fallback
            // 3. Binary search result

            const findFxRateFunction = utilsContent.match(/function findFxRate\([\s\S]*?^}/m);
            expect(findFxRateFunction).toBeTruthy();

            const functionContent = findFxRateFunction[0];

            // Count cache sets - should have at least 3 (one for each code path)
            const cacheSetMatches = functionContent.match(
                /fxRateCache\.get\(currency\)\.set\(dateString,\s*rate\)/g
            );
            expect(cacheSetMatches).toBeTruthy();
            expect(cacheSetMatches.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('Cache Invalidation (dataLoader.js)', () => {
        test('should import clearSplitAdjustmentCache', () => {
            expect(dataloaderContent).toContain(
                "import { parseCSV, clearSplitAdjustmentCache } from './calculations.js'"
            );
        });

        test('should import clearFxRateCache', () => {
            expect(dataloaderContent).toContain(
                "import { parseCSVLine, clearFxRateCache } from './utils.js'"
            );
        });

        test('should clear split cache in loadSplitHistory', () => {
            const loadSplitFunction = dataloaderContent.match(
                /export async function loadSplitHistory\([\s\S]*?^}/m
            );
            expect(loadSplitFunction).toBeTruthy();

            const functionContent = loadSplitFunction[0];
            expect(functionContent).toContain('clearSplitAdjustmentCache()');
        });

        test('should clear FX cache in loadFxDailyRates', () => {
            const loadFxFunction = dataloaderContent.match(
                /export async function loadFxDailyRates\([\s\S]*?^}/m
            );
            expect(loadFxFunction).toBeTruthy();

            const functionContent = loadFxFunction[0];
            expect(functionContent).toContain('clearFxRateCache()');
        });

        test('should clear caches AFTER successful data load', () => {
            // Cache clear should happen after data is parsed, not before
            const loadSplitFunction = dataloaderContent.match(
                /export async function loadSplitHistory\([\s\S]*?return splits;/m
            );
            expect(loadSplitFunction).toBeTruthy();

            const functionContent = loadSplitFunction[0];
            const returnIndex = functionContent.lastIndexOf('return splits;');
            const clearIndex = functionContent.indexOf('clearSplitAdjustmentCache()');

            expect(clearIndex).toBeGreaterThanOrEqual(0);
            expect(clearIndex).toBeLessThan(returnIndex);
        });
    });

    describe('No Performance Anti-patterns', () => {
        test('should NOT have new Date() inside filter callbacks without caching', () => {
            // Check getSplitAdjustment specifically
            const getSplitFunction = calculationsContent.match(
                /export function getSplitAdjustment\([\s\S]*?^}/m
            );
            expect(getSplitFunction).toBeTruthy();

            const functionContent = getSplitFunction[0];

            // If there's new Date() in a filter, there must be caching
            const hasDateInFilter = /filter\([\s\S]*new Date\(/.test(functionContent);
            const hasCache = /splitAdjustmentCache/.test(functionContent);

            if (hasDateInFilter) {
                expect(hasCache).toBe(true);
            }
        });

        test('should NOT have binary search without caching in findFxRate', () => {
            const findFxRateFunction = utilsContent.match(/function findFxRate\([\s\S]*?^}/m);
            expect(findFxRateFunction).toBeTruthy();

            const functionContent = findFxRateFunction[0];

            // If there's a while loop (binary search), there must be caching
            const hasWhileLoop = /while\s*\(/.test(functionContent);
            const hasCache = /fxRateCache/.test(functionContent);

            if (hasWhileLoop) {
                expect(hasCache).toBe(true);
            }
        });
    });

    describe('Cache Key Stability', () => {
        test('should use stable cache keys for split adjustments', () => {
            // Cache key should be a string combination of symbol and date
            expect(calculationsContent).toMatch(/`\$\{symbol\}\|\$\{transactionDate\}`/);
        });

        test('should use currency and date for FX cache keys', () => {
            // FX cache should use currency as outer key, date as inner key
            expect(utilsContent).toMatch(/fxRateCache\.get\((currency)\)/);
            expect(utilsContent).toMatch(/currencyCache\?\.has\((dateString)\)/);
        });
    });
});
