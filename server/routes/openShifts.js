'use strict';
const express = require('express');
const { requireStaff, requireManager } = require('../middleware/auth');
const {
  createOpenShift, getOpenShiftById, getOpenShiftsForUser, getOpenShiftsForWeek,
  cancelOpenShift, claimOpenShift, insertShiftFromOpenShift, getWeekStartOf,
} = require('../db/openShifts');
const { getLiveScheduleForWeek } = require('../db/schedule');
const db = require('../db/db');
const { createNotification } = require('../db/notifications');
const { sendToUser, sendToUsers } = require('../services/push');
const { getActiveUserIds } = require('../db/users');

const router = express.Router();

// GET /api/open-shifts
// Staff: returns eligible open shifts for the caller.
// Manager + ?week=YYYY-MM-DD: returns all active open shifts for that week.
router.get('/', requireStaff, (req, res) => {
  const { week } = req.query;
  if (req.user.role !== 'staff' && week) {
    return res.json({ openShifts: getOpenShiftsForWeek(week) });
  }
  return res.json({ openShifts: getOpenShiftsForUser(req.user.userId) });
});

// POST /api/open-shifts — manager posts an open shift
router.post('/', requireManager, (req, res) => {
  const { groupId, shiftTemplateId, date, startTime, hours, note } = req.body;
  if (!groupId || !date || !startTime || !hours) {
    return res.status(400).json({ error: 'groupId, date, startTime, hours required' });
  }
  const row = createOpenShift({
    groupId: Number(groupId),
    shiftTemplateId: shiftTemplateId ? Number(shiftTemplateId) : null,
    date,
    startTime,
    hours: Number(hours),
    note: note || null,
    createdBy: req.user.userId,
  });

  const recipientIds = getActiveUserIds(Number(groupId));
  if (recipientIds.length > 0) {
    const title = 'Open Shift Available';
    const body = `A ${startTime} shift on ${date} is open to claim.`;
    const data = { url: '/' };
    for (const userId of recipientIds) {
      createNotification({ userId, type: 'open_shift', title, body, data });
    }
    sendToUsers(recipientIds, { title, body, data });
  }
  return res.status(201).json(row);
});

// DELETE /api/open-shifts/:id — manager cancels an open shift
router.delete('/:id', requireManager, (req, res) => {
  const result = cancelOpenShift(Number(req.params.id));
  if (result.changes === 0) return res.status(409).json({ error: 'Shift cannot be cancelled' });
  return res.json({ ok: true });
});

// POST /api/open-shifts/:id/claim — staff claims; always auto-approved
router.post('/:id/claim', requireStaff, (req, res) => {
  const id = Number(req.params.id);
  const userId = req.user.userId;

  const os = getOpenShiftById(id);
  if (!os || os.status !== 'open') return res.status(404).json({ error: 'Open shift not available' });

  // Verify caller belongs to this shift's group
  const inGroup = db.prepare(
    'SELECT 1 FROM user_groups WHERE user_id = ? AND group_id = ?'
  ).get(userId, os.group_id);
  if (!inGroup) return res.status(403).json({ error: 'You are not eligible for this shift' });

  const weekStart = getWeekStartOf(os.date);
  const schedule = getLiveScheduleForWeek(weekStart);
  if (!schedule) return res.status(409).json({ error: 'No published schedule for this week' });

  const txResult = db.transaction(() => {
    const conflict = db.prepare(
      `SELECT ss.id FROM schedule_shifts ss
       JOIN schedules sc ON ss.schedule_id = sc.id
       WHERE ss.user_id = ? AND ss.date = ? AND ss.is_deleted = 0 AND sc.status = 'published'
       LIMIT 1`
    ).get(userId, os.date);
    if (conflict) return 'conflict';

    const claim = claimOpenShift(id, userId, 'auto_approved');
    if (claim.changes === 0) return 'unavailable';

    insertShiftFromOpenShift(os, userId, schedule.id);
    return 'ok';
  })();

  if (txResult === 'conflict') return res.status(409).json({ error: 'You already have a shift on this day' });
  if (txResult === 'unavailable') return res.status(409).json({ error: 'Open shift no longer available' });

  const title = 'Shift Claimed';
  const body = `Your claim for the ${os.start_time} shift on ${os.date} was confirmed.`;
  const data = { url: '/schedule' };
  createNotification({ userId, type: 'open_shift', title, body, data });
  sendToUser(userId, { title, body, data });

  return res.json({ status: 'auto_approved' });
});

module.exports = router;
