'use strict';
process.env.JWT_SECRET = 'test-secret';

const { createTestDb, seedGroup, seedTemplate, seedCoverageRule, seedUser } = require('../test/helpers');
const {
  getAllGroups, getGroupById, createGroup, updateGroup, deleteGroup,
  getTemplatesForGroup, createTemplate, updateTemplate, deleteTemplate,
  getCoverageRules, upsertCoverageRule, deleteCoverageRule,
} = require('./groups');

let db, group;
beforeEach(() => {
  db = createTestDb();
  group = seedGroup(db, { name: 'Server', color: '#6366f1' });
});

describe('getAllGroups', () => {
  it('returns all groups ordered by name', () => {
    seedGroup(db, { name: 'Bartender', color: '#ff0000' });
    const groups = getAllGroups(db);
    expect(groups.map(g => g.name)).toEqual(['Bartender', 'Server']);
  });
});

describe('createGroup / getGroupById / updateGroup', () => {
  it('creates and retrieves a group', () => {
    const g = createGroup('Host', '#abc123', db);
    expect(g.id).toBeDefined();
    const found = getGroupById(g.id, db);
    expect(found.name).toBe('Host');
    expect(found.color).toBe('#abc123');
  });

  it('updates a group', () => {
    const updated = updateGroup(group.id, 'Server Team', '#ffffff', db);
    expect(updated.name).toBe('Server Team');
  });
});

describe('deleteGroup', () => {
  it('deletes a group with no members', () => {
    const result = deleteGroup(group.id, db);
    expect(result.changes).toBe(1);
    expect(getGroupById(group.id, db)).toBeUndefined();
  });

  it('returns group_has_members error when users assigned', () => {
    const user = seedUser(db, { email: 'u@test.com' });
    db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').run(user.id, group.id);
    const result = deleteGroup(group.id, db);
    expect(result.error).toBe('group_has_members');
  });
});

describe('shift templates', () => {
  it('creates and retrieves templates for a group', () => {
    const t = createTemplate(group.id, 'Lunch', '11:00', 5, db);
    expect(t.id).toBeDefined();
    const templates = getTemplatesForGroup(group.id, db);
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe('Lunch');
  });

  it('updates a template', () => {
    const t = createTemplate(group.id, 'Lunch', '11:00', 5, db);
    const updated = updateTemplate(t.id, group.id, 'Brunch', '10:00', 4, db);
    expect(updated.name).toBe('Brunch');
    expect(updated.hours).toBe(4);
  });

  it('deletes a template', () => {
    const t = createTemplate(group.id, 'Lunch', '11:00', 5, db);
    deleteTemplate(t.id, group.id, db);
    expect(getTemplatesForGroup(group.id, db)).toHaveLength(0);
  });
});

describe('coverage rules', () => {
  it('upserts and retrieves coverage rules', () => {
    const t = createTemplate(group.id, 'Lunch', '11:00', 5, db);
    upsertCoverageRule(group.id, 0, t.id, 3, db);
    const rules = getCoverageRules(group.id, db);
    expect(rules).toHaveLength(1);
    expect(rules[0].min_staff).toBe(3);
  });

  it('upsert updates min_staff on conflict', () => {
    const t = createTemplate(group.id, 'Lunch', '11:00', 5, db);
    upsertCoverageRule(group.id, 0, t.id, 2, db);
    upsertCoverageRule(group.id, 0, t.id, 4, db);
    const rules = getCoverageRules(group.id, db);
    expect(rules).toHaveLength(1);
    expect(rules[0].min_staff).toBe(4);
  });

  it('deletes a coverage rule', () => {
    const t = createTemplate(group.id, 'Lunch', '11:00', 5, db);
    const rule = upsertCoverageRule(group.id, 0, t.id, 2, db);
    deleteCoverageRule(rule.id, db);
    expect(getCoverageRules(group.id, db)).toHaveLength(0);
  });
});
