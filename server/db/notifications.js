'use strict';

const _db = require('./db');

function getNotificationsForUser(userId, db = _db) {
  return db
    .prepare(
      `SELECT id, type, title, body, data, read_at, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`
    )
    .all(userId);
}

function getUnreadCount(userId, db = _db) {
  return db
    .prepare(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL`
    )
    .get(userId).count;
}

function markAllRead(userId, db = _db) {
  db.prepare(
    `UPDATE notifications SET read_at = unixepoch() WHERE user_id = ? AND read_at IS NULL`
  ).run(userId);
}

function clearAllNotifications(userId, db = _db) {
  db.prepare(`DELETE FROM notifications WHERE user_id = ?`).run(userId);
}

function createNotification({ userId, type, title, body, data = null }, db = _db) {
  return db
    .prepare(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id`
    )
    .get(userId, type, title, body, data ? JSON.stringify(data) : null);
}

function insertBroadcast(title, body, userIds, db = _db) {
  const stmt = db.prepare(
    `INSERT INTO notifications (user_id, type, title, body) VALUES (?, 'broadcast', ?, ?)`
  );
  db.transaction((ids) => {
    for (const id of ids) stmt.run(id, title, body);
  })(userIds);
}

module.exports = { getNotificationsForUser, getUnreadCount, markAllRead, clearAllNotifications, createNotification, insertBroadcast };
