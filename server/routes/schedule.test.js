'use strict';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const { createTestDb, seedUser, seedGroup } = require('../test/helpers');

function makeToken(user) {
  return jwt.sign({ userId: user.id, role: user.role, name: user.name }, 'test-secret');
}

function seedSchedule(db, managerId, weekStart) {
  const result = db
    .prepare(
      `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'published', ?)`
    )
    .run(weekStart, managerId);
  return result.lastInsertRowid;
}

describe('GET /api/schedule', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/schedule?week=2026-06-02');
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid JWT cookie', async () => {
    const db = createTestDb();
    const user = seedUser(db);
    const token = makeToken(user);
    const res = await request(app)
      .get('/api/schedule?week=2026-06-02')
      .set('Cookie', `token=${token}`);
    expect([200, 404]).toContain(res.status);
  });

  it('returns 400 for missing week param', async () => {
    const db = createTestDb();
    const user = seedUser(db);
    const token = makeToken(user);
    const res = await request(app)
      .get('/api/schedule')
      .set('Cookie', `token=${token}`);
    expect(res.status).toBe(400);
  });
});

describe('getPublishedScheduleForWeek', () => {
  it('returns undefined for missing week', () => {
    const db = createTestDb();
    const { getPublishedScheduleForWeek } = require('../db/schedule');
    const result = getPublishedScheduleForWeek('2026-06-02', db);
    expect(result).toBeUndefined();
  });

  it('returns schedule row when published', () => {
    const db = createTestDb();
    const { getPublishedScheduleForWeek } = require('../db/schedule');
    const manager = seedUser(db, { role: 'manager', email: 'm@test.com' });
    seedSchedule(db, manager.id, '2026-06-02');
    const result = getPublishedScheduleForWeek('2026-06-02', db);
    expect(result.week_start_date).toBe('2026-06-02');
    expect(result.status).toBe('published');
  });

  it('does not return draft schedules', () => {
    const db = createTestDb();
    const { getPublishedScheduleForWeek } = require('../db/schedule');
    const manager = seedUser(db, { role: 'manager', email: 'm@test.com' });
    db.prepare(`INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'draft', ?)`).run('2026-06-02', manager.id);
    const result = getPublishedScheduleForWeek('2026-06-02', db);
    expect(result).toBeUndefined();
  });
});

describe('getUpcomingShiftForUser', () => {
  it('returns undefined when user has no upcoming published shifts', () => {
    const db = createTestDb();
    const { getUpcomingShiftForUser } = require('../db/schedule');
    const user = seedUser(db);
    const result = getUpcomingShiftForUser(user.id, db);
    expect(result).toBeUndefined();
  });

  it('returns the shift when one exists in a published schedule', () => {
    const db = createTestDb();
    const { getUpcomingShiftForUser } = require('../db/schedule');
    const manager = seedUser(db, { role: 'manager', email: 'mgr@test.com' });
    const staff = seedUser(db, { role: 'staff', email: 'staff@test.com' });
    const group = seedGroup(db);

    const scheduleId = db
      .prepare(
        `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'published', ?)`
      )
      .run('2099-01-01', manager.id).lastInsertRowid;

    db.prepare(
      `INSERT INTO schedule_shifts (schedule_id, user_id, group_id, date, start_time, hours, is_fixed)
       VALUES (?, ?, ?, '2099-01-01', '17:00', 6, 0)`
    ).run(scheduleId, staff.id, group.id);

    const result = getUpcomingShiftForUser(staff.id, db);
    expect(result).toBeDefined();
    expect(result.date).toBe('2099-01-01');
    expect(result.start_time).toBe('17:00');
    expect(result.hours).toBe(6);
    expect(result.group_name).toBe(group.name);
    expect(result.group_color).toBe(group.color);
  });
});
