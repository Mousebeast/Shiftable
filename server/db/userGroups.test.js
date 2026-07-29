'use strict';
process.env.JWT_SECRET = 'test-secret';

const { createTestDb, seedUser, seedGroup, seedTemplate } = require('../test/helpers');
const { setUserGroups, fixedSchedulesOutsideGroups } = require('./users');
const { upsertFixedSchedule } = require('./fixedSchedules');
const { getSchedulerInputs } = require('./schedule');

let db, user, serverGroup, bevCart, serverTmpl, bevTmpl;

beforeEach(() => {
  db = createTestDb();
  user = seedUser(db, { email: 'sierra@test.com', name: 'Sierra' });
  serverGroup = seedGroup(db, { name: 'Server' });
  bevCart = seedGroup(db, { name: 'Bev Cart' });
  serverTmpl = seedTemplate(db, serverGroup.id, { name: 'Dinner' });
  bevTmpl = seedTemplate(db, bevCart.id, { name: 'BC' });
  setUserGroups(user.id, [serverGroup.id, bevCart.id], db);
});

function fixedRows(userId) {
  return db.prepare('SELECT * FROM fixed_schedules WHERE user_id = ?').all(userId);
}

describe('setUserGroups — fixed schedule cleanup', () => {
  it('drops fixed schedules belonging to a removed group', () => {
    upsertFixedSchedule(user.id, 4, bevTmpl.id, db);
    upsertFixedSchedule(user.id, 1, serverTmpl.id, db);
    expect(fixedRows(user.id)).toHaveLength(2);

    setUserGroups(user.id, [serverGroup.id], db); // removed from Bev Cart

    const remaining = fixedRows(user.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].shift_template_id).toBe(serverTmpl.id);
  });

  it('keeps fixed schedules for groups the user is still in', () => {
    upsertFixedSchedule(user.id, 1, serverTmpl.id, db);
    setUserGroups(user.id, [serverGroup.id, bevCart.id], db); // no change
    expect(fixedRows(user.id)).toHaveLength(1);
  });

  it('drops every fixed schedule when all groups are removed', () => {
    upsertFixedSchedule(user.id, 4, bevTmpl.id, db);
    upsertFixedSchedule(user.id, 1, serverTmpl.id, db);
    setUserGroups(user.id, [], db);
    expect(fixedRows(user.id)).toHaveLength(0);
  });

  it('does not touch another user\'s fixed schedules', () => {
    const other = seedUser(db, { email: 'other@test.com', name: 'Other' });
    setUserGroups(other.id, [bevCart.id], db);
    upsertFixedSchedule(other.id, 4, bevTmpl.id, db);
    upsertFixedSchedule(user.id, 4, bevTmpl.id, db);

    setUserGroups(user.id, [serverGroup.id], db);

    expect(fixedRows(user.id)).toHaveLength(0);
    expect(fixedRows(other.id)).toHaveLength(1);
  });

  it('re-adding the group does not resurrect the fixed schedule', () => {
    // Documents the deliberate choice: removal is destructive, not a soft hide.
    upsertFixedSchedule(user.id, 4, bevTmpl.id, db);
    setUserGroups(user.id, [serverGroup.id], db);
    setUserGroups(user.id, [serverGroup.id, bevCart.id], db);
    expect(fixedRows(user.id)).toHaveLength(0);
  });
});

describe('fixedSchedulesOutsideGroups', () => {
  it('reports what a group change would remove', () => {
    upsertFixedSchedule(user.id, 4, bevTmpl.id, db);
    upsertFixedSchedule(user.id, 1, serverTmpl.id, db);
    const doomed = fixedSchedulesOutsideGroups(user.id, [serverGroup.id], db);
    expect(doomed).toHaveLength(1);
    expect(doomed[0].group_name).toBe('Bev Cart');
    expect(doomed[0].day_of_week).toBe(4);
  });

  it('returns empty when nothing would be removed', () => {
    upsertFixedSchedule(user.id, 1, serverTmpl.id, db);
    expect(fixedSchedulesOutsideGroups(user.id, [serverGroup.id, bevCart.id], db)).toEqual([]);
  });

  it('reports everything when all groups are dropped', () => {
    upsertFixedSchedule(user.id, 4, bevTmpl.id, db);
    upsertFixedSchedule(user.id, 1, serverTmpl.id, db);
    expect(fixedSchedulesOutsideGroups(user.id, [], db)).toHaveLength(2);
  });
});

describe('getSchedulerInputs — orphaned fixed schedules', () => {
  it('ignores a fixed schedule whose group the user has left', () => {
    // Force the pre-fix state directly: a fixed_schedules row for a group the
    // user is not in. This is what production looked like for Sierra, and what
    // any database predating the cleanup migration still contains.
    upsertFixedSchedule(user.id, 4, bevTmpl.id, db);
    db.prepare('DELETE FROM user_groups WHERE user_id = ? AND group_id = ?').run(user.id, bevCart.id);
    expect(fixedRows(user.id)).toHaveLength(1); // row still present

    const inputs = getSchedulerInputs('2026-06-01', db);
    expect(inputs.fixedSchedules).toHaveLength(0);
  });

  it('still returns fixed schedules for current groups', () => {
    upsertFixedSchedule(user.id, 1, serverTmpl.id, db);
    const inputs = getSchedulerInputs('2026-06-01', db);
    expect(inputs.fixedSchedules).toHaveLength(1);
    expect(inputs.fixedSchedules[0].group_id).toBe(serverGroup.id);
  });

  it('does not duplicate a row when the user is in several groups', () => {
    // The user_groups join must not fan out: membership in Server and Bev Cart
    // should still yield exactly one row for a single Server fixed schedule.
    upsertFixedSchedule(user.id, 1, serverTmpl.id, db);
    const inputs = getSchedulerInputs('2026-06-01', db);
    expect(inputs.fixedSchedules).toHaveLength(1);
  });
});
