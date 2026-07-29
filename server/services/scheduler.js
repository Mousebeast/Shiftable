'use strict';

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function consecutiveDaysEndingBefore(date, scheduledDateSet) {
  const d = new Date(date + 'T00:00:00Z');
  let count = 0;
  while (true) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (scheduledDateSet.has(d.toISOString().slice(0, 10))) count++;
    else break;
  }
  return count;
}

function consecutiveDaysStartingAfter(date, scheduledDateSet) {
  const d = new Date(date + 'T00:00:00Z');
  let count = 0;
  while (true) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (scheduledDateSet.has(d.toISOString().slice(0, 10))) count++;
    else break;
  }
  return count;
}

function generateSchedule({ weekDates, maxConsecutiveDays, users, userGroups, fixedSchedules, overrideShifts = [], timeOffBlocks, availability, coverageRules, eventCoverage = [], closedDates = new Set(), dayPriorityOrder = [0,1,2,3,4,5,6], fillOrder = 'group_first', fixedOnly = false }) {
  const shifts = [];
  const warnings = [];

  const weeklyHours = {};
  const weeklyShifts = {};
  const scheduledDates = {};
  users.forEach(u => {
    weeklyHours[u.id] = 0;
    weeklyShifts[u.id] = 0;
    scheduledDates[u.id] = new Set();
  });

  // Phase 1: Lock fixed schedules
  for (const fs of fixedSchedules) {
    const date = weekDates[fs.day_of_week];
    if (!date) continue;
    if (closedDates.has(date)) continue;
    if ((timeOffBlocks[fs.user_id] || []).includes(date)) continue;
    if (!Object.prototype.hasOwnProperty.call(weeklyHours, fs.user_id)) continue;

    shifts.push({
      user_id: fs.user_id,
      group_id: fs.group_id,
      shift_template_id: fs.shift_template_id,
      date,
      start_time: fs.start_time,
      hours: fs.hours,
      is_fixed: 1,
      is_override: 0,
    });
    weeklyHours[fs.user_id] += fs.hours;
    weeklyShifts[fs.user_id]++;
    scheduledDates[fs.user_id].add(date);
  }

  // Phase 1b: Lock manual overrides — override wins over fixed shifts
  for (const os of overrideShifts) {
    if (closedDates.has(os.date)) continue;
    if (!Object.prototype.hasOwnProperty.call(weeklyHours, os.user_id)) continue;
    // Remove any existing placement for this user+date (override beats fixed)
    const existingIdx = shifts.findIndex(s => s.user_id === os.user_id && s.date === os.date);
    if (existingIdx !== -1) {
      weeklyHours[os.user_id] -= shifts[existingIdx].hours;
      scheduledDates[os.user_id].delete(os.date);
      shifts.splice(existingIdx, 1);
    }
    if (scheduledDates[os.user_id].has(os.date)) continue;
    // Deletion tombstone — block this slot without adding a shift
    if (os.is_deleted) {
      scheduledDates[os.user_id].add(os.date);
      continue;
    }
    shifts.push({
      user_id: os.user_id,
      group_id: os.group_id,
      shift_template_id: os.shift_template_id ?? null,
      date: os.date,
      start_time: os.start_time,
      hours: os.hours,
      is_fixed: 0,
      is_override: 1,
    });
    weeklyHours[os.user_id] += os.hours;
    weeklyShifts[os.user_id]++;
    scheduledDates[os.user_id].add(os.date);
  }

  // Fixed-only mode stops here, with Phases 1 and 1b applied and nothing filled.
  // The manager asked for a starting point of fixed shifts plus their own edits,
  // to complete by hand.
  //
  // Phase 3's min-shifts warnings are skipped deliberately, not overlooked: in a
  // deliberately-incomplete schedule nearly everyone is under their minimum, so
  // the warnings would describe exactly what was requested. Warnings that always
  // fire train people to ignore warnings.
  if (fixedOnly) {
    return { shifts, warnings };
  }

  // Phase 2: Fill all coverage slots (coverage rules + event coverage) in one sorted pass.
  // Events and rules are normalized to a common shape and sorted together so group priority
  // is respected across both types — higher-priority groups fill before lower ones on the same day.
  const dayPriorityMap = Object.fromEntries(dayPriorityOrder.map((day, idx) => [day, idx]));

  const allSlots = [];

  for (const rule of coverageRules) {
    const date = weekDates[rule.day_of_week];
    if (!date || closedDates.has(date)) continue;
    allSlots.push({
      type: 'coverage',
      date,
      day_of_week: rule.day_of_week,
      group_id: rule.group_id,
      shift_template_id: rule.shift_template_id,
      quota: rule.min_staff,
      start_time: rule.start_time,
      hours: rule.hours,
      // Carried so a coverage warning can name itself. The UI cannot derive these
      // from the schedule: a gap means the group has no shift to read a name from.
      group_name: rule.group_name,
      template_name: rule.template_name,
      group_priority: rule.group_priority || 0,
    });
  }

  for (const ec of eventCoverage) {
    if (closedDates.has(ec.date)) continue;
    // day_of_week is an offset from the week start, so it is simply the date's
    // position in weekDates. Deriving it here keeps the scheduler a pure function
    // with no dependency on the configured week start.
    const day_of_week = weekDates.indexOf(ec.date);
    if (day_of_week === -1) continue; // event coverage outside the week being built
    allSlots.push({
      type: 'event',
      date: ec.date,
      day_of_week,
      group_id: ec.group_id,
      shift_template_id: ec.shift_template_id,
      quota: ec.required_staff,
      start_time: ec.start_time,
      hours: ec.hours,
      group_name: ec.group_name,
      template_name: ec.template_name,
      group_priority: ec.group_priority || 0,
    });
  }

  allSlots.sort((a, b) => {
    const dayA = dayPriorityMap[a.day_of_week] ?? a.day_of_week;
    const dayB = dayPriorityMap[b.day_of_week] ?? b.day_of_week;
    const grpA = a.group_priority || 0;
    const grpB = b.group_priority || 0;
    const first  = fillOrder === 'group_first' ? (grpA - grpB) || (dayA - dayB) : (dayA - dayB) || (grpA - grpB);
    if (first !== 0) return first;
    return toMinutes(a.start_time) - toMinutes(b.start_time);
  });

  for (const slot of allSlots) {
    const {
      date, day_of_week, group_id, shift_template_id, quota, start_time, hours,
      group_name, template_name,
    } = slot;

    const alreadyAssigned = shifts.filter(s =>
      s.group_id === group_id &&
      s.shift_template_id === shift_template_id &&
      s.date === date
    ).length;

    const stillNeeded = quota - alreadyAssigned;
    if (stillNeeded <= 0) continue;

    const shiftStartMin = toMinutes(start_time);
    const shiftEndMin = shiftStartMin + Math.round(hours * 60);

    const eligible = users.filter(u => {
      if (!(userGroups[u.id] || []).includes(group_id)) return false;
      if ((timeOffBlocks[u.id] || []).includes(date)) return false;
      if (scheduledDates[u.id].has(date)) return false;
      const avail = (availability[u.id] || {})[day_of_week];
      if (avail) {
        if (avail.is_blocked) return false;
        if (shiftStartMin < toMinutes(avail.start_time)) return false;
        const availEndMin = avail.end_time === '00:00' ? 1440 : toMinutes(avail.end_time);
        if (shiftEndMin > availEndMin) return false;
      }
      if (u.max_hours_per_week != null && weeklyHours[u.id] + hours > u.max_hours_per_week) return false;
      if (u.max_shifts_per_week != null && weeklyShifts[u.id] >= u.max_shifts_per_week) return false;
      if (maxConsecutiveDays > 0) {
        const before = consecutiveDaysEndingBefore(date, scheduledDates[u.id]);
        const after = consecutiveDaysStartingAfter(date, scheduledDates[u.id]);
        if (before + 1 + after > maxConsecutiveDays) return false;
      }
      return true;
    });

    const poolA = eligible
      .filter(u => u.min_shifts_per_week != null && weeklyShifts[u.id] < u.min_shifts_per_week)
      .sort((a, b) => (a.priority_order ?? 0) - (b.priority_order ?? 0));
    const poolB = eligible
      .filter(u => u.min_shifts_per_week == null || weeklyShifts[u.id] >= u.min_shifts_per_week)
      .sort((a, b) => (a.priority_order ?? 0) - (b.priority_order ?? 0));

    let assigned = 0;
    for (const user of [...poolA, ...poolB]) {
      if (assigned >= stillNeeded) break;
      shifts.push({
        user_id: user.id,
        group_id,
        shift_template_id,
        date,
        start_time,
        hours,
        is_fixed: 0,
        is_override: 0,
      });
      weeklyHours[user.id] += hours;
      weeklyShifts[user.id]++;
      scheduledDates[user.id].add(date);
      assigned++;
    }

    const totalAssigned = alreadyAssigned + assigned;
    if (totalAssigned < quota) {
      if (slot.type === 'event') {
        warnings.push({
          type: 'event_coverage_gap',
          date,
          group_id,
          group_name,
          template_name,
          start_time,
          needed: quota,
          assigned: totalAssigned,
        });
      } else {
        warnings.push({
          group_id,
          day_of_week,
          shift_template_id,
          group_name,
          template_name,
          start_time,
          needed: quota,
          assigned: totalAssigned,
        });
      }
    }
  }

  // Phase 3: min_shifts validation
  for (const u of users) {
    if (u.min_shifts_per_week != null && weeklyShifts[u.id] < u.min_shifts_per_week) {
      warnings.push({
        type: 'min_shifts_unmet',
        user_id: u.id,
        needed: u.min_shifts_per_week,
        assigned: weeklyShifts[u.id],
      });
    }
  }

  return { shifts, warnings };
}

module.exports = { generateSchedule };
