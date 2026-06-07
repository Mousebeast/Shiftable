/**
 * server/db/users.js — User DB helpers
 *
 * Synchronous query helpers for the users table.
 * All functions accept an optional `db` parameter to allow injection
 * of an in-memory test database. When omitted, the singleton is used.
 */

'use strict';

const { randomUUID } = require('crypto');
const _db = require('./db');

/**
 * getUserByClaimToken(token, db?)
 * Returns the user row whose claim_token matches and has not expired,
 * or undefined if not found / expired.
 */
function getUserByClaimToken(token, db = _db) {
  return db
    .prepare(
      `SELECT id, name, email, role, claim_token, claim_token_expires_at, is_active
       FROM users
       WHERE claim_token = ?
         AND claim_token_expires_at > unixepoch()
         AND is_active = 1`
    )
    .get(token);
}

/**
 * atomicClaimToken(token, db?)
 * Atomically validates and consumes a claim token in a single UPDATE…RETURNING.
 * Returns the user row (id, name, role) if the token was valid and is now cleared.
 * Returns undefined if the token was already consumed, expired, or invalid.
 *
 * This prevents TOCTOU races: two concurrent requests cannot both pass the
 * validity check because the UPDATE is atomic — only one will find a matching row.
 */
function atomicClaimToken(token, db = _db) {
  return db
    .prepare(
      `UPDATE users
       SET claim_token = NULL, claim_token_expires_at = NULL
       WHERE claim_token = ?
         AND claim_token_expires_at > unixepoch()
         AND is_active = 1
       RETURNING id, name, role`
    )
    .get(token);
}

/**
 * setPinHash(id, pinHash, db?)
 * Sets the pin_hash for the given user id.
 */
function setPinHash(id, pinHash, db = _db) {
  db.prepare(
    `UPDATE users SET pin_hash = ? WHERE id = ?`
  ).run(pinHash, id);
}

/**
 * getUserById(id, db?)
 * Returns the user row for the given id, or undefined if not found.
 */
function getUserById(id, db = _db) {
  return db
    .prepare(
      `SELECT id, name, email, role, pin_hash, is_active
       FROM users
       WHERE id = ?`
    )
    .get(id);
}

/**
 * getActiveUsersWithPin(db?)
 * Returns all active users that have already set a PIN (claimed their account).
 */
function getActiveUsersWithPin(db = _db) {
  return db
    .prepare(
      `SELECT id, name, role, pin_hash
       FROM users
       WHERE is_active = 1
         AND pin_hash IS NOT NULL`
    )
    .all();
}

/**
 * updateUserAfterClaim(id, pinHash, db?)
 * Sets pin_hash after successful account claim.
 * Note: claim_token is cleared atomically by atomicClaimToken() before this is called.
 */
function updateUserAfterClaim(id, pinHash, db = _db) {
  db.prepare(
    `UPDATE users SET pin_hash = ? WHERE id = ?`
  ).run(pinHash, id);
}

/**
 * updateLastLogin(id, db?)
 * Stamps last_login_at with the current Unix timestamp.
 */
function updateLastLogin(id, db = _db) {
  db.prepare(
    `UPDATE users SET last_login_at = unixepoch() WHERE id = ?`
  ).run(id);
}

function getAllUsers(includeInactive = false, db = _db) {
  const users = db
    .prepare(
      `SELECT id, name, email, phone, role, min_hours_per_week, max_hours_per_week,
              priority_order, min_shifts_per_week, max_shifts_per_week,
              is_active, created_at, last_login_at,
              CASE WHEN claim_token IS NOT NULL THEN 1 ELSE 0 END as has_claim_token
       FROM users
       ${includeInactive ? '' : 'WHERE is_active = 1'}
       ORDER BY priority_order ASC`
    )
    .all();
  const getGroups = db.prepare(
    `SELECT g.id, g.name, g.color, g.priority FROM groups g
     JOIN user_groups ug ON ug.group_id = g.id
     WHERE ug.user_id = ?`
  );
  return users.map(u => ({ ...u, groups: getGroups.all(u.id) }));
}

function createUser(name, email, role, minHours, maxHours, db = _db, phone = null, minShifts = null, maxShifts = null) {
  const { mo } = db.prepare(`SELECT COALESCE(MAX(priority_order), 0) AS mo FROM users WHERE is_active = 1`).get();
  return db
    .prepare(
      `INSERT INTO users (name, email, phone, role, min_hours_per_week, max_hours_per_week, priority_order, min_shifts_per_week, max_shifts_per_week)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, name, email, phone, role, min_hours_per_week, max_hours_per_week,
                 priority_order, min_shifts_per_week, max_shifts_per_week, is_active`
    )
    .get(name, email, phone || null, role, minHours, maxHours, mo + 1, minShifts, maxShifts);
}

