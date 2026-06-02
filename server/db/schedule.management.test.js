'use strict';
process.env.JWT_SECRET = 'test-secret';

const { createTestDb, seedUser, seedGroup, seedTemplate, seedCoverageRule } = require('../test/helpers');
const {
  createFreshDraftSchedule,
  getLiveScheduleForWeek,
  forkDraftFromPublished,
  republishSchedule,
  discardDraft,
  getScheduleById,
  getDraftScheduleForWeek,
  clearShiftsForSchedule,
  insertShifts,
  publishSchedule,
  getSchedulerInputs,
  getShiftsForSchedule,
} = require('./schedule');

const WEEK = '2026-06-02'; // Monday

let db, manager, group, template;
beforeEach(() => {
  db = createTestDb();
  manager = seedUser(db, { email: 'mgr@test.com', role: 'manager' });
  group = seedGroup(db);
  template = seedTemplate(db, group.id);
  seedCoverageRule(db, group.id, template.id, { day_of_week: 0, min_staff: 2 });
  db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('max_consecutive_days', '6')`).run();
});

describe('createFreshDraftSchedule', () => {
  it('creates a new draft with no parent', () => {
    const s = createFreshDraftSchedule(WEEK, manager.id, db);
    expect(s.status).toBe('draft');
    expect(s.week_start_date).toBe(WEEK);
    expect(s.parent_schedule_id).toBeNull();
  });
});

describe('getLiveScheduleForWeek', () => {
  it('returns undefined when no published schedule exists', () => {
    expect(getLiveScheduleForWeek(WEEK, db)).toBeUndefined();
  });

  it('returns the published schedule', () => {
    const draft = createFreshDraftSchedule(WEEK, manager.id, db);
    publishSchedule(draft.id, manager.id, db);
    const live = getLiveScheduleForWeek(WEEK, db);
    expect(live.status).toBe('published');
  });
});

describe('forkDraftFromPublished', () => {
  it('creates a draft with parent_schedule_id and copies shifts', () => {
    const draft0 = createFreshDraftSchedule(WEEK, manager.id, db);
    insertShifts(draft0.id, [{
      user_id: manager.id, group_id: group.id, shift_template_id: template.id,
      date: WEEK, start_time: '11:00', hours: 5, is_fixed: 0, is_override: 1,
    }], db);
    publishSchedule(draft0.id, manager.id, db);

    const fork = forkDraftFromPublished(draft0.id, manager.id, db);
    expect(fork.status).toBe('draft');
    expect(fork.parent_schedule_id).toBe(draft0.id);

    const forkShifts = getShiftsForSchedule(fork.id, db);
    expect(forkShifts).toHaveLength(1);
    expect(forkShifts[0].is_override).toBe(1);
  });
});

describe('republishSchedule', () => {
  it('archives old published and promotes draft', () => {
    const draft0 = createFreshDraftSchedule(WEEK, manager.id, db);
    publishSchedule(draft0.id, manager.id, db);

    const fork = forkDraftFromPublished(draft0.id, manager.id, db);
    const { schedule } = republishSchedule(fork.id, manager.id, db);

    expect(schedule.status).toBe('published');
    const old = getScheduleById(draft0.id, db);
    expect(old.status).toBe('archived');
  });

  it('auto-denies pending swaps on the old published schedule', () => {
    const { seedUser } = require('../test/helpers');
    const staff2 = seedUser(db, { email: 'staff2@test.com', role: 'staff' });
    db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').run(staff2.id, group.id);

    const draft0 = createFreshDraftSchedule(WEEK, manager.id, db);
    insertShifts(draft0.id, [{
      user_id: staff2.id, group_id: group.id, shift_template_id: template.id,
      date: WEEK, start_time: '11:00', hours: 5, is_fixed: 0, is_override: 0,
    }], db);
    publishSchedule(draft0.id, manager.id, db);

    const [shift] = db.prepare('SELECT id FROM schedule_shifts WHERE schedule_id = ?').all(draft0.id);
    db.prepare(
      `INSERT INTO shift_swaps (original_shift_id, requester_id, status, created_at)
       VALUES (?, ?, 'open', unixepoch())`
    ).run(shift.id, staff2.id);

    const fork = forkDraftFromPublished(draft0.id, manager.id, db);
    const { deniedSwaps } = republishSchedule(fork.id, manager.id, db);
    expect(deniedSwaps).toHaveLength(1);

    const swap = db.prepare('SELECT status FROM shift_swaps WHERE original_shift_id = ?').get(shift.id);
    expect(swap.status).toBe('denied');
  });
});

describe('discardDraft', () => {
  it('deletes the draft and cascades to shifts', () => {
    const live = createFreshDraftSchedule(WEEK, manager.id, db);
    publishSchedule(live.id, manager.id, db);
    const fork = forkDraftFromPublished(live.id, manager.id, db);
    discardDraft(fork.id, db);
    expect(getScheduleById(fork.id, db)).toBeUndefined();
  });
});

describe('getScheduleById', () => {
  it('returns the schedule row', () => {
    const s = createFreshDraftSchedule(WEEK, manager.id, db);
    const found = getScheduleById(s.id, db);
    expect(found.week_start_date).toBe(WEEK);
  });

  it('returns undefined for missing id', () => {
    expect(getScheduleById(99999, db)).toBeUndefined();
  });
});

describe('getDraftScheduleForWeek', () => {
  it('returns draft for week', () => {
    createFreshDraftSchedule(WEEK, manager.id, db);
    const s = getDraftScheduleForWeek(WEEK, db);
    expect(s.status).toBe('draft');
  });

  it('returns undefined when no draft exists', () => {
    expect(getDraftScheduleForWeek(WEEK, db)).toBeUndefined();
  });
});

describe('insertShifts + clearShiftsForSchedule', () => {
  it('inserts shifts and clears them', () => {
    const s = createFreshDraftSchedule(WEEK, manager.id, db);
    const staff = seedUser(db, { email: 's@test.com' });
    insertShifts(s.id, [
      { user_id: staff.id, group_id: group.id, shift_template_id: template.id,
        date: '2026-06-02', start_time: '11:00', hours: 5, is_fixed: 0 },
    ], db);
    const rows = db.prepare('SELECT * FROM schedule_shifts WHERE schedule_id = ?').all(s.id);
    expect(rows).toHaveLength(1);
    clearShiftsForSchedule(s.id, db);
    const after = db.prepare('SELECT * FROM schedule_shifts WHERE schedule_id = ?').all(s.id);
    expect(after).toHaveLength(0);
  });

  it('inserts a custom shift with null shift_template_id', () => {
    const s = createFreshDraftSchedule(WEEK, manager.id, db);
    const staff = seedUser(db, { email: 's2@test.com' });
    insertShifts(s.id, [
      { user_id: staff.id, group_id: group.id, shift_template_id: null,
        date: '2026-06-02', start_time: '11:00', hours: 5, is_fixed: 0 },
    ], db);
    const rows = db.prepare('SELECT * FROM schedule_shifts WHERE schedule_id = ?').all(s.id);
    expect(rows[0].shift_template_id).toBeNull();
  });
});

describe('publishSchedule', () => {
  it('sets status to published', () => {
    const s = createFreshDraftSchedule(WEEK, manager.id, db);
    const published = publishSchedule(s.id, manager.id, db);
    expect(published.status).toBe('published');
    expect(published.published_by).toBe(manager.id);
  });
});

describe('getSchedulerInputs', () => {
  it('returns correct structure', () => {
    const staff = seedUser(db, { email: 's@test.com', min_hours_per_week: 20, max_hours_per_week: 40 });
    db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').run(staff.id, group.id);

    const inputs = getSchedulerInputs(WEEK, db);

    expect(inputs.weekDates).toHaveLength(7);
    expect(inputs.weekDates[0]).toBe('2026-06-02');
    expect(inputs.weekDates[6]).toBe('2026-06-08');
    expect(inputs.maxConsecutiveDays).toBe(6);
    expect(inputs.users.find(u => u.id === staff.id)).toBeDefined();
    expect(inputs.userGroups[staff.id]).toContain(group.id);
    expect(inputs.coverageRules).toHaveLength(1);
    expect(inputs.coverageRules[0].min_staff).toBe(2);
  });

  it('includes approved time-off blocks within the week', () => {
    const staff = seedUser(db, { email: 's@test.com' });
    db.prepare(
      `INSERT INTO time_off_requests (user_id, start_date, end_date, reason, status, approved_by, approved_at)
       VALUES (?, '2026-06-02', '2026-06-03', 'holiday', 'approved', ?, unixepoch())`
    ).run(staff.id, manager.id);

    const inputs = getSchedulerInputs(WEEK, db);
    expect(inputs.timeOffBlocks[staff.id]).toContain('2026-06-02');
    expect(inputs.timeOffBlocks[staff.id]).toContain('2026-06-03');
    expect(inputs.timeOffBlocks[staff.id]).not.toContain('2026-06-04');
  });

  it('includes approved availability as of week start', () => {
    const staff = seedUser(db, { email: 's@test.com' });
    db.prepare(
      `INSERT INTO availability (user_id, day_of_week, start_time, end_time, effective_from, status, approved_by, approved_at)
       VALUES (?, 0, '09:00', '17:00', '2026-06-02', 'approved', ?, unixepoch())`
    ).run(staff.id, manager.id);

    const inputs = getSchedulerInputs(WEEK, db);
    expect(inputs.availability[staff.id][0]).toEqual({ start_time: '09:00', end_time: '17:00' });
  });

  it('excludes availability with effective_from after week start', () => {
    const staff = seedUser(db, { email: 's@test.com' });
    db.prepare(
      `INSERT INTO availability (user_id, day_of_week, start_time, end_time, effective_from, status, approved_by, approved_at)
       VALUES (?, 0, '09:00', '17:00', '2026-06-09', 'approved', ?, unixepoch())`
    ).run(staff.id, manager.id);

    const inputs = getSchedulerInputs(WEEK, db);
    expect((inputs.availability[staff.id] || {})[0]).toBeUndefined();
  });

  it('includes fixed schedules with template details', () => {
    const staff = seedUser(db, { email: 's@test.com' });
    db.prepare('INSERT INTO fixed_schedules (user_id, day_of_week, shift_template_id) VALUES (?, 0, ?)').run(staff.id, template.id);

    const inputs = getSchedulerInputs(WEEK, db);
    const fs = inputs.fixedSchedules.find(f => f.user_id === staff.id);
    expect(fs).toBeDefined();
    expect(fs.group_id).toBe(group.id);
    expect(fs.start_time).toBe(template.start_time);
    expect(fs.hours).toBe(template.hours);
  });

  it('picks the most-recent availability when two rows exist for the same user/day', () => {
    const staff = seedUser(db, { email: 's2@test.com' });
    // Older pattern: 09:00-17:00, effective from 2026-05-26
    db.prepare(
      `INSERT INTO availability (user_id, day_of_week, start_time, end_time, effective_from, status, approved_by, approved_at)
       VALUES (?, 0, '09:00', '17:00', '2026-05-26', 'approved', ?, unixepoch())`
    ).run(staff.id, manager.id);
    // Newer pattern: 12:00-20:00, effective from 2026-06-02 (same as weekStart)
    db.prepare(
      `INSERT INTO availability (user_id, day_of_week, start_time, end_time, effective_from, status, approved_by, approved_at)
       VALUES (?, 0, '12:00', '20:00', '2026-06-02', 'approved', ?, unixepoch())`
    ).run(staff.id, manager.id);

    const inputs = getSchedulerInputs(WEEK, db);
    expect(inputs.availability[staff.id][0]).toEqual({ start_time: '12:00', end_time: '20:00' });
  });
});
