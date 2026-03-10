import * as dateUtils from '@utils/date.js';

const { getNyDate, isTradingDay, getTradingDayDate, parseYearFromDate } = dateUtils;

describe('Date Utils', () => {
    it('getNyDate should return a Date object', () => {
        const date = getNyDate();
        expect(date).toBeInstanceOf(Date);
    });

    describe('isTradingDay', () => {
        it('should return false for weekends', () => {
            const saturday = new Date(
                new Date('2024-12-01T12:00:00').toLocaleString('en-US', {
                    timeZone: 'America/New_York',
                })
            );
            const sunday = new Date(
                new Date('2024-12-08T12:00:00').toLocaleString('en-US', {
                    timeZone: 'America/New_York',
                })
            );
            expect(isTradingDay(saturday)).toBe(false);
            expect(isTradingDay(sunday)).toBe(false);
        });

        it('should return true for weekdays', () => {
            const monday = new Date(
                new Date('2024-12-02T12:00:00').toLocaleString('en-US', {
                    timeZone: 'America/New_York',
                })
            );
            const tuesday = new Date(
                new Date('2024-12-03T12:00:00').toLocaleString('en-US', {
                    timeZone: 'America/New_York',
                })
            );
            const wednesday = new Date(
                new Date('2024-12-04T12:00:00').toLocaleString('en-US', {
                    timeZone: 'America/New_York',
                })
            );
            const thursday = new Date(
                new Date('2024-12-05T12:00:00').toLocaleString('en-US', {
                    timeZone: 'America/New_York',
                })
            );
            const friday = new Date(
                new Date('2024-12-06T12:00:00').toLocaleString('en-US', {
                    timeZone: 'America/New_York',
                })
            );
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
            const monday = new Date(
                new Date('2024-12-02T12:00:00').toLocaleString('en-US', {
                    timeZone: 'America/New_York',
                })
            );
            const result = getTradingDayDate(monday);
            expect(result).toBe(monday);
        });

        it('should return null when passed a weekend day explicitly', () => {
            const saturday = new Date(
                new Date('2024-12-01T12:00:00').toLocaleString('en-US', {
                    timeZone: 'America/New_York',
                })
            );
            const result = getTradingDayDate(saturday);
            expect(result).toBe(null);
        });

        it('should cover both branches with explicit dates', () => {
            const weekday = new Date(
                new Date('2024-12-02T12:00:00').toLocaleString('en-US', {
                    timeZone: 'America/New_York',
                })
            );
            expect(getTradingDayDate(weekday)).toBe(weekday);
            const weekend = new Date(
                new Date('2024-12-01T12:00:00').toLocaleString('en-US', {
                    timeZone: 'America/New_York',
                })
            );
            expect(getTradingDayDate(weekend)).toBe(null);
        });
    });

    describe('parseYearFromDate', () => {
        it('should return null for null, undefined, and empty strings', () => {
            expect(parseYearFromDate(null)).toBe(null);
            expect(parseYearFromDate(undefined)).toBe(null);
            expect(parseYearFromDate('')).toBe(null);
        });

        it('should return null for invalid types (not string or Date)', () => {
            expect(parseYearFromDate(2024)).toBe(null);
            expect(parseYearFromDate(true)).toBe(null);
            expect(parseYearFromDate({})).toBe(null);
            expect(parseYearFromDate([])).toBe(null);
        });

        it('should extract UTC year from a valid Date object', () => {
            const date = new Date(Date.UTC(2023, 5, 15));
            expect(parseYearFromDate(date)).toBe(2023);

            const anotherDate = new Date(Date.UTC(1999, 11, 31));
            expect(parseYearFromDate(anotherDate)).toBe(1999);
        });

        it('should return NaN or correct behavior for an Invalid Date object (based on current implementation, Invalid Date returns NaN for getUTCFullYear())', () => {
            const invalidDate = new Date('invalid date string');
            expect(Number.isNaN(parseYearFromDate(invalidDate))).toBe(true);
        });

        it('should extract year from valid string formats starting with 4 digits', () => {
            expect(parseYearFromDate('2024')).toBe(2024);
            expect(parseYearFromDate('2024-01-01')).toBe(2024);
            expect(parseYearFromDate('  2023  ')).toBe(2023);
            expect(parseYearFromDate('2022Q1')).toBe(2022);
            expect(parseYearFromDate('2000/12/31')).toBe(2000);
            expect(parseYearFromDate(' 1999 random string')).toBe(1999);
        });

        it('should return null for string formats that do not start with a 4-digit year', () => {
            expect(parseYearFromDate('Q1 2024')).toBe(null);
            expect(parseYearFromDate('01-01-2023')).toBe(null);
            expect(parseYearFromDate('12/31/2000')).toBe(null);
            expect(parseYearFromDate('99')).toBe(null); // only 2 digits
            expect(parseYearFromDate('abc2024')).toBe(null);
            expect(parseYearFromDate('not a date')).toBe(null);
        });
    });
});
