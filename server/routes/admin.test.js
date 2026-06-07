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

const { seedUser } = require('../test/helpers');
const adminRouter = require('./admin');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/admin', adminRouter);
  return app;
}

function adminToken(id) {
  return jwt.sign({ userId: id, role: 'admin' }, 'test-secret', { expiresIn: '1h' });
}
function managerToken(id) {
  return jwt.sign({ userId: id, role: 'manager' }, 'test-secret', { expiresIn: '1h' });
}
function staffToken(id) {
  return jwt.sign({ userId: id, role: 'staff' }, 'test-secret', { expiresIn: '1h' });
}

let app, admin, manager, staff;
beforeEach(() => {
  db.prepare('DELETE FROM login_events').run();
  db.prepare('DELETE FROM shift_swaps').run();
  db.prepare('DELETE FROM schedule_shifts').run();
  db.prepare('DELETE FROM schedules').run();
  db.prepare('DELETE FROM fixed_schedules').run();
  db.prepare('DELETE FROM availability').run();
  db.prepare('DELETE FROM time_off_requests').run();
  db.prepare('DELETE FROM notifications').run();
  db.prepare('DELETE FROM push_subscriptions').run();
  db.prepare('DELETE FROM user_groups').run();
  db.prepare('DELETE FROM users').run();
  db.prepare('DELETE FROM coverage_rules').run();
  db.prepare('DELETE FROM shift_templates').run();
  db.prepare('DELETE FROM groups').run();
  db.prepare('DELETE FROM app_settings').run();
  app = buildApp();
  admin = seedUser(db, { email: 'admin@test.com', role: 'admin' });
  manager = seedUser(db, { email: 'mgr@test.com', role: 'manager' });
  staff = seedUser(db, { email: 'staff@test.com', role: 'staff' });
});

describe('GET /api/admin/settings', () => {
  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/settings')
      .set('Cookie', `token=${staffToken(staff.id)}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 for manager', async () => {
    const res = await request(app)
      .get('/api/admin/settings')
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(403);
  });

  it('returns empty settings object initially', async () => {
    const res = await request(app)
      .get('/api/admin/settings')
      .set('Cookie', `token=${adminToken(admin.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.settings).toEqual({});
  });

  it('returns seeded settings', async () => {
    db.prepare("INSERT INTO app_settings VALUES ('restaurant_name', 'Testaurant')").run();
    const res = await request(app)
      .get('/api/admin/settings')
      .set('Cookie', `token=${adminToken(admin.id)}`);
    expect(res.body.settings.restaurant_name).toBe('Testaurant');
  });
});

