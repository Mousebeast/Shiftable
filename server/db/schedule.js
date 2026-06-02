'use strict';

const _db = require('./db');

function getLiveScheduleForWeek(weekStart, db = _db) {
  return db.prepare(
    `SELECT id, week_start_date, status, created_by, published_by,
            parent_schedule_id, created_at, published_at
     FROM schedules WHERE week_start_date = ? AND status = 'published'`
  ).get(weekStart);
}
// Backwards-compat alias
const getPublishedScheduleForWeek = getLiveScheduleForWeek;

function getShiftsForSchedule(scheduleId, db = _db) {
  return db
    .prepare(
      `SELECT ss.id, ss.user_id, ss.group_id, ss.date, ss.start_time, ss.hours,
              ss.is_fixed, ss.is_override,
              u.name AS user_name,
              g.name AS group_name, g.color AS group_color, g.priority AS group_priority
       FROM schedule_shifts ss
       JOIN users u ON u.id = ss.user_id
       JOIN groups g ON g.id = ss.group_id
       WHERE ss.schedule_id = ?
       ORDER BY ss.date, g.priority, ss.start_time, u.name`
    )
    .all(scheduleId);
}

function getUpcomingShiftForUser(userId, db = _db) {
  return db
    .prepare(
      `SELECT ss.id, ss.date, ss.start_time, ss.hours,
              g.name AS group_name, g.color AS group_color
       FROM schedule_shifts ss
       JOIN schedules s ON s.id = ss.schedule_id
       JOIN groups g ON g.id = ss.group_id
       WHERE ss.user_id = ?
         AND s.status = 'published'
         AND ss.date >= date('now', 'localtime')
       ORDER BY ss.date, ss.start_time
       LIMIT 1`
    )
    .get(userId);
}

function createFreshDraftSchedule(weekStart, createdBy, db = _db) {
  return db.prepare(
    `INSERT INTO schedules (week_start_date, status, created_by)
     VALUES (?, 'draft', ?)
     RETURNING id, week_start_date, status, created_by, parent_schedule_id, created_at`
  ).get(weekStart, createdBy);
}

