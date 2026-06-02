'use strict';
const _db = require('./db');

function getOpenSwapsForUser(userId, db = _db) {
  // Open swaps the user could claim: same group, not their own
  return db.prepare(
    `SELECT sw.id, sw.status, sw.requester_id, sw.created_at,
            ss.date, ss.start_time, ss.hours,
            g.name AS group_name, g.color AS group_color,
            u.name AS requester_name
     FROM shift_swaps sw
     JOIN schedule_shifts ss ON ss.id = sw.original_shift_id
     JOIN groups g ON g.id = ss.group_id
     JOIN users u ON u.id = sw.requester_id
     JOIN user_groups ug ON ug.group_id = ss.group_id AND ug.user_id = ?
     WHERE sw.status = 'open'
       AND sw.requester_id != ?
       AND ss.date >= date('now')
     ORDER BY ss.date`
  ).all(userId, userId);
}

function getMySwaps(userId, db = _db) {
  return db.prepare(
    `SELECT sw.id, sw.status, sw.created_at, sw.resolved_at,
            ss.date, ss.start_time, ss.hours,
            g.name AS group_name,
            claimer.name AS claimer_name
     FROM shift_swaps sw
     JOIN schedule_shifts ss ON ss.id = sw.original_shift_id
     JOIN groups g ON g.id = ss.group_id
     LEFT JOIN users claimer ON claimer.id = sw.claimer_id
     WHERE sw.requester_id = ?
     ORDER BY sw.created_at DESC`
  ).all(userId);
}

function getShiftForSwap(shiftId, db = _db) {
  return db.prepare(
    `SELECT ss.*, s.week_start_date, s.status AS schedule_status
     FROM schedule_shifts ss
     JOIN schedules s ON s.id = ss.schedule_id
     WHERE ss.id = ?`
  ).get(shiftId);
}

function createSwapOffer(requesterId, shiftId, db = _db) {
  return db.prepare(
    `INSERT INTO shift_swaps (original_shift_id, requester_id, status)
     VALUES (?, ?, 'open')
     RETURNING id`
  ).get(shiftId, requesterId);
}

function claimSwap(swapId, claimerId, db = _db) {
  return db.prepare(
    `UPDATE shift_swaps SET claimer_id = ?, status = 'claimed' WHERE id = ? AND status = 'open'`
  ).run(claimerId, swapId);
}

function resolveSwap(swapId, status, db = _db) {
  db.prepare(
    `UPDATE shift_swaps SET status = ?, resolved_at = unixepoch() WHERE id = ?`
  ).run(status, swapId);
}

// Atomically resolves the swap status AND transfers the shift to the claimer.
// Used for both auto-approved and manager-approved paths.
function resolveAndTransfer(swapId, status, db = _db) {
  db.transaction(() => {
    const swap = db.prepare(`SELECT original_shift_id, claimer_id FROM shift_swaps WHERE id = ?`).get(swapId);
    if (!swap || !swap.claimer_id) return;
    db.prepare(`UPDATE schedule_shifts SET user_id = ? WHERE id = ?`).run(swap.claimer_id, swap.original_shift_id);
    db.prepare(`UPDATE shift_swaps SET status = ?, resolved_at = unixepoch() WHERE id = ?`).run(status, swapId);
  })();
}

function cancelSwapsForUser(userId, db = _db) {
  db.prepare(
    `UPDATE shift_swaps SET status = 'cancelled', resolved_at = unixepoch()
     WHERE status IN ('open', 'pending_manager')
       AND (requester_id = ? OR claimer_id = ?)`
  ).run(userId, userId);
}

function cancelSwap(swapId, requesterId, db = _db) {
  db.prepare(
    `UPDATE shift_swaps SET status = 'cancelled', resolved_at = unixepoch()
     WHERE id = ? AND requester_id = ? AND status = 'open'`
  ).run(swapId, requesterId);
}

function getSwapById(swapId, db = _db) {
  return db.prepare(`SELECT * FROM shift_swaps WHERE id = ?`).get(swapId);
}

function getUserGroupIds(userId, db = _db) {
  return db.prepare(`SELECT group_id FROM user_groups WHERE user_id = ?`)
    .all(userId).map((r) => r.group_id);
}

function getUserWeeklyHours(userId, weekStart, db = _db) {
  const row = db.prepare(
    `SELECT COALESCE(SUM(ss.hours), 0) AS total
     FROM schedule_shifts ss
     JOIN schedules s ON s.id = ss.schedule_id
     WHERE ss.user_id = ? AND s.week_start_date = ? AND s.status = 'published'`
  ).get(userId, weekStart);
  return row.total;
}

function isUserScheduledOnDate(userId, date, db = _db) {
  return !!db.prepare(
    `SELECT 1 FROM schedule_shifts ss
     JOIN schedules s ON s.id = ss.schedule_id
     WHERE ss.user_id = ? AND ss.date = ? AND s.status = 'published'`
  ).get(userId, date);
}

function getUserMaxHours(userId, db = _db) {
  const user = db.prepare(`SELECT max_hours_per_week FROM users WHERE id = ?`).get(userId);
  return user ? user.max_hours_per_week : 40;
}

function getPendingSwaps(db = _db) {
  return db.prepare(
    `SELECT sw.id, sw.status, sw.created_at,
            req.name AS requester_name, req.id AS requester_id,
            claimer.name AS claimer_name, claimer.id AS claimer_id,
            ss.date, ss.start_time, ss.hours,
            g.name AS group_name, g.color AS group_color
     FROM shift_swaps sw
     JOIN users req ON req.id = sw.requester_id
     LEFT JOIN users claimer ON claimer.id = sw.claimer_id
     JOIN schedule_shifts ss ON ss.id = sw.original_shift_id
     JOIN groups g ON g.id = ss.group_id
     WHERE sw.status = 'pending_manager'
     ORDER BY sw.created_at`
  ).all();
}

module.exports = {
  getOpenSwapsForUser, getMySwaps, getShiftForSwap, createSwapOffer,
  claimSwap, resolveSwap, resolveAndTransfer, cancelSwap, cancelSwapsForUser, getSwapById, getUserGroupIds,
  getUserWeeklyHours, isUserScheduledOnDate, getUserMaxHours,
  getPendingSwaps,
};
