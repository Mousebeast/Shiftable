'use strict';
process.env.JWT_SECRET = 'test-secret';

const { createTestDb, seedUser, seedGroup, seedTemplate } = require('../test/helpers');
const {
  getFixedSchedulesForUser, upsertFixedSchedule, deleteFixedSchedule,
} = require('./fixedSchedules');

let db, user, group, template;
beforeEach(() => {
  db = createTestDb();
  user = seedUser(db, { email: 'u@test.com' });
  group = seedGroup(db);
  template = seedTemplate(db, group.id);
});

describe('getFixedSchedulesForUser', () => {
  it('returns empty array for user with no fixed schedules', () => {
    expect(getFixedSchedulesForUser(user.id, db)).toEqual([]);
  });

  it('returns fixed schedules with template info', () => {
    upsertFixedSchedule(user.id, 0, template.id, db);
    const schedules = getFixedSchedulesForUser(user.id, db);
    expect(schedules).toHaveLength(1);
    expect(schedules[0].day_of_week).toBe(0);
    expect(schedules[0].template_name).toBeDefined();
    expect(schedules[0].start_time).toBeDefined();
    expect(schedules[0].hours).toBeDefined();
    expect(schedules[0].group_name).toBeDefined();
    expect(schedules[0].group_id).toBeDefined();
  });
});

describe('upsertFixedSchedule', () => {
  it('inserts a new fixed schedule', () => {
    const result = upsertFixedSchedule(user.id, 1, template.id, db);
    expect(result.id).toBeDefined();
    expect(result.day_of_week).toBe(1);
    expect(result.shift_template_id).toBe(template.id);
    const schedules = getFixedSchedulesForUser(user.id, db);
    expect(schedules).toHaveLength(1);
    expect(schedules[0].day_of_week).toBe(1);
  });

  it('replaces an existing schedule for the same day', () => {
    const t2 = seedTemplate(db, group.id, { name: 'Dinner', start_time: '17:00', hours: 6 });
    upsertFixedSchedule(user.id, 0, template.id, db);
    upsertFixedSchedule(user.id, 0, t2.id, db);
    const schedules = getFixedSchedulesForUser(user.id, db);
    expect(schedules).toHaveLength(1);
    expect(schedules[0].shift_template_id).toBe(t2.id);
  });
});

describe('deleteFixedSchedule', () => {
  it('removes a fixed schedule for a given day', () => {
    upsertFixedSchedule(user.id, 2, template.id, db);
    deleteFixedSchedule(user.id, 2, db);
    expect(getFixedSchedulesForUser(user.id, db)).toHaveLength(0);
  });
});
