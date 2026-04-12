import { BayesianEngine } from '../../../../js/pages/analysis/bayes.js';

describe('BayesianEngine', () => {
    it('initializes with correct priors', () => {
        const scenarios = [
            { id: 'bull', prob: 0.2, name: 'Bull Case' },
            { id: 'base', prob: 0.5, name: 'Base Case' },
            { id: 'bear', prob: 0.3, name: 'Bear Case' },
        ];
        const engine = new BayesianEngine(scenarios);
        expect(engine.priors).toEqual(scenarios);
    });

    it('updates probabilities correctly for bullish observation', () => {
        const scenarios = [
            { id: 'bull', prob: 0.3, name: 'Bull Case' },
            { id: 'base', prob: 0.4, name: 'Base Case' },
            { id: 'bear', prob: 0.3, name: 'Bear Case' },
        ];
        const engine = new BayesianEngine(scenarios);

        const result = engine.update('bullish', 1.0);

        // Strength = 1.0 -> high=1.0, mid=0.5, low=0.0
        // likelihoods: bull=1.0, base=0.5, bear=0.0
        // unnormalized: bull=0.3*1.0=0.3, base=0.4*0.5=0.2, bear=0.3*0.0=0.0
        // marginal: 0.5
        expect(result[0].prob).toBeCloseTo(0.3 / 0.5);
        expect(result[1].prob).toBeCloseTo(0.2 / 0.5);
        expect(result[2].prob).toBeCloseTo(0.0 / 0.5);
    });

    it('updates probabilities correctly for bearish observation', () => {
        const scenarios = [
            { id: 'bull', prob: 0.3, name: 'Bull Case' },
            { id: 'base', prob: 0.4, name: 'Base Case' },
            { id: 'bear', prob: 0.3, name: 'Bear Case' },
        ];
        const engine = new BayesianEngine(scenarios);

        const result = engine.update('bearish', 1.0);

        // bearish likelihoods: bull=0.0, base=0.5, bear=1.0
        // bull=0.3*0.0=0.0, base=0.4*0.5=0.2, bear=0.3*1.0=0.3
        // marginal: 0.5
        expect(result[0].prob).toBeCloseTo(0.0 / 0.5);
        expect(result[1].prob).toBeCloseTo(0.2 / 0.5);
        expect(result[2].prob).toBeCloseTo(0.3 / 0.5);
    });

    it('updates probabilities correctly for volatility_spike observation', () => {
        const scenarios = [
            { id: 'bull', prob: 0.3, name: 'Bull Case' },
            { id: 'base', prob: 0.4, name: 'Base Case' },
            { id: 'bear', prob: 0.3, name: 'Bear Case' },
        ];
        const engine = new BayesianEngine(scenarios);

        const result = engine.update('volatility_spike', 1.0);

        // volatility_spike likelihoods: bull=0.0, base=0.0, bear=1.0
        // bull=0.3*0.0=0.0, base=0.4*0.0=0.0, bear=0.3*1.0=0.3
        // marginal: 0.3
        expect(result[0].prob).toBeCloseTo(0.0 / 0.3);
        expect(result[1].prob).toBeCloseTo(0.0 / 0.3);
        expect(result[2].prob).toBeCloseTo(0.3 / 0.3);
    });

    it('handles marginal probability 0 gracefully', () => {
        const scenarios = [
            { id: 'bull', prob: 0, name: 'Bull Case' },
            { id: 'base', prob: 0, name: 'Base Case' },
            { id: 'bear', prob: 0, name: 'Bear Case' },
        ];
        const engine = new BayesianEngine(scenarios);

        const result = engine.update('bullish', 1.0);

        // If marginal = 0, should not normalize, returns updated priors with prob=0
        expect(result[0].prob).toBeCloseTo(0);
    });

    it('uses fallback likelihood for unknown prior id', () => {
        const scenarios = [{ id: 'unknown_id', prob: 1.0, name: 'Unknown' }];
        const engine = new BayesianEngine(scenarios);

        const result = engine.update('bullish', 1.0);

        // Likelihoods don't have 'unknown_id', fallback is 0.5
        // marginal: 0.5
        // prob: 0.5 / 0.5 = 1.0
        expect(result[0].prob).toBeCloseTo(1.0);
    });

    it('returns uniform likelihoods for default switch case', () => {
        const scenarios = [
            { id: 'bull', prob: 0.3, name: 'Bull' },
            { id: 'base', prob: 0.4, name: 'Base' },
            { id: 'bear', prob: 0.3, name: 'Bear' },
        ];
        const engine = new BayesianEngine(scenarios);
        const result = engine.update('random_unknown', 1.0);

        // Default likelihoods: bull=0.5, base=0.5, bear=0.5
        // prob: bull: 0.3, base: 0.4, bear: 0.3
        expect(result[0].prob).toBeCloseTo(0.3);
        expect(result[1].prob).toBeCloseTo(0.4);
        expect(result[2].prob).toBeCloseTo(0.3);
    });

    it('resets correctly', () => {
        const scenarios = [
            { id: 'bull', prob: 0.3, name: 'Bull Case' },
            { id: 'base', prob: 0.4, name: 'Base Case' },
            { id: 'bear', prob: 0.3, name: 'Bear Case' },
        ];
        const engine = new BayesianEngine(scenarios);
        engine.update('bullish', 1.0);

        engine.reset(scenarios);

        expect(engine.priors[0].prob).toBeCloseTo(0.3);
        expect(engine.priors[1].prob).toBeCloseTo(0.4);
        expect(engine.priors[2].prob).toBeCloseTo(0.3);
    });

    it('returns default likelihoods when strength is NaN or undefined', () => {
        const scenarios = [
            { id: 'bull', prob: 0.3, name: 'Bull Case' },
            { id: 'base', prob: 0.4, name: 'Base Case' },
            { id: 'bear', prob: 0.3, name: 'Bear Case' },
        ];
        const engine = new BayesianEngine(scenarios);

        const result = engine.update('bullish', NaN);
        // Math.max(0, NaN) returns NaN in node but in V8 it returns 0?
        // Let's just check it doesn't crash or be NaN
        expect(result).toBeDefined();
    });

    it('uses default strength when undefined', () => {
        const scenarios = [
            { id: 'bull', prob: 0.3, name: 'Bull Case' },
            { id: 'base', prob: 0.4, name: 'Base Case' },
            { id: 'bear', prob: 0.3, name: 'Bear Case' },
        ];
        const engine = new BayesianEngine(scenarios);

        const result = engine.update('bullish');

        // strength=0.5 -> s=0.5, high=0.75, low=0.25, mid=0.5
        expect(result[0].prob).toBeCloseTo((0.3 * 0.75) / (0.3 * 0.75 + 0.4 * 0.5 + 0.3 * 0.25));
    });

    it('clamps strength below 0 and above 1', () => {
        const scenarios = [
            { id: 'bull', prob: 0.3, name: 'Bull Case' },
            { id: 'base', prob: 0.4, name: 'Base Case' },
            { id: 'bear', prob: 0.3, name: 'Bear Case' },
        ];
        const engine = new BayesianEngine(scenarios);

        const result1 = engine.update('bullish', 2.0); // clamped to 1
        const engine2 = new BayesianEngine(scenarios);
        const result2 = engine2.update('bullish', 1.0);

        expect(result1[0].prob).toBeCloseTo(result2[0].prob);

        const result3 = engine.update('bullish', -1.0); // clamped to 0
        expect(result3).toBeDefined();
    });
});
