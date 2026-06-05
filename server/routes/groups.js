'use strict';

const express = require('express');
const { requireStaff, requireManager } = require('../middleware/auth');
const {
  getAllGroups, getGroupById, createGroup, updateGroup, updateGroupOrder, deleteGroup,
  getTemplatesForGroup, createTemplate, updateTemplate, deleteTemplate,
  getCoverageRules, upsertCoverageRule, deleteCoverageRule,
  getAllTemplates, getAllGroupsWithDetail,
} = require('../db/groups');

const router = express.Router();

router.get('/all-templates', requireManager, (req, res) => {
  return res.json({ templates: getAllTemplates() });
});

router.get('/all-detail', requireManager, (req, res) => {
  return res.json({ groups: getAllGroupsWithDetail() });
});

// GET /api/groups — all roles (staff need groups for schedule display)
router.get('/', requireStaff, (req, res) => {
  const groups = getAllGroups();
  return res.json({ groups });
});

// GET /api/groups/:id — all roles
router.get('/:id', requireStaff, (req, res) => {
  const group = getGroupById(Number(req.params.id));
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const templates = getTemplatesForGroup(group.id);
  const coverage = getCoverageRules(group.id);
  return res.json({ group, templates, coverage });
});

// POST /api/groups — manager+
router.post('/', requireManager, (req, res) => {
  const { name, color = '#6366f1' } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const group = createGroup(name, color);
  return res.status(201).json({ group });
});

// PATCH /api/groups/order — manager+ (bulk reorder)
router.patch('/order', requireManager, (req, res) => {
  const { groupIds } = req.body;
  if (!Array.isArray(groupIds) || groupIds.some(id => !Number.isInteger(Number(id)))) {
    return res.status(400).json({ error: 'groupIds must be an array of integers' });
  }
  updateGroupOrder(groupIds.map(Number));
  return res.json({ ok: true });
});

// PATCH /api/groups/:id — manager+
router.patch('/:id', requireManager, (req, res) => {
  const { name, color } = req.body;
  if (!name || !color) return res.status(400).json({ error: 'name and color required' });
  const group = updateGroup(Number(req.params.id), name, color);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  return res.json({ group });
});

// DELETE /api/groups/:id — manager+
router.delete('/:id', requireManager, (req, res) => {
  const result = deleteGroup(Number(req.params.id));
  if (result.error === 'group_has_members') {
    return res.status(409).json({ error: 'Cannot delete group with assigned staff' });
  }
  if (result.changes === 0) return res.status(404).json({ error: 'Group not found' });
  return res.json({ ok: true });
});

// GET /api/groups/:id/templates — all roles
router.get('/:id/templates', requireStaff, (req, res) => {
  const templates = getTemplatesForGroup(Number(req.params.id));
  return res.json({ templates });
});

// POST /api/groups/:id/templates — manager+
router.post('/:id/templates', requireManager, (req, res) => {
  const { name, startTime, hours } = req.body;
  if (!name || !startTime || hours == null) {
    return res.status(400).json({ error: 'name, startTime, and hours are required' });
  }
  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    return res.status(400).json({ error: 'startTime must be HH:MM' });
  }
  if (Number(hours) <= 0 || Number(hours) > 24) {
    return res.status(400).json({ error: 'hours must be between 0 and 24 (exclusive)' });
  }
  const template = createTemplate(Number(req.params.id), name, startTime, Number(hours));
  return res.status(201).json({ template });
});

// PATCH /api/groups/:id/templates/:tid — manager+
router.patch('/:id/templates/:tid', requireManager, (req, res) => {
  const { name, startTime, hours } = req.body;
  if (!name || !startTime || hours == null) {
    return res.status(400).json({ error: 'name, startTime, and hours are required' });
  }
  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    return res.status(400).json({ error: 'startTime must be HH:MM' });
  }
  if (Number(hours) <= 0 || Number(hours) > 24) {
    return res.status(400).json({ error: 'hours must be between 0 and 24 (exclusive)' });
  }
  const template = updateTemplate(Number(req.params.tid), Number(req.params.id), name, startTime, Number(hours));
  if (!template) return res.status(404).json({ error: 'Template not found' });
  return res.json({ template });
});

// DELETE /api/groups/:id/templates/:tid — manager+
router.delete('/:id/templates/:tid', requireManager, (req, res) => {
  const result = deleteTemplate(Number(req.params.tid), Number(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: 'Template not found' });
  return res.json({ ok: true });
});

// GET /api/groups/:id/coverage — manager+
router.get('/:id/coverage', requireManager, (req, res) => {
  const rules = getCoverageRules(Number(req.params.id));
  return res.json({ rules });
});

// PUT /api/groups/:id/coverage — manager+ (upsert)
router.put('/:id/coverage', requireManager, (req, res) => {
  const { dayOfWeek, templateId, minStaff } = req.body;
  if (dayOfWeek == null || !templateId || minStaff == null) {
    return res.status(400).json({ error: 'dayOfWeek, templateId, and minStaff are required' });
  }
  if (dayOfWeek < 0 || dayOfWeek > 6) {
    return res.status(400).json({ error: 'dayOfWeek must be 0–6' });
  }
  if (Number(minStaff) < 1) {
    return res.status(400).json({ error: 'minStaff must be at least 1' });
  }
  const groupId = Number(req.params.id);
  const templates = getTemplatesForGroup(groupId);
  if (!templates.find(t => t.id === Number(templateId))) {
    return res.status(400).json({ error: 'Template does not belong to this group' });
  }
  const rule = upsertCoverageRule(
    groupId, Number(dayOfWeek), Number(templateId), Number(minStaff)
  );
  return res.json({ rule });
});

// DELETE /api/groups/:id/coverage/:rid — manager+
router.delete('/:id/coverage/:rid', requireManager, (req, res) => {
  const result = deleteCoverageRule(Number(req.params.rid));
  if (result.changes === 0) return res.status(404).json({ error: 'Coverage rule not found' });
  return res.json({ ok: true });
});

module.exports = router;
