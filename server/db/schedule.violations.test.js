'use strict';
process.env.JWT_SECRET = 'test-secret';

const { createTestDb, seedUser, seedGroup, seedTemplate } = require('../test/helpers');
const { createFreshDraftSchedule, checkShiftViolations, validateScheduleShifts } = require('./schedule');

const WEEK = '2026-07-27'; // Monday
const D = n => {
  const d = new Date(`${WEEK}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

let db, manager, group, template, ava, draft;

beforeEach(() => {
  db = createTestDb();
  manager = seedUser(db, { email: 'mgr@test.com', role: 'manager' });
  group = seedGroup(db, { name: 'Host' });
  template = seedTemplate(db, group.id, { name: 'PM', start_time: '16:00', hours: 4 });
  ava = seedUser(db, { name: 'Ava Reyes', email: 'ava@test.com', role: 'staff' });
  db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').run(ava.id, group.id);
  draft = createFreshDraftSchedule(WEEK, manager.id, db);
});

function addShift(dayOffset, userId = ava.id) {
  return db.prepare(
    `INSERT INTO schedule_shifts (schedule_id, user_id, group_id, shift_template_id, date, start_time, hours)
     VALUES (?, ?, ?, ?, ?, '16:00', 4)`
  ).run(draft.id, userId, group.id, template.id, D(dayOffset)).lastInsertRowid;
}

function checkFor(dayOffset, excludeShiftId = null) {
  return checkShiftViolations({
    scheduleId: draft.id, userId: ava.id, date: D(dayOffset),
    startTime: '16:00', hours: 4, excludeShiftId,
  }, db);
}

const typesFrom = vs => vs.map(v => v.type);

// Both caps were enforced only inside the scheduler's fill loop, so a manager
// adding shifts by hand could breach either in silence. max_hours_per_week was
// checked both ways, which made all three look uniformly enforced when only one
// was.
describe('max_shifts_per_week is checked after hand-edits', () => {
  it('does not fire when the user has no cap set', () => {
    addShift(0); addShift(1); addShift(2);
    expect(typesFrom(checkFor(3))).not.toContain('max_shifts');
  });

  it('does not fire while the shift being added stays inside the cap', () => {
    db.prepare('UPDATE users SET max_shifts_per_week = 3 WHERE id = ?').run(ava.id);
    addShift(0); addShift(1);
    expect(typesFrom(checkFor(2))).not.toContain('max_shifts');
  });

  it('fires on the shift that breaches the cap', () => {
    db.prepare('UPDATE users SET max_shifts_per_week = 3 WHERE id = ?').run(ava.id);
    addShift(0); addShift(1); addShift(2);
    const v = checkFor(3).find(x => x.type === 'max_shifts');
    expect(v).toBeTruthy();
    expect(v.message).toMatch(/exceed 3 shifts this week \(4 total\)/);
  });

  it('carries the user name rather than leaving it to be derived', () => {
    db.prepare('UPDATE users SET max_shifts_per_week = 1 WHERE id = ?').run(ava.id);
    addShift(0);
    const v = checkFor(1).find(x => x.type === 'max_shifts');
    expect(v).toMatchObject({ user_id: ava.id, user_name: 'Ava Reyes' });
  });

  it('excludes the shift being edited, so moving one does not read as adding one', () => {
    db.prepare('UPDATE users SET max_shifts_per_week = 3 WHERE id = ?').run(ava.id);
    addShift(0); addShift(1);
    const moving = addShift(2);
    // Re-siting that third shift is still three shifts, not four.
    expect(typesFrom(checkFor(3, moving))).not.toContain('max_shifts');
  });

  it('surfaces through validateScheduleShifts on an already-built week', () => {
    db.prepare('UPDATE users SET max_shifts_per_week = 2 WHERE id = ?').run(ava.id);
    addShift(0); addShift(1); addShift(2);
    const { violations } = validateScheduleShifts(draft.id, db);
    expect(violations.some(v => v.type === 'max_shifts')).toBe(true);
  });
});

describe('max_consecutive_days is checked after hand-edits', () => {
  function setLimit(n) {
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('max_consecutive_days', ?)`).run(String(n));
  }

  it('does not fire for a run inside the limit', () => {
    setLimit(3);
    addShift(0); addShift(1);
    expect(typesFrom(checkFor(2))).not.toContain('max_consecutive');
  });

  it('fires once the run exceeds the limit', () => {
    setLimit(3);
    addShift(0); addShift(1); addShift(2);
    const v = checkFor(3).find(x => x.type === 'max_consecutive');
    expect(v).toBeTruthy();
    expect(v.message).toMatch(/4 days in a row, over the 3-day limit/);
  });

  it('counts the longest run, not the total number of days worked', () => {
    setLimit(2);
    // Mon, Tue, then a gap, then Fri — longest run is 2, which is allowed.
    addShift(0); addShift(1);
    expect(typesFrom(checkFor(4))).not.toContain('max_consecutive');
  });

  it('treats two shifts on one day as a single day', () => {
    setLimit(2);
    addShift(0); addShift(0); addShift(1);
    expect(typesFrom(checkFor(1))).not.toContain('max_consecutive');
  });

  it('carries the user name', () => {
    setLimit(1);
    addShift(0);
    const v = checkFor(1).find(x => x.type === 'max_consecutive');
    expect(v).toMatchObject({ user_id: ava.id, user_name: 'Ava Reyes' });
  });

  it('stays week-scoped — a run continuing past the week end is not counted', () => {
    setLimit(5);
    // Six consecutive days, but the last two belong to the following week's
    // schedule, which this one cannot see. Deliberate: the scheduler fills one
    // week at a time and cannot prevent a cross-boundary run, so flagging it
    // here would report a breach no edit to this week could clear.
    const nextWeek = createFreshDraftSchedule('2026-08-03', manager.id, db);
    db.prepare(
      `INSERT INTO schedule_shifts (schedule_id, user_id, group_id, shift_template_id, date, start_time, hours)
       VALUES (?, ?, ?, ?, '2026-08-03', '16:00', 4)`
    ).run(nextWeek.id, ava.id, group.id, template.id);

    for (let i = 1; i <= 5; i++) addShift(i); // Tue–Sat of this week
    expect(typesFrom(checkFor(6))).toContain('max_consecutive'); // Tue–Sun = 6 > 5
    // …and the next week's schedule sees only its own single day.
    const next = checkShiftViolations({
      scheduleId: nextWeek.id, userId: ava.id, date: '2026-08-04',
      startTime: '16:00', hours: 4,
    }, db);
    expect(typesFrom(next)).not.toContain('max_consecutive');
  });
});

