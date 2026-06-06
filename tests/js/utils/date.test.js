import * as dateUtils from '@utils/date.js';

const {
    getNyDate,
    isTradingDay,
    getTradingDayDate,
    toIsoDate,
    parseYearFromDate,
    parseQuarterToken,
    resolveQuarterRange,
    normalizeDateOnly,
} = dateUtils;

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

        describe('Market Holidays', () => {
            // Test static holidays and their observation rules
            it('should return false for New Years Day', () => {
                // January 1st
                const nyDay = new Date('2024-01-01T12:00:00-05:00');
                expect(isTradingDay(nyDay)).toBe(false);

                // Observed on Monday when Jan 1 is Sunday
                const nyObservedMon = new Date('2023-01-02T12:00:00-05:00');
                expect(isTradingDay(nyObservedMon)).toBe(false);

                // Observed on Friday when Dec 31 is Friday (Jan 1 is Saturday)
                const nyObservedFri = new Date('2021-12-31T12:00:00-05:00');
                expect(isTradingDay(nyObservedFri)).toBe(false);
            });

            it('should return false for Juneteenth', () => {
                // June 19th
                const juneteenth = new Date('2024-06-19T12:00:00-04:00');
                expect(isTradingDay(juneteenth)).toBe(false);

                // Observed on Monday
                const juneteenthObservedMon = new Date('2022-06-20T12:00:00-04:00');
                expect(isTradingDay(juneteenthObservedMon)).toBe(false);

                // Observed on Friday
                const juneteenthObservedFri = new Date('2021-06-18T12:00:00-04:00');
                expect(isTradingDay(juneteenthObservedFri)).toBe(false);
            });

            it('should return false for Independence Day', () => {
                // July 4th
                const july4 = new Date('2024-07-04T12:00:00-04:00');
                expect(isTradingDay(july4)).toBe(false);

                // Observed on Monday
                const july4ObservedMon = new Date('2021-07-05T12:00:00-04:00');
                expect(isTradingDay(july4ObservedMon)).toBe(false);

                // Observed on Friday
                const july4ObservedFri = new Date('2020-07-03T12:00:00-04:00');
                expect(isTradingDay(july4ObservedFri)).toBe(false);
            });

            it('should return false for Christmas', () => {
                // December 25th
                const christmas = new Date('2024-12-25T12:00:00-05:00');
                expect(isTradingDay(christmas)).toBe(false);

                // Observed on Monday
                const christmasObservedMon = new Date('2022-12-26T12:00:00-05:00');
                expect(isTradingDay(christmasObservedMon)).toBe(false);

                // Observed on Friday
                const christmasObservedFri = new Date('2021-12-24T12:00:00-05:00');
                expect(isTradingDay(christmasObservedFri)).toBe(false);
            });

            // Test dynamic holidays
            it('should return false for MLK Day', () => {
                // 3rd Monday in January
                const mlkDay = new Date('2024-01-15T12:00:00-05:00');
                expect(isTradingDay(mlkDay)).toBe(false);
            });

            it('should return false for Presidents Day', () => {
                // 3rd Monday in February
                const presidentsDay = new Date('2024-02-19T12:00:00-05:00');
                expect(isTradingDay(presidentsDay)).toBe(false);
            });

            it('should return false for Memorial Day', () => {
                // Last Monday in May
                const memorialDay = new Date('2024-05-27T12:00:00-04:00');
                expect(isTradingDay(memorialDay)).toBe(false);

                // Last Monday when May 31 is Monday
                const memorialDay31 = new Date('2021-05-31T12:00:00-04:00');
                expect(isTradingDay(memorialDay31)).toBe(false);
            });

            it('should return false for Labor Day', () => {
                // 1st Monday in September
                const laborDay = new Date('2024-09-02T12:00:00-04:00');
                expect(isTradingDay(laborDay)).toBe(false);
            });

            it('should return false for Thanksgiving', () => {
                // 4th Thursday in November
                const thanksgiving = new Date('2024-11-28T12:00:00-05:00');
                expect(isTradingDay(thanksgiving)).toBe(false);
            });

            it('should return false for Good Friday', () => {
                // Good Friday calculation based on Easter
                const goodFriday2024 = new Date('2024-03-29T12:00:00-04:00');
                expect(isTradingDay(goodFriday2024)).toBe(false);

                const goodFriday2023 = new Date('2023-04-07T12:00:00-04:00');
                expect(isTradingDay(goodFriday2023)).toBe(false);

                const goodFriday2025 = new Date('2025-04-18T12:00:00-04:00');
                expect(isTradingDay(goodFriday2025)).toBe(false);
            });
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

    describe('toIsoDate', () => {
        it('should return YYYY-MM-DD for a valid Date object', () => {
            const date = new Date('2024-05-15T10:30:00Z');
            expect(toIsoDate(date)).toBe('2024-05-15');
        });

        it('should return correct YYYY-MM-DD for a leap year date', () => {
            const leapDate = new Date('2024-02-29T10:30:00Z');
            expect(toIsoDate(leapDate)).toBe('2024-02-29');
        });

        it('should return correct YYYY-MM-DD for the end of the year', () => {
            const endOfYear = new Date('2023-12-31T23:59:59Z');
            expect(toIsoDate(endOfYear)).toBe('2023-12-31');
        });

        it('should return correct YYYY-MM-DD for early dates', () => {
            const earlyDate = new Date('1999-01-01T00:00:00Z');
            expect(toIsoDate(earlyDate)).toBe('1999-01-01');
        });

        it('should return an empty string for an Invalid Date object', () => {
            const invalidDate = new Date('not-a-date');
            expect(toIsoDate(invalidDate)).toBe('');
        });

        it('should return an empty string when passed null', () => {
            expect(toIsoDate(null)).toBe('');
        });

        it('should return an empty string when passed undefined', () => {
            expect(toIsoDate(undefined)).toBe('');
        });

        it('should return an empty string when passed a string instead of a Date object', () => {
            expect(toIsoDate('2024-05-15')).toBe('');
        });

        it('should return an empty string when passed a number', () => {
            expect(toIsoDate(1715769000000)).toBe('');
        });

        it('should return an empty string when passed a plain object', () => {
            expect(toIsoDate({})).toBe('');
        });

        it('should return an empty string when passed other non-Date types', () => {
            expect(toIsoDate(NaN)).toBe('');
            expect(toIsoDate(true)).toBe('');
            expect(toIsoDate(false)).toBe('');
            expect(toIsoDate([])).toBe('');
            expect(toIsoDate(() => {})).toBe('');
            expect(toIsoDate(Symbol('sym'))).toBe('');
            expect(toIsoDate(BigInt(1))).toBe('');
            expect(toIsoDate(new Error('test'))).toBe('');
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

        it('should return NaN or correct behavior for an Invalid Date object', () => {
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

    it('should return null if parsed year is somehow not finite', () => {
        const spy = jest.spyOn(Number, 'isFinite').mockReturnValue(false);
        try {
            expect(parseYearFromDate('2024')).toBe(null);
        } finally {
            spy.mockRestore();
        }
    });

    describe('parseQuarterToken', () => {
        it('should parse an explicit quarter token', () => {
            expect(parseQuarterToken('2024q1')).toEqual({ year: 2024, quarter: 1 });
            expect(parseQuarterToken(' 2023Q4 ')).toEqual({ year: 2023, quarter: 4 });
            expect(parseQuarterToken('1999q2')).toEqual({ year: 1999, quarter: 2 });
        });

        it('should parse a simple quarter token with fallback year', () => {
            expect(parseQuarterToken('q1', 2024)).toEqual({ year: 2024, quarter: 1 });
            expect(parseQuarterToken(' Q3 ', 2023)).toEqual({ year: 2023, quarter: 3 });
        });

        it('should return null for non-string tokens', () => {
            expect(parseQuarterToken(null)).toBe(null);
            expect(parseQuarterToken(undefined)).toBe(null);
            expect(parseQuarterToken(2024)).toBe(null);
            expect(parseQuarterToken({})).toBe(null);
        });

        it('should return null for invalid token formats', () => {
            expect(parseQuarterToken('2024q5')).toBe(null);
            expect(parseQuarterToken('q0', 2024)).toBe(null);
            expect(parseQuarterToken('2024 q1')).toBe(null);
            expect(parseQuarterToken('2024-q1')).toBe(null);
            expect(parseQuarterToken('not a token')).toBe(null);
            expect(parseQuarterToken('')).toBe(null);
        });

        it('should return null for simple quarter tokens with non-finite fallback year', () => {
            expect(parseQuarterToken('q1', null)).toBe(null);
            expect(parseQuarterToken('q1', undefined)).toBe(null);
            expect(parseQuarterToken('q1', '2024')).toBe(null);
            expect(parseQuarterToken('q1', NaN)).toBe(null);
            expect(parseQuarterToken('q1', Infinity)).toBe(null);
        });
    });

    describe('resolveQuarterRange', () => {
        it('should return correct range for mode full (default)', () => {
            expect(resolveQuarterRange(2024, 1)).toEqual({
                from: '2024-01-01',
                to: '2024-03-31',
            });
            expect(resolveQuarterRange(2023, 2, 'full')).toEqual({
                from: '2023-04-01',
                to: '2023-06-30',
            });
            expect(resolveQuarterRange(2023, 3)).toEqual({
                from: '2023-07-01',
                to: '2023-09-30',
            });
            expect(resolveQuarterRange(2023, 4)).toEqual({
                from: '2023-10-01',
                to: '2023-12-31',
            });
            // leap year Q1 end date should be March 31 anyway, but Q1 has 91 days
            expect(resolveQuarterRange(2024, 1)).toEqual({
                from: '2024-01-01',
                to: '2024-03-31',
            });
        });

        it('should return correct range for mode start', () => {
            expect(resolveQuarterRange(2024, 1, 'start')).toEqual({
                from: '2024-01-01',
                to: null,
            });
            expect(resolveQuarterRange(2023, 4, 'start')).toEqual({
                from: '2023-10-01',
                to: null,
            });
        });

        it('should return correct range for mode end', () => {
            expect(resolveQuarterRange(2024, 1, 'end')).toEqual({
                from: null,
                to: '2024-03-31',
            });
            expect(resolveQuarterRange(2023, 4, 'end')).toEqual({
                from: null,
                to: '2023-12-31',
            });
        });

        it('should return nulls if year or quarter is not a finite number', () => {
            const nullRange = { from: null, to: null };
            expect(resolveQuarterRange(null, 1)).toEqual(nullRange);
            expect(resolveQuarterRange(2024, null)).toEqual(nullRange);
            expect(resolveQuarterRange('2024', 1)).toEqual(nullRange);
            expect(resolveQuarterRange(2024, '1')).toEqual(nullRange);
            expect(resolveQuarterRange(NaN, 1)).toEqual(nullRange);
            expect(resolveQuarterRange(2024, Infinity)).toEqual(nullRange);
            expect(resolveQuarterRange(undefined, undefined)).toEqual(nullRange);
        });
    });

    describe('normalizeDateOnly', () => {
        it('should return null for falsy inputs', () => {
            expect(normalizeDateOnly(null)).toBe(null);
            expect(normalizeDateOnly(undefined)).toBe(null);
            expect(normalizeDateOnly('')).toBe(null);
            expect(normalizeDateOnly(0)).toBe(null);
            expect(normalizeDateOnly(false)).toBe(null);
        });

        it('should return null for invalid date inputs', () => {
            expect(normalizeDateOnly('invalid-date')).toBe(null);
            expect(normalizeDateOnly(new Date('invalid-date'))).toBe(null);
        });

        it('should normalize a valid Date object to midnight local time', () => {
            const date = new Date(2024, 0, 15, 14, 30, 45, 500); // 2024-01-15 14:30:45.500
            const normalized = normalizeDateOnly(date);

            expect(normalized.getFullYear()).toBe(2024);
            expect(normalized.getMonth()).toBe(0);
            expect(normalized.getDate()).toBe(15);
            expect(normalized.getHours()).toBe(0);
            expect(normalized.getMinutes()).toBe(0);
            expect(normalized.getSeconds()).toBe(0);
            expect(normalized.getMilliseconds()).toBe(0);

            // ensure we didn't mutate the original input date
            expect(date.getHours()).toBe(14);
        });

        it('should normalize a valid date string to midnight local time', () => {
            // Note: date strings parse behavior can vary with timezones depending on format
            // In a local browser env without UTC markers, they might map to local time.
            const dateString = '2024-05-20T10:15:30Z';
            const normalized = normalizeDateOnly(dateString);

            // Time should be exactly midnight
            expect(normalized.getHours()).toBe(0);
            expect(normalized.getMinutes()).toBe(0);
            expect(normalized.getSeconds()).toBe(0);
            expect(normalized.getMilliseconds()).toBe(0);
        });

        it('should handle numeric timestamp inputs appropriately', () => {
            const timestamp = new Date(2023, 11, 25, 8, 0, 0).getTime();
            const normalized = normalizeDateOnly(timestamp);

            expect(normalized.getFullYear()).toBe(2023);
            expect(normalized.getMonth()).toBe(11);
            expect(normalized.getDate()).toBe(25);
            expect(normalized.getHours()).toBe(0);
            expect(normalized.getMinutes()).toBe(0);
        });
    });
});
