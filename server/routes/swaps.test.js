'use strict';
process.env.JWT_SECRET = 'test-secret';

const { createTestDb, seedUser, seedGroup } = require('../test/helpers');
const { checkAutoApprove } = require('../services/autoApprove');
const { createSwapOffer, claimSwap, getSwapById } = require('../db/swaps');

function seedScheduleAndShift(db, managerId, userId, groupId, date, weekStart) {
  const sched = db.prepare(
    `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'published', ?)`
  ).run(weekStart, managerId);
  const shift = db.prepare(
    `INSERT INTO schedule_shifts (schedule_id, user_id, group_id, date, start_time, hours)
     VALUES (?, ?, ?, ?, '09:00', 5)`
  ).run(sched.lastInsertRowid, userId, groupId, date);
  return shift.lastInsertRowid;
}

describe('checkAutoApprove', () => {
  let db, requester, claimer, manager, group;
  beforeEach(() => {
    db = createTestDb();
    requester = seedUser(db, { email: 'r@test.com' });
    claimer = seedUser(db, { email: 'c@test.com' });
    manager = seedUser(db, { email: 'm@test.com', role: 'manager' });
    group = seedGroup(db);
    db.prepare(`INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)`).run(requester.id, group.id);
    db.prepare(`INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)`).run(claimer.id, group.id);
  });

  it('returns false when claimer not in same group', () => {
    const shiftId = seedScheduleAndShift(db, manager.id, requester.id, group.id, '2026-06-08', '2026-06-08');
    const swap = { original_shift_id: shiftId, requester_id: requester.id, claimer_id: claimer.id };
    db.prepare(`DELETE FROM user_groups WHERE user_id = ? AND group_id = ?`).run(claimer.id, group.id);
    expect(checkAutoApprove(swap, db)).toBe(false);
  });

  it('returns false when claimer already scheduled that day', () => {
    const shiftId = seedScheduleAndShift(db, manager.id, requester.id, group.id, '2026-06-08', '2026-06-08');
    const schedId = db.prepare(`SELECT id FROM schedules WHERE week_start_date = '2026-06-08'`).get().id;
    db.prepare(
      `INSERT INTO schedule_shifts (schedule_id, user_id, group_id, date, start_time, hours) VALUES (?, ?, ?, '2026-06-08', '13:00', 4)`
    ).run(schedId, claimer.id, group.id);
    const swap = { original_shift_id: shiftId, requester_id: requester.id, claimer_id: claimer.id };
    expect(checkAutoApprove(swap, db)).toBe(false);
  });

  it('returns false when the shift would exceed the claimer weekly max hours', () => {
    const shiftId = seedScheduleAndShift(db, manager.id, requester.id, group.id, '2026-06-08', '2026-06-08');
    // Seeded shift is 5h. Cap the claimer at 4 so any claim breaches it.
    db.prepare(`UPDATE users SET max_hours_per_week = 4 WHERE id = ?`).run(claimer.id);
    const swap = { original_shift_id: shiftId, requester_id: requester.id, claimer_id: claimer.id };
    expect(checkAutoApprove(swap, db)).toBe(false);
  });

  it('returns true when all conditions met', () => {
    const shiftId = seedScheduleAndShift(db, manager.id, requester.id, group.id, '2026-06-08', '2026-06-08');
    const swap = { original_shift_id: shiftId, requester_id: requester.id, claimer_id: claimer.id };
    expect(checkAutoApprove(swap, db)).toBe(true);
  });

  // Availability is deliberately not a condition — claiming is volunteering,
  // and the claimer's own stated hours are theirs to override. These three
  // pin that down so it cannot be reintroduced as a "fix".
  describe('availability is not consulted', () => {
    it('auto-approves with no availability record at all', () => {
      const shiftId = seedScheduleAndShift(db, manager.id, requester.id, group.id, '2026-06-08', '2026-06-08');
      const swap = { original_shift_id: shiftId, requester_id: requester.id, claimer_id: claimer.id };
      expect(checkAutoApprove(swap, db)).toBe(true);
    });

    it('auto-approves when the shift falls outside the claimer stated hours', () => {
      const shiftId = seedScheduleAndShift(db, manager.id, requester.id, group.id, '2026-06-08', '2026-06-08');
      // Shift is 09:00 for 5h; claimer says evenings only.
      db.prepare(
        `INSERT INTO availability (user_id, day_of_week, start_time, end_time, effective_from, status)
         VALUES (?, 0, '17:00', '23:00', '2026-06-08', 'approved')`
      ).run(claimer.id);
      const swap = { original_shift_id: shiftId, requester_id: requester.id, claimer_id: claimer.id };
      expect(checkAutoApprove(swap, db)).toBe(true);
    });

    it('auto-approves even when the claimer is blocked that day', () => {
      const shiftId = seedScheduleAndShift(db, manager.id, requester.id, group.id, '2026-06-08', '2026-06-08');
      db.prepare(
        `INSERT INTO availability (user_id, day_of_week, start_time, end_time, is_blocked, effective_from, status)
         VALUES (?, 0, '00:00', '00:00', 1, '2026-06-08', 'approved')`
      ).run(claimer.id);
      const swap = { original_shift_id: shiftId, requester_id: requester.id, claimer_id: claimer.id };
      expect(checkAutoApprove(swap, db)).toBe(true);
    });
  });
});

describe('swap DB helpers', () => {
  let db, requester, claimer, manager, group;
  beforeEach(() => {
    db = createTestDb();
    requester = seedUser(db, { email: 'r@test.com' });
    claimer = seedUser(db, { email: 'c@test.com' });
    manager = seedUser(db, { email: 'm@test.com', role: 'manager' });
    group = seedGroup(db);
    db.prepare(`INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)`).run(requester.id, group.id);
    db.prepare(`INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)`).run(claimer.id, group.id);
  });

  it('createSwapOffer + getSwapById roundtrip', () => {
    const shiftId = seedScheduleAndShift(db, manager.id, requester.id, group.id, '2026-06-08', '2026-06-08');
    const row = createSwapOffer(requester.id, shiftId, db);
    expect(row.id).toBeGreaterThan(0);
    const swap = getSwapById(row.id, db);
    expect(swap.status).toBe('open');
    expect(swap.requester_id).toBe(requester.id);
    expect(swap.original_shift_id).toBe(shiftId);
  });

  it('claimSwap transitions open → claimed', () => {
    const shiftId = seedScheduleAndShift(db, manager.id, requester.id, group.id, '2026-06-08', '2026-06-08');
    const row = createSwapOffer(requester.id, shiftId, db);
    const result = claimSwap(row.id, claimer.id, db);
    expect(result.changes).toBe(1);
    const swap = getSwapById(row.id, db);
    expect(swap.status).toBe('claimed');
    expect(swap.claimer_id).toBe(claimer.id);
  });

  it('claimSwap returns changes=0 if already claimed', () => {
    const shiftId = seedScheduleAndShift(db, manager.id, requester.id, group.id, '2026-06-08', '2026-06-08');
    const row = createSwapOffer(requester.id, shiftId, db);
    claimSwap(row.id, claimer.id, db);
    const second = claimSwap(row.id, claimer.id, db);
    expect(second.changes).toBe(0);
  });
});
