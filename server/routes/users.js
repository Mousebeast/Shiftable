'use strict';

const express = require('express');
const { randomUUID } = require('crypto');
const { requireManager } = require('../middleware/auth');
const {
  getAllUsers, createUser, updateUser, reorderUsers, deactivateUser, setClaimToken, setUserGroups,
  getUserById, getUserWithGroups,
} = require('../db/users');
const { getFixedSchedulesForUser, upsertFixedSchedule, deleteFixedSchedule, getAllFixedSchedules } = require('../db/fixedSchedules');
const { sendWelcomeEmail, sendPinResetEmail } = require('../services/email');
const { sendClaimSms, sendPinResetSms } = require('../services/sms');
const { cancelSwapsForUser } = require('../db/swaps');

const db = require('../db/db');
const router = express.Router();

const CLAIM_TTL_SEC = 72 * 60 * 60;

function makeClaimUrl(token) {
  const setting = db.prepare("SELECT value FROM app_settings WHERE key = 'app_url'").get();
  const base = setting?.value || process.env.APP_URL || 'http://localhost:5173';
  return `${base}/claim?token=${token}`;
}

router.get('/', requireManager, (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  const users = getAllUsers(includeInactive);
  return res.json({ users });
});

router.post('/', requireManager, (req, res) => {
  const { phone, role, minHours = 0, maxHours = 40, groupIds = [], minShifts = null, maxShifts = null } = req.body;
  const name = req.body.name?.trim();
  const email = req.body.email?.trim().toLowerCase() || null;
  if (!name || !role) {
    return res.status(400).json({ error: 'name and role are required' });
  }
  if (!['staff', 'manager'].includes(role)) {
    return res.status(400).json({ error: 'role must be staff or manager' });
  }
  if (typeof minHours !== 'number' || typeof maxHours !== 'number' ||
      minHours < 0 || maxHours < minHours) {
    return res.status(400).json({ error: 'minHours and maxHours must be non-negative numbers with maxHours >= minHours' });
  }
  const minS = minShifts !== null && minShifts !== '' ? Number(minShifts) : null;
  const maxS = maxShifts !== null && maxShifts !== '' ? Number(maxShifts) : null;
  if (minS !== null && maxS !== null && minS > maxS) {
    return res.status(400).json({ error: 'minShifts must be <= maxShifts' });
  }
  let user;
  try {
    user = createUser(name, email, role, minHours, maxHours, undefined, phone, minS, maxS);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed: users.email')) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    throw err;
  }
  setUserGroups(user.id, groupIds);
  const token = randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + CLAIM_TTL_SEC;
  setClaimToken(user.id, token, expiresAt);
  const claimUrl = makeClaimUrl(token);
  if (user.email) sendWelcomeEmail(user, claimUrl).catch(() => {});
  if (user.email || user.phone) sendClaimSms(user, claimUrl).catch(() => {});
  return res.status(201).json({ user: getUserWithGroups(user.id), claimUrl });
});

// Fix 5: guard deactivate — self, 404, and admin-role checks
router.patch('/:id/deactivate', requireManager, (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.userId) {
    return res.status(400).json({ error: 'Cannot deactivate your own account' });
  }
  const target = getUserById(targetId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'admin') {
    return res.status(403).json({ error: 'Cannot deactivate an admin account' });
  }
  deactivateUser(targetId);
  cancelSwapsForUser(targetId);
  return res.json({ ok: true });
});

router.patch('/reorder', requireManager, (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds) || orderedIds.some(id => !Number.isInteger(Number(id)))) {
    return res.status(400).json({ error: 'orderedIds must be an array of user IDs' });
  }
  reorderUsers(orderedIds.map(Number));
  return res.json({ ok: true });
});

router.patch('/:id', requireManager, (req, res) => {
  const { phone, role, minHours, maxHours, groupIds = [], minShifts, maxShifts } = req.body;
  const name = req.body.name?.trim();
  const email = req.body.email?.trim().toLowerCase() || null;
  const targetId = Number(req.params.id);
  if (!name || !role) {
    return res.status(400).json({ error: 'name and role are required' });
  }
  const isSelfEdit = targetId === req.user.userId;
  const allowedRoles = isSelfEdit && req.user.role === 'admin'
    ? ['staff', 'manager', 'admin']
    : ['staff', 'manager'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'role must be staff or manager' });
  }
  const target = getUserById(targetId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'admin' && !isSelfEdit) {
    return res.status(403).json({ error: 'Cannot edit an admin account. To assign groups, use Group Management instead.' });
  }
  if (minHours !== undefined || maxHours !== undefined) {
    const min = minHours ?? 0;
    const max = maxHours ?? min;
    if (typeof min !== 'number' || typeof max !== 'number' || min < 0 || max < min) {
      return res.status(400).json({ error: 'minHours and maxHours must be non-negative numbers with maxHours >= minHours' });
    }
  }
  const minS = (minShifts != null && minShifts !== '') ? Number(minShifts) : null;
  const maxS = (maxShifts != null && maxShifts !== '') ? Number(maxShifts) : null;
  if (minS != null && maxS != null && minS > maxS) {
    return res.status(400).json({ error: 'minShifts must be <= maxShifts' });
  }
  const user = updateUser(targetId, { name, email, phone, role, minHours, maxHours, minShifts: minS, maxShifts: maxS });
  if (!user) return res.status(404).json({ error: 'User not found' });
  setUserGroups(user.id, groupIds);
  return res.json({ user: getUserWithGroups(user.id) });
});

// Fix 6 + Fix 3B: fetch user first (404 + admin guard), then regenerate
router.post('/:id/regenerate-link', requireManager, (req, res) => {
  const targetId = Number(req.params.id);
  const target = getUserById(targetId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'admin') {
    return res.status(403).json({ error: 'Cannot regenerate link for an admin account' });
  }
  const token = randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + CLAIM_TTL_SEC;
  setClaimToken(targetId, token, expiresAt);
  const claimUrl = makeClaimUrl(token);
  sendPinResetEmail(target, claimUrl).catch(() => {});
  sendPinResetSms(target, claimUrl).catch(() => {});
  return res.json({ claimUrl });
});

router.get('/all-fixed-schedules', requireManager, (req, res) => {
  return res.json({ schedules: getAllFixedSchedules() });
});

router.get('/:id/fixed-schedules', requireManager, (req, res) => {
  const userId = Number(req.params.id);
  const user = getUserById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const schedules = getFixedSchedulesForUser(userId);
  return res.json({ schedules });
});

router.put('/:id/fixed-schedules/:day', requireManager, (req, res) => {
  const day = Number(req.params.day);
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    return res.status(400).json({ error: 'day must be 0–6' });
  }
  const { templateId } = req.body;
  if (!templateId) return res.status(400).json({ error: 'templateId is required' });
  let schedule;
  try {
    schedule = upsertFixedSchedule(Number(req.params.id), day, Number(templateId));
  } catch (err) {
    if (err.message && err.message.includes('FOREIGN KEY constraint failed')) {
      return res.status(422).json({ error: 'User or shift template not found' });
    }
    throw err;
  }
  return res.json({ schedule });
});

router.delete('/:id/fixed-schedules/:day', requireManager, (req, res) => {
  const day = Number(req.params.day);
  const result = deleteFixedSchedule(Number(req.params.id), day);
  if (result.changes === 0) return res.status(404).json({ error: 'Fixed schedule not found' });
  return res.json({ ok: true });
});

module.exports = router;
