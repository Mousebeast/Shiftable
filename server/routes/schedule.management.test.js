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

const { seedUser, seedGroup, seedTemplate, seedCoverageRule } = require('../test/helpers');
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

function staffToken(id) {
  return jwt.sign({ userId: id, role: 'staff' }, 'test-secret', { expiresIn: '1h' });
}

const WEEK = '2026-06-01'; // Monday

let app, manager, staff, group, template;
beforeEach(() => {
  db.prepare('DELETE FROM schedule_shifts').run();
  db.prepare('DELETE FROM schedules').run();
  db.prepare('DELETE FROM coverage_rules').run();
  db.prepare('DELETE FROM shift_templates').run();
  db.prepare('DELETE FROM user_groups').run();
  db.prepare('DELETE FROM fixed_schedules').run();
  db.prepare('DELETE FROM time_off_requests').run();
  db.prepare('DELETE FROM availability').run();
  db.prepare('DELETE FROM users').run();
  db.prepare('DELETE FROM groups').run();
  db.prepare("DELETE FROM app_settings WHERE key = 'max_consecutive_days'").run();
  db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('max_consecutive_days', '6')").run();

  app = buildApp();
  manager = seedUser(db, { email: 'mgr@test.com', role: 'manager' });
  staff = seedUser(db, { email: 'staff@test.com', role: 'staff' });
  group = seedGroup(db);
  template = seedTemplate(db, group.id, { start_time: '11:00', hours: 5 });
  seedCoverageRule(db, group.id, template.id, { day_of_week: 0, min_staff: 1 });
  db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').run(staff.id, group.id);
});

describe('POST /api/schedule/generate', () => {
  it('creates a draft schedule with shifts', async () => {
    const res = await request(app)
      .post('/api/schedule/generate')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ week: WEEK });
    expect(res.status).toBe(201);
    expect(res.body.schedule.status).toBe('draft');
    expect(res.body.schedule.week_start_date).toBe(WEEK);
    expect(Array.isArray(res.body.shifts)).toBe(true);
    expect(Array.isArray(res.body.warnings)).toBe(true);
  });

  it('returns 403 for staff', async () => {
    const res = await request(app)
      .post('/api/schedule/generate')
      .set('Cookie', `token=${staffToken(staff.id)}`)
      .send({ week: WEEK });
    expect(res.status).toBe(403);
  });

  it('returns 400 when week is missing', async () => {
    const res = await request(app)
      .post('/api/schedule/generate')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when week is not a Monday', async () => {
    const res = await request(app)
      .post('/api/schedule/generate')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ week: '2026-06-03' }); // Wednesday (not a Monday)
    expect(res.status).toBe(400);
  });

  it('returns 409 when a published schedule already exists for the week', async () => {
    db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by, published_by, published_at)
       VALUES (?, 'published', ?, ?, unixepoch())`
    ).run(WEEK, manager.id, manager.id);

    const res = await request(app)
      .post('/api/schedule/generate')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ week: WEEK });
    expect(res.status).toBe(409);
  });

  it('regenerates a draft when one already exists (replaces shifts)', async () => {
    await request(app)
      .post('/api/schedule/generate')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ week: WEEK });
    const res = await request(app)
      .post('/api/schedule/generate')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ week: WEEK });
    expect(res.status).toBe(201);
  });
});

describe('PATCH /api/schedule/:id/publish', () => {
  it('publishes a draft schedule', async () => {
    const genRes = await request(app)
      .post('/api/schedule/generate')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ week: WEEK });
    const scheduleId = genRes.body.schedule.id;

    const res = await request(app)
      .patch(`/api/schedule/${scheduleId}/publish`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.schedule.status).toBe('published');
  });

  it('returns 403 for staff', async () => {
    const res = await request(app)
      .patch('/api/schedule/999/publish')
      .set('Cookie', `token=${staffToken(staff.id)}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent schedule', async () => {
    const res = await request(app)
      .patch('/api/schedule/99999/publish')
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(404);
  });

  it('returns 409 when schedule is already published', async () => {
    const genRes = await request(app)
      .post('/api/schedule/generate')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ week: WEEK });
    const scheduleId = genRes.body.schedule.id;
    await request(app)
      .patch(`/api/schedule/${scheduleId}/publish`)
      .set('Cookie', `token=${managerToken(manager.id)}`);

    const res = await request(app)
      .patch(`/api/schedule/${scheduleId}/publish`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(409);
  });
});

