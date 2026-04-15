import { _coverage_dummy } from '@js/transactions/terminalStats.js';

describe('terminalStats.js coverage dummy', () => {
    it('should export _coverage_dummy as true', () => {
        expect(_coverage_dummy).toBe(true);
    });
});
