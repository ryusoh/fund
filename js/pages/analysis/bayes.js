/**
 * Compute Brier score for resolved predictions.
 * Score = (1/N) * sum((probability - outcome)^2)
 * Lower is better: 0 is perfect calibration, 0.25 is random chance on 50/50.
 *
 * @param {Array<Object>} predictions - Array of prediction objects
 * @returns {{ count: number, brierScore: number, resolved: Array<Object> } | null}
 */
export function computeBrierScore(predictions = []) {
    if (!Array.isArray(predictions) || predictions.length === 0) {
        return null;
    }

    const resolved = predictions.filter(
        (p) => p && p.resolved === true && p.outcome !== null && p.outcome !== undefined
    );
    if (resolved.length === 0) {
        return null;
    }

    let sumSquaredErrors = 0;
    for (const item of resolved) {
        const prob = typeof item.probability === 'number' ? item.probability : 0.5;
        const outcome = item.outcome === true || item.outcome === 1 ? 1 : 0;
        const error = prob - outcome;
        sumSquaredErrors += error * error;
    }

    const brierScore = sumSquaredErrors / resolved.length;
    return {
        count: resolved.length,
        brierScore: Number(brierScore.toFixed(4)),
        resolved,
    };
}
