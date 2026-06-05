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

function generateSchedule({ weekDates, maxConsecutiveDays, users, userGroups, fixedSchedules, overrideShifts = [], timeOffBlocks, availability, coverageRules, eventCoverage = [], closedDates = new Set() }) {
  const shifts = [];
  const warnings = [];

  const weeklyHours = {};
  const scheduledDates = {};
  users.forEach(u => {
    weeklyHours[u.id] = 0;
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
    scheduledDates[os.user_id].add(os.date);
  }

  // Phase 2: Fill coverage rules (sorted by day then start_time)
  const sortedRules = [...coverageRules].sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    if ((a.group_priority || 0) !== (b.group_priority || 0)) return (a.group_priority || 0) - (b.group_priority || 0);
    return toMinutes(a.start_time) - toMinutes(b.start_time);
  });

  for (const rule of sortedRules) {
    const date = weekDates[rule.day_of_week];
    if (!date) continue;
    if (closedDates.has(date)) continue;

    const alreadyAssigned = shifts.filter(s =>
      s.group_id === rule.group_id &&
      s.shift_template_id === rule.shift_template_id &&
      s.date === date
    ).length;

    const stillNeeded = rule.min_staff - alreadyAssigned;
    if (stillNeeded <= 0) continue;

    const shiftStartMin = toMinutes(rule.start_time);
    const shiftEndMin = shiftStartMin + Math.round(rule.hours * 60);

    const eligible = users
      .filter(u => {
        if (!(userGroups[u.id] || []).includes(rule.group_id)) return false;
        if ((timeOffBlocks[u.id] || []).includes(date)) return false;
        if (scheduledDates[u.id].has(date)) return false;
        const avail = (availability[u.id] || {})[rule.day_of_week];
        if (avail) {
          if (avail.is_blocked) return false;
          if (shiftStartMin < toMinutes(avail.start_time)) return false;
          const availEndMin = avail.end_time === '00:00' ? 1440 : toMinutes(avail.end_time);
          if (shiftEndMin > availEndMin) return false;
        }
        if (u.max_hours_per_week != null && weeklyHours[u.id] + rule.hours > u.max_hours_per_week) return false;
        if (maxConsecutiveDays > 0) {
          const before = consecutiveDaysEndingBefore(date, scheduledDates[u.id]);
          const after = consecutiveDaysStartingAfter(date, scheduledDates[u.id]);
          if (before + 1 + after > maxConsecutiveDays) return false;
        }
        return true;
      })
      .sort((a, b) => weeklyHours[a.id] - weeklyHours[b.id]);

    let assigned = 0;
    for (const user of eligible) {
      if (assigned >= stillNeeded) break;
      shifts.push({
        user_id: user.id,
        group_id: rule.group_id,
        shift_template_id: rule.shift_template_id,
        date,
        start_time: rule.start_time,
        hours: rule.hours,
        is_fixed: 0,
        is_override: 0,
      });
      weeklyHours[user.id] += rule.hours;
      scheduledDates[user.id].add(date);
      assigned++;
    }

    const totalAssigned = alreadyAssigned + assigned;
    if (totalAssigned < rule.min_staff) {
      warnings.push({
        group_id: rule.group_id,
        day_of_week: rule.day_of_week,
        shift_template_id: rule.shift_template_id,
        needed: rule.min_staff,
        assigned: totalAssigned,
      });
    }
  }

  // Phase 2b: Fill event coverage requirements
  for (const ec of eventCoverage) {
    if (closedDates.has(ec.date)) continue;

    const alreadyAssigned = shifts.filter(s =>
      s.group_id === ec.group_id &&
      s.shift_template_id === ec.shift_template_id &&
      s.date === ec.date
    ).length;

    const stillNeeded = ec.required_staff - alreadyAssigned;
    if (stillNeeded <= 0) continue;

    const shiftStartMin = toMinutes(ec.start_time);
    const shiftEndMin = shiftStartMin + Math.round(ec.hours * 60);

    // Determine the day_of_week from ec.date for availability lookup
    const ecDate = new Date(ec.date + 'T00:00:00Z');
    const dayOfWeek = (ecDate.getUTCDay() + 6) % 7; // 0=Mon, 6=Sun

    const eligible = users
      .filter(u => {
        if (!(userGroups[u.id] || []).includes(ec.group_id)) return false;
        if ((timeOffBlocks[u.id] || []).includes(ec.date)) return false;
        if (scheduledDates[u.id].has(ec.date)) return false;
        const avail = (availability[u.id] || {})[dayOfWeek];
        if (avail) {
          if (avail.is_blocked) return false;
          if (shiftStartMin < toMinutes(avail.start_time)) return false;
          const availEndMin = avail.end_time === '00:00' ? 1440 : toMinutes(avail.end_time);
          if (shiftEndMin > availEndMin) return false;
        }
        if (u.max_hours_per_week != null && weeklyHours[u.id] + ec.hours > u.max_hours_per_week) return false;
        if (maxConsecutiveDays > 0) {
          const before = consecutiveDaysEndingBefore(ec.date, scheduledDates[u.id]);
          const after = consecutiveDaysStartingAfter(ec.date, scheduledDates[u.id]);
          if (before + 1 + after > maxConsecutiveDays) return false;
        }
        return true;
      })
      .sort((a, b) => weeklyHours[a.id] - weeklyHours[b.id]);

    let assigned = 0;
    for (const user of eligible) {
      if (assigned >= stillNeeded) break;
      shifts.push({
        user_id: user.id,
        group_id: ec.group_id,
        shift_template_id: ec.shift_template_id,
        date: ec.date,
        start_time: ec.start_time,
        hours: ec.hours,
        is_fixed: 0,
        is_override: 0,
      });
      weeklyHours[user.id] += ec.hours;
      scheduledDates[user.id].add(ec.date);
      assigned++;
    }

    const totalAssigned = alreadyAssigned + assigned;
    if (totalAssigned < ec.required_staff) {
      warnings.push({
        type: 'event_coverage_gap',
        date: ec.date,
        group_id: ec.group_id,
        needed: ec.required_staff,
        assigned: totalAssigned,
      });
    }
  }

  return { shifts, warnings };
}

module.exports = { generateSchedule };
