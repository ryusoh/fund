import { easeInOutSine } from '@utils/easing.js';

describe('Easing Utils', () => {
    it('easeInOutSine should return the correct values', () => {
        expect(easeInOutSine(0)).toBe(0);
        expect(easeInOutSine(0.5)).toBeCloseTo(0.5);
        expect(easeInOutSine(1)).toBe(1);
    });
});
