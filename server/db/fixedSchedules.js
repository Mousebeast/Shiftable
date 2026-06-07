'use strict';
const _db = require('./db');

function getFixedSchedulesForUser(userId, db = _db) {
  return db.prepare(
    `SELECT fs.id, fs.day_of_week, fs.shift_template_id,
            st.name AS template_name, st.start_time, st.hours,
            g.name AS group_name, g.id AS group_id
     FROM fixed_schedules fs
     JOIN shift_templates st ON st.id = fs.shift_template_id
     JOIN groups g ON g.id = st.group_id
     WHERE fs.user_id = ?
     ORDER BY fs.day_of_week`
  ).all(userId);
}

function upsertFixedSchedule(userId, dayOfWeek, templateId, db = _db) {
  return db.prepare(
    `INSERT INTO fixed_schedules (user_id, day_of_week, shift_template_id)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, day_of_week) DO UPDATE SET shift_template_id = excluded.shift_template_id
     RETURNING id, user_id, day_of_week, shift_template_id`
  ).get(userId, dayOfWeek, templateId);
}

function deleteFixedSchedule(userId, dayOfWeek, db = _db) {
  return db.prepare(
    `DELETE FROM fixed_schedules WHERE user_id = ? AND day_of_week = ?`
  ).run(userId, dayOfWeek);
}

function getAllFixedSchedules(db = _db) {
  const rows = db.prepare(
    `SELECT fs.user_id, fs.day_of_week, fs.shift_template_id,
            u.name AS user_name,
            st.name AS template_name, st.start_time, st.hours,
            g.id AS group_id, g.name AS group_name, g.color AS group_color
     FROM fixed_schedules fs
     JOIN users u ON u.id = fs.user_id AND u.is_active = 1
     JOIN shift_templates st ON st.id = fs.shift_template_id
     JOIN groups g ON g.id = st.group_id
     ORDER BY u.name, fs.day_of_week`
  ).all();
  return rows;
}

module.exports = { getFixedSchedulesForUser, upsertFixedSchedule, deleteFixedSchedule, getAllFixedSchedules };
