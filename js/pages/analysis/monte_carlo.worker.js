/**
 * Monte Carlo Simulation Worker
 *
 * Runs geometric brownian motion paths to estimate risk metrics.
 */
/* global self */

export function initWorker(selfContext) {
    selfContext.onmessage = function (e) {
        const { type, payload } = e.data;

        if (type === 'RUN_SIMULATION') {
            const result = runSimulation(payload);
            selfContext.postMessage({ type: 'SIMULATION_COMPLETE', result });
        }
    };
}

if (typeof self !== 'undefined' && typeof window === 'undefined') {
    initWorker(self);
}

function runSimulation(config) {
    const { scenarios, volatility, horizon, paths = 10000 } = config;

    if (!scenarios.length || scenarios.some((s) => !s.growth || !s.valuation)) {
        return { error: 'Scenario data lacks growth/valuation blocks' };
    }

    // const dt = 1 / 252; // Daily steps
    // const steps = Math.floor(horizon * 252);
    const terminalValues = [];

    for (let i = 0; i < paths; i++) {
        // 1. Pick a scenario based on probability
        const scenario = pickScenario(scenarios);

        // 2. Determine drift (mu) from scenario CAGR
        // CAGR = (Terminal / Price)^(1/T) - 1
        // We approximate drift mu approx ln(1 + CAGR)
        // const drift = Math.log(1 + scenario.growth.epsCagr); // Simplified drift assumption linked to EPS growth

        // 3. Run Path
        // S_t = S_0 * exp( (mu - 0.5*sigma^2)*t + sigma*W_t )
        // For simple terminal value simulation, we can jump straight to T if we assume constant parameters
        // But to be "Monte Carlo", let's add random noise to the drift itself or volatility

        // Refined Approach:
        // Scenario gives us the "Fundamental" Terminal Value.
        // Market Price fluctuates around that fundamental path.
        // Let's simulate the Terminal Price distribution directly.

        // Terminal Price = Terminal EPS * Exit PE
        // We perturb EPS growth and Exit PE around the scenario means.

        const epsSigma = scenario.growth.epsCagrSigma || volatility * 0.5; // Assumption if missing
        const peSigma = scenario.valuation.exitPeSigma || volatility * 0.5;

        const sampledCagr = normalSample(scenario.growth.epsCagr, epsSigma / Math.sqrt(horizon));
        const sampledPe = normalSample(scenario.valuation.exitPe, peSigma);

        const terminalEps = config.eps * Math.pow(1 + sampledCagr, horizon);
        const terminalPrice = terminalEps * Math.max(1, sampledPe); // PE can't be negative usually

        terminalValues.push(terminalPrice);
    }

    terminalValues.sort((a, b) => a - b);

    // Compute Metrics: 5% tail (95% confidence) and 20% tail (80% confidence, per doc §3.2)
    const cvarIndex95 = Math.max(1, Math.floor(paths * 0.05));
    const cvarIndex80 = Math.max(1, Math.floor(paths * 0.2));
    let sum = 0;
    let cvarSum95 = 0;
    let cvarSum80 = 0;
    for (let i = 0; i < paths; i++) {
        const val = terminalValues[i];
        sum += val;
        if (i < cvarIndex95) {
            cvarSum95 += val;
        }
        if (i < cvarIndex80) {
            cvarSum80 += val;
        }
    }
    const mean = sum / paths;
    const median = terminalValues[Math.floor(paths * 0.5)];
    const VaR_95 = terminalValues[cvarIndex95];
    const CVaR_95 = cvarSum95 / cvarIndex95;
    const VaR_80 = terminalValues[cvarIndex80];
    const CVaR_80 = cvarSum80 / cvarIndex80;

    // Percentile trajectory fan chart across horizon years t = 0..horizon
    const initialPrice =
        typeof config.price === 'number' && config.price > 0 ? config.price : config.eps * 20;
    const fanSteps = Math.max(1, Math.min(10, Math.floor(horizon)));
    const fanChart = [];
    for (let step = 0; step <= fanSteps; step++) {
        const t = (step / fanSteps) * horizon;
        if (t === 0) {
            fanChart.push({
                t: 0,
                year: 0,
                median: initialPrice,
                p5: initialPrice,
                p25: initialPrice,
                p75: initialPrice,
                p95: initialPrice,
            });
        } else if (step === fanSteps) {
            fanChart.push({
                t,
                year: Number(t.toFixed(1)),
                median,
                p5: terminalValues[Math.floor(paths * 0.05)],
                p25: terminalValues[Math.floor(paths * 0.25)],
                p75: terminalValues[Math.floor(paths * 0.75)],
                p95: terminalValues[Math.floor(paths * 0.95)],
            });
        } else {
            // Interpolate distribution across trajectory
            const fraction = t / horizon;
            const stepValues = new Array(paths);
            for (let i = 0; i < paths; i++) {
                stepValues[i] = initialPrice * Math.pow(terminalValues[i] / initialPrice, fraction);
            }
            stepValues.sort((a, b) => a - b);
            fanChart.push({
                t,
                year: Number(t.toFixed(1)),
                median: stepValues[Math.floor(paths * 0.5)],
                p5: stepValues[Math.floor(paths * 0.05)],
                p25: stepValues[Math.floor(paths * 0.25)],
                p75: stepValues[Math.floor(paths * 0.75)],
                p95: stepValues[Math.floor(paths * 0.95)],
            });
        }
    }

    // Create Histogram Data
    const histogram = createHistogram(terminalValues, 50);

    return {
        mean,
        median,
        VaR_95,
        CVaR_95,
        VaR_80,
        CVaR_80,
        runCount: paths,
        asOf: new Date().toISOString(),
        initialPrice,
        fanChart,
        histogram,
        paths: terminalValues, // Optional: send back all paths if needed for scatter plot
    };
}

function secureRandom() {
    if (
        typeof self !== 'undefined' &&
        self.crypto &&
        typeof self.crypto.getRandomValues === 'function'
    ) {
        const array = new Uint32Array(1);
        self.crypto.getRandomValues(array);
        return array[0] / (0xffffffff + 1);
    }
    throw new Error('Secure random number generation is not supported in this environment');
}

function pickScenario(scenarios) {
    const r = secureRandom();
    let sum = 0;
    for (const s of scenarios) {
        sum += s.prob;
        if (r <= sum) {
            return s;
        }
    }
    return scenarios[scenarios.length - 1];
}

function normalSample(mean, stdDev) {
    const u1 = secureRandom();
    const u2 = secureRandom();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z * stdDev;
}

function createHistogram(data, bins) {
    const min = data[0];
    const max = data[data.length - 1];
    const range = max - min;
    const binSize = range / bins;
    const histogram = new Array(bins).fill(0);

    for (const val of data) {
        const binIndex = Math.min(bins - 1, Math.floor((val - min) / binSize));
        histogram[binIndex]++;
    }

    return {
        min,
        max,
        binSize,
        counts: histogram,
    };
}
