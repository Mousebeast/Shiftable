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
const { sendToUsers } = require('../services/push');
const scheduleRouter = require('./schedule');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/schedule', scheduleRouter);
  return app;
}

function managerToken(id) {
  return jwt.sign({ userId: id, role: 'manager' }, 'test-secret', { expiresIn: '1h' });
}

let app, manager, staff;
beforeEach(() => {
  jest.clearAllMocks();
  db.prepare('DELETE FROM notifications').run();
  db.prepare('DELETE FROM schedule_shifts').run();
  db.prepare('DELETE FROM schedules').run();
  db.prepare('DELETE FROM users').run();
  app = buildApp();
  manager = seedUser(db, { email: 'mgr@test.com', role: 'manager' });
  staff = seedUser(db, { email: 'staff@test.com', role: 'staff' });
});

describe('PATCH /api/schedule/:id/publish — notifications', () => {
  it('creates schedule_published notification for each staff with a shift', async () => {
    const grp = db.prepare("INSERT INTO groups (name, color) VALUES ('Srv', '#fff')").run();
    const sched = db.prepare(
      "INSERT INTO schedules (week_start_date, status, created_by) VALUES ('2026-06-02', 'draft', ?)"
    ).run(manager.id);
    db.prepare(
      "INSERT INTO schedule_shifts (schedule_id, user_id, group_id, date, start_time, hours) VALUES (?, ?, ?, '2026-06-02', '09:00', 8)"
    ).run(sched.lastInsertRowid, staff.id, grp.lastInsertRowid);

    const res = await request(app)
      .patch(`/api/schedule/${sched.lastInsertRowid}/publish`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);

    const notif = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'schedule_published'").get(staff.id);
    expect(notif).toBeTruthy();
    expect(sendToUsers).toHaveBeenCalledWith(
      expect.arrayContaining([staff.id]),
      expect.objectContaining({ title: expect.any(String) })
    );
  });

  it('does not create notifications for a schedule with no shifts', async () => {
    const sched = db.prepare(
      "INSERT INTO schedules (week_start_date, status, created_by) VALUES ('2026-06-09', 'draft', ?)"
    ).run(manager.id);

    await request(app)
      .patch(`/api/schedule/${sched.lastInsertRowid}/publish`)
      .set('Cookie', `token=${managerToken(manager.id)}`);

    const notifs = db.prepare("SELECT * FROM notifications WHERE type = 'schedule_published'").all();
    expect(notifs.length).toBe(0);
    expect(sendToUsers).not.toHaveBeenCalled();
  });
});