describe('GET /api/schedule/builder', () => {
  it('returns null when no schedule exists for the week', async () => {
    const res = await request(app)
      .get(`/api/schedule/builder?week=${WEEK}`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.schedule).toBeNull();
    expect(res.body.shifts).toHaveLength(0);
  });

  it('returns draft schedule and shifts when a draft exists', async () => {
    // Generate a draft first
    await request(app)
      .post('/api/schedule/generate')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ week: WEEK });

    const res = await request(app)
      .get(`/api/schedule/builder?week=${WEEK}`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.schedule.status).toBe('draft');
    expect(res.body.schedule.week_start_date).toBe(WEEK);
    expect(Array.isArray(res.body.shifts)).toBe(true);
  });

  it('returns published schedule and shifts when a published schedule exists', async () => {
    const genRes = await request(app)
      .post('/api/schedule/generate')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ week: WEEK });
    await request(app)
      .patch(`/api/schedule/${genRes.body.schedule.id}/publish`)
      .set('Cookie', `token=${managerToken(manager.id)}`);

    const res = await request(app)
      .get(`/api/schedule/builder?week=${WEEK}`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.schedule.status).toBe('published');
    expect(Array.isArray(res.body.shifts)).toBe(true);
  });

  it('returns 403 for staff role', async () => {
    const res = await request(app)
      .get(`/api/schedule/builder?week=${WEEK}`)
      .set('Cookie', `token=${staffToken(staff.id)}`);
    expect(res.status).toBe(403);
  });

  it('returns 400 when week parameter is missing', async () => {
    const res = await request(app)
      .get('/api/schedule/builder')
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(400);
  });
});

// Helper — seeds a published schedule with one shift, returns { scheduleId, shiftId }
function seedPublishedWithShift(template2 = template) {
  const scheduleId = db.prepare(
    `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'published', ?)`
  ).run(WEEK, manager.id).lastInsertRowid;
  const shiftId = db.prepare(
    `INSERT INTO schedule_shifts (schedule_id, user_id, group_id, shift_template_id, date, start_time, hours, is_fixed, is_override)
     VALUES (?, ?, ?, ?, ?, '11:00', 5, 0, 0)`
  ).run(scheduleId, staff.id, group.id, template2.id, WEEK).lastInsertRowid;
  return { scheduleId, shiftId };
}

function seedDraftForkWithShift(template2 = template) {
  const publishedId = db.prepare(
    `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'published', ?)`
  ).run(WEEK, manager.id).lastInsertRowid;
  const draftId = db.prepare(
    `INSERT INTO schedules (week_start_date, status, created_by, parent_schedule_id) VALUES (?, 'draft', ?, ?)`
  ).run(WEEK, manager.id, publishedId).lastInsertRowid;
  const shiftId = db.prepare(
    `INSERT INTO schedule_shifts (schedule_id, user_id, group_id, shift_template_id, date, start_time, hours, is_fixed, is_override)
     VALUES (?, ?, ?, ?, ?, '11:00', 5, 0, 0)`
  ).run(draftId, staff.id, group.id, template2.id, WEEK).lastInsertRowid;
  return { scheduleId: draftId, publishedId, shiftId };
}

