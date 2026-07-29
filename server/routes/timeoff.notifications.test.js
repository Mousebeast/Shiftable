'use strict';
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

jest.mock('../services/push', () => ({
  sendToUser: jest.fn(),
  sendToUsers: jest.fn(),
}));

const path = require('path');
const fs = require('fs');
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const db = require('../db/db');
db.exec(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));

const { seedUser } = require('../test/helpers');
const { sendToUser } = require('../services/push');
const timeoffRouter = require('./timeoff');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/timeoff', timeoffRouter);
  return app;
}

function token(user) {
  return jwt.sign({ userId: user.id, role: user.role }, 'test-secret', { expiresIn: '1h' });
}

let app, manager, staff, requestId;
beforeEach(() => {
  jest.clearAllMocks();
  db.prepare('DELETE FROM notifications').run();
  db.prepare('DELETE FROM time_off_requests').run();
  db.prepare('DELETE FROM users').run();
  app = buildApp();
  manager = seedUser(db, { email: 'mgr@test.com', role: 'manager' });
  staff = seedUser(db, { email: 'staff@test.com', role: 'staff' });
  const row = db.prepare(
    "INSERT INTO time_off_requests (user_id, start_date, end_date) VALUES (?, '2026-07-01', '2026-07-03')"
  ).run(staff.id);
  requestId = row.lastInsertRowid;
});

it('creates timeoff_resolved notification on approve', async () => {
  await request(app)
    .patch(`/api/timeoff/${requestId}/approve`)
    .set('Cookie', `token=${token(manager)}`);

  const notif = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'timeoff_resolved'").get(staff.id);
  expect(notif).toBeTruthy();
  expect(notif.title).toMatch(/approved/i);
  expect(sendToUser).toHaveBeenCalledWith(staff.id, expect.objectContaining({ title: expect.any(String) }));
});

it('creates timeoff_resolved notification on deny', async () => {
  await request(app)
    .patch(`/api/timeoff/${requestId}/deny`)
    .set('Cookie', `token=${token(manager)}`);

  const notif = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'timeoff_resolved'").get(staff.id);
  expect(notif).toBeTruthy();
  expect(notif.title).toMatch(/denied/i);
});
