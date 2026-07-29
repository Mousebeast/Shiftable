'use strict';

const _db = require('./db');

function getAvailabilityForUser(userId, db = _db) {
  return db
    .prepare(
      `SELECT id, day_of_week, start_time, end_time, is_blocked, effective_from, status, created_at
       FROM availability
       WHERE user_id = ?
       ORDER BY created_at DESC, day_of_week`
    )
    .all(userId);
}

function getCurrentApprovedPattern(userId, db = _db) {
  const rows = db.prepare(
    `SELECT day_of_week, start_time, end_time, is_blocked, effective_from
     FROM availability
     WHERE user_id = ? AND status = 'approved'
     ORDER BY day_of_week, effective_from DESC, id DESC`
  ).all(userId);
  const seen = new Set();
  return rows.filter(row => {
    if (seen.has(row.day_of_week)) return false;
    seen.add(row.day_of_week);
    return true;
  });
}

function createAvailabilityEntries(userId, entries, db = _db) {
  const insert = db.prepare(
    `INSERT INTO availability (user_id, day_of_week, start_time, end_time, is_blocked, effective_from, status)
     VALUES (@userId, @day_of_week, @start_time, @end_time, @is_blocked, @effective_from, 'pending')`
  );
  const insertAll = db.transaction((rows) => {
    for (const row of rows) insert.run(row);
  });
  insertAll(entries.map((e) => ({ ...e, userId })));
}

function approveAvailability(id, managerId, db = _db) {
  return db.prepare(
    `UPDATE availability SET status = 'approved', approved_by = ?, approved_at = unixepoch()
     WHERE id = ? AND status = 'pending'`
  ).run(managerId, id);
}

function denyAvailability(id, managerId, db = _db) {
  return db.prepare(
    `UPDATE availability SET status = 'denied', approved_by = ?, approved_at = unixepoch()
     WHERE id = ? AND status = 'pending'`
  ).run(managerId, id);
}

function getPendingAvailability(db = _db) {
  return db
    .prepare(
      `SELECT a.id, a.user_id, a.day_of_week, a.start_time, a.end_time, a.is_blocked, a.effective_from,
              a.created_at, u.name AS user_name
       FROM availability a
       JOIN users u ON u.id = a.user_id
       WHERE a.status = 'pending'
       ORDER BY a.created_at`
    )
    .all();
}

function getAvailabilityById(id, db = _db) {
  return db.prepare('SELECT * FROM availability WHERE id = ?').get(id);
}

function getAllStaffAvailability(db = _db) {
  const users = db.prepare(
    `SELECT id, name FROM users WHERE is_active = 1 ORDER BY name`
  ).all();
  const groupRows = db.prepare(
    `SELECT ug.user_id, g.id, g.name, g.color, g.priority
     FROM user_groups ug JOIN groups g ON g.id = ug.group_id`
  ).all();
  const groupsByUser = {};
  for (const row of groupRows) {
    if (!groupsByUser[row.user_id]) groupsByUser[row.user_id] = [];
    groupsByUser[row.user_id].push({ id: row.id, name: row.name, color: row.color, priority: row.priority });
  }
  const allAvail = db.prepare(
    `SELECT user_id, day_of_week, start_time, end_time, is_blocked
     FROM availability
     WHERE status = 'approved'
     ORDER BY user_id, day_of_week, effective_from DESC, id DESC`
  ).all();
  const availMap = {};
  for (const row of allAvail) {
    if (!availMap[row.user_id]) availMap[row.user_id] = {};
    if (!availMap[row.user_id][row.day_of_week]) {
      availMap[row.user_id][row.day_of_week] = {
        day_of_week: row.day_of_week,
        start_time: row.start_time,
        end_time: row.end_time,
        is_blocked: row.is_blocked,
      };
    }
  }
  return users.map(u => ({
    id: u.id,
    name: u.name,
    groups: groupsByUser[u.id] || [],
    availability: Object.values(availMap[u.id] || {}),
  }));
}

function upsertManagerAvailability(userId, dayOfWeek, startTime, endTime, isBlocked, managerId, effectiveFrom, db = _db) {
  db.prepare(
    `DELETE FROM availability WHERE user_id=? AND day_of_week=? AND effective_from=? AND status='approved'`
  ).run(userId, dayOfWeek, effectiveFrom);
  db.prepare(
    `INSERT INTO availability (user_id, day_of_week, start_time, end_time, is_blocked, effective_from, status, approved_by, approved_at)
     VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, unixepoch())`
  ).run(userId, dayOfWeek, startTime, endTime, isBlocked ? 1 : 0, effectiveFrom, managerId);
}

function clearManagerAvailability(userId, dayOfWeek, managerId, db = _db) {
  db.prepare(
    `UPDATE availability SET status = 'denied', approved_by = ?, approved_at = unixepoch()
     WHERE user_id = ? AND day_of_week = ? AND status = 'approved'`
  ).run(managerId, userId, dayOfWeek);
}

module.exports = {
  getAvailabilityForUser,
  getCurrentApprovedPattern,
  createAvailabilityEntries,
  approveAvailability,
  denyAvailability,
  getPendingAvailability,
  getAvailabilityById,
  getAllStaffAvailability,
  upsertManagerAvailability,
  clearManagerAvailability,
};
