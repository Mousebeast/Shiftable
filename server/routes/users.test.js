'use strict';
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

const path = require('path');
const fs = require('fs');
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const db = require('../db/db');
db.exec(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));

const { seedUser, seedGroup, seedTemplate } = require('../test/helpers');
const usersRouter = require('./users');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/users', usersRouter);
  return app;
}

function managerToken(id) {
  return jwt.sign({ userId: id, role: 'manager' }, 'test-secret', { expiresIn: '1h' });
}

function adminToken(id) {
  return jwt.sign({ userId: id, role: 'admin' }, 'test-secret', { expiresIn: '1h' });
}

function staffToken(id) {
  return jwt.sign({ userId: id, role: 'staff' }, 'test-secret', { expiresIn: '1h' });
}

let app, manager, staff, admin, group;
beforeEach(() => {
  db.prepare('DELETE FROM user_groups').run();
  db.prepare('DELETE FROM users').run();
  db.prepare('DELETE FROM groups').run();
  app = buildApp();
  manager = seedUser(db, { email: 'mgr@test.com', role: 'manager' });
  staff = seedUser(db, { email: 'staff@test.com', role: 'staff' });
  admin = seedUser(db, { email: 'admin@test.com', role: 'admin' });
  group = seedGroup(db);
});

describe('GET /api/users', () => {
  it('returns active users for manager', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it('returns 403 for staff', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Cookie', `token=${staffToken(staff.id)}`);
    expect(res.status).toBe(403);
  });

  it('includes inactive when ?includeInactive=true', async () => {
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(staff.id);
    const res = await request(app)
      .get('/api/users?includeInactive=true')
      .set('Cookie', `token=${managerToken(manager.id)}`);
    const ids = res.body.users.map(u => u.id);
    expect(ids).toContain(staff.id);
  });
});

describe('POST /api/users', () => {
  it('creates a user and returns claim link', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ name: 'New Staff', email: 'new@test.com', role: 'staff', minHours: 0, maxHours: 40, groupIds: [group.id] });
    expect(res.status).toBe(201);
    expect(res.body.user.id).toBeDefined();
    expect(res.body.user.name).toBe('New Staff');
    expect(res.body.claimUrl).toMatch(/\/claim\?token=/);
  });

  it('creates staff without email (email is optional)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ name: 'No Email', role: 'staff' });
    expect(res.status).toBe(201);
  });

  it('returns 409 on duplicate email', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ name: 'Dupe', email: 'staff@test.com', role: 'staff', minHours: 0, maxHours: 40, groupIds: [] });
    expect(res.status).toBe(409);
  });

  it('returns 400 when minHours > maxHours', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ name: 'Bad Hours', email: 'badhours@test.com', role: 'staff', minHours: 30, maxHours: 10, groupIds: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/maxHours >= minHours/);
  });

  it('returns 400 when minHours is negative', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ name: 'Neg Hours', email: 'neg@test.com', role: 'staff', minHours: -5, maxHours: 40, groupIds: [] });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/users/:id', () => {
  it('updates user fields', async () => {
    const res = await request(app)
      .patch(`/api/users/${staff.id}`)
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ name: 'Updated', email: 'updated@test.com', role: 'staff', minHours: 5, maxHours: 35, groupIds: [] });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Updated');
  });

  it('returns 404 for non-existent user', async () => {
    const res = await request(app)
      .patch('/api/users/99999')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ name: 'Ghost', email: 'ghost@test.com', role: 'staff', minHours: 0, maxHours: 40, groupIds: [] });
    expect(res.status).toBe(404);
  });

  it('returns 400 when minHours > maxHours', async () => {
    const res = await request(app)
      .patch(`/api/users/${staff.id}`)
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ name: 'Staff', email: 'staff@test.com', role: 'staff', minHours: 35, maxHours: 10, groupIds: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/maxHours >= minHours/);
  });

  it('preserves existing hours when not sent', async () => {
    // First set specific hours
    await request(app)
      .patch(`/api/users/${staff.id}`)
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ name: 'Staff', email: 'staff@test.com', role: 'staff', minHours: 10, maxHours: 30, groupIds: [] });
    // Then update only name/email/role — hours should stay
    const res = await request(app)
      .patch(`/api/users/${staff.id}`)
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ name: 'Renamed', email: 'staff@test.com', role: 'staff', groupIds: [] });
    expect(res.status).toBe(200);
    expect(res.body.user.min_hours_per_week).toBe(10);
    expect(res.body.user.max_hours_per_week).toBe(30);
  });
});

