import { computeBrierScore } from '../../../../js/pages/analysis/bayes.js';

describe('computeBrierScore', () => {
    it('returns null when predictions are missing or unresolved', () => {
        expect(computeBrierScore([])).toBeNull();
        expect(computeBrierScore(null)).toBeNull();
        expect(
            computeBrierScore([
                { id: 'p1', probability: 0.7, resolved: false, outcome: null },
                { id: 'p2', probability: 0.5, resolved: true, outcome: null },
            ])
        ).toBeNull();
    });

    it('computes mean squared calibration error across resolved predictions', () => {
        const result = computeBrierScore([
            { id: 'p1', probability: 0.8, resolved: true, outcome: true },
            { id: 'p2', probability: 0.2, resolved: true, outcome: false },
            { id: 'p3', probability: 0.6, resolved: false, outcome: null },
        ]);
        expect(result.count).toBe(2);
        expect(result.brierScore).toBeCloseTo(0.04, 4);
        expect(result.resolved).toHaveLength(2);
    });

    it('falls back to 0.5 probability when probability is non-numeric', () => {
        const result = computeBrierScore([{ id: 'p1', resolved: true, outcome: 1 }]);
        expect(result.brierScore).toBeCloseTo(0.25, 4);
    });
});
