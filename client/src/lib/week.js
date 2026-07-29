/**
 * Week-start configuration for the client.
 *
 * The first day of the week is fixed at install time via WEEK_START in .env and
 * injected into index.html as window.__WEEK_START_DOW__ — by Express in production
 * (server/index.js) and by a dev-only Vite plugin in development (vite.config.js).
 * It is read synchronously here, at module evaluation, so day columns render in the
 * right order on first paint with no loading gate.
 *
 * Mirrors server/services/dates.js — keep the two in step.
 *
 * `day_of_week` values everywhere in the schema are an offset from the week start,
 * where 0 is the first day of the week. They are NOT absolute weekday numbers.
 */

const ALL_DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALL_DAYS_LONG = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/** JS getDay() index of the first day of the week. Monday=1 (default), Sunday=0. */
export const WEEK_START_DOW =
  typeof window !== 'undefined' && window.__WEEK_START_DOW__ === 0 ? 0 : 1;

/** Full name of the first day — for help text and validation messages. */
export const WEEK_START_NAME = ALL_DAYS_LONG[WEEK_START_DOW];

function rotate(arr) {
  return arr.slice(WEEK_START_DOW).concat(arr.slice(0, WEEK_START_DOW));
}

/** Short day labels in week order. Index matches `day_of_week`. */
export const DAY_NAMES = rotate(ALL_DAYS_SHORT);

/** Full day labels in week order. Index matches `day_of_week`. */
export const DAY_NAMES_LONG = rotate(ALL_DAYS_LONG);

/** Days to subtract from `day` (a JS getDay() index) to reach the week start. */
function offsetToWeekStart(day) {
  return -((day - WEEK_START_DOW + 7) % 7);
}

function toLocalDateString(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * The start of the week containing `date`, as YYYY-MM-DD in local time.
 * Built from local calendar components, never toISOString() — that reports the UTC
 * date and is already tomorrow after ~7pm in a UTC- timezone.
 */
export function getWeekStartOf(date) {
  const d = new Date(date);
  d.setDate(d.getDate() + offsetToWeekStart(d.getDay()));
  return toLocalDateString(d);
}

/**
 * The start of the *next* week after the one containing `from` (default: today).
 * Used for availability `effective_from`, which may never land in the current week.
 */
export function getNextWeekStart(from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + offsetToWeekStart(d.getDay()) + 7);
  return toLocalDateString(d);
}

/** The seven YYYY-MM-DD dates of the week beginning at `weekStart`, in order. */
export function getWeekDates(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + i);
    return toLocalDateString(d);
  });
}

/** The last day (YYYY-MM-DD) of the week beginning at `weekStart`. */
export function getWeekEnd(weekStart) {
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + 6);
  return toLocalDateString(d);
}
