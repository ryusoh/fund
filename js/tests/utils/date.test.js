import * as dateUtils from '@utils/date.js';

const { getNyDate, isTradingDay, getTradingDayDate } = dateUtils;

describe('Date Utils', () => {
  it('getNyDate should return a Date object', () => {
    const date = getNyDate();
    expect(date).toBeInstanceOf(Date);
  });

  describe('isTradingDay', () => {
    it('should return false for weekends', () => {
      const saturday = new Date(new Date('2024-12-01T12:00:00').toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const sunday = new Date(new Date('2024-12-08T12:00:00').toLocaleString('en-US', { timeZone: 'America/New_York' }));
      expect(isTradingDay(saturday)).toBe(false);
      expect(isTradingDay(sunday)).toBe(false);
    });

    it('should return true for weekdays', () => {
      const monday = new Date(new Date('2024-12-02T12:00:00').toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const tuesday = new Date(new Date('2024-12-03T12:00:00').toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const wednesday = new Date(new Date('2024-12-04T12:00:00').toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const thursday = new Date(new Date('2024-12-05T12:00:00').toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const friday = new Date(new Date('2024-12-06T12:00:00').toLocaleString('en-US', { timeZone: 'America/New_York' }));
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
      const monday = new Date(new Date('2024-12-02T12:00:00').toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const result = getTradingDayDate(monday);
      expect(result).toBe(monday);
    });

    it('should return null when passed a weekend day explicitly', () => {
      const saturday = new Date(new Date('2024-12-01T12:00:00').toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const result = getTradingDayDate(saturday);
      expect(result).toBe(null);
    });

    it('should cover both branches with explicit dates', () => {
      const weekday = new Date(new Date('2024-12-02T12:00:00').toLocaleString('en-US', { timeZone: 'America/New_York' }));
      expect(getTradingDayDate(weekday)).toBe(weekday);
      const weekend = new Date(new Date('2024-12-01T12:00:00').toLocaleString('en-US', { timeZone: 'America/New_York' }));
      expect(getTradingDayDate(weekend)).toBe(null);
    });
  });
});

