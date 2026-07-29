'use strict';

const express = require('express');
const { requireManager } = require('../middleware/auth');
const db = require('../db/db');

const router = express.Router();

// GET /api/reports/hours?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/hours', requireManager, (req, res) => {
  const { from, to } = req.query;
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ error: 'from and to are required (YYYY-MM-DD)' });
  }
  if (from > to) {
    return res.status(400).json({ error: 'from must be on or before to' });
  }

  const rows = db.prepare(
    `SELECT u.id AS user_id, u.name,
            COALESCE(SUM(ss.hours), 0) AS total_hours,
            COUNT(ss.id) AS shift_count
     FROM users u
     LEFT JOIN schedule_shifts ss
       ON ss.user_id = u.id
       AND ss.is_deleted = 0
       AND ss.date >= ?
       AND ss.date <= ?
       AND ss.schedule_id IN (SELECT id FROM schedules WHERE status = 'published')
     WHERE u.is_active = 1
     GROUP BY u.id, u.name
     ORDER BY total_hours DESC, u.name`
  ).all(from, to);

  return res.json({ rows, from, to });
});

module.exports = router;
