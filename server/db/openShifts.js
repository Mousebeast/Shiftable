'use strict';
const _db = require('./db');
const { weekStartOfDateString, addDaysToDateString } = require('../services/dates');

// Operates on a stored date string, so it stays entirely in UTC. The previous
// implementation built the Date in local time but read it back with
// toISOString(), which returns the wrong day off UTC.
function getWeekStartOf(dateStr) {
  return weekStartOfDateString(dateStr);
}

function createOpenShift({ groupId, shiftTemplateId, date, startTime, hours, note, createdBy }, db = _db) {
  return db.prepare(`
    INSERT INTO open_shifts (group_id, shift_template_id, date, start_time, hours, note, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(groupId, shiftTemplateId || null, date, startTime, hours, note || null, createdBy);
}

function getOpenShiftById(id, db = _db) {
  return db.prepare(`
    SELECT os.*, g.name AS group_name, g.color AS group_color,
           st.name AS template_name,
           u.name AS claimer_name
    FROM open_shifts os
    JOIN groups g ON g.id = os.group_id
    LEFT JOIN shift_templates st ON st.id = os.shift_template_id
    LEFT JOIN users u ON u.id = os.claimer_id
    WHERE os.id = ?
  `).get(id);
}

function getOpenShiftsForUser(userId, db = _db) {
  return db.prepare(`
    SELECT os.*, g.name AS group_name, g.color AS group_color,
           st.name AS template_name
    FROM open_shifts os
    JOIN groups g ON g.id = os.group_id
    LEFT JOIN shift_templates st ON st.id = os.shift_template_id
    WHERE os.status = 'open'
      AND os.claimer_id IS NULL
      AND os.group_id IN (SELECT group_id FROM user_groups WHERE user_id = ?)
      AND NOT EXISTS (
        SELECT 1 FROM schedule_shifts ss
        JOIN schedules sc ON ss.schedule_id = sc.id
        WHERE ss.user_id = ? AND ss.date = os.date
          AND ss.is_deleted = 0 AND sc.status = 'published'
      )
    ORDER BY os.date, os.start_time
  `).all(userId, userId);
}

function getOpenShiftsForWeek(weekStart, db = _db) {
  const weekEnd = addDaysToDateString(weekStart, 6);
  return db.prepare(`
    SELECT os.*, g.name AS group_name, g.color AS group_color,
           st.name AS template_name,
           u.name AS claimer_name
    FROM open_shifts os
    JOIN groups g ON g.id = os.group_id
    LEFT JOIN shift_templates st ON st.id = os.shift_template_id
    LEFT JOIN users u ON u.id = os.claimer_id
    WHERE os.status NOT IN ('cancelled', 'denied', 'auto_approved', 'manager_approved')
      AND os.date BETWEEN ? AND ?
    ORDER BY os.date, os.start_time
  `).all(weekStart, weekEnd);
}

function getPendingOpenShifts(db = _db) {
  return db.prepare(`
    SELECT os.*, g.name AS group_name, g.color AS group_color,
           st.name AS template_name,
           u.name AS claimer_name
    FROM open_shifts os
    JOIN groups g ON g.id = os.group_id
    LEFT JOIN shift_templates st ON st.id = os.shift_template_id
    LEFT JOIN users u ON u.id = os.claimer_id
    WHERE os.status = 'pending_manager'
    ORDER BY os.created_at
  `).all();
}

function cancelOpenShift(id, db = _db) {
  return db.prepare(
    `UPDATE open_shifts SET status = 'cancelled', resolved_at = unixepoch()
     WHERE id = ? AND status = 'open'`
  ).run(id);
}

function claimOpenShift(id, claimerId, status, db = _db) {
  return db.prepare(
    `UPDATE open_shifts SET claimer_id = ?, status = ?,
     resolved_at = CASE WHEN ? = 'auto_approved' THEN unixepoch() ELSE NULL END
     WHERE id = ? AND status = 'open'`
  ).run(claimerId, status, status, id);
}

function resolveOpenShift(id, status, db = _db) {
  return db.prepare(
    `UPDATE open_shifts SET status = ?, resolved_at = unixepoch() WHERE id = ?`
  ).run(status, id);
}

function insertShiftFromOpenShift(openShift, claimerId, scheduleId, db = _db) {
  return db.prepare(`
    INSERT INTO schedule_shifts
      (schedule_id, user_id, group_id, shift_template_id, date, start_time, hours, note, is_fixed, is_override)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
    RETURNING id
  `).get(
    scheduleId, claimerId, openShift.group_id, openShift.shift_template_id,
    openShift.date, openShift.start_time, openShift.hours, openShift.note
  );
}

module.exports = {
  getWeekStartOf,
  createOpenShift,
  getOpenShiftById,
  getOpenShiftsForUser,
  getOpenShiftsForWeek,
  getPendingOpenShifts,
  cancelOpenShift,
  claimOpenShift,
  resolveOpenShift,
  insertShiftFromOpenShift,
};
