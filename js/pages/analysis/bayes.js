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
            const likelihood = likelihoods[prior.id] || 0.5; // Default to uninformative
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
}
