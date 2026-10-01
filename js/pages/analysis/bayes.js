/**
 * Bayesian Inference Module for Fermat-Pascal-Kelly System
 *
 * Handles updating scenario probabilities based on new observations.
 */

export class BayesianEngine {
    constructor(scenarios) {
        this.priors = scenarios.map((s) => ({
            id: s.id,
            prob: s.prob,
            name: s.name,
        }));
    }

    /**
     * Update probabilities based on an observation.
     *
     * @param {string} observationType - 'bullish', 'bearish', 'neutral'
     * @param {number} strength - 0 to 1, how strong the evidence is
     */
    update(observationType, strength = 0.5) {
        const likelihoods = this.getLikelihoods(observationType, strength);

        let marginalLikelihood = 0;
        const posteriors = this.priors.map((prior) => {
            const likelihood = likelihoods[prior.id] !== undefined ? likelihoods[prior.id] : 0.5; // Default to uninformative
            const unnormalized = prior.prob * likelihood;
            marginalLikelihood += unnormalized;
            return { ...prior, unnormalized };
        });

        // Normalize
        if (marginalLikelihood > 0) {
            this.priors = posteriors.map((p) => ({
                ...p,
                prob: p.unnormalized / marginalLikelihood,
            }));
        }

        return this.priors;
    }

    /**
     * Define likelihood P(Observation | Scenario)
     */
    getLikelihoods(type, strength) {
        // Base likelihoods for a "standard" signal of that type
        // strength modifies how extreme the likelihoods are.
        // strength 0 => uniform (no update), strength 1 => certainty

        const s = Math.max(0, Math.min(1, strength));
        const high = 0.5 + 0.5 * s; // e.g., 0.8 for s=0.6
        const low = 0.5 - 0.5 * s; // e.g., 0.2 for s=0.6
        const mid = 0.5;

        switch (type) {
            case 'bullish':
                return {
                    bull: high,
                    base: mid,
                    bear: low,
                };
            case 'bearish':
                return {
                    bull: low,
                    base: mid,
                    bear: high,
                };
            case 'volatility_spike':
                return {
                    bull: low,
                    base: low,
                    bear: high,
                };
            default:
                return { bull: 0.5, base: 0.5, bear: 0.5 };
        }
    }

    reset(scenarios) {
        this.priors = scenarios.map((s) => ({
            id: s.id,
            prob: s.prob,
            name: s.name,
        }));
    }

    /**
     * Replay a sequential list of evidence items against priors.
     *
     * @param {Array<Object>} evidenceList - List of evidence objects
     * @returns {Object} { history: Array<Object>, currentPosteriors: Array<Object> }
     */
    replay(evidenceList = []) {
        const history = [];
        if (!Array.isArray(evidenceList) || evidenceList.length === 0) {
            return {
                history: [],
                currentPosteriors: this.priors.map((p) => ({ ...p })),
            };
        }

        for (let i = 0; i < evidenceList.length; i++) {
            const item = evidenceList[i];
            const direction = item.direction || 'neutral';
            const strength = typeof item.strength === 'number' ? item.strength : 0.5;
            const updated = this.update(direction, strength);
            history.push({
                index: i,
                date: item.date || null,
                claim: item.claim || '',
                sourceUrl: item.source_url || item.sourceUrl || '',
                direction,
                strength,
                thesisCommitRef: item.thesis_commit_ref || item.thesisCommitRef || null,
                valid_to: item.valid_to || item.validTo || null,
                valid_from: item.valid_from || item.validFrom || null,
                posteriors: updated.map((p) => ({ ...p })),
            });
        }

        return {
            history,
            currentPosteriors: this.priors.map((p) => ({ ...p })),
        };
    }

    /**
     * Compute Brier score for resolved predictions.
     * Score = (1/N) * sum((probability - outcome)^2)
     * Lower is better: 0 is perfect calibration, 0.25 is random chance on 50/50.
     *
     * @param {Array<Object>} predictions - Array of prediction objects
     * @returns {Object|null}
     */
    static computeBrierScore(predictions = []) {
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

    /**
     * Parse JSONL text into array of objects.
     *
     * @param {string} text - JSONL string
     * @returns {Array<Object>}
     */
    static parseJsonl(text = '') {
        if (!text || typeof text !== 'string') {
            return [];
        }
        return text
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && !line.startsWith('#'))
            .map((line) => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter((item) => item !== null);
    }

    /**
     * Filter evidence records to only those valid as of the given date.
     * An item is considered superseded if valid_to is set and valid_to < asOf.
     *
     * @param {Array<Object>} evidenceList - List of evidence objects
     * @param {string|Date} [asOf] - ISO date string or Date object
     * @returns {Array<Object>}
     */
    static filterValidEvidence(evidenceList, asOf) {
        return filterValidEvidence(evidenceList, asOf);
    }
}

/**
 * Filter evidence records to only those valid as of the given date.
 * An item is considered superseded if valid_to is set and valid_to < asOf.
 *
 * @param {Array<Object>} evidenceList - List of evidence objects
 * @param {string|Date} [asOf] - ISO date string or Date object
 * @returns {Array<Object>}
 */
export function filterValidEvidence(evidenceList, asOf) {
    if (!Array.isArray(evidenceList)) {
        return [];
    }
    const today =
        typeof asOf === 'string'
            ? asOf
            : asOf instanceof Date
              ? asOf.toISOString().slice(0, 10)
              : new Date().toISOString().slice(0, 10);

    return evidenceList.filter((item) => {
        if (!item || typeof item !== 'object') {
            return false;
        }
        const validTo = item.valid_to || item.validTo;
        if (validTo && validTo < today) {
            return false;
        }
        return true;
    });
}