describe('PATCH /api/users/:id/deactivate', () => {
  it('deactivates a user', async () => {
    const res = await request(app)
      .patch(`/api/users/${staff.id}/deactivate`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
    const check = db.prepare('SELECT is_active FROM users WHERE id = ?').get(staff.id);
    expect(check.is_active).toBe(0);
  });

  it('returns 400 when manager tries to deactivate themselves', async () => {
    const res = await request(app)
      .patch(`/api/users/${manager.id}/deactivate`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/own account/);
  });

  it('returns 404 for non-existent user', async () => {
    const res = await request(app)
      .patch('/api/users/99999/deactivate')
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(404);
  });

  // This route is requireManager. Admin accounts became deactivatable so that
  // an owner can retire a departed admin, and this test is what stops that
  // relaxation from silently handing managers the ability to disable the
  // owner's account.
  it('returns 403 when manager tries to deactivate an admin', async () => {
    const res = await request(app)
      .patch(`/api/users/${admin.id}/deactivate`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin/);
  });

  it('lets an admin deactivate another admin when one remains active', async () => {
    const actor = seedUser(db, { email: 'deact-actor@test.com', role: 'admin' });
    const target = seedUser(db, { email: 'deact-target@test.com', role: 'admin' });
    const res = await request(app)
      .patch(`/api/users/${target.id}/deactivate`)
      .set('Cookie', `token=${adminToken(actor.id)}`);
    expect(res.status).toBe(200);
    const row = db.prepare('SELECT is_active FROM users WHERE id = ?').get(target.id);
    expect(row.is_active).toBe(0);
  });

  // There is deliberately no "refuses to deactivate the last active admin"
  // test here, because that branch is unreachable on this route and a test
  // asserting it would be fiction. Two existing rules make it so: authenticate
  // returns 401 for a deactivated user, so the actor is always active; and
  // self-deactivation returns 400. Therefore whenever the target is an active
  // admin there are at least two active admins (actor + target), and the count
  // check cannot trip. The guard is kept as defence in depth — it becomes
  // load-bearing the moment either of those rules changes — and the counting
  // logic itself is covered directly in server/db/admin.test.js.
});

describe('POST /api/users/:id/regenerate-link', () => {
  it('sets a new claim token and returns claim url', async () => {
    const res = await request(app)
      .post(`/api/users/${staff.id}/regenerate-link`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.claimUrl).toMatch(/\/claim\?token=/);
  });

  it('returns 404 for non-existent user', async () => {
    const res = await request(app)
      .post('/api/users/99999/regenerate-link')
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 when targeting an admin account', async () => {
    const res = await request(app)
      .post(`/api/users/${admin.id}/regenerate-link`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin/);
  });
});

describe('GET /api/users/:id/fixed-schedules', () => {
  it('returns fixed schedules for a user', async () => {
    const res = await request(app)
      .get(`/api/users/${staff.id}/fixed-schedules`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.schedules)).toBe(true);
  });

  it('returns 403 for staff role', async () => {
    const res = await request(app)
      .get(`/api/users/${staff.id}/fixed-schedules`)
      .set('Cookie', `token=${staffToken(staff.id)}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent user', async () => {
    const res = await request(app)
      .get('/api/users/99999/fixed-schedules')
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/User not found/);
  });
});

describe('GET /api/users/:id/group-change-impact', () => {
  function seedFixed(userId, groupId, day, name) {
    const tmpl = seedTemplate(db, groupId, { name });
    db.prepare('INSERT OR IGNORE INTO user_groups (user_id, group_id) VALUES (?, ?)').run(userId, groupId);
    db.prepare('INSERT INTO fixed_schedules (user_id, day_of_week, shift_template_id) VALUES (?, ?, ?)')
      .run(userId, day, tmpl.id);
    return tmpl;
  }

  it('reports the fixed schedules a group removal would delete', async () => {
    const other = seedGroup(db, { name: 'Bev Cart' });
    seedFixed(staff.id, group.id, 1, 'Dinner');
    seedFixed(staff.id, other.id, 4, 'BC');

    const res = await request(app)
      .get(`/api/users/${staff.id}/group-change-impact?groupIds=${group.id}`)
      .set('Cookie', `token=${managerToken(manager.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.removed).toHaveLength(1);
    expect(res.body.removed[0].group_name).toBe('Bev Cart');
    expect(res.body.removed[0].day_of_week).toBe(4);
  });

  it('reports nothing when no group is being removed', async () => {
    seedFixed(staff.id, group.id, 1, 'Dinner');
    const res = await request(app)
      .get(`/api/users/${staff.id}/group-change-impact?groupIds=${group.id}`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.body.removed).toEqual([]);
  });

  it('treats an empty groupIds as removing every group', async () => {
    // The NOT IN (NULL) trap lives here: this must report everything at risk,
    // not nothing. See fixedSchedulesOutsideGroups in db/users.js.
    seedFixed(staff.id, group.id, 1, 'Dinner');
    const res = await request(app)
      .get(`/api/users/${staff.id}/group-change-impact?groupIds=`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.body.removed).toHaveLength(1);
  });

  it('changes nothing — the preview is read-only', async () => {
    seedFixed(staff.id, group.id, 1, 'Dinner');
    await request(app)
      .get(`/api/users/${staff.id}/group-change-impact?groupIds=`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    const n = db.prepare('SELECT COUNT(*) AS n FROM fixed_schedules WHERE user_id = ?').get(staff.id).n;
    expect(n).toBe(1);
  });

  it('returns 404 for a nonexistent user', async () => {
    const res = await request(app)
      .get('/api/users/99999/group-change-impact?groupIds=1')
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 for staff', async () => {
    const res = await request(app)
      .get(`/api/users/${staff.id}/group-change-impact?groupIds=1`)
      .set('Cookie', `token=${staffToken(staff.id)}`);
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/users/:id/fixed-schedules/:day', () => {
  it('upserts a fixed schedule', async () => {
    const tmpl = seedTemplate(db, group.id);
    // Group membership is now a precondition — a fixed schedule for a group the
    // user is not in is exactly the state that produced the Sierra bug.
    db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').run(staff.id, group.id);
    const res = await request(app)
      .put(`/api/users/${staff.id}/fixed-schedules/0`)
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ templateId: tmpl.id });
    expect(res.status).toBe(200);
    expect(res.body.schedule.day_of_week).toBe(0);
  });

  it('rejects a template from a group the user is not in', async () => {
    // Closes the second route to an orphan: previously this succeeded, and the
    // scheduler then locked the shift in Phase 1 ahead of every constraint.
    const otherGroup = seedGroup(db, { name: 'Bev Cart' });
    const otherTmpl = seedTemplate(db, otherGroup.id, { name: 'BC' });
    db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').run(staff.id, group.id);
    const res = await request(app)
      .put(`/api/users/${staff.id}/fixed-schedules/0`)
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ templateId: otherTmpl.id });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/not in the group/i);
    expect(db.prepare('SELECT COUNT(*) AS n FROM fixed_schedules WHERE user_id = ?').get(staff.id).n).toBe(0);
  });

  it('rejects a template for a user with no groups at all', async () => {
    const tmpl = seedTemplate(db, group.id);
    const res = await request(app)
      .put(`/api/users/${staff.id}/fixed-schedules/0`)
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ templateId: tmpl.id });
    expect(res.status).toBe(422);
  });

  it('returns 400 for invalid day (> 6)', async () => {
    const res = await request(app)
      .put(`/api/users/${staff.id}/fixed-schedules/7`)
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ templateId: 1 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when templateId missing', async () => {
    const res = await request(app)
      .put(`/api/users/${staff.id}/fixed-schedules/0`)
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 422 when templateId does not exist', async () => {
    const res = await request(app)
      .put(`/api/users/${staff.id}/fixed-schedules/0`)
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ templateId: 99999 });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/User or shift template not found/);
  });
});

