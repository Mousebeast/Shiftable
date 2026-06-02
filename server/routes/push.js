'use strict';
const express = require('express');
const { requireStaff } = require('../middleware/auth');
const { saveSubscription, deleteSubscriptionForUser } = require('../db/push');

const router = express.Router();

router.get('/vapid-key', requireStaff, (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return res.status(503).json({ error: 'Push notifications not configured' });
  return res.json({ publicKey });
});

router.post('/subscribe', requireStaff, (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }
  saveSubscription(req.user.userId, { endpoint, keys });
  return res.status(201).json({ ok: true });
});

router.delete('/unsubscribe', requireStaff, (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
  deleteSubscriptionForUser(endpoint, req.user.userId);
  return res.json({ ok: true });
});

module.exports = router;
