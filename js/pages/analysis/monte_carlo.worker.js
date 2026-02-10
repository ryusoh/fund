/**
 * Monte Carlo Simulation Worker
 *
 * Runs geometric brownian motion paths to estimate risk metrics.
 */
/* global self */

self.onmessage = function (e) {
    const { type, payload } = e.data;

    if (type === 'RUN_SIMULATION') {
        const result = runSimulation(payload);
        self.postMessage({ type: 'SIMULATION_COMPLETE', result });
    }
};

function runSimulation(config) {
    const { scenarios, volatility, horizon, paths = 10000 } = config;

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

    // Compute Metrics
    const mean = terminalValues.reduce((a, b) => a + b, 0) / paths;
    const VaR_95 = terminalValues[Math.floor(paths * 0.05)];
    const CVaR_95 =
        terminalValues.slice(0, Math.floor(paths * 0.05)).reduce((a, b) => a + b, 0) /
        Math.floor(paths * 0.05);

    // Create Histogram Data
    const histogram = createHistogram(terminalValues, 50);

    return {
        mean,
        VaR_95,
        CVaR_95,
        histogram,
        paths: terminalValues, // Optional: send back all paths if needed for scatter plot
    };
}

function pickScenario(scenarios) {
    const r = Math.random();
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
    const u1 = Math.random();
    const u2 = Math.random();
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
