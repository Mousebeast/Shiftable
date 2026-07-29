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

const { seedUser, seedGroup } = require('../test/helpers');
const { sendToUsers } = require('../services/push');
const timeoffRouter = require('./timeoff');
const availabilityRouter = require('./availability');
const swapsRouter = require('./swaps');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/timeoff', timeoffRouter);
  app.use('/api/availability', availabilityRouter);
  app.use('/api/swaps', swapsRouter);
  return app;
}

// Production tokens carry the name (see issueJwt), and the notification body
// uses it.
function token(user) {
  return jwt.sign({ userId: user.id, role: user.role, name: user.name }, 'test-secret', { expiresIn: '1h' });
}

// Far enough ahead to clear both the not-in-the-past rule and the
// effective-from-must-be-a-future-week-start rule.
const FUTURE_DATE = '2027-03-15';   // a Monday
const FUTURE_WEEK = '2027-03-15';

let app, admin, manager, staff, group;

function notificationsFor(userId, type) {
  return db.prepare('SELECT * FROM notifications WHERE user_id = ? AND type = ?').all(userId, type);
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const t of ['notifications', 'shift_swaps', 'schedule_shifts', 'schedules', 'time_off_requests', 'availability', 'shift_templates', 'user_groups', 'users', 'groups']) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  app = buildApp();
  admin = seedUser(db, { name: 'Owner', email: 'admin@test.com', role: 'admin' });
  manager = seedUser(db, { name: 'Sarah', email: 'mgr@test.com', role: 'manager' });
  staff = seedUser(db, { name: 'Haley Quinn', email: 'staff@test.com', role: 'staff' });
  group = seedGroup(db);
});

// Every notification in the app flowed outward to staff. Nothing flowed inward,
// so all three things that land in the Approvals queue were silent on the
// manager side and the queue was pull-only.
describe('time-off requests notify the people who can approve them', () => {
  async function submit(as = staff) {
    return request(app)
      .post('/api/timeoff')
      .set('Cookie', `token=${token(as)}`)
      .send({ startDate: FUTURE_DATE, endDate: FUTURE_DATE, reason: 'Appointment' });
  }

  it('notifies the manager', async () => {
    const res = await submit();
    expect(res.status).toBe(201);
    expect(notificationsFor(manager.id, 'timeoff_requested')).toHaveLength(1);
  });

  // The reported bug: the request reached the Approvals screen but nothing
  // fired. Admins approve too, so they must be addressed as well.
  it('notifies the admin, not just the manager', async () => {
    await submit();
    expect(notificationsFor(admin.id, 'timeoff_requested')).toHaveLength(1);
  });

  it('names the requester and the dates', async () => {
    await submit();
    const [n] = notificationsFor(manager.id, 'timeoff_requested');
    expect(n.body).toContain('Haley Quinn');
    expect(n.body).toContain(FUTURE_DATE);
  });

  it('points at the approvals queue', async () => {
    await submit();
    const [n] = notificationsFor(manager.id, 'timeoff_requested');
    expect(JSON.parse(n.data).url).toBe('/approvals');
  });

  it('does not notify the staff member who submitted it', async () => {
    await submit();
    expect(notificationsFor(staff.id, 'timeoff_requested')).toHaveLength(0);
  });

  it('does not notify a manager about their own request', async () => {
    await submit(manager);
    expect(notificationsFor(manager.id, 'timeoff_requested')).toHaveLength(0);
    // …but the other approver still hears about it.
    expect(notificationsFor(admin.id, 'timeoff_requested')).toHaveLength(1);
  });

  it('skips deactivated approvers — they cannot sign in to act on it', async () => {
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(manager.id);
    await submit();
    expect(notificationsFor(manager.id, 'timeoff_requested')).toHaveLength(0);
    expect(notificationsFor(admin.id, 'timeoff_requested')).toHaveLength(1);
  });

  it('pushes to every approver in one fire-and-forget call', async () => {
    await submit();
    expect(sendToUsers).toHaveBeenCalledTimes(1);
    const [ids] = sendToUsers.mock.calls[0];
    expect(ids.sort()).toEqual([admin.id, manager.id].sort());
  });

  it('still creates the request when there is nobody to notify', async () => {
    db.prepare("DELETE FROM users WHERE role IN ('manager','admin')").run();
    const res = await submit();
    expect(res.status).toBe(201);
    expect(db.prepare('SELECT COUNT(*) AS n FROM time_off_requests').get().n).toBe(1);
  });
});

describe('availability requests notify approvers', () => {
  async function submit(as = staff) {
    return request(app)
      .post('/api/availability')
      .set('Cookie', `token=${token(as)}`)
      .send({ entries: [{ day_of_week: 0, start_time: '09:00', end_time: '17:00', is_blocked: false }], effectiveFrom: FUTURE_WEEK });
  }

  it('reaches both the manager and the admin', async () => {
    const res = await submit();
    expect(res.status).toBe(201);
    expect(notificationsFor(manager.id, 'availability_requested')).toHaveLength(1);
    expect(notificationsFor(admin.id, 'availability_requested')).toHaveLength(1);
  });

  it('carries the requester name and effective date', async () => {
    await submit();
    const [n] = notificationsFor(manager.id, 'availability_requested');
    expect(n.body).toContain('Haley Quinn');
    expect(n.body).toContain(FUTURE_WEEK);
  });

  it('does not notify the submitter', async () => {
    await submit();
    expect(notificationsFor(staff.id, 'availability_requested')).toHaveLength(0);
  });
});

describe('swaps that need review notify approvers', () => {
  // Auto-approval requires same group, free that day, and inside the hour cap.
  // Putting the claimer in no group forces the pending_manager branch.
  async function setupPendingSwap() {
    const other = seedUser(db, { name: 'Jamie Fox', email: 'other@test.com', role: 'staff' });
    db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').run(staff.id, group.id);
    const sched = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by) VALUES ('2026-06-08', 'published', ?)`
    ).run(manager.id).lastInsertRowid;
    const shift = db.prepare(
      `INSERT INTO schedule_shifts (schedule_id, user_id, group_id, date, start_time, hours)
       VALUES (?, ?, ?, '2026-06-08', '09:00', 5)`
    ).run(sched, staff.id, group.id).lastInsertRowid;
    const swap = db.prepare(
      `INSERT INTO shift_swaps (original_shift_id, requester_id, status, created_at)
       VALUES (?, ?, 'open', unixepoch())`
    ).run(shift, staff.id).lastInsertRowid;
    return { swap, other };
  }

  it('tells the approvers, not only the requester', async () => {
    const { swap, other } = await setupPendingSwap();
    const res = await request(app)
      .post(`/api/swaps/${swap}/claim`)
      .set('Cookie', `token=${token(other)}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending_manager');
    expect(notificationsFor(manager.id, 'swap_pending')).toHaveLength(1);
    expect(notificationsFor(admin.id, 'swap_pending')).toHaveLength(1);
  });

  it('stays silent for approvers when the swap auto-approves', async () => {
    const { swap, other } = await setupPendingSwap();
    // Same group and free that day → auto-approved, nothing to review.
    db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').run(other.id, group.id);
    const res = await request(app)
      .post(`/api/swaps/${swap}/claim`)
      .set('Cookie', `token=${token(other)}`);
    expect(res.body.status).toBe('auto_approved');
    expect(notificationsFor(manager.id, 'swap_pending')).toHaveLength(0);
    expect(notificationsFor(admin.id, 'swap_pending')).toHaveLength(0);
  });
});
