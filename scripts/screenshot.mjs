/**
 * Headless screenshot tool for visual verification of the static frontend.
 *
 * Renders a page in Playwright's bundled Chromium (so Chromium-only effects like
 * the SVG backdrop-filter "liquid glass" actually paint) and writes a PNG. It
 * starts a throwaway dev server, waits for it, shoots, and tears everything down,
 * so a single command is self-contained.
 *
 * Usage:
 *   node scripts/screenshot.mjs [URL_PATH] [--out FILE] [--port N]
 *                               [--width N] [--height N] [--wait MS] [--full]
 *                               [--keys "TEXT"]... [--settle MS]
 *                               [--el SELECTOR] [--probe SELECTOR]...
 *                               [--into SELECTOR] [--gl swiftshader|plain]
 *   make screenshot URL=/terminal/
 *   # Reveal panes hidden until a terminal command runs (table -> `transaction`,
 *   # chart -> `plot balance`, both -> `reset`), then shoot:
 *   make screenshot URL=/terminal/ ARGS='--keys transaction'
 *   # Drive several terminal commands in sequence and shoot just the pane
 *   # (the workflow used for analysis-pane development):
 *   make screenshot URL=/terminal/ ARGS='--keys analysis --keys "analysis ANET"
 *       --settle 1500 --el "#analysisSection" --probe "#analysisSection" --wait 1800'
 *
 * --keys is repeatable: each command is typed into the terminal and executed in
 * order, with --settle MS (default 1000) between them. --el crops the shot to a
 * single element (e.g. '#analysisSection'). --probe is repeatable and prints one
 * JSON line per selector to stderr with objective state for verification:
 * found/visible dimensions, whether the element scrolls internally, and how many
 * buttons it holds — so a render can be checked without eyeballing the PNG.
 *
 * Pages with an entrance fade-in (e.g. /calendar/) can out-race the default
 * 1200ms wait and shoot blank — pass a longer wait such as `--wait 2500`. Any page
 * console errors / uncaught exceptions are printed to stderr to disambiguate a
 * genuinely-broken page from one that just needs more wait.
 *
 * Side effects: spawns `scripts/dev_server.py` on --port, writes a PNG under
 * screenshots/ (gitignored). Exits non-zero on navigation/render failure.
 *
 * --gl selects the GPU backend: `swiftshader` (default) software-renders WebGL
 * so Chromium-only effects (liquid glass) paint in headless CI; on a dev
 * machine where SwiftShader sporadically wedges page loads (observed on macOS),
 * `--gl plain` skips those flags — WebGL effects won't paint, but DOM/CSS
 * panes still verify fine.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
    const opts = {
        url: '/',
        port: 8123,
        width: 1440,
        height: 900,
        wait: 1200,
        full: false,
        cmd: [],
        settle: 1000,
        el: null,
        probe: [],
        into: '#terminalInput',
        click: null,
        eval: null,
        gl: 'swiftshader',
    };
    const positional = [];
    const takeValue = (argv, i, inline, name) => {
        if (inline !== undefined && inline !== '') {
            return [inline, i];
        }
        if (i + 1 >= argv.length) {
            throw new Error(`missing value for ${name}`);
        }
        return [argv[i + 1], i + 1];
    };
    for (let i = 0; i < argv.length; i++) {
        // Support both "--flag value" and "--flag=value".
        const [a, inline] = argv[i].split(/=(.*)/s);
        let value;
        let next;
        if (a === '--full') {
            opts.full = true;
        } else if (a === '--out') {
            [opts.out, i] = takeValue(argv, i, inline, a);
        } else if (a === '--port') {
            [value, next] = takeValue(argv, i, inline, a);
            opts.port = Number(value);
            i = next;
        } else if (a === '--width') {
            [value, next] = takeValue(argv, i, inline, a);
            opts.width = Number(value);
            i = next;
        } else if (a === '--height') {
            [value, next] = takeValue(argv, i, inline, a);
            opts.height = Number(value);
            i = next;
        } else if (a === '--wait') {
            [value, next] = takeValue(argv, i, inline, a);
            opts.wait = Number(value);
            i = next;
        } else if (a === '--keys') {
            [value, next] = takeValue(argv, i, inline, a);
            opts.cmd.push(value);
            i = next;
        } else if (a === '--settle') {
            [value, next] = takeValue(argv, i, inline, a);
            opts.settle = Number(value);
            i = next;
        } else if (a === '--el') {
            [opts.el, i] = takeValue(argv, i, inline, a);
        } else if (a === '--probe') {
            [value, next] = takeValue(argv, i, inline, a);
            opts.probe.push(value);
            i = next;
        } else if (a === '--into') {
            [opts.into, i] = takeValue(argv, i, inline, a);
        } else if (a === '--click') {
            [opts.click, i] = takeValue(argv, i, inline, a);
        } else if (a === '--eval') {
            [opts.eval, i] = takeValue(argv, i, inline, a);
        } else if (a === '--gl') {
            [opts.gl, i] = takeValue(argv, i, inline, a);
        } else {
            positional.push(argv[i]);
        }
    }
    if (positional[0]) {
        opts.url = positional[0];
    }
    if (opts.gl !== 'swiftshader' && opts.gl !== 'plain') {
        throw new Error(`--gl must be swiftshader|plain, got: ${opts.gl}`);
    }
    return opts;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(base, diedFn, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (diedFn && diedFn()) {
            throw new Error('dev server process exited before becoming ready');
        }
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

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const path = opts.url.startsWith('/') ? opts.url : `/${opts.url}`;
    const base = `http://localhost:${opts.port}`;
    const slug = path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';
    const out = resolve(
        repoRoot,
        opts.out || `screenshots/${slug}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
    );
    mkdirSync(dirname(out), { recursive: true });

    // Capture server stderr so a spawn failure (e.g. the port already taken by
    // a leftover dev server from a crashed run) fails fast with the real
    // reason instead of muting into a goto timeout against the wrong server.
    let serverErr = '';
    let serverExited = false;
    const server = spawn('python3', ['scripts/dev_server.py', String(opts.port)], {
        cwd: repoRoot,
        stdio: ['ignore', 'ignore', 'pipe'],
    });
    server.stderr.on('data', (chunk) => {
        serverErr += chunk.toString();
    });
    server.on('exit', (code) => {
        if (code !== null && code !== 0 && !serverExited) {
            serverExited = true;
            console.error(
                `[dev server exited ${code}] ${serverErr.trim() || '(no output)'} — ` +
                    'the port is likely held by a leftover dev server; kill it or pass --port'
            );
        }
    });

    let browser;
    try {
        await waitForServer(base, () => serverExited);
        browser = await chromium.launch({
            // Software GL so WebGL overlays still render in headless. `--gl plain`
            // skips these on machines where SwiftShader wedges page loads.
            args:
                opts.gl === 'plain'
                    ? []
                    : ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader'],
        });
        const page = await browser.newPage({
            viewport: { width: opts.width, height: opts.height },
            deviceScaleFactor: 2,
        });
        // Surface runtime failures so a blank/broken screenshot self-diagnoses
        // instead of looking like an empty page (a silent error reads identically
        // to "nothing rendered yet"). Printed to stderr; the PNG path stays the
        // only thing on stdout.
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                console.error(`[page console.error] ${msg.text()}`);
            }
        });
        page.on('pageerror', (err) => {
            console.error(`[page error] ${err.message}`);
        });
        // domcontentloaded (not networkidle): the terminal page keeps a live
        // data connection open, so networkidle can hang for its full timeout;
        // --wait/--settle cover render settling instead.
        const response = await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
        if (response && response.status() >= 400) {
            throw new Error(`HTTP ${response.status()} for ${path}`);
        }
        // Optionally drive the page first (e.g. type terminal commands or click a chart
        // to reveal panes that are hidden until then), so the resulting state is captured.
        // Each --keys command is executed in order with a settle delay between them.
        for (const cmd of opts.cmd) {
            await page.evaluate(
                ({ cmdText, intoSelector }) => {
                    const input = document.querySelector(intoSelector);
                    if (input) {
                        input.value = cmdText;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(
                            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
                        );
                    }
                },
                { cmdText: cmd, intoSelector: opts.into }
            );
            await sleep(opts.settle);
        }
        if (opts.eval) {
            await page.evaluate(opts.eval);
        }
        if (opts.click) {
            await page.locator(opts.click).click({ force: true, timeout: 5000 });
        }
        // Objective probes: print element state as JSON to stderr so a render can
        // be verified without eyeballing the PNG (stdout stays PNG-path only).
        for (const selector of opts.probe) {
            const probe = await page.evaluate((sel) => {
                const el = document.querySelector(sel);
                if (!el) {
                    return { selector: sel, found: false };
                }
                const box = el.getBoundingClientRect();
                return {
                    selector: sel,
                    found: true,
                    visible: box.width > 0 && box.height > 0,
                    width: Math.round(box.width),
                    height: Math.round(box.height),
                    scrollable: el.scrollHeight > el.clientHeight + 1,
                    buttons: el.querySelectorAll('button').length,
                };
            }, selector);
            console.error(`[probe] ${JSON.stringify(probe)}`);
        }
        // Let fonts, canvas/WebGL, and the glass animation settle before shooting.
        await sleep(opts.wait);
        if (opts.el) {
            const element = await page.$(opts.el);
            if (!element) {
                throw new Error(`element not found for --el: ${opts.el}`);
            }
            await element.screenshot({ path: out });
        } else {
            await page.screenshot({ path: out, fullPage: opts.full });
        }

        console.log(out);
    } finally {
        if (browser) {
            await browser.close();
        }
        server.kill();
    }
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
