'use strict';

const express = require('express');
const { requireStaff, requireManager } = require('../middleware/auth');
const { notifyApprovers } = require('../services/approverNotify');
const {
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
} = require('../db/availability');
const { createNotification } = require('../db/notifications');
const { sendToUser } = require('../services/push');
const { isWeekStartDateString, WEEK_START_NAME } = require('../services/dates');

const router = express.Router();

// GET /api/availability — caller's history + current approved pattern
router.get('/', requireStaff, (req, res) => {
  const history = getAvailabilityForUser(req.user.userId);
  const current = getCurrentApprovedPattern(req.user.userId);
  return res.json({ history, current });
});

// POST /api/availability — submit a new availability pattern change request
router.post('/', requireStaff, (req, res) => {
  const { entries, effectiveFrom } = req.body;
  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'entries must be a non-empty array' });
  }
  if (!effectiveFrom || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    return res.status(400).json({ error: 'effectiveFrom required (YYYY-MM-DD)' });
  }
  // Validate effectiveFrom falls on the configured week start
  if (!isWeekStartDateString(effectiveFrom)) {
    return res.status(400).json({ error: `effectiveFrom must be a ${WEEK_START_NAME}` });
  }
  for (const e of entries) {
    if (!Number.isInteger(e.day_of_week) || e.day_of_week < 0 || e.day_of_week > 6) {
      return res.status(400).json({ error: 'day_of_week must be 0–6' });
    }
    if (!e.is_blocked) {
      if (!e.start_time || !e.end_time) {
        return res.status(400).json({ error: 'start_time and end_time required unless is_blocked' });
      }
      if (e.start_time >= e.end_time) {
        return res.status(400).json({ error: 'start_time must be before end_time' });
      }
    }
  }
  createAvailabilityEntries(
    req.user.userId,
    entries.map((e) => ({
      day_of_week: e.day_of_week,
      start_time: e.is_blocked ? '00:00' : e.start_time,
      end_time: e.is_blocked ? '00:00' : e.end_time,
      is_blocked: e.is_blocked ? 1 : 0,
      effective_from: effectiveFrom,
    })),
  );
  notifyApprovers({
    excludeUserId: req.user.userId,
    type: 'availability_requested',
    title: 'Availability Change Requested',
    body: `${req.user.name || 'A staff member'} requested a change effective ${effectiveFrom}.`,
  });
  return res.status(201).json({ ok: true });
});

// GET /api/availability/pending — manager: list all pending requests
router.get('/pending', requireManager, (req, res) => {
  return res.json({ requests: getPendingAvailability() });
});

// PATCH /api/availability/:id/approve — manager
router.patch('/:id/approve', requireManager, (req, res) => {
  const id = Number(req.params.id);
  const avail = getAvailabilityById(id);
  const result = approveAvailability(id, req.user.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found or not pending' });
  if (avail) {
    createNotification({ userId: avail.user_id, type: 'availability_resolved', title: 'Availability Approved', body: 'Your availability change has been approved.', data: { url: '/availability' } });
    sendToUser(avail.user_id, { title: 'Availability Approved', body: 'Your availability change has been approved.', data: { url: '/availability' } }); // fire-and-forget
  }
  return res.json({ ok: true });
});

// PATCH /api/availability/:id/deny — manager
router.patch('/:id/deny', requireManager, (req, res) => {
  const id = Number(req.params.id);
  const avail = getAvailabilityById(id);
  const result = denyAvailability(id, req.user.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found or not pending' });
  if (avail) {
    createNotification({ userId: avail.user_id, type: 'availability_resolved', title: 'Availability Denied', body: 'Your availability change has been denied.', data: { url: '/availability' } });
    sendToUser(avail.user_id, { title: 'Availability Denied', body: 'Your availability change has been denied.', data: { url: '/availability' } }); // fire-and-forget
  }
  return res.json({ ok: true });
});

// GET /api/availability/manager/all — all staff with current approved patterns
router.get('/manager/all', requireManager, (req, res) => {
  return res.json({ staff: getAllStaffAvailability() });
});

// PUT /api/availability/manager/:userId/:day — set a day directly (auto-approved)
router.put('/manager/:userId/:day', requireManager, (req, res) => {
  const userId = Number(req.params.userId);
  const dayOfWeek = Number(req.params.day);
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return res.status(400).json({ error: 'day must be 0–6' });
  }
  const { startTime, endTime, effectiveFrom, isBlocked } = req.body;
  if (!effectiveFrom) {
    return res.status(400).json({ error: 'effectiveFrom required' });
  }
  if (!isBlocked && (!startTime || !endTime)) {
    return res.status(400).json({ error: 'startTime and endTime required unless isBlocked' });
  }
  if (!isWeekStartDateString(effectiveFrom)) {
    return res.status(400).json({ error: `effectiveFrom must be a ${WEEK_START_NAME}` });
  }
  upsertManagerAvailability(userId, dayOfWeek, isBlocked ? '00:00' : startTime, isBlocked ? '00:00' : endTime, isBlocked, req.user.userId, effectiveFrom);
  return res.json({ ok: true });
});

// DELETE /api/availability/manager/:userId/:day — clear a day (removes availability)
router.delete('/manager/:userId/:day', requireManager, (req, res) => {
  const userId = Number(req.params.userId);
  const dayOfWeek = Number(req.params.day);
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return res.status(400).json({ error: 'day must be 0–6' });
  }
  clearManagerAvailability(userId, dayOfWeek, req.user.userId);
  return res.json({ ok: true });
});

module.exports = router;
