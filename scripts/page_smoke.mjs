/**
 * Headless page smoke test: load every page in Playwright's Chromium and fail
 * on runtime breakage that otherwise ships silently.
 *
 * Caught:
 *   - uncaught page exceptions (pageerror)
 *   - console errors — notably CSP violations (e.g. a blob: asset blocked by
 *     img-src), which surface ONLY as console text while the visual effect
 *     they power silently disappears
 *
 * Tolerated (allowlisted): network errors to external hosts (CDN fonts/scripts,
 * the live data API), which fail in sandboxes/offline CI without indicating
 * repo breakage. Localhost resource failures always fail the gate.
 *
 * Usage:
 *   node scripts/page_smoke.mjs            # all pages
 *   node scripts/page_smoke.mjs /terminal/ # one page
 *   make smoke
 *
 * Requires the Playwright Chromium binary: `make ensure-playwright`.
 * Exits non-zero if any page reports a non-allowlisted error.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ALL_PAGES = ['/', '/analysis/', '/calendar/', '/performance/', '/position/', '/terminal/'];
const PORT = 8125;
// Longer wait for pages with an entrance fade-in (see scripts/screenshot.mjs).
const WAIT_MS = { '/calendar/': 3000 };
const DEFAULT_WAIT_MS = 1500;

// Console errors matching any of these are environmental (offline CDN / live
// API unreachable), not repo breakage. Everything else fails the gate.
const ALLOWLIST = [
    /net::ERR_INTERNET_DISCONNECTED/,
    /net::ERR_NAME_NOT_RESOLVED/,
    /net::ERR_CONNECTION_REFUSED/,
    /net::ERR_ABORTED/,
    /net::ERR_TIMED_OUT/,
    /net::ERR_NETWORK_CHANGED/,
    /Failed to fetch/,
    /cdnjs\.cloudflare\.com/,
    /fonts\.googleapis\.com/,
    /fonts\.gstatic\.com/,
    /unpkg\.com/,
    /bootcdn\.net/,
    /baomitu\.com/,
    /api\.lyeutsaon\.com/,
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(base, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(base);
            if (res.ok || res.status === 404) {
                return;
            }
        } catch {
            /* not up yet */
        }
        await sleep(200);
    }
    throw new Error(`dev server did not come up at ${base}`);
}

const isAllowed = (text) => ALLOWLIST.some((pattern) => pattern.test(text));

async function checkPage(browser, path) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const failures = [];
    page.on('pageerror', (error) => failures.push(`[pageerror] ${error.message}`));
    page.on('console', (message) => {
        if (message.type() !== 'error') {
            return;
        }
        const text = message.text();
        if (!isAllowed(text)) {
            failures.push(`[console.error] ${text}`);
        }
    });
    try {
        await page.goto(`http://localhost:${PORT}${path}`, {
            waitUntil: 'domcontentloaded',
            timeout: 20000,
        });
        await page.waitForTimeout(WAIT_MS[path] ?? DEFAULT_WAIT_MS);
    } catch (error) {
        failures.push(`[navigation] ${error.message}`);
    }
    await page.close();
    return failures;
}

async function main() {
    const requested = process.argv.slice(2);
    const pages = requested.length > 0 ? requested : ALL_PAGES;

    const server = spawn('python3', ['scripts/dev_server.py', String(PORT)], {
        cwd: repoRoot,
        stdio: 'ignore',
    });

    let browser;
    let failed = 0;
    try {
        await waitForServer(`http://localhost:${PORT}`);
        browser = await chromium.launch({
            // Software GL so WebGL overlays still render in headless.
            args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader'],
        });
        for (const path of pages) {
            const failures = await checkPage(browser, path);
            if (failures.length === 0) {
                console.log(`PASS ${path}`);
            } else {
                failed += failures.length;
                console.error(`FAIL ${path}`);
                for (const failure of failures) {
                    console.error(`  ${failure}`);
                }
            }
        }
    } finally {
        if (browser) {
            await browser.close();
        }
        server.kill();
    }

    if (failed > 0) {
        console.error(`\npage smoke: ${failed} error(s) — see above`);
        process.exit(1);
    }
    console.log(`\npage smoke: ${pages.length} page(s) clean`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
