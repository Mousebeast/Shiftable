'use strict';

const { generateSchedule } = require('./scheduler');

const WEEK = ['2026-06-02','2026-06-03','2026-06-04','2026-06-05','2026-06-06','2026-06-07','2026-06-08'];
const BASE = {
  weekDates: WEEK,
  maxConsecutiveDays: 6,
  users: [],
  userGroups: {},
  fixedSchedules: [],
  timeOffBlocks: {},
  availability: {},
  coverageRules: [],
};

describe('generateSchedule — empty inputs', () => {
  it('returns empty shifts and no warnings', () => {
    const { shifts, warnings } = generateSchedule(BASE);
    expect(shifts).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

describe('Phase 1: fixed schedule locking', () => {
  it('locks a fixed schedule as is_fixed=1', () => {
    const inputs = {
      ...BASE,
      users: [{ id: 1, name: 'Alice', min_hours_per_week: 0, max_hours_per_week: 40 }],
      userGroups: { 1: [10] },
      fixedSchedules: [{ user_id: 1, day_of_week: 0, shift_template_id: 5, group_id: 10, start_time: '11:00', hours: 5 }],
    };
    const { shifts } = generateSchedule(inputs);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].is_fixed).toBe(1);
    expect(shifts[0].user_id).toBe(1);
    expect(shifts[0].date).toBe('2026-06-02'); // Monday = day 0
  });

  it('skips fixed schedule if user is on time-off that day', () => {
    const inputs = {
      ...BASE,
      users: [{ id: 1, name: 'Alice', min_hours_per_week: 0, max_hours_per_week: 40 }],
      userGroups: { 1: [10] },
      fixedSchedules: [{ user_id: 1, day_of_week: 0, shift_template_id: 5, group_id: 10, start_time: '11:00', hours: 5 }],
      timeOffBlocks: { 1: ['2026-06-02'] },
    };
    const { shifts } = generateSchedule(inputs);
    expect(shifts).toHaveLength(0);
  });
});

describe('Phase 2: fill coverage rules', () => {
  const user1 = { id: 1, name: 'Alice', min_hours_per_week: 0, max_hours_per_week: 40 };
  const user2 = { id: 2, name: 'Bob',   min_hours_per_week: 0, max_hours_per_week: 40 };
  const rule = { group_id: 10, day_of_week: 0, shift_template_id: 5, min_staff: 2, start_time: '11:00', hours: 5 };

  it('assigns enough staff to meet min_staff', () => {
    const inputs = {
      ...BASE,
      users: [user1, user2],
      userGroups: { 1: [10], 2: [10] },
      coverageRules: [rule],
    };
    const { shifts, warnings } = generateSchedule(inputs);
    expect(shifts).toHaveLength(2);
    expect(warnings).toHaveLength(0);
  });

  it('does not assign user blocked by time-off', () => {
    const inputs = {
      ...BASE,
      users: [user1, user2],
      userGroups: { 1: [10], 2: [10] },
      coverageRules: [{ ...rule, min_staff: 1 }],
      timeOffBlocks: { 1: ['2026-06-02'] },
    };
    const { shifts } = generateSchedule(inputs);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].user_id).toBe(2);
  });

  it('does not assign user outside their availability window', () => {
    const inputs = {
      ...BASE,
      users: [user1, user2],
      userGroups: { 1: [10], 2: [10] },
      coverageRules: [{ ...rule, min_staff: 1 }],
      // user1 available 14:00-20:00 — shift is 11:00-16:00, doesn't fit
      availability: { 1: { 0: { start_time: '14:00', end_time: '20:00' } } },
    };
    const { shifts } = generateSchedule(inputs);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].user_id).toBe(2);
  });

  it('respects availability window when shift fits', () => {
    const inputs = {
      ...BASE,
      users: [user1],
      userGroups: { 1: [10] },
      coverageRules: [{ ...rule, min_staff: 1 }],
      // user1 available 09:00-17:00 — shift 11:00-16:00 fits
      availability: { 1: { 0: { start_time: '09:00', end_time: '17:00' } } },
    };
    const { shifts } = generateSchedule(inputs);
    expect(shifts).toHaveLength(1);
  });

  it('does not assign user who would exceed max_hours_per_week', () => {
    const cappedUser = { id: 1, name: 'Alice', min_hours_per_week: 0, max_hours_per_week: 4 };
    const inputs = {
      ...BASE,
      users: [cappedUser],
      userGroups: { 1: [10] },
      // rule requires 5 hours but user cap is 4
      coverageRules: [{ ...rule, min_staff: 1 }],
    };
    const { shifts, warnings } = generateSchedule(inputs);
    expect(shifts).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].needed).toBe(1);
    expect(warnings[0].assigned).toBe(0);
  });

  it('does not double-schedule a user on the same day', () => {
    // Two rules on the same day, same user eligible for both
    const ruleA = { group_id: 10, day_of_week: 0, shift_template_id: 5, min_staff: 1, start_time: '09:00', hours: 4 };
    const ruleB = { group_id: 10, day_of_week: 0, shift_template_id: 6, min_staff: 1, start_time: '14:00', hours: 4 };
    const inputs = {
      ...BASE,
      users: [user1],
      userGroups: { 1: [10] },
      coverageRules: [ruleA, ruleB],
    };
    const { shifts } = generateSchedule(inputs);
    // user1 can only be scheduled once per day
    const user1Shifts = shifts.filter(s => s.user_id === 1);
    expect(user1Shifts).toHaveLength(1);
  });

  it('does not assign user exceeding max_consecutive_days', () => {
    // user1 already scheduled Mon-Sat (6 days), should not be assigned Sunday
    const inputs = {
      ...BASE,
      maxConsecutiveDays: 6,
      users: [user1, user2],
      userGroups: { 1: [10], 2: [10] },
      // Fixed schedules for user1 Mon-Sat (days 0-5)
      fixedSchedules: [0,1,2,3,4,5].map(d => ({
        user_id: 1, day_of_week: d, shift_template_id: 5, group_id: 10, start_time: '11:00', hours: 5,
      })),
      // Coverage rule on Sunday (day 6) needing 1 staff
      coverageRules: [{ group_id: 10, day_of_week: 6, shift_template_id: 5, min_staff: 1, start_time: '11:00', hours: 5 }],
    };
    const { shifts } = generateSchedule(inputs);
    // Sunday shift should go to user2, not user1
    const sundayShift = shifts.find(s => s.date === '2026-06-08' && s.is_fixed === 0);
    expect(sundayShift).toBeDefined();
    expect(sundayShift.user_id).toBe(2);
  });

  it('emits a warning when min_staff cannot be met', () => {
    const inputs = {
      ...BASE,
      users: [user1],
      userGroups: { 1: [10] },
      coverageRules: [{ ...rule, min_staff: 3 }],
    };
    const { shifts, warnings } = generateSchedule(inputs);
    expect(shifts).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].needed).toBe(3);
    expect(warnings[0].assigned).toBe(1);
  });

  it('does not count fixed-schedule users toward coverage fill again', () => {
    // user1 has a fixed schedule for Monday, rule needs 2 — only user2 should fill the gap
    const inputs = {
      ...BASE,
      users: [user1, user2],
      userGroups: { 1: [10], 2: [10] },
      fixedSchedules: [{ user_id: 1, day_of_week: 0, shift_template_id: 5, group_id: 10, start_time: '11:00', hours: 5 }],
      coverageRules: [rule], // min_staff: 2
    };
    const { shifts } = generateSchedule(inputs);
    // user1 from fixed + user2 from fill = 2 total, no duplicates
    expect(shifts).toHaveLength(2);
    const user1Shifts = shifts.filter(s => s.user_id === 1);
    expect(user1Shifts).toHaveLength(1);
  });

  it('fills lower-hours users first (fair distribution)', () => {
    // user2 has 30 hours already (via fixed schedules), user1 has 0 — user1 should be picked first
    const heavyUser = { id: 2, name: 'Bob', min_hours_per_week: 0, max_hours_per_week: 40 };
    // Give user2 pre-existing fixed schedules totaling 30 hours (6 days × 5h)
    const fixedForUser2 = [0,1,2,3,4,5].map(d => ({
      user_id: 2, day_of_week: d, shift_template_id: 5, group_id: 10, start_time: '11:00', hours: 5,
    }));
    const inputs = {
      ...BASE,
      users: [user1, heavyUser],
      userGroups: { 1: [10], 2: [10] },
      fixedSchedules: fixedForUser2,
      coverageRules: [{ ...rule, day_of_week: 6, min_staff: 1 }], // Sunday fill
    };
    const { shifts } = generateSchedule(inputs);
    const sundayFill = shifts.find(s => s.date === '2026-06-08' && s.is_fixed === 0);
    expect(sundayFill.user_id).toBe(1);
  });
});