describe('PATCH /api/schedule/shifts/:id', () => {
  it('returns 403 for staff role', async () => {
    const res = await request(app)
      .patch('/api/schedule/shifts/1')
      .set('Cookie', `token=${staffToken(staff.id)}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('returns 404 for nonexistent shift', async () => {
    const res = await request(app)
      .patch('/api/schedule/shifts/99999')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ templateId: template.id, groupId: group.id, startTime: '11:00', hours: 5 });
    expect(res.status).toBe(404);
  });

  it('updates shift and sets is_override=1', async () => {
    const { shiftId } = seedDraftForkWithShift();
    const res = await request(app)
      .patch(`/api/schedule/shifts/${shiftId}`)
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ templateId: template.id, groupId: group.id, startTime: '14:00', hours: 4 });
    expect(res.status).toBe(200);
    expect(res.body.shift.start_time).toBe('14:00');
    expect(res.body.shift.hours).toBe(4);
    expect(res.body.shift.is_override).toBe(1);
    expect(Array.isArray(res.body.violations)).toBe(true);
  });

  it('returns hours_cap violation when shift exceeds weekly max', async () => {
    // Set max_hours_per_week to 4 so adding a 5h shift exceeds it
    db.prepare('UPDATE users SET max_hours_per_week=4 WHERE id=?').run(staff.id);
    const { shiftId } = seedDraftForkWithShift();
    const res = await request(app)
      .patch(`/api/schedule/shifts/${shiftId}`)
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ templateId: template.id, groupId: group.id, startTime: '11:00', hours: 5 });
    expect(res.status).toBe(200); // advisory — still saves
    expect(res.body.violations.some(v => v.type === 'hours_cap')).toBe(true);
  });
});

describe('DELETE /api/schedule/shifts/:id', () => {
  it('returns 403 for staff role', async () => {
    const res = await request(app)
      .delete('/api/schedule/shifts/1')
      .set('Cookie', `token=${staffToken(staff.id)}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for nonexistent shift', async () => {
    const res = await request(app)
      .delete('/api/schedule/shifts/99999')
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(404);
  });

  it('removes shift and returns ok with violations', async () => {
    const { shiftId } = seedDraftForkWithShift();
    const res = await request(app)
      .delete(`/api/schedule/shifts/${shiftId}`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.violations)).toBe(true);
    const row = db.prepare('SELECT id FROM schedule_shifts WHERE id=?').get(shiftId);
    expect(row).toBeUndefined();
  });

  it('returns coverage_gap violation when removal breaks a coverage rule', async () => {
    // coverage rule requires min_staff=1; deleting the only shift creates a gap
    const { shiftId } = seedDraftForkWithShift();
    const res = await request(app)
      .delete(`/api/schedule/shifts/${shiftId}`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.body.violations.some(v => v.type === 'coverage_gap')).toBe(true);
  });
});

describe('POST /api/schedule/:id/shifts', () => {
  it('returns 403 for staff role', async () => {
    const { scheduleId } = seedPublishedWithShift();
    const res = await request(app)
      .post(`/api/schedule/${scheduleId}/shifts`)
      .set('Cookie', `token=${staffToken(staff.id)}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('returns 400 when required fields are missing', async () => {
    const { scheduleId } = seedPublishedWithShift();
    const res = await request(app)
      .post(`/api/schedule/${scheduleId}/shifts`)
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ userId: staff.id }); // missing date, groupId, startTime, hours
    expect(res.status).toBe(400);
  });

  it('inserts an override shift and returns enriched shift', async () => {
    const scheduleId = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'published', ?)`
    ).run(WEEK, manager.id).lastInsertRowid;
    const res = await request(app)
      .post(`/api/schedule/${scheduleId}/shifts`)
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ userId: staff.id, date: WEEK, groupId: group.id, templateId: template.id, startTime: '11:00', hours: 5 });
    expect(res.status).toBe(201);
    expect(res.body.shift.user_id).toBe(staff.id);
    expect(res.body.shift.is_override).toBe(1);
    expect(res.body.shift.user_name).toBeDefined(); // enriched via JOIN
    expect(Array.isArray(res.body.violations)).toBe(true);
  });
});

