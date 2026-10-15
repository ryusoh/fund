/**
 * Deterministic viewport-fit gate for the analysis pane.
 *
 * Drives every analysis function view at the minimum desktop viewport
 * (1280×580 — the terminal CSS floors the pane at its 320px design minimum)
 * in headless Chromium and fails if any active section is taller than the
 * `.analysis-stage` viewport. This is the executable half of the
 * ensure/detect/test contract in docs/analysis-pane-visual-design.md:
 * the CSS flex contract makes overflow structurally impossible, the
 * runtime guard (checkPaneViewportFit) reports it, and this gate proves
 * it on a real layout engine for real data.
 *
 * Usage:
 *   node scripts/check_analysis_pane_layout.mjs [--port N]
 *   make analysis-layout-check
 *
 * Sections are visited in a fixed order: overview, scenarios, value,
 * kelly, mc (after driving a full 10k-path Monte Carlo), belief,
 * evidence, predictions, journal — plus `analysis anet` to render a
 * single-ticker context. After each visit the stage's
 * scrollHeight/clientHeight are measured; scroll > client + 1 fails the
 * gate with the section name and pixel overflow.
 *
 * Exits 0 and prints a per-section fit summary when everything fits;
 * exits 1 on navigation failure, a missing pane, or any overflow.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Desktop viewport height at which the terminal CSS floors the pane at its
// 320px design minimum: below this the shared card rule shrinks every card
// further, which is outside the analysis pane's contract.
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
        return {
            section: visible ? visible.dataset.analysisSection : null,
            client: stage.clientHeight,
            scroll: stage.scrollHeight,
        };
    });
}

async function waitForMonteCarlo(page, timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const done = await page.evaluate(() => {
            const metrics = document.querySelector('#riskMetrics');
            if (!metrics) {
                return false;
            }
            // The pending run line (.mc-status) disappears once results land.
            return metrics.querySelector('.stat-card') !== null;
        });
        if (done) {
            return;
        }
        await sleep(250);
    }
    throw new Error('Monte Carlo results did not render within timeout');
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
        // --gl plain: software GL (SwiftShader) sporadically wedges page loads on
        // macOS; DOM/CSS layout — all this gate measures — verifies fine without it.
        browser = await chromium.launch({ args: [] });
        const page = await browser.newPage({ viewport: VIEWPORT });
        page.on('pageerror', (err) => {
            console.error(`[page error] ${err.message}`);
        });
        await page.goto(`${base}/terminal/`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#terminalInput', { timeout: 15000 });

        const results = [];
        const visit = async (label, cmd) => {
            await runCommand(page, cmd);
            await sleep(600);
            const m = await measureStage(page);
            if (!m) {
                throw new Error(`analysis stage not found after '${cmd}'`);
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

        // Portfolio context (PORT): every function view on aggregated data.
        // The PORT aggregate scenarios intentionally lack growth/valuation
        // blocks, so the MC worker reports its error pane here — still a
        // layout surface the contract must contain. A full 10k-path render is
        // gated in the anet context below.
        await visit('overview', 'analysis');
        await visit('scenarios', 'analysis scenarios');
        await visit('value', 'analysis value');
        await visit('kelly', 'analysis kelly');
        await visit('mc-error-pane', 'analysis mc');
        await visit('belief', 'analysis belief');
        await visit('evidence', 'analysis evidence');
        await visit('predictions', 'analysis predictions');
        await visit('journal', 'analysis journal');

        // Single-ticker context (full scenario blocks): drive a complete
        // Monte Carlo run and measure the rendered result, not just the
        // pending state.
        await visit('anet-overview', 'analysis anet');
        await visit('anet-mc', 'analysis mc');
        await waitForMonteCarlo(page);
        await sleep(300);
        const mcAfter = await measureStage(page);
        if (mcAfter.scroll - mcAfter.client > 1) {
            throw new Error(
                `viewport-fit violation: 'mc' after simulation is ` +
                    `${mcAfter.scroll - mcAfter.client}px taller than the analysis stage`
            );
        }
        results.push({
            label: 'anet-mc-sim',
            ...mcAfter,
            overflow: mcAfter.scroll - mcAfter.client,
        });

        // Instrument validation: the fit assertion above is only meaningful
        // if the stage is actually constrained by the pane. Before the
        // .lab-container contract, the stage grew with content and every
        // scroll == client check passed vacuously. A content-driven stage has
        // per-section heights; a constrained one is identical every visit.
        const clients = results.map((r) => r.client);
        const spread = Math.max(...clients) - Math.min(...clients);
        if (spread > 1) {
            throw new Error(
                `analysis stage height varies across views (${Math.min(...clients)}–` +
                    `${Math.max(...clients)}px) — the stage is not constrained by the ` +
                    'pane, so the viewport-fit assertions above were vacuous. ' +
                    'The .lab-container/stage flex contract is broken.'
            );
        }

        console.log('analysis-pane viewport-fit gate: PASS');
        for (const r of results) {
            console.log(
                `  ${r.label.padEnd(14)} section=${String(r.section).padEnd(10)} ` +
                    `${r.scroll}/${r.client}px (overflow ${r.overflow})`
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
