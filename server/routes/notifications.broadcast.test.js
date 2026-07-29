'use strict';
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';

const path = require('path');
const fs = require('fs');
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const db = require('../db/db');
db.exec(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));

const { seedUser, seedGroup } = require('../test/helpers');
const notificationsRouter = require('./notifications');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/notifications', notificationsRouter);
  return app;
}

function managerToken(id) {
  return jwt.sign({ userId: id, role: 'manager' }, 'test-secret', { expiresIn: '1h' });
}
function staffToken(id) {
  return jwt.sign({ userId: id, role: 'staff' }, 'test-secret', { expiresIn: '1h' });
}

let app, manager, staff1, group;
beforeEach(() => {
  db.prepare('DELETE FROM notifications').run();
  db.prepare('DELETE FROM user_groups').run();
  db.prepare('DELETE FROM users').run();
  db.prepare('DELETE FROM groups').run();

  app = buildApp();
  manager = seedUser(db, { email: 'mgr@test.com', role: 'manager' });
  staff1 = seedUser(db, { email: 'staff1@test.com', role: 'staff' });
  // Seeded so broadcasts reach three recipients; the row itself is never read.
  seedUser(db, { email: 'staff2@test.com', role: 'staff' });
  group = seedGroup(db);
  db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').run(staff1.id, group.id);
});

describe('POST /api/notifications/broadcast', () => {
  it('returns 403 for staff', async () => {
    const res = await request(app)
      .post('/api/notifications/broadcast')
      .set('Cookie', `token=${staffToken(staff1.id)}`)
      .send({ title: 'Hi', body: 'Hello' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when title or body missing', async () => {
    const res = await request(app)
      .post('/api/notifications/broadcast')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ title: 'Hi' });
    expect(res.status).toBe(400);
  });

  it('broadcasts to all active users when no groupId given', async () => {
    const res = await request(app)
      .post('/api/notifications/broadcast')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ title: 'All hands', body: 'Team meeting at 3pm' });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(3); // manager + staff1 + staff2
    const rows = db.prepare("SELECT * FROM notifications WHERE type = 'broadcast'").all();
    expect(rows).toHaveLength(3);
  });

  it('broadcasts only to users in the specified group', async () => {
    const res = await request(app)
      .post('/api/notifications/broadcast')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ title: 'Group note', body: 'Servers only', groupId: group.id });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(1); // only staff1 is in the group
    const rows = db.prepare("SELECT * FROM notifications WHERE type = 'broadcast'").all();
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(staff1.id);
  });
});