describe('PATCH /api/admin/settings', () => {
  it('saves allowed settings and returns updated object', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Cookie', `token=${adminToken(admin.id)}`)
      .send({ settings: { restaurant_name: 'My Place', max_consecutive_days: '6' } });
    expect(res.status).toBe(200);
    expect(res.body.settings.restaurant_name).toBe('My Place');
    expect(res.body.settings.max_consecutive_days).toBe('6');
  });

  it('upserts — second save overwrites first', async () => {
    await request(app)
      .patch('/api/admin/settings')
      .set('Cookie', `token=${adminToken(admin.id)}`)
      .send({ settings: { restaurant_name: 'First' } });
    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Cookie', `token=${adminToken(admin.id)}`)
      .send({ settings: { restaurant_name: 'Second' } });
    expect(res.body.settings.restaurant_name).toBe('Second');
  });

  it('rejects unknown setting keys', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Cookie', `token=${adminToken(admin.id)}`)
      .send({ settings: { vapid_private: 'secret' } });
    expect(res.status).toBe(400);
  });

  it('returns 400 if settings is not an object', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Cookie', `token=${adminToken(admin.id)}`)
      .send({ settings: 'bad' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/users', () => {
  it('returns all users including inactive', async () => {
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(staff.id);
    const res = await request(app)
      .get('/api/admin/users')
      .set('Cookie', `token=${adminToken(admin.id)}`);
    expect(res.status).toBe(200);
    const ids = res.body.users.map(u => u.id);
    expect(ids).toContain(staff.id);
    expect(ids).toContain(admin.id);
    expect(ids).toContain(manager.id);
  });

  it('returns 403 for manager', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/admin/users/:id/role', () => {
  it('promotes staff to manager', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${staff.id}/role`)
      .set('Cookie', `token=${adminToken(admin.id)}`)
      .send({ role: 'manager' });
    expect(res.status).toBe(200);
    const row = db.prepare('SELECT role FROM users WHERE id = ?').get(staff.id);
    expect(row.role).toBe('manager');
  });

  it('demotes manager to staff', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${manager.id}/role`)
      .set('Cookie', `token=${adminToken(admin.id)}`)
      .send({ role: 'staff' });
    expect(res.status).toBe(200);
    const row = db.prepare('SELECT role FROM users WHERE id = ?').get(manager.id);
    expect(row.role).toBe('staff');
  });

  it('rejects invalid role (admin)', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${staff.id}/role`)
      .set('Cookie', `token=${adminToken(admin.id)}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(400);
  });

  it('cannot change an admin account role', async () => {
    const otherAdmin = seedUser(db, { email: 'admin2@test.com', role: 'admin' });
    const res = await request(app)
      .patch(`/api/admin/users/${otherAdmin.id}/role`)
      .set('Cookie', `token=${adminToken(admin.id)}`)
      .send({ role: 'staff' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for nonexistent user', async () => {
    const res = await request(app)
      .patch('/api/admin/users/9999/role')
      .set('Cookie', `token=${adminToken(admin.id)}`)
      .send({ role: 'staff' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/users/:id', () => {
  it('hard deletes a user with no published shifts', async () => {
    const res = await request(app)
      .delete(`/api/admin/users/${staff.id}`)
      .set('Cookie', `token=${adminToken(admin.id)}`);
    expect(res.status).toBe(200);
    const row = db.prepare('SELECT id FROM users WHERE id = ?').get(staff.id);
    expect(row).toBeUndefined();
  });

  it('returns 409 if user has shifts in a published schedule', async () => {
    const grp = db.prepare("INSERT INTO groups (name, color) VALUES ('Srv', '#fff')").run();
    const sched = db.prepare(
      "INSERT INTO schedules (week_start_date, status, created_by) VALUES ('2026-06-02', 'published', ?)"
    ).run(admin.id);
    db.prepare(
      "INSERT INTO schedule_shifts (schedule_id, user_id, group_id, date, start_time, hours) VALUES (?, ?, ?, '2026-06-02', '09:00', 8)"
    ).run(sched.lastInsertRowid, staff.id, grp.lastInsertRowid);

    const res = await request(app)
      .delete(`/api/admin/users/${staff.id}`)
      .set('Cookie', `token=${adminToken(admin.id)}`);
    expect(res.status).toBe(409);
    const row = db.prepare('SELECT id FROM users WHERE id = ?').get(staff.id);
    expect(row).toBeDefined();
  });

  it('cannot delete an admin account', async () => {
    const otherAdmin = seedUser(db, { email: 'admin2@test.com', role: 'admin' });
    const res = await request(app)
      .delete(`/api/admin/users/${otherAdmin.id}`)
      .set('Cookie', `token=${adminToken(admin.id)}`);
    expect(res.status).toBe(403);
  });

  it('cannot delete own account', async () => {
    const res = await request(app)
      .delete(`/api/admin/users/${admin.id}`)
      .set('Cookie', `token=${adminToken(admin.id)}`);
    expect(res.status).toBe(400);
  });

  it('returns 404 for nonexistent user', async () => {
    const res = await request(app)
      .delete('/api/admin/users/9999')
      .set('Cookie', `token=${adminToken(admin.id)}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/users/:id/login-history', () => {
  it('returns login events newest first', async () => {
    db.prepare('INSERT INTO login_events (user_id) VALUES (?)').run(staff.id);
    db.prepare('INSERT INTO login_events (user_id) VALUES (?)').run(staff.id);
    const res = await request(app)
      .get(`/api/admin/users/${staff.id}/login-history`)
      .set('Cookie', `token=${adminToken(admin.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.events.length).toBe(2);
    expect(res.body.events[0]).toHaveProperty('logged_in_at');
  });

  it('returns empty array for user with no logins', async () => {
    const res = await request(app)
      .get(`/api/admin/users/${staff.id}/login-history`)
      .set('Cookie', `token=${adminToken(admin.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([]);
  });

  it('returns 404 for nonexistent user', async () => {
    const res = await request(app)
      .get('/api/admin/users/9999/login-history')
      .set('Cookie', `token=${adminToken(admin.id)}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/backup', () => {
  it('returns 503 for in-memory database', async () => {
    const res = await request(app)
      .get('/api/admin/backup')
      .set('Cookie', `token=${adminToken(admin.id)}`);
    expect(res.status).toBe(503);
  });

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/backup')
      .set('Cookie', `token=${staffToken(staff.id)}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/system', () => {
  it('returns node version and uptime', async () => {
    const res = await request(app)
      .get('/api/admin/system')
      .set('Cookie', `token=${adminToken(admin.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.nodeVersion).toMatch(/^v\d+/);
    expect(typeof res.body.uptimeSec).toBe('number');
    expect(typeof res.body.totalMemMb).toBe('number');
  });
});

describe('POST /api/admin/maintenance/clear-tokens', () => {
  it('clears expired claim tokens and returns count', async () => {
    const expiredAt = Math.floor(Date.now() / 1000) - 1;
    db.prepare('UPDATE users SET claim_token = ?, claim_token_expires_at = ? WHERE id = ?')
      .run('expiredtoken', expiredAt, staff.id);

    const res = await request(app)
      .post('/api/admin/maintenance/clear-tokens')
      .set('Cookie', `token=${adminToken(admin.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.cleared).toBe(1);
    const row = db.prepare('SELECT claim_token FROM users WHERE id = ?').get(staff.id);
    expect(row.claim_token).toBeNull();
  });

  it('returns 0 when no expired tokens exist', async () => {
    const res = await request(app)
      .post('/api/admin/maintenance/clear-tokens')
      .set('Cookie', `token=${adminToken(admin.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.cleared).toBe(0);
  });
});