describe('DELETE /api/users/:id/fixed-schedules/:day', () => {
  it('removes a fixed schedule', async () => {
    const tmpl = seedTemplate(db, group.id);
    db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').run(staff.id, group.id);
    await request(app)
      .put(`/api/users/${staff.id}/fixed-schedules/1`)
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ templateId: tmpl.id });
    const res = await request(app)
      .delete(`/api/users/${staff.id}/fixed-schedules/1`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
  });

  it('returns 403 for staff role', async () => {
    const res = await request(app)
      .delete(`/api/users/${staff.id}/fixed-schedules/0`)
      .set('Cookie', `token=${staffToken(staff.id)}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when fixed schedule does not exist', async () => {
    const res = await request(app)
      .delete(`/api/users/${staff.id}/fixed-schedules/0`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Fixed schedule not found/);
  });
});

// Deactivation was one-way until 2026-07-29: no helper, no route, no control.
// Recovering a mis-click meant editing SQLite by hand.
describe('PATCH /api/users/:id/reactivate', () => {
  function deactivate(id) {
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);
  }

  it('brings a deactivated user back', async () => {
    deactivate(staff.id);
    const res = await request(app)
      .patch(`/api/users/${staff.id}/reactivate`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
    expect(db.prepare('SELECT is_active FROM users WHERE id = ?').get(staff.id).is_active).toBe(1);
  });

  it('leaves groups and scheduling limits exactly as they were', async () => {
    const group = seedGroup(db);
    db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').run(staff.id, group.id);
    db.prepare('UPDATE users SET max_hours_per_week = 22, max_shifts_per_week = 3, priority_order = 4 WHERE id = ?').run(staff.id);
    deactivate(staff.id);

    await request(app)
      .patch(`/api/users/${staff.id}/reactivate`)
      .set('Cookie', `token=${managerToken(manager.id)}`);

    const row = db.prepare('SELECT max_hours_per_week, max_shifts_per_week, priority_order FROM users WHERE id = ?').get(staff.id);
    expect(row).toMatchObject({ max_hours_per_week: 22, max_shifts_per_week: 3, priority_order: 4 });
    const membership = db.prepare('SELECT COUNT(*) AS n FROM user_groups WHERE user_id = ?').get(staff.id);
    expect(membership.n).toBe(1);
  });

  it('is idempotent on an already-active user', async () => {
    const res = await request(app)
      .patch(`/api/users/${staff.id}/reactivate`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.alreadyActive).toBe(true);
  });

  it('returns 404 for a non-existent user', async () => {
    const res = await request(app)
      .patch('/api/users/99999/reactivate')
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed id', async () => {
    const res = await request(app)
      .patch('/api/users/not-a-number/reactivate')
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(400);
  });

  // The mirror of the deactivate guard, and needed for the opposite reason:
  // restoring a deactivated admin restores admin access. This route is
  // requireManager, so without this a manager could grant rights they do not
  // hold themselves.
  it('returns 403 when a manager tries to reactivate an admin', async () => {
    deactivate(admin.id);
    const res = await request(app)
      .patch(`/api/users/${admin.id}/reactivate`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(403);
    expect(db.prepare('SELECT is_active FROM users WHERE id = ?').get(admin.id).is_active).toBe(0);
  });

  it('lets an admin reactivate another admin', async () => {
    const other = seedUser(db, { email: 'other-admin@test.com', role: 'admin' });
    deactivate(other.id);
    const res = await request(app)
      .patch(`/api/users/${other.id}/reactivate`)
      .set('Cookie', `token=${adminToken(admin.id)}`);
    expect(res.status).toBe(200);
    expect(db.prepare('SELECT is_active FROM users WHERE id = ?').get(other.id).is_active).toBe(1);
  });

  it('refuses an active staff member', async () => {
    // The actor must be someone other than the target: authenticate 401s a
    // deactivated account before any role guard runs, so a deactivated user
    // cannot reach this route to restore themselves either way.
    const actor = seedUser(db, { email: 'active-staff@test.com', role: 'staff' });
    deactivate(staff.id);
    const res = await request(app)
      .patch(`/api/users/${staff.id}/reactivate`)
      .set('Cookie', `token=${staffToken(actor.id)}`);
    expect(res.status).toBe(403);
    expect(db.prepare('SELECT is_active FROM users WHERE id = ?').get(staff.id).is_active).toBe(0);
  });

  it('a deactivated user cannot restore themselves — the token is rejected first', async () => {
    deactivate(staff.id);
    const res = await request(app)
      .patch(`/api/users/${staff.id}/reactivate`)
      .set('Cookie', `token=${staffToken(staff.id)}`);
    expect(res.status).toBe(401);
  });
});
