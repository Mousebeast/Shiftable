'use strict';
const _db = require('./db');

function getAllGroups(db = _db) {
  return db.prepare(
    `SELECT id, name, color, priority, created_at FROM groups ORDER BY priority ASC, name`
  ).all();
}

function getGroupById(id, db = _db) {
  return db.prepare(
    `SELECT id, name, color, priority, created_at FROM groups WHERE id = ?`
  ).get(id);
}

function createGroup(name, color, db = _db) {
  return db.prepare(
    `INSERT INTO groups (name, color) VALUES (?, ?) RETURNING id, name, color, priority`
  ).get(name, color);
}

function updateGroup(id, name, color, db = _db) {
  return db.prepare(
    `UPDATE groups SET name = ?, color = ? WHERE id = ? RETURNING id, name, color, priority`
  ).get(name, color, id);
}

function updateGroupOrder(groupIds, db = _db) {
  const update = db.prepare(`UPDATE groups SET priority = ? WHERE id = ?`);
  db.transaction(() => {
    groupIds.forEach((id, index) => update.run(index, id));
  })();
}

function deleteGroup(id, db = _db) {
  const { count } = db.prepare(
    `SELECT COUNT(*) as count FROM user_groups WHERE group_id = ?`
  ).get(id);
  if (count > 0) return { error: 'group_has_members' };
  return db.prepare(`DELETE FROM groups WHERE id = ?`).run(id);
}

function getTemplatesForGroup(groupId, db = _db) {
  return db.prepare(
    `SELECT id, name, start_time, hours FROM shift_templates WHERE group_id = ? ORDER BY start_time`
  ).all(groupId);
}

function createTemplate(groupId, name, startTime, hours, db = _db) {
  return db.prepare(
    `INSERT INTO shift_templates (group_id, name, start_time, hours)
     VALUES (?, ?, ?, ?) RETURNING id, group_id, name, start_time, hours`
  ).get(groupId, name, startTime, hours);
}

function updateTemplate(id, groupId, name, startTime, hours, db = _db) {
  return db.prepare(
    `UPDATE shift_templates SET name = ?, start_time = ?, hours = ?
     WHERE id = ? AND group_id = ? RETURNING id, name, start_time, hours`
  ).get(name, startTime, hours, id, groupId);
}

function deleteTemplate(id, groupId, db = _db) {
  return db.prepare(`DELETE FROM shift_templates WHERE id = ? AND group_id = ?`).run(id, groupId);
}

function getCoverageRules(groupId, db = _db) {
  return db.prepare(
    `SELECT cr.id, cr.day_of_week, cr.shift_template_id, cr.min_staff, st.name AS template_name
     FROM coverage_rules cr
     JOIN shift_templates st ON st.id = cr.shift_template_id
     WHERE cr.group_id = ?
     ORDER BY cr.day_of_week, st.start_time`
  ).all(groupId);
}

function upsertCoverageRule(groupId, dayOfWeek, templateId, minStaff, db = _db) {
  return db.prepare(
    `INSERT INTO coverage_rules (group_id, day_of_week, shift_template_id, min_staff)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(group_id, day_of_week, shift_template_id) DO UPDATE SET min_staff = excluded.min_staff
     RETURNING id, group_id, day_of_week, shift_template_id, min_staff`
  ).get(groupId, dayOfWeek, templateId, minStaff);
}

function deleteCoverageRule(id, db = _db) {
  return db.prepare(`DELETE FROM coverage_rules WHERE id = ?`).run(id);
}

function getAllTemplates(db = _db) {
  return db.prepare(
    `SELECT st.id, st.name, st.start_time, st.hours,
            g.id AS group_id, g.name AS group_name, g.color AS group_color
     FROM shift_templates st
     JOIN groups g ON g.id = st.group_id
     ORDER BY g.name, st.start_time`
  ).all();
}

function getAllGroupsWithDetail(db = _db) {
  const groups = db.prepare(
    `SELECT id, name, color, priority FROM groups ORDER BY priority ASC, name`
  ).all();
  const templates = db.prepare(
    `SELECT id, group_id, name, start_time, hours FROM shift_templates ORDER BY group_id, start_time`
  ).all();
  const coverage = db.prepare(
    `SELECT cr.id, cr.group_id, cr.day_of_week, cr.shift_template_id, cr.min_staff, st.name AS template_name
     FROM coverage_rules cr
     JOIN shift_templates st ON st.id = cr.shift_template_id
     ORDER BY cr.group_id, cr.day_of_week, st.start_time`
  ).all();

  // Already ordered by priority ASC — drag order preserved
  return groups.map(g => ({
    ...g,
    templates: templates.filter(t => t.group_id === g.id),
    coverage: coverage.filter(c => c.group_id === g.id),
  }));
}

module.exports = {
  getAllGroups, getGroupById, createGroup, updateGroup, updateGroupOrder, deleteGroup,
  getTemplatesForGroup, createTemplate, updateTemplate, deleteTemplate,
  getCoverageRules, upsertCoverageRule, deleteCoverageRule,
  getAllTemplates, getAllGroupsWithDetail,
};
