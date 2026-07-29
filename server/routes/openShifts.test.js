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

const { seedUser, seedGroup, seedTemplate } = require('../test/helpers');
const openShiftsRouter = require('./openShifts');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/open-shifts', openShiftsRouter);
  return app;
}

const staffToken = id => jwt.sign({ userId: id, role: 'staff' }, 'test-secret', { expiresIn: '1h' });

// 2026-06-08 is a Monday, which is the default week start.
const WEEK = '2026-06-08';
const DAY = '2026-06-08';

let app, manager, staff, group, template, scheduleId;

function seedPublishedWeek() {
  return db.prepare(
    `INSERT INTO schedules (week_start_date, status, created_by, published_by, published_at)
     VALUES (?, 'published', ?, ?, unixepoch())`
  ).run(WEEK, manager.id, manager.id).lastInsertRowid;
}

function seedOpenShift(hours = 6) {
  return db.prepare(
    `INSERT INTO open_shifts (group_id, shift_template_id, date, start_time, hours, status, created_by)
     VALUES (?, ?, ?, '17:00', ?, 'open', ?)`
  ).run(group.id, template.id, DAY, hours, manager.id).lastInsertRowid;
}

// Gives the claimer existing published hours in the same week, on a different
// day so the one-shift-per-day rule doesn't mask the hours check.
function seedExistingHours(hours) {
  db.prepare(
    `INSERT INTO schedule_shifts (schedule_id, user_id, group_id, date, start_time, hours)
     VALUES (?, ?, ?, '2026-06-09', '09:00', ?)`
  ).run(scheduleId, staff.id, group.id, hours);
}

beforeEach(() => {
  for (const t of ['open_shifts', 'schedule_shifts', 'schedules', 'availability', 'shift_templates', 'user_groups', 'users', 'groups']) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  app = buildApp();
  manager = seedUser(db, { email: 'mgr@test.com', role: 'manager' });
  staff = seedUser(db, { email: 'staff@test.com', role: 'staff' });
  group = seedGroup(db);
  template = seedTemplate(db, group.id);
  db.prepare(`INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)`).run(staff.id, group.id);
  scheduleId = seedPublishedWeek();
});

describe('POST /api/open-shifts/:id/claim — weekly hour cap', () => {
  it('claims successfully when the shift fits inside the weekly maximum', async () => {
    db.prepare(`UPDATE users SET max_hours_per_week = 40 WHERE id = ?`).run(staff.id);
    seedExistingHours(10);
    const id = seedOpenShift(6);

    const res = await request(app)
      .post(`/api/open-shifts/${id}/claim`)
      .set('Cookie', `token=${staffToken(staff.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('auto_approved');
  });

  it('refuses the claim when it would breach the weekly maximum', async () => {
    db.prepare(`UPDATE users SET max_hours_per_week = 12 WHERE id = ?`).run(staff.id);
    seedExistingHours(10);
    const id = seedOpenShift(6); // 10 + 6 > 12

    const res = await request(app)
      .post(`/api/open-shifts/${id}/claim`)
      .set('Cookie', `token=${staffToken(staff.id)}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/maximum hours/i);
  });

  it('leaves the open shift claimable by someone else after a refusal', async () => {
    db.prepare(`UPDATE users SET max_hours_per_week = 12 WHERE id = ?`).run(staff.id);
    seedExistingHours(10);
    const id = seedOpenShift(6);

    await request(app)
      .post(`/api/open-shifts/${id}/claim`)
      .set('Cookie', `token=${staffToken(staff.id)}`);

    // The whole claim runs in one transaction, so a rejected claim must not
    // consume the shift or leave a half-written schedule_shifts row.
    const row = db.prepare(`SELECT status, claimer_id FROM open_shifts WHERE id = ?`).get(id);
    expect(row.status).toBe('open');
    expect(row.claimer_id).toBeNull();
    const inserted = db.prepare(
      `SELECT COUNT(*) AS n FROM schedule_shifts WHERE user_id = ? AND date = ?`
    ).get(staff.id, DAY);
    expect(inserted.n).toBe(0);
  });

  it('lands exactly on the maximum without refusing', async () => {
    db.prepare(`UPDATE users SET max_hours_per_week = 16 WHERE id = ?`).run(staff.id);
    seedExistingHours(10);
    const id = seedOpenShift(6); // 10 + 6 === 16

    const res = await request(app)
      .post(`/api/open-shifts/${id}/claim`)
      .set('Cookie', `token=${staffToken(staff.id)}`);

    expect(res.status).toBe(200);
  });
});

// Claiming an open shift is volunteering. The claimer's own stated hours are
// theirs to override; only the restaurant's weekly maximum is not.
describe('POST /api/open-shifts/:id/claim — availability is not consulted', () => {
  it('claims with no availability record at all', async () => {
    const id = seedOpenShift(6);
    const res = await request(app)
      .post(`/api/open-shifts/${id}/claim`)
      .set('Cookie', `token=${staffToken(staff.id)}`);
    expect(res.status).toBe(200);
  });

  it('claims a shift falling outside the stated hours', async () => {
    db.prepare(
      `INSERT INTO availability (user_id, day_of_week, start_time, end_time, effective_from, status)
       VALUES (?, 0, '08:00', '12:00', ?, 'approved')`
    ).run(staff.id, WEEK);
    const id = seedOpenShift(6); // 17:00 start, well outside 08:00–12:00

    const res = await request(app)
      .post(`/api/open-shifts/${id}/claim`)
      .set('Cookie', `token=${staffToken(staff.id)}`);
    expect(res.status).toBe(200);
  });

  it('claims on a day the staff member is blocked', async () => {
    db.prepare(
      `INSERT INTO availability (user_id, day_of_week, start_time, end_time, is_blocked, effective_from, status)
       VALUES (?, 0, '00:00', '00:00', 1, ?, 'approved')`
    ).run(staff.id, WEEK);
    const id = seedOpenShift(6);

    const res = await request(app)
      .post(`/api/open-shifts/${id}/claim`)
      .set('Cookie', `token=${staffToken(staff.id)}`);
    expect(res.status).toBe(200);
  });
});