describe('PATCH /api/schedule/:id/republish', () => {
  it('returns 403 for staff role', async () => {
    // Use a draft with a parent to satisfy the new republish contract
    const published = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'published', ?) RETURNING id`
    ).get(WEEK, manager.id);
    const draft = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by, parent_schedule_id) VALUES (?, 'draft', ?, ?) RETURNING id`
    ).get(WEEK, manager.id, published.id);
    const res = await request(app)
      .patch(`/api/schedule/${draft.id}/republish`)
      .set('Cookie', `token=${staffToken(staff.id)}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 and promotes a draft fork to published', async () => {
    const published = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'published', ?) RETURNING id`
    ).get(WEEK, manager.id);
    const draft = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by, parent_schedule_id) VALUES (?, 'draft', ?, ?) RETURNING id`
    ).get(WEEK, manager.id, published.id);
    const res = await request(app)
      .patch(`/api/schedule/${draft.id}/republish`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.schedule.status).toBe('published');
  });

  it('returns 409 for a published schedule', async () => {
    const { scheduleId } = seedPublishedWithShift();
    const res = await request(app)
      .patch(`/api/schedule/${scheduleId}/republish`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(409);
  });
});

describe('POST /api/schedule/generate with force', () => {
  it('creates a new draft (does not mutate the published schedule) when force=true', async () => {
    const { scheduleId } = seedPublishedWithShift();
    const res = await request(app)
      .post('/api/schedule/generate')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ week: WEEK, force: true });
    expect(res.status).toBe(201);
    // A new draft is created; published schedule is untouched
    expect(res.body.schedule.status).toBe('draft');
    expect(res.body.schedule.id).not.toBe(scheduleId);
  });

  it('preserves is_override shifts from published into the new draft when force=true', async () => {
    const { scheduleId } = seedPublishedWithShift();
    // Mark the existing shift as an override
    db.prepare('UPDATE schedule_shifts SET is_override=1 WHERE schedule_id=?').run(scheduleId);
    const res = await request(app)
      .post('/api/schedule/generate')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ week: WEEK, force: true });
    expect(res.status).toBe(201);
    const overrideShift = res.body.shifts.find(s => s.is_override === 1);
    expect(overrideShift).toBeDefined();
    expect(overrideShift.start_time).toBe('11:00');
    // User should only have ONE shift on the override date (no double-scheduling by fill phase)
    const userShiftsOnDay = res.body.shifts.filter(s => s.user_id === staff.id && s.date === WEEK);
    expect(userShiftsOnDay).toHaveLength(1);
  });
});

describe('POST /api/schedule/generate with force=true', () => {
  it('creates a working draft alongside published — does NOT demote published', async () => {
    // First generate and publish a schedule
    await request(app)
      .post('/api/schedule/generate')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ week: WEEK });
    const allSchedules = db.prepare("SELECT id FROM schedules WHERE status='draft'").all();
    const draftId = allSchedules[0].id;
    const publishRes = await request(app)
      .patch(`/api/schedule/${draftId}/publish`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    const publishedId = publishRes.body.schedule.id;

    // Force re-generate
    const res = await request(app)
      .post('/api/schedule/generate')
      .set('Cookie', `token=${managerToken(manager.id)}`)
      .send({ week: WEEK, force: true });

    expect(res.status).toBe(201);
    expect(res.body.schedule.status).toBe('draft');
    expect(res.body.hasDraft).toBe(true);
    expect(res.body.liveSchedule).toBeDefined();

    // Published schedule must still exist and still be published
    const still = db.prepare('SELECT status FROM schedules WHERE id = ?').get(publishedId);
    expect(still.status).toBe('published');
  });
});

describe('POST /api/schedule/:id/fork', () => {
  function seedPublished() {
    const s = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'published', ?) RETURNING id`
    ).get(WEEK, manager.id);
    db.prepare(
      `INSERT INTO schedule_shifts (schedule_id, user_id, group_id, shift_template_id, date, start_time, hours, is_fixed, is_override)
       VALUES (?, ?, ?, ?, ?, '11:00', 5, 0, 0)`
    ).run(s.id, staff.id, group.id, template.id, WEEK);
    return s;
  }

  it('creates a draft copy of a published schedule', async () => {
    const published = seedPublished();
    const res = await request(app)
      .post(`/api/schedule/${published.id}/fork`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(201);
    expect(res.body.schedule.status).toBe('draft');
    expect(res.body.hasDraft).toBe(true);
    expect(res.body.shifts).toHaveLength(1);
  });

  it('returns existing draft if one already exists', async () => {
    const published = seedPublished();
    await request(app)
      .post(`/api/schedule/${published.id}/fork`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    const res = await request(app)
      .post(`/api/schedule/${published.id}/fork`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
    const drafts = db.prepare("SELECT id FROM schedules WHERE status='draft'").all();
    expect(drafts).toHaveLength(1);
  });

  it('returns 409 for a non-published schedule', async () => {
    const s = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'draft', ?) RETURNING id`
    ).get(WEEK, manager.id);
    const res = await request(app)
      .post(`/api/schedule/${s.id}/fork`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(409);
  });

  it('returns 403 for staff role', async () => {
    const published = seedPublished();
    const res = await request(app)
      .post(`/api/schedule/${published.id}/fork`)
      .set('Cookie', `token=${staffToken(staff.id)}`);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/schedule/:id/draft', () => {
  it('discards a draft and returns the live schedule', async () => {
    const published = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'published', ?) RETURNING id`
    ).get(WEEK, manager.id);
    const fork = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by, parent_schedule_id) VALUES (?, 'draft', ?, ?) RETURNING id`
    ).get(WEEK, manager.id, published.id);

    const res = await request(app)
      .delete(`/api/schedule/${fork.id}/draft`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.hasDraft).toBe(false);
    expect(res.body.schedule.id).toBe(published.id);

    const gone = db.prepare('SELECT id FROM schedules WHERE id=?').get(fork.id);
    expect(gone).toBeUndefined();
  });

  it('returns 409 for a non-draft schedule', async () => {
    const s = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'published', ?) RETURNING id`
    ).get(WEEK, manager.id);
    const res = await request(app)
      .delete(`/api/schedule/${s.id}/draft`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/schedule/:id/republish (two-version)', () => {
  it('archives old published, promotes draft to published', async () => {
    const published = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'published', ?) RETURNING id`
    ).get(WEEK, manager.id);
    const fork = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by, parent_schedule_id) VALUES (?, 'draft', ?, ?) RETURNING id`
    ).get(WEEK, manager.id, published.id);

    const res = await request(app)
      .patch(`/api/schedule/${fork.id}/republish`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.schedule.status).toBe('published');

    const old = db.prepare('SELECT status FROM schedules WHERE id=?').get(published.id);
    expect(old.status).toBe('archived');
  });

  it('auto-denies pending swaps on the old published schedule', async () => {
    const published = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'published', ?) RETURNING id`
    ).get(WEEK, manager.id);
    const shiftRow = db.prepare(
      `INSERT INTO schedule_shifts (schedule_id, user_id, group_id, shift_template_id, date, start_time, hours, is_fixed, is_override)
       VALUES (?, ?, ?, ?, ?, '11:00', 5, 0, 0) RETURNING id`
    ).get(published.id, staff.id, group.id, template.id, WEEK);
    db.prepare(
      `INSERT INTO shift_swaps (original_shift_id, requester_id, status, created_at) VALUES (?, ?, 'open', unixepoch())`
    ).run(shiftRow.id, staff.id);

    const fork = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by, parent_schedule_id) VALUES (?, 'draft', ?, ?) RETURNING id`
    ).get(WEEK, manager.id, published.id);

    await request(app)
      .patch(`/api/schedule/${fork.id}/republish`)
      .set('Cookie', `token=${managerToken(manager.id)}`);

    const swap = db.prepare('SELECT status FROM shift_swaps WHERE original_shift_id=?').get(shiftRow.id);
    expect(swap.status).toBe('denied');
  });

  it('returns 409 for a non-draft schedule', async () => {
    const s = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'published', ?) RETURNING id`
    ).get(WEEK, manager.id);
    const res = await request(app)
      .patch(`/api/schedule/${s.id}/republish`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(409);
  });

  it('returns 403 for staff role', async () => {
    const parent = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'published', ?) RETURNING id`
    ).get(WEEK, manager.id);
    const s = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by, parent_schedule_id) VALUES (?, 'draft', ?, ?) RETURNING id`
    ).get(WEEK, manager.id, parent.id);
    const res = await request(app)
      .patch(`/api/schedule/${s.id}/republish`)
      .set('Cookie', `token=${staffToken(staff.id)}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/schedule/builder (two-version)', () => {
  it('returns hasDraft=true and liveSchedule when a draft fork exists', async () => {
    const published = db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'published', ?) RETURNING id`
    ).get(WEEK, manager.id);
    db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by, parent_schedule_id) VALUES (?, 'draft', ?, ?)`
    ).run(WEEK, manager.id, published.id);

    const res = await request(app)
      .get(`/api/schedule/builder?week=${WEEK}`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.hasDraft).toBe(true);
    expect(res.body.liveSchedule).toBeDefined();
    expect(res.body.schedule.status).toBe('draft');
  });

  it('returns hasDraft=false when only a published schedule exists', async () => {
    db.prepare(
      `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'published', ?)`
    ).run(WEEK, manager.id);

    const res = await request(app)
      .get(`/api/schedule/builder?week=${WEEK}`)
      .set('Cookie', `token=${managerToken(manager.id)}`);
    expect(res.body.hasDraft).toBe(false);
    expect(res.body.liveSchedule).toBeNull();
    expect(res.body.schedule.status).toBe('published');
  });
});

