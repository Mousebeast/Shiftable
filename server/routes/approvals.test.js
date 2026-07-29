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

const { seedUser, seedGroup, seedTemplate } = require('../test/helpers');
const approvalsRouter = require('./approvals');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/approvals', approvalsRouter);
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
  db.prepare('DELETE FROM shift_swaps').run();
  db.prepare('DELETE FROM schedule_shifts').run();
  db.prepare('DELETE FROM schedules').run();
  db.prepare('DELETE FROM time_off_requests').run();
  db.prepare('DELETE FROM availability').run();
  db.prepare('DELETE FROM shift_templates').run();
  db.prepare('DELETE FROM user_groups').run();
  db.prepare('DELETE FROM users').run();
  db.prepare('DELETE FROM groups').run();

  app = buildApp();
  manager = seedUser(db, { email: 'mgr@test.com', role: 'manager' });
  staff = seedUser(db, { email: 'staff@test.com', role: 'staff' });
  group = seedGroup(db);
});

describe('GET /api/approvals/pending', () => {
  it('returns empty arrays when nothing is pending', async () => {
    const res = await request(app)
      .get('/api/approvals/pending')
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.timeoff).toHaveLength(0);
    expect(res.body.availability).toHaveLength(0);
    expect(res.body.swaps).toHaveLength(0);
  });

  it('returns 403 for staff', async () => {
    const res = await request(app)
      .get('/api/approvals/pending')
      .set('Cookie', `token=${staffToken(staff.id)}`);
    expect(res.status).toBe(403);
  });

  it('returns pending time-off with user_name', async () => {
    db.prepare(
      `INSERT INTO time_off_requests (user_id, start_date, end_date, reason, status)
       VALUES (?, '2026-07-04', '2026-07-07', 'Vacation', 'pending')`
    ).run(staff.id);

    const res = await request(app)
      .get('/api/approvals/pending')
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.timeoff).toHaveLength(1);
    expect(res.body.timeoff[0].start_date).toBe('2026-07-04');
    expect(res.body.timeoff[0].user_name).toBeDefined();
  });

  it('returns pending availability with user_name', async () => {
    db.prepare(
      `INSERT INTO availability (user_id, day_of_week, start_time, end_time, effective_from, status)
       VALUES (?, 0, '10:00', '18:00', '2026-06-08', 'pending')`
    ).run(staff.id);

    const res = await request(app)
      .get('/api/approvals/pending')
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.body.availability).toHaveLength(1);
    expect(res.body.availability[0].user_name).toBeDefined();
    expect(res.body.availability[0].day_of_week).toBe(0);
  });

  it('returns pending_manager swaps with names and shift details', async () => {
    seedTemplate(db, group.id); // fixture only — the returned row is not used
    const claimer = seedUser(db, { email: 'claimer@test.com', role: 'staff' });
    const schedule = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by) VALUES ('2026-06-01', 'published', ?) RETURNING id`
    ).get(manager.id);
    const shift = db.prepare(
      `INSERT INTO schedule_shifts (schedule_id, user_id, group_id, date, start_time, hours)
       VALUES (?, ?, ?, '2026-06-01', '11:00', 5) RETURNING id`
    ).get(schedule.id, staff.id, group.id);
    db.prepare(
      `INSERT INTO shift_swaps (original_shift_id, requester_id, claimer_id, status)
       VALUES (?, ?, ?, 'pending_manager')`
    ).run(shift.id, staff.id, claimer.id);

    const res = await request(app)
      .get('/api/approvals/pending')
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.body.swaps).toHaveLength(1);
    expect(res.body.swaps[0].requester_name).toBeDefined();
    expect(res.body.swaps[0].claimer_name).toBeDefined();
    expect(res.body.swaps[0].date).toBe('2026-06-01');
    expect(res.body.swaps[0].group_name).toBeDefined();
  });
});
