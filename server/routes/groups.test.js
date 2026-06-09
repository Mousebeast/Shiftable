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
const groupsRouter = require('./groups');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/groups', groupsRouter);
  return app;
}

function managerToken(id) {
  return jwt.sign({ userId: id, role: 'manager' }, 'test-secret', { expiresIn: '1h' });
}

function staffToken(id) {
  return jwt.sign({ userId: id, role: 'staff' }, 'test-secret', { expiresIn: '1h' });
}

let app, manager, staff, group;
beforeEach(() => {
  db.prepare('DELETE FROM coverage_rules').run();
  db.prepare('DELETE FROM shift_templates').run();
  db.prepare('DELETE FROM user_groups').run();
  db.prepare('DELETE FROM groups').run();
  db.prepare('DELETE FROM users').run();
  app = buildApp();
  manager = seedUser(db, { email: 'mgr@test.com', role: 'manager' });
  staff = seedUser(db, { email: 'staff@test.com', role: 'staff' });
  group = seedGroup(db, { name: 'Server' });
});

describe('GET /api/groups', () => {
  it('returns groups for staff', async () => {
    const res = await request(app)
      .get('/api/groups')
      .set('Cookie', `token=${staffToken(staff.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.groups[0].name).toBe('Server');
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/groups');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/groups', () => {
  it('creates a group (manager)', async () => {
    const res = await request(app)
      .post('/api/groups')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ name: 'Bartender', color: '#ff0000' });
    expect(res.status).toBe(201);
    expect(res.body.group.name).toBe('Bartender');
  });

  it('returns 403 for staff', async () => {
    const res = await request(app)
      .post('/api/groups')
      .set('Cookie', `token=${staffToken(staff.id)}`)
      .send({ name: 'Host', color: '#aaa' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when name missing', async () => {
    const res = await request(app)
      .post('/api/groups')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ color: '#aaa' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/groups/:id', () => {
  it('updates a group', async () => {
    const res = await request(app)
      .patch(`/api/groups/${group.id}`)
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ name: 'Server Team', color: '#000' });
    expect(res.status).toBe(200);
    expect(res.body.group.name).toBe('Server Team');
  });
});

describe('DELETE /api/groups/:id', () => {
  it('deletes a group with no members', async () => {
    const res = await request(app)
      .delete(`/api/groups/${group.id}`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
  });

  it('returns 409 when group has members', async () => {
    db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').run(staff.id, group.id);
    const res = await request(app)
      .delete(`/api/groups/${group.id}`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(409);
  });
});

describe('POST /api/groups/:id/templates', () => {
  it('creates a shift template', async () => {
    const res = await request(app)
      .post(`/api/groups/${group.id}/templates`)
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ name: 'Lunch', startTime: '11:00', hours: 5 });
    expect(res.status).toBe(201);
    expect(res.body.template.name).toBe('Lunch');
  });
});

describe('PUT /api/groups/:id/coverage', () => {
  it('upserts a coverage rule', async () => {
    const tmpl = seedTemplate(db, group.id);
    const res = await request(app)
      .put(`/api/groups/${group.id}/coverage`)
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ dayOfWeek: 0, templateId: tmpl.id, minStaff: 3 });
    expect(res.status).toBe(200);
    expect(res.body.rule.min_staff).toBe(3);
  });
});
