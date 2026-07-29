'use strict';

const express = require('express');
const { requireManager } = require('../middleware/auth');
const {
  getEventsForWeek, getEventCoverageForWeek,
  addEventTitle, deleteEventTitle,
  upsertEventCoverage, deleteEventCoverageRow, deleteEventCoverage,
} = require('../db/events');
const _db = require('../db/db');

const router = express.Router();

// GET /api/events?week=YYYY-MM-DD — manager+
router.get('/', requireManager, (req, res) => {
  const { week } = req.query;
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return res.status(400).json({ error: 'week parameter required (YYYY-MM-DD)' });
  }
  return res.json({
    events: getEventsForWeek(week),
    coverage: getEventCoverageForWeek(week),
  });
});

// POST /api/events/title — manager+
router.post('/title', requireManager, (req, res) => {
  const { week, date, title } = req.body;
  if (!week || !date || title == null) {
    return res.status(400).json({ error: 'week, date, and title are required' });
  }
  const trimmed = String(title).trim();
  if (!trimmed) {
    return res.status(400).json({ error: 'title must not be empty' });
  }
  const event = addEventTitle(week, date, trimmed);
  return res.status(201).json({ event });
});

// DELETE /api/events/title/:id — manager+
router.delete('/title/:id', requireManager, (req, res) => {
  deleteEventTitle(Number(req.params.id));
  return res.json({ ok: true });
});

// PUT /api/events/coverage — manager+
router.put('/coverage', requireManager, (req, res) => {
  const { week, date, groupId, templateId, requiredStaff } = req.body;
  if (!week || !date || groupId == null || templateId == null || requiredStaff == null) {
    return res.status(400).json({ error: 'week, date, groupId, templateId, and requiredStaff are required' });
  }

  const template = _db.prepare(
    'SELECT id FROM shift_templates WHERE id = ? AND group_id = ?'
  ).get(Number(templateId), Number(groupId));
  if (!template) {
    return res.status(400).json({ error: 'Template does not belong to the specified group' });
  }

  const hasTitle = _db.prepare(
    'SELECT 1 FROM week_events WHERE week_start_date = ? AND date = ?'
  ).get(week, date);
  if (!hasTitle) {
    return res.status(400).json({ error: 'Add at least one event title before saving coverage' });
  }

  upsertEventCoverage(week, date, Number(groupId), Number(templateId), Number(requiredStaff));
  return res.json({ ok: true });
});

// DELETE /api/events/coverage/:week/:date/:groupId/:templateId — remove one row (manager+)
router.delete('/coverage/:week/:date/:groupId/:templateId', requireManager, (req, res) => {
  deleteEventCoverageRow(req.params.week, req.params.date, Number(req.params.groupId), Number(req.params.templateId));
  return res.json({ ok: true });
});

// DELETE /api/events/coverage/:week/:date — clear all coverage for a date (manager+)
router.delete('/coverage/:week/:date', requireManager, (req, res) => {
  deleteEventCoverage(req.params.week, req.params.date);
  return res.json({ ok: true });
});

module.exports = router;
