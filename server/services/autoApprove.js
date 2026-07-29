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
 * weekly hours + shift hours <= max.
 *
 * Availability is deliberately NOT a condition. Claiming a swap is an act of
 * volunteering, and someone who offers to cover a shift outside their stated
 * hours is making that call for themselves — routing it to a manager is
 * friction for a decision nobody needs to review. The same reasoning is why
 * open-shift claims never consulted availability either.
 *
 * Hours are different, and stay: a weekly maximum is the restaurant's limit,
 * not the claimer's preference, so it is the one thing volunteering cannot
 * override.
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

  return true;
}

module.exports = { checkAutoApprove };
