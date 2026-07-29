'use strict';

const express = require('express');
const { requireStaff, requireManager } = require('../middleware/auth');
const { getNotificationsForUser, getUnreadCount, markAllRead, clearAllNotifications, insertBroadcast } = require('../db/notifications');
const { getActiveUserIds } = require('../db/users');
const { sendToUsers } = require('../services/push');

const router = express.Router();

// GET /api/notifications
router.get('/', requireStaff, (req, res) => {
  const notifications = getNotificationsForUser(req.user.userId);
  const unreadCount = getUnreadCount(req.user.userId);
  return res.json({ notifications, unreadCount });
});

// PATCH /api/notifications/read-all
router.patch('/read-all', requireStaff, (req, res) => {
  markAllRead(req.user.userId);
  return res.json({ ok: true });
});

// DELETE /api/notifications — clear all for caller
router.delete('/', requireStaff, (req, res) => {
  clearAllNotifications(req.user.userId);
  return res.json({ ok: true });
});

// POST /api/notifications/broadcast — manager+
router.post('/broadcast', requireManager, (req, res) => {
  const { title, body, groupId } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'title and body are required' });
  if (typeof title !== 'string' || title.length > 120) return res.status(400).json({ error: 'title must be a string under 120 characters' });
  if (typeof body !== 'string' || body.length > 500) return res.status(400).json({ error: 'body must be a string under 500 characters' });
  if (groupId !== undefined && !Number.isInteger(groupId)) return res.status(400).json({ error: 'groupId must be an integer' });
  const userIds = getActiveUserIds(groupId || null);
  if (userIds.length === 0) return res.json({ sent: 0 });
  insertBroadcast(title, body, userIds);
  sendToUsers(userIds, { title, body, data: { url: '/notifications' } }); // fire-and-forget
  return res.json({ sent: userIds.length });
});

module.exports = router;
