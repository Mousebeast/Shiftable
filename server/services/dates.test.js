'use strict';

const {
  WEEK_START_DOW,
  DAY_NAMES,
  parseWeekStart,
  localDateString,
  localWeekStartOf,
  addDaysToDateString,
  weekStartOfDateString,
  dayIndexOfDateString,
  isWeekStartDateString,
} = require('./dates');

// June 2026: the 1st is a Monday, the 7th a Sunday.
const MON = 1; // JS getDay() index for Monday
const SUN = 0;

describe('dates helpers', () => {
  describe('parseWeekStart', () => {
    test('defaults to Monday when unset', () => {
      expect(parseWeekStart(undefined)).toBe(MON);
      expect(parseWeekStart('')).toBe(MON);
    });

    test('recognises sunday, case- and whitespace-insensitive', () => {
      expect(parseWeekStart('sunday')).toBe(SUN);
      expect(parseWeekStart('  SUNDAY ')).toBe(SUN);
      expect(parseWeekStart('Sun')).toBe(SUN);
    });

    test('anything unrecognised falls back to Monday', () => {
      expect(parseWeekStart('monday')).toBe(MON);
      expect(parseWeekStart('tuesday')).toBe(MON);
      expect(parseWeekStart('nonsense')).toBe(MON);
    });
  });

  describe('module configuration', () => {
    test('defaults to Monday under the test environment', () => {
      expect(WEEK_START_DOW).toBe(MON);
    });

    test('DAY_NAMES starts on the configured day', () => {
      expect(DAY_NAMES).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    });
  });

  describe('localDateString', () => {
    test('formats from local components, not UTC', () => {
      // 2026-06-01 21:30 local. In any UTC- zone this instant is already
      // 2026-06-02 in UTC, which is exactly what toISOString() would report.
      const d = new Date(2026, 5, 1, 21, 30, 0);
      expect(localDateString(d)).toBe('2026-06-01');
    });

    test('pads single-digit month and day', () => {
      expect(localDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
    });

    test('handles the last instant of a day', () => {
      expect(localDateString(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
    });
  });

  describe('localWeekStartOf — Monday start', () => {
    test('returns the same day when given a Monday', () => {
      expect(localWeekStartOf(new Date(2026, 5, 1), MON)).toBe('2026-06-01');
    });

    test('walks back to Monday from midweek', () => {
      expect(localWeekStartOf(new Date(2026, 5, 4), MON)).toBe('2026-06-01'); // Thu
    });

    test('Sunday wraps back to the previous Monday, not forward', () => {
      expect(localWeekStartOf(new Date(2026, 5, 7), MON)).toBe('2026-06-01');
    });

    test('crosses a month boundary', () => {
      expect(localWeekStartOf(new Date(2026, 6, 1), MON)).toBe('2026-06-29'); // Wed Jul 1
    });

    test('late-evening instant still reports the local week', () => {
      expect(localWeekStartOf(new Date(2026, 5, 7, 23, 0, 0), MON)).toBe('2026-06-01');
    });
  });

  describe('localWeekStartOf — Sunday start', () => {
    test('returns the same day when given a Sunday', () => {
      expect(localWeekStartOf(new Date(2026, 5, 7), SUN)).toBe('2026-06-07');
    });

    test('Monday belongs to the week that began the day before', () => {
      expect(localWeekStartOf(new Date(2026, 5, 1), SUN)).toBe('2026-05-31');
    });

    test('Saturday is the last day of its week', () => {
      expect(localWeekStartOf(new Date(2026, 5, 6), SUN)).toBe('2026-05-31');
    });

    test('late-evening instant still reports the local week', () => {
      expect(localWeekStartOf(new Date(2026, 5, 6, 23, 0, 0), SUN)).toBe('2026-05-31');
    });
  });

  describe('addDaysToDateString', () => {
    test('adds within a month', () => {
      expect(addDaysToDateString('2026-06-01', 6)).toBe('2026-06-07');
    });

    test('crosses a month boundary', () => {
      expect(addDaysToDateString('2026-06-29', 6)).toBe('2026-07-05');
    });

    test('crosses a year boundary', () => {
      expect(addDaysToDateString('2026-12-30', 3)).toBe('2027-01-02');
    });

    test('handles a leap day', () => {
      expect(addDaysToDateString('2028-02-28', 1)).toBe('2028-02-29');
    });

    test('adding zero is identity', () => {
      expect(addDaysToDateString('2026-06-01', 0)).toBe('2026-06-01');
    });
  });

  describe('weekStartOfDateString — Monday start', () => {
    test('returns the same day when given a Monday', () => {
      expect(weekStartOfDateString('2026-06-01', MON)).toBe('2026-06-01');
    });

    test('walks back from midweek', () => {
      expect(weekStartOfDateString('2026-06-04', MON)).toBe('2026-06-01');
    });

    test('Sunday wraps back to the previous Monday', () => {
      expect(weekStartOfDateString('2026-06-07', MON)).toBe('2026-06-01');
    });

    test('crosses a month boundary', () => {
      expect(weekStartOfDateString('2026-07-01', MON)).toBe('2026-06-29');
    });

    test('is stable when applied twice', () => {
      const once = weekStartOfDateString('2026-06-04', MON);
      expect(weekStartOfDateString(once, MON)).toBe(once);
    });
  });

  describe('weekStartOfDateString — Sunday start', () => {
    test('returns the same day when given a Sunday', () => {
      expect(weekStartOfDateString('2026-06-07', SUN)).toBe('2026-06-07');
    });

    test('Monday belongs to the week that began the day before', () => {
      expect(weekStartOfDateString('2026-06-01', SUN)).toBe('2026-05-31');
    });

    test('Saturday is the last day of its week', () => {
      expect(weekStartOfDateString('2026-06-06', SUN)).toBe('2026-05-31');
    });

    test('is stable when applied twice', () => {
      const once = weekStartOfDateString('2026-06-04', SUN);
      expect(weekStartOfDateString(once, SUN)).toBe(once);
    });
  });

  describe('dayIndexOfDateString', () => {
    test('Monday start: Monday is 0 and Sunday is 6', () => {
      expect(dayIndexOfDateString('2026-06-01', MON)).toBe(0); // Mon
      expect(dayIndexOfDateString('2026-06-04', MON)).toBe(3); // Thu
      expect(dayIndexOfDateString('2026-06-07', MON)).toBe(6); // Sun
    });

    test('Sunday start: Sunday is 0 and Saturday is 6', () => {
      expect(dayIndexOfDateString('2026-06-07', SUN)).toBe(0); // Sun
      expect(dayIndexOfDateString('2026-06-04', SUN)).toBe(4); // Thu
      expect(dayIndexOfDateString('2026-06-06', SUN)).toBe(6); // Sat
    });

    test('agrees with the week start it is measured from', () => {
      for (const startDow of [MON, SUN]) {
        for (const date of ['2026-06-01', '2026-06-04', '2026-06-07', '2026-07-01']) {
          const start = weekStartOfDateString(date, startDow);
          const index = dayIndexOfDateString(date, startDow);
          expect(addDaysToDateString(start, index)).toBe(date);
        }
      }
    });
  });

  describe('isWeekStartDateString', () => {
    test('Monday start accepts only Mondays', () => {
      expect(isWeekStartDateString('2026-06-01', MON)).toBe(true);
      expect(isWeekStartDateString('2026-06-07', MON)).toBe(false);
    });

    test('Sunday start accepts only Sundays', () => {
      expect(isWeekStartDateString('2026-06-07', SUN)).toBe(true);
      expect(isWeekStartDateString('2026-06-01', SUN)).toBe(false);
    });
  });
});
