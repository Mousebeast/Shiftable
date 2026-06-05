'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(
    path.join(__dirname, '../db/schema.sql'),
    'utf8'
  );
  db.exec(schema);
  return db;
}

const PIN_HASH_1234 = bcrypt.hashSync('1234', 4);

function seedUser(db, overrides = {}) {
  const defaults = {
    name: 'Test Staff',
    email: 'staff@test.com',
    pin_hash: PIN_HASH_1234,
    role: 'staff',
    min_hours_per_week: 0,
    max_hours_per_week: 40,
    is_active: 1,
  };
  const u = { ...defaults, ...overrides };
  const result = db
    .prepare(
      `INSERT INTO users (name, email, pin_hash, role, min_hours_per_week, max_hours_per_week, is_active)
       VALUES (@name, @email, @pin_hash, @role, @min_hours_per_week, @max_hours_per_week, @is_active)`
    )
    .run(u);
  return { ...u, id: result.lastInsertRowid };
}

function seedGroup(db, overrides = {}) {
  const defaults = { name: 'Server', color: '#6366f1' };
  const g = { ...defaults, ...overrides };
  const result = db
    .prepare(`INSERT INTO groups (name, color) VALUES (@name, @color)`)
    .run(g);
  return { ...g, id: result.lastInsertRowid };
}

function seedTemplate(db, groupId, overrides = {}) {
  const defaults = { name: 'Lunch', start_time: '11:00', hours: 5 };
  const t = { ...defaults, ...overrides, group_id: groupId };
  const result = db
    .prepare(
      `INSERT INTO shift_templates (group_id, name, start_time, hours)
       VALUES (@group_id, @name, @start_time, @hours)`
    )
    .run(t);
  return { ...t, id: result.lastInsertRowid };
}

function seedCoverageRule(db, groupId, templateId, overrides = {}) {
  const defaults = { day_of_week: 0, min_staff: 2 };
  const r = { ...defaults, ...overrides, group_id: groupId, shift_template_id: templateId };
  const result = db
    .prepare(
      `INSERT INTO coverage_rules (group_id, day_of_week, shift_template_id, min_staff)
       VALUES (@group_id, @day_of_week, @shift_template_id, @min_staff)`
    )
    .run(r);
  return { ...r, id: result.lastInsertRowid };
}

module.exports = { createTestDb, seedUser, seedGroup, seedTemplate, seedCoverageRule, PIN_HASH_1234 };
