'use strict';
const _db = require('./db');

function getEventsForWeek(weekStart, db = _db) {
  const rows = db.prepare(
    `SELECT id, date, title FROM week_events WHERE week_start_date = ? ORDER BY date ASC, id ASC`
  ).all(weekStart);
  const result = {};
  for (const row of rows) {
    if (!result[row.date]) result[row.date] = [];
    result[row.date].push({ id: row.id, title: row.title });
  }
  return result;
}

function getEventCoverageForWeek(weekStart, db = _db) {
  return db.prepare(
    `SELECT wec.date,
            wec.group_id,
            g.name AS group_name,
            wec.shift_template_id,
            st.name AS template_name,
            st.start_time,
            st.hours,
            wec.required_staff
     FROM week_event_coverage wec
     JOIN groups g ON g.id = wec.group_id
     JOIN shift_templates st ON st.id = wec.shift_template_id
     WHERE wec.week_start_date = ?`
  ).all(weekStart);
}

function addEventTitle(weekStart, date, title, db = _db) {
  return db.prepare(
    `INSERT INTO week_events (week_start_date, date, title)
     VALUES (?, ?, ?) RETURNING id, week_start_date, date, title`
  ).get(weekStart, date, title);
}

function deleteEventTitle(id, db = _db) {
  db.prepare(`DELETE FROM week_events WHERE id = ?`).run(id);
}

function upsertEventCoverage(weekStart, date, groupId, templateId, requiredStaff, db = _db) {
  db.prepare(
    `INSERT INTO week_event_coverage (week_start_date, date, group_id, shift_template_id, required_staff)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(week_start_date, date) DO UPDATE SET
       group_id = excluded.group_id,
       shift_template_id = excluded.shift_template_id,
       required_staff = excluded.required_staff`
  ).run(weekStart, date, groupId, templateId, requiredStaff);
}

function deleteEventCoverage(weekStart, date, db = _db) {
  db.prepare(
    `DELETE FROM week_event_coverage WHERE week_start_date = ? AND date = ?`
  ).run(weekStart, date);
}

module.exports = {
  getEventsForWeek,
  getEventCoverageForWeek,
  addEventTitle,
  deleteEventTitle,
  upsertEventCoverage,
  deleteEventCoverage,
};
