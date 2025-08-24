import { getBlueColorForSlice, hexToRgba } from '../utils/colors.js';
import * as dateUtils from '../utils/date.js';
import { easeInOutSine } from '../utils/easing.js';

const { getNyDate, isTradingDay, getTradingDayDate } = dateUtils;

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

    describe('isTradingDay', () => {
      it('should return false for weekends', () => {
        // Using specific dates that are definitely Saturday and Sunday
        const saturday = new Date('2024-12-01'); // Saturday
        const sunday = new Date('2024-12-02'); // Sunday
        expect(isTradingDay(saturday)).toBe(false);
        expect(isTradingDay(sunday)).toBe(false);
      });

      it('should return true for weekdays', () => {
        // Using specific dates that are definitely weekdays
        const monday = new Date('2024-12-03'); // Monday
        const tuesday = new Date('2024-12-04'); // Tuesday
        const wednesday = new Date('2024-12-05'); // Wednesday
        const thursday = new Date('2024-12-06'); // Thursday
        const friday = new Date('2024-12-07'); // Friday
        
        expect(isTradingDay(monday)).toBe(true);
        expect(isTradingDay(tuesday)).toBe(true);
        expect(isTradingDay(wednesday)).toBe(true);
        expect(isTradingDay(thursday)).toBe(true);
        expect(isTradingDay(friday)).toBe(true);
      });
    });

    describe('getTradingDayDate', () => {
      it('should return a Date object or null', () => {
        const result = getTradingDayDate();
        expect(result === null || result instanceof Date).toBe(true);
      });

      it('should return null on weekends and date on weekdays', () => {
        // This test exercises both branches of the ternary operator
        // by calling the function and checking its behavior
        const result = getTradingDayDate();
        const currentDate = getNyDate();
        const isCurrentlyTradingDay = isTradingDay(currentDate);
        
        if (isCurrentlyTradingDay) {
          expect(result).toBeInstanceOf(Date);
        } else {
          expect(result).toBe(null);
        }
      });

      it('should return date when passed a trading day explicitly', () => {
        const monday = new Date('2024-12-03'); // Monday
        const result = getTradingDayDate(monday);
        expect(result).toBe(monday);
      });

      it('should return null when passed a weekend day explicitly', () => {
        const saturday = new Date('2024-12-01'); // Saturday
        const result = getTradingDayDate(saturday);
        expect(result).toBe(null);
      });

      it('should cover both branches with explicit dates', () => {
        // Test the true branch of the ternary operator
        const weekday = new Date('2024-12-03'); // Monday
        expect(getTradingDayDate(weekday)).toBe(weekday);
        
        // Test the false branch of the ternary operator
        const weekend = new Date('2024-12-01'); // Saturday
        expect(getTradingDayDate(weekend)).toBe(null);
      });


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
