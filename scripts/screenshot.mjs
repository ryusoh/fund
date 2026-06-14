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
 *   make screenshot URL=/terminal/
 *
 * Side effects: spawns `scripts/dev_server.py` on --port, writes a PNG under
 * screenshots/ (gitignored). Exits non-zero on navigation/render failure.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
    const opts = { url: '/', port: 8123, width: 1440, height: 900, wait: 1200, full: false };
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--full') {
            opts.full = true;
        } else if (a === '--out') {
            opts.out = argv[++i];
        } else if (a === '--port') {
            opts.port = Number(argv[++i]);
        } else if (a === '--width') {
            opts.width = Number(argv[++i]);
        } else if (a === '--height') {
            opts.height = Number(argv[++i]);
        } else if (a === '--wait') {
            opts.wait = Number(argv[++i]);
        } else {
            positional.push(a);
        }
    }
    if (positional[0]) {
        opts.url = positional[0];
    }
    return opts;
}

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

    const server = spawn('python3', ['scripts/dev_server.py', String(opts.port)], {
        cwd: repoRoot,
        stdio: 'ignore',
    });

    let browser;
    try {
        await waitForServer(base);
        browser = await chromium.launch({
            // Software GL so WebGL overlays still render in headless.
            args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader'],
        });
        const page = await browser.newPage({
            viewport: { width: opts.width, height: opts.height },
            deviceScaleFactor: 2,
        });
        const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
        if (response && response.status() >= 400) {
            throw new Error(`HTTP ${response.status()} for ${path}`);
        }
        // Let fonts, canvas/WebGL, and the glass animation settle before shooting.
        await sleep(opts.wait);
        await page.screenshot({ path: out, fullPage: opts.full });

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