function forkDraftFromPublished(publishedId, createdBy, db = _db) {
  return db.transaction(() => {
    const draft = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by, parent_schedule_id)
       SELECT week_start_date, 'draft', ?, ?
       FROM schedules WHERE id = ?
       RETURNING id, week_start_date, status, created_by, parent_schedule_id, created_at`
    ).get(createdBy, publishedId, publishedId);
    if (!draft) throw new Error('Source schedule not found');
    db.prepare(
      `INSERT INTO schedule_shifts
         (schedule_id, user_id, group_id, shift_template_id, date, start_time, hours, is_fixed, is_override)
       SELECT ?, user_id, group_id, shift_template_id, date, start_time, hours, is_fixed, is_override
       FROM schedule_shifts WHERE schedule_id = ?`
    ).run(draft.id, publishedId);
    return draft;
  })();
}

function discardDraft(draftId, db = _db) {
  db.prepare(`DELETE FROM schedules WHERE id = ? AND status = 'draft'`).run(draftId);
}

function republishSchedule(draftId, publishedBy, db = _db) {
  return db.transaction(() => {
    const draft = db.prepare(
      `SELECT id, week_start_date FROM schedules WHERE id = ? AND status = 'draft'`
    ).get(draftId);
    if (!draft) throw new Error('Draft not found');

    const live = db.prepare(
      `SELECT id FROM schedules WHERE week_start_date = ? AND status = 'published'`
    ).get(draft.week_start_date);

    let deniedSwaps = [];
    if (live) {
      const pending = db.prepare(
        `SELECT ss.id, ss.requester_id, ss.claimer_id
         FROM shift_swaps ss
         JOIN schedule_shifts sh ON sh.id = ss.original_shift_id
         WHERE sh.schedule_id = ? AND ss.status IN ('open', 'claimed', 'pending_manager')`
      ).all(live.id);

      const denyOne = db.prepare(
        `UPDATE shift_swaps SET status = 'denied', resolved_at = unixepoch() WHERE id = ?`
      );
      for (const swap of pending) denyOne.run(swap.id);
      deniedSwaps = pending;

      db.prepare(`UPDATE schedules SET status = 'archived' WHERE id = ?`).run(live.id);
    }

    const published = db.prepare(
      `UPDATE schedules
       SET status = 'published', published_by = ?, published_at = unixepoch()
       WHERE id = ?
       RETURNING id, week_start_date, status, created_by, published_by, published_at, parent_schedule_id, created_at`
    ).get(publishedBy, draftId);

    return { schedule: published, deniedSwaps };
  })();
}

function getScheduleById(id, db = _db) {
  return db.prepare(
    `SELECT id, week_start_date, status, created_by, published_by,
            parent_schedule_id, created_at, published_at
     FROM schedules WHERE id = ?`
  ).get(id);
}

function getDraftScheduleForWeek(weekStart, db = _db) {
  return db.prepare(
    `SELECT id, week_start_date, status, created_by, published_by, parent_schedule_id, created_at, published_at
     FROM schedules WHERE week_start_date = ? AND status = 'draft'
     ORDER BY created_at DESC LIMIT 1`
  ).get(weekStart);
}

function insertShifts(scheduleId, shifts, db = _db) {
  const insert = db.prepare(
    `INSERT INTO schedule_shifts
       (schedule_id, user_id, group_id, shift_template_id, date, start_time, hours, is_fixed, is_override)
     VALUES (@schedule_id, @user_id, @group_id, @shift_template_id, @date, @start_time, @hours, @is_fixed, @is_override)`
  );
  db.transaction((rows) => {
    for (const row of rows) {
      insert.run({ ...row, schedule_id: scheduleId, is_override: row.is_override ?? 0 });
    }
  })(shifts);
}

function clearShiftsForSchedule(scheduleId, db = _db) {
  db.prepare(`DELETE FROM schedule_shifts WHERE schedule_id = ?`).run(scheduleId);
}

function publishSchedule(id, publishedBy, db = _db) {
  return db.prepare(
    `UPDATE schedules SET status = 'published', published_by = ?, published_at = unixepoch()
     WHERE id = ? RETURNING id, week_start_date, status, published_by, published_at`
  ).get(publishedBy, id);
}

function getSchedulerInputs(weekStart, db = _db) {
  const weekDates = [];
  const start = new Date(weekStart + 'T00:00:00Z');
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    weekDates.push(d.toISOString().slice(0, 10));
  }
  const weekEnd = weekDates[6];

  const setting = db.prepare(`SELECT value FROM app_settings WHERE key = 'max_consecutive_days'`).get();
  const maxConsecutiveDays = setting ? Number(setting.value) : 6;

  const users = db.prepare(
    `SELECT id, name, min_hours_per_week, max_hours_per_week FROM users WHERE is_active = 1`
  ).all();

  const ugRows = db.prepare(`SELECT user_id, group_id FROM user_groups`).all();
  const userGroups = {};
  for (const row of ugRows) {
    if (!userGroups[row.user_id]) userGroups[row.user_id] = [];
    userGroups[row.user_id].push(row.group_id);
  }

  const fixedSchedules = db.prepare(
    `SELECT fs.user_id, fs.day_of_week, fs.shift_template_id,
            st.group_id, st.start_time, st.hours
     FROM fixed_schedules fs
     JOIN shift_templates st ON st.id = fs.shift_template_id`
  ).all();

  const toRows = db.prepare(
    `SELECT user_id, start_date, end_date FROM time_off_requests
     WHERE status = 'approved' AND start_date <= ? AND end_date >= ?`
  ).all(weekEnd, weekStart);
  const timeOffBlocks = {};
  for (const row of toRows) {
    if (!timeOffBlocks[row.user_id]) timeOffBlocks[row.user_id] = [];
    const s = new Date(row.start_date + 'T00:00:00Z');
    const e = new Date(row.end_date + 'T00:00:00Z');
    for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (weekDates.includes(iso)) timeOffBlocks[row.user_id].push(iso);
    }
  }

  const availRows = db.prepare(
    `SELECT a.user_id, a.day_of_week, a.start_time, a.end_time
     FROM availability a
     INNER JOIN (
       SELECT user_id, day_of_week, MAX(effective_from) AS max_ef
       FROM availability
       WHERE status = 'approved' AND effective_from <= ?
       GROUP BY user_id, day_of_week
     ) latest ON a.user_id = latest.user_id
             AND a.day_of_week = latest.day_of_week
             AND a.effective_from = latest.max_ef
     WHERE a.status = 'approved'`
  ).all(weekStart);
  const availability = {};
  for (const row of availRows) {
    if (!availability[row.user_id]) availability[row.user_id] = {};
    availability[row.user_id][row.day_of_week] = { start_time: row.start_time, end_time: row.end_time };
  }

  const coverageRules = db.prepare(
    `SELECT cr.group_id, cr.day_of_week, cr.shift_template_id, cr.min_staff,
            st.start_time, st.hours, g.priority AS group_priority
     FROM coverage_rules cr
     JOIN shift_templates st ON st.id = cr.shift_template_id
     JOIN groups g ON g.id = cr.group_id
     ORDER BY cr.day_of_week, st.start_time`
  ).all();

  const eventCoverage = db.prepare(
    `SELECT wec.date, wec.group_id, wec.shift_template_id, wec.required_staff,
            st.start_time, st.hours
     FROM week_event_coverage wec
     JOIN shift_templates st ON st.id = wec.shift_template_id
     WHERE wec.week_start_date = ?`
  ).all(weekStart);

  return { weekDates, maxConsecutiveDays, users, userGroups, fixedSchedules, timeOffBlocks, availability, coverageRules, eventCoverage };
}

function getShiftById(shiftId, db = _db) {
  return db.prepare(
    `SELECT id, schedule_id, user_id, group_id, shift_template_id,
            date, start_time, hours, is_fixed, is_override
     FROM schedule_shifts WHERE id = ?`
  ).get(shiftId);
}

function updateShift(shiftId, { groupId, templateId, startTime, hours }, db = _db) {
  return db.prepare(
    `UPDATE schedule_shifts
     SET group_id = ?, shift_template_id = ?, start_time = ?, hours = ?, is_override = 1
     WHERE id = ?
     RETURNING id, schedule_id, user_id, group_id, shift_template_id,
               date, start_time, hours, is_fixed, is_override`
  ).get(groupId, templateId ?? null, startTime, hours, shiftId);
}

function deleteShift(shiftId, db = _db) {
  return db.prepare(`DELETE FROM schedule_shifts WHERE id = ?`).run(shiftId);
}

function insertOverrideShift(scheduleId, { userId, groupId, templateId, startTime, hours, date }, db = _db) {
  return db.prepare(
    `INSERT INTO schedule_shifts
       (schedule_id, user_id, group_id, shift_template_id, date, start_time, hours, is_fixed, is_override)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)
     RETURNING id, schedule_id, user_id, group_id, shift_template_id,
               date, start_time, hours, is_fixed, is_override`
  ).get(scheduleId, userId, groupId, templateId ?? null, date, startTime, hours);
}

function getOverrideShiftsForSchedule(scheduleId, db = _db) {
  return db.prepare(
    `SELECT id, user_id, group_id, shift_template_id, date, start_time, hours
     FROM schedule_shifts WHERE schedule_id = ? AND is_override = 1`
  ).all(scheduleId);
}

function validateScheduleShifts(scheduleId, db = _db) {
  const schedule = db.prepare('SELECT week_start_date FROM schedules WHERE id = ?').get(scheduleId);
  if (!schedule) return { warnings: [], violations: [] };

  const shifts = db.prepare(
    `SELECT id, user_id, group_id, shift_template_id, date, start_time, hours
     FROM schedule_shifts WHERE schedule_id = ?`
  ).all(scheduleId);

  // Build Mon–Sun date map for this week (day 0 = Mon)
  const weekDates = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(schedule.week_start_date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    weekDates[i] = d.toISOString().slice(0, 10);
  }

  // Coverage warnings: compare coverage rules against actual assigned counts
  const coverageRules = db.prepare(
    `SELECT group_id, day_of_week, shift_template_id, min_staff FROM coverage_rules`
  ).all();

  const warnings = [];
  for (const rule of coverageRules) {
    const date = weekDates[rule.day_of_week];
    const assigned = shifts.filter(s =>
      s.group_id === rule.group_id &&
      s.shift_template_id === rule.shift_template_id &&
      s.date === date
    ).length;
    if (assigned < rule.min_staff) {
      warnings.push({
        group_id: rule.group_id,
        day_of_week: rule.day_of_week,
        shift_template_id: rule.shift_template_id,
        needed: rule.min_staff,
        assigned,
      });
    }
  }

  // Event coverage warnings
  const eventCovRules = db.prepare(
    `SELECT wec.date, wec.group_id, wec.shift_template_id, wec.required_staff
     FROM week_event_coverage wec
     WHERE wec.week_start_date = ?`
  ).all(schedule.week_start_date);

  for (const ec of eventCovRules) {
    const assigned = shifts.filter(s =>
      s.group_id === ec.group_id &&
      s.shift_template_id === ec.shift_template_id &&
      s.date === ec.date
    ).length;
    if (assigned < ec.required_staff) {
      warnings.push({
        type: 'event_coverage_gap',
        date: ec.date,
        group_id: ec.group_id,
        needed: ec.required_staff,
        assigned,
      });
    }
  }

  // Per-shift constraint violations
  const violations = [];
  for (const shift of shifts) {
    const shiftViolations = checkShiftViolations({
      scheduleId,
      userId: shift.user_id,
      date: shift.date,
      groupId: shift.group_id,
      startTime: shift.start_time,
      hours: shift.hours,
      excludeShiftId: shift.id,
    }, db);
    for (const v of shiftViolations) {
      violations.push({ ...v, shiftId: shift.id });
    }
  }

  return { warnings, violations };
}

function getClosedDays(scheduleId, db = _db) {
  return db.prepare(
    `SELECT date FROM schedule_closed_days WHERE schedule_id = ? ORDER BY date`
  ).all(scheduleId).map(r => r.date);
}

function addClosedDay(scheduleId, date, db = _db) {
  db.prepare(
    `INSERT OR IGNORE INTO schedule_closed_days (schedule_id, date) VALUES (?, ?)`
  ).run(scheduleId, date);
}

function removeClosedDay(scheduleId, date, db = _db) {
  db.prepare(
    `DELETE FROM schedule_closed_days WHERE schedule_id = ? AND date = ?`
  ).run(scheduleId, date);
}

function getTimeOffForWeek(weekStart, db = _db) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const weekEnd = days[6];
  const requests = db.prepare(
    `SELECT user_id, start_date, end_date FROM time_off_requests
     WHERE status = 'approved' AND start_date <= ? AND end_date >= ?`
  ).all(weekEnd, days[0]);
  const result = [];
  for (const req of requests) {
    for (const date of days) {
      if (date >= req.start_date && date <= req.end_date) {
        result.push({ user_id: req.user_id, date });
      }
    }
  }
  return result;
}

function clearShiftsForDate(scheduleId, date, db = _db) {
  db.prepare(
    `DELETE FROM schedule_shifts WHERE schedule_id = ? AND date = ?`
  ).run(scheduleId, date);
}

function checkShiftViolations({ scheduleId, userId, date, groupId, startTime, hours, excludeShiftId = null }, db = _db) {
  const violations = [];
  const schedule = db.prepare(`SELECT week_start_date FROM schedules WHERE id = ?`).get(scheduleId);
  if (!schedule) return violations;
  const weekStart = schedule.week_start_date;

  // Mon=0 … Sun=6 (our schema convention). JS getUTCDay: Sun=0, Mon=1.
  const dayOfWeek = (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7;

  // 1. Fixed shift conflict — is there a locked is_fixed shift on this cell?
  const fixedShift = excludeShiftId
    ? db.prepare(`SELECT id FROM schedule_shifts WHERE schedule_id=? AND user_id=? AND date=? AND is_fixed=1 AND id!=?`).get(scheduleId, userId, date, excludeShiftId)
    : db.prepare(`SELECT id FROM schedule_shifts WHERE schedule_id=? AND user_id=? AND date=? AND is_fixed=1`).get(scheduleId, userId, date);
  if (fixedShift) {
    violations.push({ type: 'fixed_conflict', message: 'Overrides a locked fixed shift' });
  }

  // 2. Availability conflict — does the shift fall outside approved availability?
  const avail = db.prepare(
    `SELECT start_time, end_time FROM availability
     WHERE user_id=? AND day_of_week=? AND status='approved' AND effective_from<=?
     ORDER BY effective_from DESC LIMIT 1`
  ).get(userId, dayOfWeek, weekStart);
  if (avail) {
    const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
    const shiftEnd = toMin(startTime) + Math.round(hours * 60);
    if (toMin(startTime) < toMin(avail.start_time) || shiftEnd > toMin(avail.end_time)) {
      violations.push({ type: 'availability', message: `Outside available hours (${avail.start_time}–${avail.end_time})` });
    }
  }

  // 3. Hours cap — will this push the user over their weekly max?
  const user = db.prepare(`SELECT max_hours_per_week FROM users WHERE id=?`).get(userId);
  if (user) {
    const row = excludeShiftId
      ? db.prepare(`SELECT COALESCE(SUM(hours),0) AS t FROM schedule_shifts WHERE schedule_id=? AND user_id=? AND id!=?`).get(scheduleId, userId, excludeShiftId)
      : db.prepare(`SELECT COALESCE(SUM(hours),0) AS t FROM schedule_shifts WHERE schedule_id=? AND user_id=?`).get(scheduleId, userId);
    if (user.max_hours_per_week !== null && row.t + hours > user.max_hours_per_week) {
      violations.push({ type: 'hours_cap', message: `Would exceed ${user.max_hours_per_week}h weekly cap (${row.t + hours}h total)` });
    }
  }

  // 4. Coverage gap — will removing/replacing the old shift drop coverage below min?
  if (excludeShiftId) {
    const orig = db.prepare(`SELECT group_id, shift_template_id FROM schedule_shifts WHERE id=?`).get(excludeShiftId);
    if (orig?.shift_template_id) {
      const remaining = db.prepare(
        `SELECT COUNT(*) AS c FROM schedule_shifts WHERE schedule_id=? AND group_id=? AND shift_template_id=? AND date=? AND id!=?`
      ).get(scheduleId, orig.group_id, orig.shift_template_id, date, excludeShiftId);
      const rule = db.prepare(
        `SELECT min_staff FROM coverage_rules WHERE group_id=? AND day_of_week=? AND shift_template_id=?`
      ).get(orig.group_id, dayOfWeek, orig.shift_template_id);
      if (rule && remaining.c < rule.min_staff) {
        violations.push({ type: 'coverage_gap', message: `Coverage drops below minimum (${remaining.c}/${rule.min_staff} staff)` });
      }
    }
  }

  return violations;
}

module.exports = {
  getLiveScheduleForWeek,
  getPublishedScheduleForWeek,
  getShiftsForSchedule,
  getUpcomingShiftForUser,
  createFreshDraftSchedule,
  forkDraftFromPublished,
  republishSchedule,
  discardDraft,
  getScheduleById,
  getDraftScheduleForWeek,
  insertShifts,
  clearShiftsForSchedule,
  publishSchedule,
  getSchedulerInputs,
  getShiftById,
  updateShift,
  deleteShift,
  insertOverrideShift,
  getOverrideShiftsForSchedule,
  validateScheduleShifts,
  getClosedDays,
  addClosedDay,
  removeClosedDay,
  clearShiftsForDate,
  checkShiftViolations,
  getTimeOffForWeek,
};
