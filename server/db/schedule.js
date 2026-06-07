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
      `SELECT ss.id, ss.user_id, ss.group_id, ss.shift_template_id, ss.date, ss.start_time, ss.hours,
              ss.is_fixed, ss.is_override, ss.note,
              u.name AS user_name,
              g.name AS group_name, g.color AS group_color, g.priority AS group_priority
       FROM schedule_shifts ss
       JOIN users u ON u.id = ss.user_id
       JOIN groups g ON g.id = ss.group_id
       WHERE ss.schedule_id = ? AND ss.is_deleted = 0
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
         AND ss.is_deleted = 0
         AND ss.date >= date('now', 'localtime')
       ORDER BY ss.date, ss.start_time
       LIMIT 1`
    )
    .get(userId);
}

function getWeekHoursForUser(userId, weekStart, db = _db) {
  const row = db.prepare(
    `SELECT COALESCE(SUM(ss.hours), 0) AS total
     FROM schedule_shifts ss
     JOIN schedules s ON s.id = ss.schedule_id
     WHERE ss.user_id = ?
       AND s.status = 'published'
       AND ss.is_deleted = 0
       AND ss.date >= ?
       AND ss.date < date(?, '+7 days')`
  ).get(userId, weekStart, weekStart);
  return row ? row.total : 0;
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
         (schedule_id, user_id, group_id, shift_template_id, date, start_time, hours, note, is_fixed, is_override)
       SELECT ?, user_id, group_id, shift_template_id, date, start_time, hours, note, is_fixed, is_override
       FROM schedule_shifts WHERE schedule_id = ? AND is_deleted = 0`
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
  db.prepare(`DELETE FROM schedule_shifts WHERE schedule_id = ? AND is_deleted = 0`).run(scheduleId);
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
    `WITH latest_ef AS (
       SELECT user_id, day_of_week, MAX(effective_from) AS max_ef
       FROM availability
       WHERE status = 'approved' AND effective_from <= ?
       GROUP BY user_id, day_of_week
     ),
     latest_id AS (
       SELECT MAX(a.id) AS id
       FROM availability a
       JOIN latest_ef l ON a.user_id = l.user_id AND a.day_of_week = l.day_of_week AND a.effective_from = l.max_ef
       WHERE a.status = 'approved'
       GROUP BY a.user_id, a.day_of_week
     )
     SELECT a.user_id, a.day_of_week, a.start_time, a.end_time, a.is_blocked
     FROM availability a
     JOIN latest_id li ON a.id = li.id
     WHERE a.status = 'approved'`
  ).all(weekStart);
  const availability = {};
  for (const row of availRows) {
    if (!availability[row.user_id]) availability[row.user_id] = {};
    availability[row.user_id][row.day_of_week] = { start_time: row.start_time, end_time: row.end_time, is_blocked: row.is_blocked };
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
            date, start_time, hours, note, is_fixed, is_override
     FROM schedule_shifts WHERE id = ?`
  ).get(shiftId);
}

function updateShift(shiftId, { groupId, templateId, startTime, hours, note = null }, db = _db) {
  return db.prepare(
    `UPDATE schedule_shifts
     SET group_id = ?, shift_template_id = ?, start_time = ?, hours = ?, note = ?, is_override = 1
     WHERE id = ?
     RETURNING id, schedule_id, user_id, group_id, shift_template_id,
               date, start_time, hours, note, is_fixed, is_override`
  ).get(groupId, templateId ?? null, startTime, hours, note, shiftId);
}

function deleteShift(shiftId, db = _db) {
  return db.prepare(
    `UPDATE schedule_shifts SET is_deleted = 1, is_override = 1 WHERE id = ?`
  ).run(shiftId);
}

function insertOverrideShift(scheduleId, { userId, groupId, templateId, startTime, hours, date, note = null }, db = _db) {
  return db.prepare(
    `INSERT INTO schedule_shifts
       (schedule_id, user_id, group_id, shift_template_id, date, start_time, hours, note, is_fixed, is_override)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
     RETURNING id, schedule_id, user_id, group_id, shift_template_id,
               date, start_time, hours, note, is_fixed, is_override`
  ).get(scheduleId, userId, groupId, templateId ?? null, date, startTime, hours, note);
}

function getOverrideShiftsForSchedule(scheduleId, db = _db) {
  return db.prepare(
    `SELECT id, user_id, group_id, shift_template_id, date, start_time, hours, is_deleted
     FROM schedule_shifts
     WHERE schedule_id = ? AND is_override = 1
       AND id IN (
         SELECT MAX(id) FROM schedule_shifts
         WHERE schedule_id = ? AND is_override = 1
         GROUP BY user_id, date
       )`
  ).all(scheduleId, scheduleId);
}

