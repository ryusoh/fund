/**
 * Smoke test for the SHIPPED Cal-Heatmap bundle (`js/vendor/cal-heatmap.js`).
 *
 * The rest of the calendar suite mocks `global.CalHeatmap`, so a broken bundle —
 * e.g. an autonomous perf/refactor agent (bolt/architect) breaking a function in
 * `js/ui/cal-heatmap-src/**`— would otherwise sail through CI. This loads the
 * real committed bundle (the exact artifact GitHub Pages serves) the same way the
 * page does (UMD d3 global + the IIFE bundle) and actually paints, asserting cells
 * render. It tests the bundle AS COMMITTED, so it tolerates source↔bundle drift
 * (stale or intentionally hand-tweaked) as long as what ships works.
 * See docs/calendar-renderer-migration.md.
 */
import fs from 'fs';
import path from 'path';

// jest runs from the repo root (rootDir), so resolve vendored bundles from cwd.
const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

// Indirect eval runs in global (sloppy) scope, mirroring the page's <script> tags:
// d3.v7.min.js (UMD) attaches window.d3; cal-heatmap.js (IIFE) defines CalHeatmap.
const globalEval = eval;

describe('cal-heatmap shipped bundle smoke test', () => {
    beforeAll(() => {
        globalEval(read('js/vendor/d3.v7.min.js'));
        globalEval(read('js/vendor/cal-heatmap.js'));
    });

    it('exposes d3 and CalHeatmap globals from the vendored bundles', () => {
        expect(typeof globalThis.d3).toBe('object');
        expect(typeof globalThis.CalHeatmap).toBe('function');
    });

    it('paints day cells with the real bundle', async () => {
        document.body.innerHTML = '<div id="cal-heatmap-smoke"></div>';
        const cal = new globalThis.CalHeatmap();

        let paintErr;
        const painting = Promise.resolve(
            cal.paint({
                itemSelector: '#cal-heatmap-smoke',
                range: 1,
                domain: { type: 'month' },
                subDomain: { type: 'day' },
                date: { start: new Date(2025, 0, 1) },
                data: { source: [], x: 'date', y: 'value' },
            })
        ).catch((e) => {
            paintErr = e;
        });

        // Don't depend on d3 transitions settling in jsdom; cells are appended
        // synchronously during the join. Give it a beat, then assert the DOM.
        await Promise.race([painting, new Promise((r) => setTimeout(r, 2000))]);
        if (paintErr) {
            throw paintErr;
        }

        const cells = document.querySelectorAll('#cal-heatmap-smoke rect.ch-subdomain-bg');
        expect(cells.length).toBeGreaterThan(0); // a month → ~28-31 day cells
    });
});
