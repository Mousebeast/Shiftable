'use strict';
const express = require('express');
const { requireStaff, requireManager } = require('../middleware/auth');
const { getTimeOffForUser, createTimeOffRequest, approveTimeOff, denyTimeOff, getPendingTimeOff, getTimeOffById, getPublishedShiftsConflicting } = require('../db/timeoff');
const { createNotification } = require('../db/notifications');
const { sendToUser } = require('../services/push');

const router = express.Router();

router.get('/', requireStaff, (req, res) => {
  return res.json({ requests: getTimeOffForUser(req.user.userId) });
});

router.post('/', requireStaff, (req, res) => {
  const { startDate, endDate, reason } = req.body;
  if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return res.status(400).json({ error: 'startDate and endDate (YYYY-MM-DD) required' });
  }
  if (startDate > endDate) {
    return res.status(400).json({ error: 'startDate must be on or before endDate' });
  }
  const today = new Date().toISOString().slice(0, 10);
  if (startDate < today) {
    return res.status(400).json({ error: 'startDate cannot be in the past' });
  }
  const row = createTimeOffRequest(req.user.userId, startDate, endDate, reason);
  return res.status(201).json({ id: row.id });
});

// GET /pending must be registered BEFORE /:id routes (Express route order)
router.get('/pending', requireManager, (req, res) => {
  return res.json({ pending: getPendingTimeOff() });
});

router.patch('/:id/approve', requireManager, (req, res) => {
  const id = Number(req.params.id);
  const toRequest = getTimeOffById(id);
  if (!toRequest || toRequest.status !== 'pending') {
    return res.status(404).json({ error: 'Not found or already resolved' });
  }
  if (!req.body.force) {
    const conflicts = getPublishedShiftsConflicting(toRequest.user_id, toRequest.start_date, toRequest.end_date);
    if (conflicts.length > 0) {
      return res.status(409).json({ conflicts });
    }
  }
  const result = approveTimeOff(id, req.user.userId, req.body.managerNote);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found or already resolved' });
  if (toRequest) {
    createNotification({ userId: toRequest.user_id, type: 'timeoff_resolved', title: 'Time Off Approved', body: 'Your time-off request has been approved.', data: { url: '/timeoff' } });
    sendToUser(toRequest.user_id, { title: 'Time Off Approved', body: 'Your time-off request has been approved.', data: { url: '/timeoff' } });
  }
  return res.json({ ok: true });
});

router.patch('/:id/deny', requireManager, (req, res) => {
  const id = Number(req.params.id);
  const toRequest = getTimeOffById(id);
  const result = denyTimeOff(id, req.user.userId, req.body.managerNote);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found or already resolved' });
  if (toRequest) {
    createNotification({ userId: toRequest.user_id, type: 'timeoff_resolved', title: 'Time Off Denied', body: 'Your time-off request has been denied.', data: { url: '/timeoff' } });
    sendToUser(toRequest.user_id, { title: 'Time Off Denied', body: 'Your time-off request has been denied.', data: { url: '/timeoff' } }); // fire-and-forget
  }
  return res.json({ ok: true });
});

module.exports = router;