function validateScheduleShifts(scheduleId, db = _db) {
  const schedule = db.prepare('SELECT week_start_date FROM schedules WHERE id = ?').get(scheduleId);
  if (!schedule) return { warnings: [], violations: [] };

  const shifts = db.prepare(
    `SELECT id, user_id, group_id, shift_template_id, date, start_time, hours
     FROM schedule_shifts WHERE schedule_id = ? AND is_deleted = 0`
  ).all(scheduleId);

  const closedDates = new Set(
    db.prepare(`SELECT date FROM schedule_closed_days WHERE schedule_id = ?`).all(scheduleId).map(r => r.date)
  );

  const permClosed = getPermanentClosedDays(db);
  const schedOverrides = getDayOverrides(scheduleId, db);
  const permClosedSet = new Set(permClosed.filter(d => !schedOverrides[String(d)]));

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
    if (closedDates.has(date)) continue;
    if (permClosedSet.has(rule.day_of_week)) continue;
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
      if (v.type === 'coverage_gap') continue;
      violations.push({ ...v, shiftId: shift.id });
    }
  }

  // Weekly min-hours check — only for users who actually have shifts this week
  const userScheduledHours = {};
  for (const shift of shifts) {
    userScheduledHours[shift.user_id] = (userScheduledHours[shift.user_id] || 0) + shift.hours;
  }
  const usersWithMin = db.prepare(
    `SELECT id, name, min_hours_per_week FROM users
     WHERE is_active = 1 AND min_hours_per_week IS NOT NULL AND min_hours_per_week > 0`
  ).all();
  for (const u of usersWithMin) {
    const scheduled = userScheduledHours[u.id] || 0;
    if (scheduled < u.min_hours_per_week) {
      violations.push({
        type: 'min_hours',
        shiftId: null,
        userId: u.id,
        userName: u.name,
        scheduled,
        minimum: u.min_hours_per_week,
      });
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

function getPermanentClosedDays(db = _db) {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = 'closed_days'`).get();
  if (!row) return [];
  try { return JSON.parse(row.value) || []; } catch { return []; }
}

function setPermanentClosedDays(days, db = _db) {
  db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('closed_days', ?)`).run(JSON.stringify(days));
}

function getDayOverrides(scheduleId, db = _db) {
  const row = db.prepare(`SELECT day_overrides FROM schedules WHERE id = ?`).get(scheduleId);
  if (!row?.day_overrides) return {};
  try { return JSON.parse(row.day_overrides) || {}; } catch { return {}; }
}

function setDayOverride(scheduleId, dayOfWeek, db = _db) {
  const current = getDayOverrides(scheduleId, db);
  current[String(dayOfWeek)] = 'open';
  db.prepare(`UPDATE schedules SET day_overrides = ? WHERE id = ?`).run(JSON.stringify(current), scheduleId);
  return current;
}

function removeDayOverride(scheduleId, dayOfWeek, db = _db) {
  const current = getDayOverrides(scheduleId, db);
  delete current[String(dayOfWeek)];
  const val = Object.keys(current).length ? JSON.stringify(current) : null;
  db.prepare(`UPDATE schedules SET day_overrides = ? WHERE id = ?`).run(val, scheduleId);
  return current;
}

function checkShiftViolations({ scheduleId, userId, date, groupId, startTime, hours, excludeShiftId = null }, db = _db) {
  const violations = [];
  const schedule = db.prepare(`SELECT week_start_date FROM schedules WHERE id = ?`).get(scheduleId);
  if (!schedule) return violations;
  const weekStart = schedule.week_start_date;

  // Mon=0 … Sun=6 (our schema convention). JS getUTCDay: Sun=0, Mon=1.
  const dayOfWeek = (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7;

  // 0. Permanently closed day check
  const permClosed = getPermanentClosedDays(db);
  if (permClosed.includes(dayOfWeek)) {
    const overrides = getDayOverrides(scheduleId, db);
    if (!overrides[String(dayOfWeek)]) {
      violations.push({ type: 'closed_day', message: 'Shift on a permanently closed day' });
    }
  }

  // 1. Fixed shift conflict — is there a locked is_fixed shift on this cell?
  const fixedShift = excludeShiftId
    ? db.prepare(`SELECT id FROM schedule_shifts WHERE schedule_id=? AND user_id=? AND date=? AND is_fixed=1 AND id!=?`).get(scheduleId, userId, date, excludeShiftId)
    : db.prepare(`SELECT id FROM schedule_shifts WHERE schedule_id=? AND user_id=? AND date=? AND is_fixed=1`).get(scheduleId, userId, date);
  if (fixedShift) {
    violations.push({ type: 'fixed_conflict', message: 'Overrides a locked fixed shift' });
  }

  // 2. Availability conflict — does the shift fall outside approved availability?
  const avail = db.prepare(
    `SELECT start_time, end_time, is_blocked FROM availability
     WHERE user_id=? AND day_of_week=? AND status='approved' AND effective_from<=?
     ORDER BY effective_from DESC, id DESC LIMIT 1`
  ).get(userId, dayOfWeek, weekStart);
  if (avail) {
    if (avail.is_blocked) {
      violations.push({ type: 'not_available', message: 'Not available this day' });
    } else {
      const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
      const shiftEnd = toMin(startTime) + Math.round(hours * 60);
      const outsideStart = toMin(startTime) < toMin(avail.start_time);
      const outsideEnd = shiftEnd <= 1440 && shiftEnd > toMin(avail.end_time);
      if (outsideStart || outsideEnd) {
        violations.push({ type: 'availability', message: `Outside available hours (${avail.start_time}–${avail.end_time})` });
      }
    }
  }

  // 3. Inactive user check + hours cap
  const user = db.prepare(`SELECT is_active, max_hours_per_week FROM users WHERE id=?`).get(userId);
  if (!user || !user.is_active) {
    violations.push({ type: 'inactive_user', message: 'Staff member is no longer active' });
    return violations;
  }
  const row = excludeShiftId
    ? db.prepare(`SELECT COALESCE(SUM(hours),0) AS t FROM schedule_shifts WHERE schedule_id=? AND user_id=? AND id!=? AND is_deleted=0`).get(scheduleId, userId, excludeShiftId)
    : db.prepare(`SELECT COALESCE(SUM(hours),0) AS t FROM schedule_shifts WHERE schedule_id=? AND user_id=? AND is_deleted=0`).get(scheduleId, userId);
  if (user.max_hours_per_week !== null && row.t + hours > user.max_hours_per_week) {
    violations.push({ type: 'hours_cap', message: `Would exceed ${user.max_hours_per_week}h weekly cap (${row.t + hours}h total)` });
  }

  // 4. Coverage gap — will removing/replacing the old shift drop coverage below min?
  if (excludeShiftId) {
    const orig = db.prepare(`SELECT group_id, shift_template_id FROM schedule_shifts WHERE id=?`).get(excludeShiftId);
    if (orig?.shift_template_id) {
      const remaining = db.prepare(
        `SELECT COUNT(*) AS c FROM schedule_shifts WHERE schedule_id=? AND group_id=? AND shift_template_id=? AND date=? AND id!=? AND is_deleted=0`
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

function getPublishedShiftsForIcal(icalToken, db = _db) {
  const user = db.prepare('SELECT id FROM users WHERE ical_token = ?').get(icalToken);
  if (!user) return null;
  return db.prepare(
    `SELECT ss.id, ss.date, ss.start_time, ss.hours, ss.note, g.name AS group_name
     FROM schedule_shifts ss
     JOIN schedules sc ON ss.schedule_id = sc.id
     JOIN groups g ON ss.group_id = g.id
     WHERE ss.user_id = ?
       AND sc.status = 'published'
       AND ss.is_deleted = 0
       AND ss.date >= date('now', '-14 days')
       AND ss.date <= date('now', '+112 days')
     ORDER BY ss.date, ss.start_time`
  ).all(user.id);
}

function getRecentPublishedSchedules(limit, db = _db) {
  return db.prepare(
    `SELECT id, week_start_date FROM schedules
     WHERE status = 'published'
     ORDER BY week_start_date DESC
     LIMIT ?`
  ).all(limit);
}

function saveWeekAsTemplate(name, weekStart, createdBy, db = _db) {
  return db.transaction(() => {
    const schedule = db.prepare(
      `SELECT id FROM schedules WHERE week_start_date = ? AND status IN ('draft','published')
       ORDER BY CASE status WHEN 'draft' THEN 0 ELSE 1 END LIMIT 1`
    ).get(weekStart);
    if (!schedule) throw new Error('No schedule found for this week');

    const template = db.prepare(
      `INSERT INTO schedule_templates (name, created_by) VALUES (?, ?)
       RETURNING id, name, created_by, created_at`
    ).get(name, createdBy);

    const shifts = db.prepare(
      `SELECT user_id, group_id, shift_template_id, date, start_time, hours
       FROM schedule_shifts WHERE schedule_id = ? AND is_deleted = 0`
    ).all(schedule.id);

    const insert = db.prepare(
      `INSERT INTO schedule_template_shifts
         (template_id, user_id, group_id, shift_template_id, day_of_week, start_time, hours)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const weekStartMs = new Date(weekStart + 'T00:00:00Z').getTime();
    for (const s of shifts) {
      const dow = Math.round((new Date(s.date + 'T00:00:00Z').getTime() - weekStartMs) / 86400000);
      insert.run(template.id, s.user_id, s.group_id, s.shift_template_id, dow, s.start_time, s.hours);
    }

    return { ...template, shift_count: shifts.length };
  })();
}

function getAllTemplates(db = _db) {
  return db.prepare(
    `SELECT t.id, t.name, t.created_by, t.created_at, COUNT(ts.id) AS shift_count
     FROM schedule_templates t
     LEFT JOIN schedule_template_shifts ts ON ts.template_id = t.id
     GROUP BY t.id ORDER BY t.created_at DESC`
  ).all();
}

function deleteTemplate(id, db = _db) {
  const result = db.prepare(`DELETE FROM schedule_templates WHERE id = ?`).run(id);
  return result.changes > 0;
}

function applyTemplate(templateId, targetWeek, createdBy, db = _db) {
  return db.transaction(() => {
    const template = db.prepare(`SELECT id FROM schedule_templates WHERE id = ?`).get(templateId);
    if (!template) throw new Error('Template not found');

    const existing = db.prepare(
      `SELECT id FROM schedules WHERE week_start_date = ? AND status != 'archived'`
    ).get(targetWeek);
    if (existing) throw new Error('A schedule already exists for the target week');

    const draft = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'draft', ?)
       RETURNING id, week_start_date, status, created_by, created_at`
    ).get(targetWeek, createdBy);

    const shifts = db.prepare(
      `SELECT user_id, group_id, shift_template_id, day_of_week, start_time, hours
       FROM schedule_template_shifts WHERE template_id = ?`
    ).all(templateId);

    const stmt = db.prepare(
      `INSERT INTO schedule_shifts
         (schedule_id, user_id, group_id, shift_template_id, date, start_time, hours, is_fixed, is_override)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`
    );
    for (const s of shifts) {
      const d = new Date(targetWeek + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + s.day_of_week);
      stmt.run(draft.id, s.user_id, s.group_id, s.shift_template_id, d.toISOString().slice(0, 10), s.start_time, s.hours);
    }

    return draft;
  })();
}

function copyScheduleWeek(sourceWeekStart, targetWeekStart, createdBy, db = _db) {
  return db.transaction(() => {
    const source = db.prepare(
      `SELECT id FROM schedules WHERE week_start_date = ? AND status = 'published'`
    ).get(sourceWeekStart);
    if (!source) throw new Error('Source schedule not found or not published');

    const existing = db.prepare(
      `SELECT id FROM schedules WHERE week_start_date = ? AND status != 'archived'`
    ).get(targetWeekStart);
    if (existing) throw new Error('A schedule already exists for the target week');

    const draft = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by)
       VALUES (?, 'draft', ?)
       RETURNING id, week_start_date, status, created_by, created_at`
    ).get(targetWeekStart, createdBy);

    const offsetDays = Math.round(
      (new Date(targetWeekStart + 'T00:00:00Z') - new Date(sourceWeekStart + 'T00:00:00Z')) / 86400000
    );

    const sourceShifts = db.prepare(
      `SELECT user_id, group_id, shift_template_id, date, start_time, hours, note
       FROM schedule_shifts WHERE schedule_id = ? AND is_deleted = 0`
    ).all(source.id);

    const stmt = db.prepare(
      `INSERT INTO schedule_shifts
         (schedule_id, user_id, group_id, shift_template_id, date, start_time, hours, note, is_fixed, is_override)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
    );

    for (const s of sourceShifts) {
      const d = new Date(s.date + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + offsetDays);
      stmt.run(draft.id, s.user_id, s.group_id, s.shift_template_id,
        d.toISOString().slice(0, 10), s.start_time, s.hours, s.note);
    }

    return draft;
  })();
}

module.exports = {
  getLiveScheduleForWeek,
  getPublishedScheduleForWeek,
  getShiftsForSchedule,
  getUpcomingShiftForUser,
  getWeekHoursForUser,
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
  getPermanentClosedDays,
  setPermanentClosedDays,
  getDayOverrides,
  setDayOverride,
  removeDayOverride,
  checkShiftViolations,
  getTimeOffForWeek,
  recordScheduleView,
  getScheduleViewers,
  getPublishedShiftsForIcal,
  getRecentPublishedSchedules,
  copyScheduleWeek,
  saveWeekAsTemplate,
  getAllTemplates,
  deleteTemplate,
  applyTemplate,
};

function recordScheduleView(scheduleId, userId, db = _db) {
  db.prepare(
    `INSERT INTO schedule_views (schedule_id, user_id, viewed_at)
     VALUES (?, ?, unixepoch())
     ON CONFLICT(schedule_id, user_id) DO NOTHING`
  ).run(scheduleId, userId);
}

function getScheduleViewers(scheduleId, db = _db) {
  return db.prepare(
    `SELECT user_id FROM schedule_views WHERE schedule_id = ?`
  ).all(scheduleId).map(r => r.user_id);
}