function updateUser(id, { name, email, phone, role, minHours, maxHours, minShifts, maxShifts }, db = _db) {
  const existing = db.prepare(
    `SELECT min_hours_per_week, max_hours_per_week, phone, min_shifts_per_week, max_shifts_per_week FROM users WHERE id = ?`
  ).get(id);
  if (!existing) return undefined;
  const finalMin = minHours ?? existing.min_hours_per_week;
  const finalMax = maxHours ?? existing.max_hours_per_week;
  const finalPhone = phone !== undefined ? (phone || null) : existing.phone;
  const finalMinShifts = minShifts !== undefined ? minShifts : existing.min_shifts_per_week;
  const finalMaxShifts = maxShifts !== undefined ? maxShifts : existing.max_shifts_per_week;
  return db
    .prepare(
      `UPDATE users SET name = ?, email = ?, phone = ?, role = ?,
              min_hours_per_week = ?, max_hours_per_week = ?,
              min_shifts_per_week = ?, max_shifts_per_week = ?
       WHERE id = ?
       RETURNING id, name, email, phone, role, min_hours_per_week, max_hours_per_week,
                 priority_order, min_shifts_per_week, max_shifts_per_week, is_active`
    )
    .get(name, email, finalPhone, role, finalMin, finalMax, finalMinShifts, finalMaxShifts, id);
}

function deactivateUser(id, db = _db) {
  return db.prepare(`UPDATE users SET is_active = 0 WHERE id = ?`).run(id);
}

function getUserByEmail(email, db = _db) {
  return db.prepare(
    `SELECT id, name, email, role, is_active FROM users WHERE email = ?`
  ).get(email);
}

function setClaimToken(id, token, expiresAt, db = _db) {
  return db.prepare(
    `UPDATE users SET claim_token = ?, claim_token_expires_at = ? WHERE id = ?`
  ).run(token, expiresAt, id);
}

function setUserGroups(userId, groupIds, db = _db) {
  const clear = db.prepare(`DELETE FROM user_groups WHERE user_id = ?`);
  const insert = db.prepare(`INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)`);
  db.transaction((uid, gids) => {
    clear.run(uid);
    for (const gid of gids) insert.run(uid, gid);
  })(userId, groupIds);
}

function getActiveUserIds(groupId = null, db = _db) {
  if (groupId) {
    return db.prepare(
      `SELECT u.id FROM users u
       JOIN user_groups ug ON ug.user_id = u.id
       WHERE ug.group_id = ? AND u.is_active = 1`
    ).all(groupId).map(r => r.id);
  }
  return db.prepare(`SELECT id FROM users WHERE is_active = 1`).all().map(r => r.id);
}

function reorderUsers(orderedIds, db = _db) {
  const update = db.prepare(`UPDATE users SET priority_order = ? WHERE id = ? AND is_active = 1`);
  db.transaction((ids) => {
    ids.forEach((id, idx) => update.run(idx + 1, id));
  })(orderedIds);
}

function getUserWithGroups(id, db = _db) {
  const user = db.prepare(
    `SELECT id, name, email, phone, role, min_hours_per_week, max_hours_per_week,
            priority_order, min_shifts_per_week, max_shifts_per_week,
            is_active, created_at, last_login_at,
            CASE WHEN claim_token IS NOT NULL THEN 1 ELSE 0 END as has_claim_token
     FROM users WHERE id = ?`
  ).get(id);
  if (!user) return null;
  user.groups = db.prepare(
    `SELECT g.id, g.name, g.color, g.priority FROM groups g
     JOIN user_groups ug ON ug.group_id = g.id WHERE ug.user_id = ?`
  ).all(id);
  return user;
}

function getOrCreateIcalToken(userId, db = _db) {
  const row = db.prepare('SELECT ical_token FROM users WHERE id = ?').get(userId);
  if (row?.ical_token) return row.ical_token;
  const token = randomUUID();
  db.prepare('UPDATE users SET ical_token = ? WHERE id = ?').run(token, userId);
  return token;
}

function regenerateIcalToken(userId, db = _db) {
  const token = randomUUID();
  db.prepare('UPDATE users SET ical_token = ? WHERE id = ?').run(token, userId);
  return token;
}

module.exports = {
  getUserByClaimToken,
  atomicClaimToken,
  setPinHash,
  getUserById,
  getActiveUsersWithPin,
  updateUserAfterClaim,
  updateLastLogin,
  getAllUsers,
  createUser,
  updateUser,
  reorderUsers,
  deactivateUser,
  getUserByEmail,
  setClaimToken,
  setUserGroups,
  getActiveUserIds,
  getUserWithGroups,
  getOrCreateIcalToken,
  regenerateIcalToken,
};
