'use strict';
const _db = require('./db');

function getTimeOffForUser(userId, db = _db) {
  return db.prepare(
    `SELECT id, start_date, end_date, reason, status, manager_note, created_at
     FROM time_off_requests
     WHERE user_id = ?
     ORDER BY created_at DESC`
  ).all(userId);
}

function createTimeOffRequest(userId, startDate, endDate, reason, db = _db) {
  return db.prepare(
    `INSERT INTO time_off_requests (user_id, start_date, end_date, reason, status)
     VALUES (?, ?, ?, ?, 'pending')
     RETURNING id`
  ).get(userId, startDate, endDate, reason || null);
}

function approveTimeOff(id, managerId, managerNote, db = _db) {
  return db.prepare(
    `UPDATE time_off_requests
     SET status = 'approved', approved_by = ?, approved_at = unixepoch(), manager_note = ?
     WHERE id = ? AND status = 'pending'`
  ).run(managerId, managerNote || null, id);
}

function denyTimeOff(id, managerId, managerNote, db = _db) {
  return db.prepare(
    `UPDATE time_off_requests
     SET status = 'denied', approved_by = ?, approved_at = unixepoch(), manager_note = ?
     WHERE id = ? AND status = 'pending'`
  ).run(managerId, managerNote || null, id);
}

function getPendingTimeOff(db = _db) {
  return db.prepare(
    `SELECT t.id, t.user_id, t.start_date, t.end_date, t.reason, t.created_at,
            u.name AS user_name
     FROM time_off_requests t
     JOIN users u ON u.id = t.user_id
     WHERE t.status = 'pending'
     ORDER BY t.start_date`
  ).all();
}

function getTimeOffById(id, db = _db) {
  return db.prepare('SELECT * FROM time_off_requests WHERE id = ?').get(id);
}

function getPublishedShiftsConflicting(userId, startDate, endDate, db = _db) {
  return db.prepare(
    `SELECT ss.date, ss.start_time, ss.hours, g.name AS group_name
     FROM schedule_shifts ss
     JOIN schedules s ON s.id = ss.schedule_id
     JOIN groups g ON g.id = ss.group_id
     WHERE ss.user_id = ?
       AND s.status = 'published'
       AND ss.is_deleted = 0
       AND ss.date >= ?
       AND ss.date <= ?
     ORDER BY ss.date`
  ).all(userId, startDate, endDate);
}

module.exports = { getTimeOffForUser, createTimeOffRequest, approveTimeOff, denyTimeOff, getPendingTimeOff, getTimeOffById, getPublishedShiftsConflicting };