// Generate blocks time-off dates while filling, so it could never produce one of
// these. Copy Week and Apply Template are mechanical date-shifted copies with no
// filtering at all, and nothing re-checked afterwards — so a shift copied onto
// approved time off was completely silent.
describe('approved time off is checked after hand-edits and copies', () => {
  function approveTimeOff(start, end, userId = ava.id) {
    db.prepare(
      `INSERT INTO time_off_requests (user_id, start_date, end_date, status)
       VALUES (?, ?, ?, 'approved')`
    ).run(userId, start, end);
  }

  it('does not fire when there is no time off', () => {
    expect(typesFrom(checkFor(0))).not.toContain('time_off');
  });

  it('fires for a shift on an approved single day', () => {
    approveTimeOff(D(2), D(2));
    const v = checkFor(2).find(x => x.type === 'time_off');
    expect(v).toBeTruthy();
    expect(v.message).toMatch(/approved time off/i);
  });

  it('fires anywhere inside a multi-day range, including the boundaries', () => {
    approveTimeOff(D(1), D(3));
    for (const offset of [1, 2, 3]) {
      expect(typesFrom(checkFor(offset))).toContain('time_off');
    }
  });

  it('does not fire on the days either side of the range', () => {
    approveTimeOff(D(1), D(3));
    expect(typesFrom(checkFor(0))).not.toContain('time_off');
    expect(typesFrom(checkFor(4))).not.toContain('time_off');
  });

  it('ignores requests that are pending or denied', () => {
    for (const status of ['pending', 'denied']) {
      db.prepare(
        `INSERT INTO time_off_requests (user_id, start_date, end_date, status) VALUES (?, ?, ?, ?)`
      ).run(ava.id, D(5), D(5), status);
    }
    expect(typesFrom(checkFor(5))).not.toContain('time_off');
  });

  it('is scoped to the person who booked it', () => {
    const other = seedUser(db, { name: 'Bo', email: 'bo@test.com', role: 'staff' });
    approveTimeOff(D(2), D(2), other.id);
    expect(typesFrom(checkFor(2))).not.toContain('time_off');
  });

  it('carries its own date, since a removed shift nulls the shift id', () => {
    approveTimeOff(D(2), D(2));
    const v = checkFor(2).find(x => x.type === 'time_off');
    expect(v).toMatchObject({ user_id: ava.id, date: D(2) });
  });

  // The reported case: a week copied forward onto a request approved since.
  it('surfaces on a whole schedule via validateScheduleShifts', () => {
    approveTimeOff(D(2), D(2));
    addShift(0);
    addShift(2);
    const { violations } = validateScheduleShifts(draft.id, db);
    const hits = violations.filter(v => v.type === 'time_off');
    expect(hits).toHaveLength(1);
    expect(hits[0].date).toBe(D(2));
  });
});
