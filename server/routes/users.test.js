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

  it('returns 400 when email missing', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ name: 'No Email', role: 'staff' });
    expect(res.status).toBe(400);
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

  it('returns 403 when manager tries to deactivate an admin', async () => {
    const res = await request(app)
      .patch(`/api/users/${admin.id}/deactivate`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin/);
  });
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

describe('PUT /api/users/:id/fixed-schedules/:day', () => {
  it('upserts a fixed schedule', async () => {
    const tmpl = seedTemplate(db, group.id);
    const res = await request(app)
      .put(`/api/users/${staff.id}/fixed-schedules/0`)
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ templateId: tmpl.id });
    expect(res.status).toBe(200);
    expect(res.body.schedule.day_of_week).toBe(0);
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
