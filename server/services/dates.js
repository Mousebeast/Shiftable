'use strict';

/**
 * Date-string helpers.
 *
 * Two distinct cases, and mixing them is the bug this module exists to prevent:
 *
 * 1. Manipulating a stored date string (week_start_date, shift date). These are
 *    timezone-agnostic calendar dates. Construct with 'T00:00:00Z', mutate with
 *    setUTCDate, read with toISOString — UTC in, UTC math, UTC out. Self-consistent
 *    and correct in every timezone. Most of server/db/schedule.js already does this.
 *
 * 2. Deriving a date from *now* ("today", "this week's start"). The answer depends
 *    on the viewer's timezone, so toISOString() is wrong: it reports the UTC date,
 *    which after ~7pm in a UTC- timezone is already tomorrow. Use localDateString().
 *
 * The failure only appears off UTC, so it will not reproduce on a UTC server —
 * it reaches self-hosted installs instead.
 *
 * ── Week start ───────────────────────────────────────────────────────────────
 *
 * Which weekday a week begins on is fixed at install time via WEEK_START in .env
 * ('monday' — the default — or 'sunday'). It is read from the environment and is
 * deliberately NOT a runtime setting: schedules, availability, and week_events are
 * all keyed to week-start dates, and `day_of_week` columns store an offset from the
 * week start (0 = first day of the week). Flipping it after data exists would leave
 * two incompatible keying schemes in the same columns. See the note in
 * routes/admin.js explaining why it must never reach app_settings.
 */

/** Parse a WEEK_START value into a JS getDay() index. Monday=1, Sunday=0. */
function parseWeekStart(value) {
  return String(value || '').trim().toLowerCase().startsWith('sun') ? 0 : 1;
}

/** JS getDay() index of the configured first day of the week. */
const WEEK_START_DOW = parseWeekStart(process.env.WEEK_START);

/** Human-readable name of the configured first day — used in validation messages. */
const WEEK_START_NAME = WEEK_START_DOW === 0 ? 'Sunday' : 'Monday';

/** Short day labels in configured week order, index 0 = first day of the week. */
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  .slice(WEEK_START_DOW)
  .concat(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].slice(0, WEEK_START_DOW));

/**
 * Days to subtract from a weekday to reach the start of its week.
 * `day` and `startDow` are both JS getDay() indices (0=Sun … 6=Sat).
 */
function offsetToWeekStart(day, startDow) {
  return -((day - startDow + 7) % 7);
}

/**
 * Format a Date as YYYY-MM-DD using local calendar components.
 * Use for anything derived from the current moment.
 */
function localDateString(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * The start of the week containing `d`, as YYYY-MM-DD in local time.
 * Mirrors getWeekStartOf in client/src/lib/week.js — keep them in step.
 */
function localWeekStartOf(d, startDow = WEEK_START_DOW) {
  const start = new Date(d);
  start.setDate(d.getDate() + offsetToWeekStart(d.getDay(), startDow));
  return localDateString(start);
}

/**
 * Add `days` to a stored YYYY-MM-DD date string, returning YYYY-MM-DD.
 * Pure calendar arithmetic — no local-time involvement in either direction.
 */
function addDaysToDateString(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The start of the week containing a stored YYYY-MM-DD date string.
 */
function weekStartOfDateString(dateStr, startDow = WEEK_START_DOW) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + offsetToWeekStart(d.getUTCDay(), startDow));
  return d.toISOString().slice(0, 10);
}

/**
 * The `day_of_week` index of a stored YYYY-MM-DD date string — an offset from the
 * configured week start, where 0 is the first day of the week. This is the schema
 * convention for every day_of_week column.
 */
function dayIndexOfDateString(dateStr, startDow = WEEK_START_DOW) {
  const day = new Date(dateStr + 'T00:00:00Z').getUTCDay();
  return (day - startDow + 7) % 7;
}

/**
 * True when a stored YYYY-MM-DD date string falls on the configured week start.
 * Use for the `effective_from` and `week` parameter validations.
 */
function isWeekStartDateString(dateStr, startDow = WEEK_START_DOW) {
  return new Date(dateStr + 'T00:00:00Z').getUTCDay() === startDow;
}

module.exports = {
  WEEK_START_DOW,
  WEEK_START_NAME,
  DAY_NAMES,
  parseWeekStart,
  localDateString,
  localWeekStartOf,
  addDaysToDateString,
  weekStartOfDateString,
  dayIndexOfDateString,
  isWeekStartDateString,
};
