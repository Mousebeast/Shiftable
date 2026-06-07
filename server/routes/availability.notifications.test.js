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
const availabilityRouter = require('./availability');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/availability', availabilityRouter);
  return app;
}

function token(user) {
  return jwt.sign({ userId: user.id, role: user.role }, 'test-secret', { expiresIn: '1h' });
}

let app, manager, staff, availId;
beforeEach(() => {
  jest.clearAllMocks();
  db.prepare('DELETE FROM notifications').run();
  db.prepare('DELETE FROM availability').run();
  db.prepare('DELETE FROM users').run();
  app = buildApp();
  manager = seedUser(db, { email: 'mgr@test.com', role: 'manager' });
  staff = seedUser(db, { email: 'staff@test.com', role: 'staff' });
  const row = db.prepare(
    "INSERT INTO availability (user_id, day_of_week, start_time, end_time, effective_from) VALUES (?, 0, '09:00', '17:00', '2026-06-09')"
  ).run(staff.id);
  availId = row.lastInsertRowid;
});

it('creates availability_resolved notification on approve', async () => {
  await request(app)
    .patch(`/api/availability/${availId}/approve`)
    .set('Cookie', `token=${token(manager)}`);

  const notif = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'availability_resolved'").get(staff.id);
  expect(notif).toBeTruthy();
  expect(sendToUser).toHaveBeenCalledWith(staff.id, expect.objectContaining({ title: expect.any(String) }));
});

it('creates availability_resolved notification on deny', async () => {
  await request(app)
    .patch(`/api/availability/${availId}/deny`)
    .set('Cookie', `token=${token(manager)}`);

  const notif = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'availability_resolved'").get(staff.id);
  expect(notif).toBeTruthy();
  expect(notif.title).toMatch(/denied/i);
});
