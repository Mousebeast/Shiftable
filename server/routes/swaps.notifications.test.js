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
const { sendToUser, sendToUsers } = require('../services/push');
const swapsRouter = require('./swaps');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/swaps', swapsRouter);
  return app;
}

function token(user) {
  return jwt.sign({ userId: user.id, role: user.role }, 'test-secret', { expiresIn: '1h' });
}

let app, manager, staff1, staff2, grpId, schedId, shiftId, swapId;
beforeEach(() => {
  jest.clearAllMocks();
  db.prepare('DELETE FROM notifications').run();
  db.prepare('DELETE FROM shift_swaps').run();
  db.prepare('DELETE FROM schedule_shifts').run();
  db.prepare('DELETE FROM schedules').run();
  db.prepare('DELETE FROM user_groups').run();
  db.prepare('DELETE FROM users').run();
  db.prepare('DELETE FROM groups').run();
  app = buildApp();
  manager = seedUser(db, { email: 'mgr@test.com', role: 'manager' });
  staff1 = seedUser(db, { email: 'staff1@test.com', role: 'staff' });
  staff2 = seedUser(db, { email: 'staff2@test.com', role: 'staff' });
  const grp = db.prepare("INSERT INTO groups (name, color) VALUES ('Srv', '#fff')").run();
  grpId = grp.lastInsertRowid;
  db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').run(staff1.id, grpId);
  db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').run(staff2.id, grpId);
  const sched = db.prepare(
    "INSERT INTO schedules (week_start_date, status, created_by) VALUES ('2026-06-02', 'published', ?)"
  ).run(manager.id);
  schedId = sched.lastInsertRowid;
  const shift = db.prepare(
    "INSERT INTO schedule_shifts (schedule_id, user_id, group_id, date, start_time, hours) VALUES (?, ?, ?, '2026-06-02', '09:00', 8)"
  ).run(schedId, staff1.id, grpId);
  shiftId = shift.lastInsertRowid;
});

describe('POST /api/swaps — swap_offered notification', () => {
  it('notifies other group members when swap is offered', async () => {
    const res = await request(app)
      .post('/api/swaps')
      .set('Cookie', `token=${token(staff1)}`)
      .send({ shiftId });
    expect(res.status).toBe(201);

    const notif = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'swap_offered'").get(staff2.id);
    expect(notif).toBeTruthy();
    expect(sendToUsers).toHaveBeenCalledWith(
      expect.arrayContaining([staff2.id]),
      expect.objectContaining({ title: expect.any(String) })
    );
  });
});

describe('POST /api/swaps/:id/claim — swap_resolved notification', () => {
  it('notifies requester when swap is claimed', async () => {
    // Create an open swap for staff1's shift
    const swap = db.prepare(
      "INSERT INTO shift_swaps (original_shift_id, requester_id, status) VALUES (?, ?, 'open')"
    ).run(shiftId, staff1.id);

    const res = await request(app)
      .post(`/api/swaps/${swap.lastInsertRowid}/claim`)
      .set('Cookie', `token=${token(staff2)}`);
    expect(res.status).toBe(200);

    const notif = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'swap_resolved'").get(staff1.id);
    expect(notif).toBeTruthy();
    expect(sendToUser).toHaveBeenCalledWith(staff1.id, expect.objectContaining({ title: expect.any(String) }));
  });
});

describe('PATCH /api/swaps/:id/approve — swap_resolved notification', () => {
  beforeEach(() => {
    const swap = db.prepare(
      "INSERT INTO shift_swaps (original_shift_id, requester_id, claimer_id, status) VALUES (?, ?, ?, 'pending_manager')"
    ).run(shiftId, staff1.id, staff2.id);
    swapId = swap.lastInsertRowid;
  });

  it('notifies requester and claimer on approval', async () => {
    await request(app)
      .patch(`/api/swaps/${swapId}/approve`)
      .set('Cookie', `token=${token(manager)}`);

    const n1 = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'swap_resolved'").get(staff1.id);
    const n2 = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'swap_resolved'").get(staff2.id);
    expect(n1).toBeTruthy();
    expect(n2).toBeTruthy();
    expect(sendToUser).toHaveBeenCalledTimes(2);
  });
});

describe('PATCH /api/swaps/:id/deny — swap_resolved notification', () => {
  beforeEach(() => {
    const swap = db.prepare(
      "INSERT INTO shift_swaps (original_shift_id, requester_id, claimer_id, status) VALUES (?, ?, ?, 'pending_manager')"
    ).run(shiftId, staff1.id, staff2.id);
    swapId = swap.lastInsertRowid;
  });

  it('notifies requester and claimer on denial', async () => {
    await request(app)
      .patch(`/api/swaps/${swapId}/deny`)
      .set('Cookie', `token=${token(manager)}`);

    const n1 = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'swap_resolved'").get(staff1.id);
    expect(n1).toBeTruthy();
    expect(sendToUser).toHaveBeenCalledTimes(2);
  });
});
