'use strict';

const { createTestDb, seedUser, seedGroup } = require('../test/helpers');
const { getAllStaffAvailability } = require('./availability');
const { localWeekStartOf, addDaysToDateString } = require('../services/dates');

const THIS_WEEK = localWeekStartOf(new Date());
const NEXT_WEEK = addDaysToDateString(THIS_WEEK, 7);
const LAST_WEEK = addDaysToDateString(THIS_WEEK, -7);

function seedAvailability(db, userId, { day = 0, start = '09:00', end = '17:00', blocked = 0, effectiveFrom }) {
  db.prepare(
    `INSERT INTO availability (user_id, day_of_week, start_time, end_time, is_blocked, effective_from, status)
     VALUES (?, ?, ?, ?, ?, ?, 'approved')`
  ).run(userId, day, start, end, blocked, effectiveFrom);
}

function dayZeroFor(db, userId) {
  const staff = getAllStaffAvailability(db);
  const member = staff.find(s => s.id === userId);
  return member.availability.find(a => a.day_of_week === 0);
}

// This powers the builder's Availability tab. It must show what is in force
// now, not the newest row outright — manager edits are dated to the current
// week, so a future-dated staff request would otherwise render in place of an
// edit that had just saved successfully.
describe('getAllStaffAvailability — effective_from bound', () => {
  let db, user;
  beforeEach(() => {
    db = createTestDb();
    user = seedUser(db, { email: 's@test.com' });
    const group = seedGroup(db);
    db.prepare(`INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)`).run(user.id, group.id);
  });

  it('returns a row that is already in force', () => {
    seedAvailability(db, user.id, { effectiveFrom: LAST_WEEK, start: '09:00', end: '17:00' });
    expect(dayZeroFor(db, user.id)).toMatchObject({ start_time: '09:00', end_time: '17:00' });
  });

  it('ignores a future-dated row in favour of the one in force', () => {
    seedAvailability(db, user.id, { effectiveFrom: LAST_WEEK, start: '09:00', end: '17:00' });
    seedAvailability(db, user.id, { effectiveFrom: NEXT_WEEK, start: '18:00', end: '23:00' });
    expect(dayZeroFor(db, user.id)).toMatchObject({ start_time: '09:00', end_time: '17:00' });
  });

  it('does not show a future block as if it were current', () => {
    seedAvailability(db, user.id, { effectiveFrom: LAST_WEEK });
    seedAvailability(db, user.id, { effectiveFrom: NEXT_WEEK, blocked: 1, start: '00:00', end: '00:00' });
    expect(dayZeroFor(db, user.id).is_blocked).toBe(0);
  });

  it('omits the day entirely when the only row is future-dated', () => {
    seedAvailability(db, user.id, { effectiveFrom: NEXT_WEEK });
    expect(dayZeroFor(db, user.id)).toBeUndefined();
  });

  it('prefers a current-week row over an older one — a manager edit wins today', () => {
    seedAvailability(db, user.id, { effectiveFrom: LAST_WEEK, start: '09:00', end: '17:00' });
    seedAvailability(db, user.id, { effectiveFrom: THIS_WEEK, start: '12:00', end: '20:00' });
    expect(dayZeroFor(db, user.id)).toMatchObject({ start_time: '12:00', end_time: '20:00' });
  });
});
