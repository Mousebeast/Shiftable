'use strict';
const {
  getShiftForSwap,
  getUserGroupIds,
  getUserWeeklyHours,
  isUserScheduledOnDate,
  getUserMaxHours,
} = require('../db/swaps');

/**
 * Returns true if swap can be auto-approved, false if needs manager review.
 * Conditions: claimer in same group, not already scheduled that day,
 * weekly hours + shift hours <= max, has approved availability for that day.
 */
function checkAutoApprove(swap, db) {
  const shift = getShiftForSwap(swap.original_shift_id, db);
  if (!shift) return false;

  // 1. Claimer in same group
  const claimerGroups = getUserGroupIds(swap.claimer_id, db);
  if (!claimerGroups.includes(shift.group_id)) return false;

  // 2. Claimer not already scheduled on that date
  if (isUserScheduledOnDate(swap.claimer_id, shift.date, db)) return false;

  // 3. Claimer under max hours for the week
  const maxHours = getUserMaxHours(swap.claimer_id, db);
  const currentHours = getUserWeeklyHours(swap.claimer_id, shift.week_start_date, db);
  if (currentHours + shift.hours > maxHours) return false;

  // 4. Claimer has approved availability for that day of week
  // day_of_week: 0=Mon...6=Sun; JS getDay() 0=Sun...6=Sat
  const jsDay = new Date(shift.date + 'T00:00:00').getDay();
  const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1; // convert to Mon=0
  const available = db.prepare(
    `SELECT 1 FROM availability
     WHERE user_id = ?
       AND day_of_week = ?
       AND status = 'approved'
       AND effective_from <= ?
     LIMIT 1`
  ).get(swap.claimer_id, dayOfWeek, shift.date);
  if (!available) return false;

  return true;
}

module.exports = { checkAutoApprove };
