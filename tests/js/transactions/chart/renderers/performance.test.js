import { drawPerformanceChart } from '../../../../../js/transactions/chart/renderers/performance.js';

describe('performance chart renderer', () => {
    it('exports correctly', () => {
        expect(typeof drawPerformanceChart).toBe('function');
    });
});