describe('generateSchedule — override locking', () => {
  it('preserves override shifts and does not re-assign that user+date to coverage fill', () => {
    const { generateSchedule } = require('../services/scheduler');
    const weekDates = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'];
    const users = [{ id: 1, name: 'Alice', min_hours_per_week: 0, max_hours_per_week: 40 }];
    const overrideShifts = [{
      user_id: 1, group_id: 10, shift_template_id: 20, date: '2026-06-01', start_time: '17:00', hours: 6,
    }];
    const coverageRules = [{
      group_id: 10, day_of_week: 0, shift_template_id: 20, min_staff: 1, start_time: '11:00', hours: 5, group_priority: 0,
    }];

    const { shifts } = generateSchedule({
      weekDates,
      maxConsecutiveDays: 6,
      users,
      userGroups: { 1: [10] },
      fixedSchedules: [],
      overrideShifts,
      timeOffBlocks: {},
      availability: {},
      coverageRules,
    });

    // The override shift should appear exactly once
    const overrides = shifts.filter(s => s.is_override === 1);
    expect(overrides).toHaveLength(1);
    expect(overrides[0].start_time).toBe('17:00');

    // Alice should not be double-scheduled on 2026-06-01
    const aliceOnDay1 = shifts.filter(s => s.user_id === 1 && s.date === '2026-06-01');
    expect(aliceOnDay1).toHaveLength(1);
  });

  it('override shift replaces a fixed shift for the same user+date', () => {
    const { generateSchedule } = require('../services/scheduler');
    const user = { id: 1, min_hours_per_week: 0, max_hours_per_week: null };

    const fixedSchedules = [{
      user_id: 1, day_of_week: 0, shift_template_id: 1,
      group_id: 10, start_time: '11:00', hours: 5,
    }];
    const overrideShifts = [{
      user_id: 1, group_id: 10, shift_template_id: 2,
      date: '2026-06-01', start_time: '17:00', hours: 6,
    }];

    const { shifts } = generateSchedule({
      weekDates: ['2026-06-01'],
      maxConsecutiveDays: 6,
      users: [user],
      userGroups: { 1: [10] },
      fixedSchedules,
      overrideShifts,
      timeOffBlocks: {},
      availability: {},
      coverageRules: [],
    });

    // Only one shift for this user on this date — the override wins
    const userShifts = shifts.filter(s => s.user_id === 1 && s.date === '2026-06-01');
    expect(userShifts).toHaveLength(1);
    expect(userShifts[0].is_override).toBe(1);
    expect(userShifts[0].start_time).toBe('17:00');
    expect(userShifts[0].hours).toBe(6);
  });
});
