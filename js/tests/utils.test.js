import { getBlueColorForSlice, hexToRgba } from '../utils/colors.js';
import { getNyDate } from '../utils/date.js';
import { easeInOutSine } from '../utils/easing.js';

describe('utility functions', () => {
  describe('colors.js', () => {
    it('getBlueColorForSlice should return a color from the palette', () => {
      const color = getBlueColorForSlice(0);
      expect(color).toMatch(/^#/);
    });

    it('hexToRgba should convert hex to rgba correctly', () => {
      const rgba = hexToRgba('#FFFFFF', 0.5);
      expect(rgba).toBe('rgba(255, 255, 255, 0.5)');
    });
  });

  describe('date.js', () => {
    it('getNyDate should return a Date object', () => {
      const date = getNyDate();
      expect(date).toBeInstanceOf(Date);
    });
  });

  describe('easing.js', () => {
    it('easeInOutSine should return the correct values', () => {
      expect(easeInOutSine(0)).toBe(0);
      expect(easeInOutSine(0.5)).toBeCloseTo(0.5);
      expect(easeInOutSine(1)).toBe(1);
    });
  });
});
