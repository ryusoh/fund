import { drawRollingChart } from '../../../../../js/transactions/chart/renderers/rolling.js';

describe('rolling returns chart renderer', () => {
    it('exports correctly', () => {
        expect(typeof drawRollingChart).toBe('function');
    });
});
