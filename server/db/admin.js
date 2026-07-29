'use strict';
const _db = require('./db');

function getSettings(db = _db) {
  return db.prepare('SELECT key, value FROM app_settings').all();
}

function upsertSetting(key, value, db = _db) {
  return db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
}

function getAllUsersAdmin(db = _db) {
  return db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.is_active,
           u.min_hours_per_week, u.max_hours_per_week,
           u.created_at, u.last_login_at,
           GROUP_CONCAT(g.name) AS group_names
    FROM users u
    LEFT JOIN user_groups ug ON ug.user_id = u.id
    LEFT JOIN groups g ON g.id = ug.group_id
    GROUP BY u.id
    ORDER BY u.name
  `).all();
}

function promoteUser(id, role, db = _db) {
  return db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
}

/**
 * Number of admin accounts that can still log in.
 *
 * Counts active admins only: a deactivated admin cannot authenticate, so
 * treating one as "an admin still exists" would let the last usable admin be
 * removed. Callers use this to refuse any change that would leave an instance
 * with no way back in — there is no vendor support desk for a self-hosted app.
 */
function countActiveAdmins(db = _db) {
  return db.prepare(
    `SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1`
  ).get().n;
}

function hasPublishedShifts(userId, db = _db) {
  const row = db.prepare(`
    SELECT 1 FROM schedule_shifts ss
    JOIN schedules s ON s.id = ss.schedule_id
    WHERE ss.user_id = ? AND s.status = 'published'
    LIMIT 1
  `).get(userId);
  return !!row;
}

function hardDeleteUser(id, db = _db) {
  return db.transaction(() => {
    // Nullify nullable schedule references (no CASCADE defined)
    db.prepare('UPDATE schedules SET published_by = NULL WHERE published_by = ?').run(id);
    // Delete non-CASCADE child records
    db.prepare('DELETE FROM shift_swaps WHERE requester_id = ? OR claimer_id = ?').run(id, id);
    db.prepare('DELETE FROM schedule_template_shifts WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM schedule_templates WHERE created_by = ?').run(id);
    db.prepare('DELETE FROM open_shifts WHERE created_by = ?').run(id);
    // schedule_shifts is ON DELETE RESTRICT — delete before the user row
    db.prepare('DELETE FROM schedule_shifts WHERE user_id = ?').run(id);
    // Clean up any draft schedules this user created (published ones blocked upstream)
    db.prepare(`DELETE FROM schedule_shifts WHERE schedule_id IN
      (SELECT id FROM schedules WHERE created_by = ?)`).run(id);
    db.prepare('DELETE FROM schedules WHERE created_by = ?').run(id);
    // Delete user — CASCADE handles user_groups, availability, time_off_requests,
    //   fixed_schedules, push_subscriptions, notifications, login_events
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  })();
}

function getLoginHistory(userId, limit = 20, db = _db) {
  return db.prepare(
    'SELECT id, logged_in_at FROM login_events WHERE user_id = ? ORDER BY logged_in_at DESC LIMIT ?'
  ).all(userId, limit);
}

function recordLoginEvent(userId, db = _db) {
  return db.prepare('INSERT INTO login_events (user_id) VALUES (?)').run(userId);
}

function clearExpiredTokens(db = _db) {
  const result = db.prepare(
    `UPDATE users SET claim_token = NULL, claim_token_expires_at = NULL
     WHERE claim_token IS NOT NULL AND claim_token_expires_at < unixepoch()`
  ).run();
  return result.changes;
}

module.exports = {
  getSettings, upsertSetting, getAllUsersAdmin, promoteUser, countActiveAdmins,
  hasPublishedShifts, hardDeleteUser, getLoginHistory, recordLoginEvent, clearExpiredTokens,
};
