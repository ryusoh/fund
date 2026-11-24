/**
 * Deterministic viewport-fit gate for the 2-view analysis decision pane.
 *
 * Drives the Decision Board (`analysis`) and every tracked ticker's Decision
 * Chart at the minimum desktop viewport (1280×580 — the terminal CSS floors
 * the pane at its 320px design minimum) in headless Chromium and fails if any
 * active view overflows `.analysis-stage` or fails to render.
 *
 * Usage:
 *   node scripts/check_analysis_pane_layout.mjs [--port N]
 *   make analysis-layout-check
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWPORT = { width: 1280, height: 580 };
const PORT = Number(process.argv[process.argv.indexOf('--port') + 1]) || 8124;

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

async function runCommand(page, cmd) {
    await page.evaluate((cmdText) => {
        const input = document.querySelector('#terminalInput');
        if (!input) {
            throw new Error('#terminalInput not found');
        }
        input.value = cmdText;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }, cmd);
}

async function measureStage(page) {
    return page.evaluate(() => {
        const stage = document.querySelector('.analysis-stage');
        const visible = document.querySelector('[data-analysis-section]:not(.is-hidden)');
        if (!stage) {
            return null;
        }
        const boardRows = document.querySelectorAll('.decision-board .board-row').length;
        const sizingBullet = document.querySelector('#sizingBullet');
        const canvas = document.querySelector('#decisionChartCanvas');
        const isVisible = (el) => {
            if (!el) {
                return false;
            }
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && el.textContent.trim().length > 0;
        };
        return {
            section: visible ? visible.dataset.analysisSection : null,
            client: stage.clientHeight,
            scroll: stage.scrollHeight,
            boardRows,
            sizingVisible: isVisible(sizingBullet),
            canvasWidth: canvas ? canvas.width : 0,
            canvasHeight: canvas ? canvas.height : 0,
        };
    });
}

async function main() {
    const base = `http://localhost:${PORT}`;
    let serverErr = '';
    let serverExited = false;
    const server = spawn('python3', ['scripts/dev_server.py', String(PORT)], {
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
        browser = await chromium.launch({ args: [] });
        const page = await browser.newPage({ viewport: VIEWPORT });
        page.on('pageerror', (err) => {
            console.error(`[page error] ${err.message}`);
        });
        await page.goto(`${base}/terminal/`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#terminalInput', { timeout: 15000 });

        const results = [];
        const visit = async (label, cmd, expectedSection) => {
            await runCommand(page, cmd);
            if (expectedSection === 'board') {
                await page.waitForSelector('.decision-board .board-row', { timeout: 15000 });
            } else {
                await page.waitForSelector(
                    '[data-analysis-section="ticker"]:not(.is-hidden) #sizingBullet',
                    { timeout: 15000 }
                );
            }
            await sleep(250);
            const m = await measureStage(page);
            if (!m) {
                throw new Error(`analysis stage not found after '${cmd}'`);
            }
            if (m.section !== expectedSection) {
                throw new Error(
                    `expected section '${expectedSection}' after '${cmd}', got '${m.section}'`
                );
            }
            if (expectedSection === 'board') {
                if (m.boardRows < 7) {
                    throw new Error(`board did not render completely after '${cmd}'`);
                }
            } else {
                if (!m.sizingVisible) {
                    throw new Error(`ticker decision chrome missing after '${cmd}'`);
                }
                if (!(m.canvasWidth > 0 && m.canvasHeight > 0)) {
                    throw new Error(
                        `decision canvas backing store is empty (${m.canvasWidth}x${m.canvasHeight}) after '${cmd}'`
                    );
                }
            }
            const overflow = m.scroll - m.client;
            results.push({ label, cmd, ...m, overflow });
            if (overflow > 1) {
                throw new Error(
                    `viewport-fit violation: '${m.section || label}' is ${overflow}px ` +
                        `taller than the analysis stage (${m.scroll} > ${m.client}) ` +
                        `after '${cmd}'`
                );
            }
        };

        await visit('board', 'analysis', 'board');
        await visit('goog-2y', 'analysis goog', 'ticker');
        await visit('goog-full', 'analysis goog full', 'ticker');
        await visit('anet-2y', 'analysis anet', 'ticker');
        await visit('pdd-2y', 'analysis pdd', 'ticker');
        await visit('vt-2y', 'analysis vt', 'ticker');
        await visit('aehr-2y', 'analysis aehr', 'ticker');
        await visit('cbrs-2y', 'analysis cbrs', 'ticker');

        const clients = results.map((r) => r.client);
        const spread = Math.max(...clients) - Math.min(...clients);
        if (spread > 1) {
            throw new Error(
                `analysis stage height varies across views (${Math.min(...clients)}–` +
                    `${Math.max(...clients)}px) — the stage is not constrained by the ` +
                    'pane, so the viewport-fit assertions above were vacuous.'
            );
        }

        console.log('analysis-pane viewport-fit gate: PASS');
        for (const r of results) {
            console.log(
                `  ${r.label.padEnd(12)} section=${String(r.section).padEnd(8)} ` +
                    `${r.scroll}/${r.client}px (overflow ${r.overflow}) ` +
                    `canvas=${r.canvasWidth}x${r.canvasHeight}`
            );
        }
    } finally {
        if (browser) {
            await browser.close();
        }
        server.kill();
    }
}

main().catch((err) => {
    console.error(`analysis-pane viewport-fit gate: FAIL — ${err.message || err}`);
    process.exit(1);
});
