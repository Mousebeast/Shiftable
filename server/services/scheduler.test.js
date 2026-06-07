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

// Helper to build a user with all scheduler fields
function makeUser(id, overrides = {}) {
  return {
    id,
    name: `User${id}`,
    min_hours_per_week: 0,
    max_hours_per_week: 40,
    priority_order: id,
    min_shifts_per_week: null,
    max_shifts_per_week: null,
    ...overrides,
  };
}

describe('Priority ordering', () => {
  it('assigns the user with lower priority_order first when both eligible', () => {
    const inputs = {
      ...BASE,
      users: [makeUser(1, { priority_order: 2 }), makeUser(2, { priority_order: 1 })],
      userGroups: { 1: [10], 2: [10] },
      coverageRules: [{ group_id: 10, day_of_week: 0, shift_template_id: 5, min_staff: 1, start_time: '11:00', hours: 5 }],
    };
    const { shifts } = generateSchedule(inputs);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].user_id).toBe(2); // priority_order 1 wins
  });

  it('array order does not determine assignment — priority_order does', () => {
    // User 1 is first in the array but has higher priority_order number
    const inputs = {
      ...BASE,
      users: [makeUser(1, { priority_order: 10 }), makeUser(2, { priority_order: 1 })],
      userGroups: { 1: [10], 2: [10] },
      coverageRules: [{ group_id: 10, day_of_week: 0, shift_template_id: 5, min_staff: 1, start_time: '11:00', hours: 5 }],
    };
    const { shifts } = generateSchedule(inputs);
    expect(shifts[0].user_id).toBe(2);
  });
});

describe('max_shifts_per_week', () => {
  it('excludes a user who has reached max_shifts via fill phase', () => {
    // user1 max=1, gets Monday; Tuesday rule should assign user2
    const inputs = {
      ...BASE,
      users: [makeUser(1, { priority_order: 1, max_shifts_per_week: 1 }), makeUser(2, { priority_order: 2 })],
      userGroups: { 1: [10], 2: [10] },
      coverageRules: [
        { group_id: 10, day_of_week: 0, shift_template_id: 5, min_staff: 1, start_time: '11:00', hours: 5 },
        { group_id: 10, day_of_week: 1, shift_template_id: 5, min_staff: 1, start_time: '11:00', hours: 5 },
      ],
    };
    const { shifts } = generateSchedule(inputs);
    expect(shifts).toHaveLength(2);
    expect(shifts.find(s => s.date === '2026-06-02').user_id).toBe(1);
    expect(shifts.find(s => s.date === '2026-06-03').user_id).toBe(2); // user1 at max
  });

  it('counts fixed shifts against max_shifts_per_week', () => {
    // user1 max=1, has a fixed Monday shift → excluded from Tuesday fill
    const inputs = {
      ...BASE,
      users: [makeUser(1, { priority_order: 1, max_shifts_per_week: 1 }), makeUser(2, { priority_order: 2 })],
      userGroups: { 1: [10], 2: [10] },
      fixedSchedules: [{ user_id: 1, day_of_week: 0, shift_template_id: 5, group_id: 10, start_time: '11:00', hours: 5 }],
      coverageRules: [{ group_id: 10, day_of_week: 1, shift_template_id: 5, min_staff: 1, start_time: '11:00', hours: 5 }],
    };
    const { shifts } = generateSchedule(inputs);
    const tuesdayShift = shifts.find(s => s.date === '2026-06-03');
    expect(tuesdayShift.user_id).toBe(2); // user1's fixed shift counts toward max
  });

  it('null max_shifts imposes no limit', () => {
    const inputs = {
      ...BASE,
      users: [makeUser(1, { max_shifts_per_week: null })],
      userGroups: { 1: [10] },
      coverageRules: [0, 1, 2, 3, 4].map(dow => ({
        group_id: 10, day_of_week: dow, shift_template_id: 5, min_staff: 1, start_time: '11:00', hours: 5,
      })),
    };
    const { shifts } = generateSchedule(inputs);
    expect(shifts).toHaveLength(5);
  });
});

describe('min_shifts_per_week pool priority', () => {
  it('draws pool A (below min) before pool B (no min constraint)', () => {
    // user2 listed first in array, but user1 has min_shifts=2 (pool A) — user1 should go first
    const inputs = {
      ...BASE,
      users: [makeUser(2, { priority_order: 1 }), makeUser(1, { priority_order: 1, min_shifts_per_week: 2 })],
      userGroups: { 1: [10], 2: [10] },
      coverageRules: [{ group_id: 10, day_of_week: 0, shift_template_id: 5, min_staff: 1, start_time: '11:00', hours: 5 }],
    };
    const { shifts } = generateSchedule(inputs);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].user_id).toBe(1); // pool A wins
  });

  it('once pool A user reaches min they move to pool B for subsequent slots', () => {
    // user1 min=1, user2 no min, same priority_order
    // Monday: user1 drawn (pool A). Tuesday: user1 now in pool B (met min), user2 still in pool B — priority decides
    const inputs = {
      ...BASE,
      users: [makeUser(1, { priority_order: 1, min_shifts_per_week: 1 }), makeUser(2, { priority_order: 2 })],
      userGroups: { 1: [10], 2: [10] },
      coverageRules: [
        { group_id: 10, day_of_week: 0, shift_template_id: 5, min_staff: 1, start_time: '11:00', hours: 5 },
        { group_id: 10, day_of_week: 1, shift_template_id: 5, min_staff: 1, start_time: '11:00', hours: 5 },
      ],
    };
    const { shifts } = generateSchedule(inputs);
    expect(shifts.find(s => s.date === '2026-06-02').user_id).toBe(1); // pool A on Monday
    expect(shifts.find(s => s.date === '2026-06-03').user_id).toBe(1); // still priority_order 1 on Tuesday
  });
});

describe('min_shifts_unmet warning', () => {
  it('emits warning when coverage slots are insufficient to meet min_shifts', () => {
    const inputs = {
      ...BASE,
      users: [makeUser(1, { min_shifts_per_week: 3 })],
      userGroups: { 1: [10] },
      coverageRules: [{ group_id: 10, day_of_week: 0, shift_template_id: 5, min_staff: 1, start_time: '11:00', hours: 5 }],
    };
    const { warnings } = generateSchedule(inputs);
    const w = warnings.find(x => x.type === 'min_shifts_unmet' && x.user_id === 1);
    expect(w).toBeDefined();
    expect(w.needed).toBe(3);
    expect(w.assigned).toBe(1);
  });

  it('does not warn when min_shifts is null', () => {
    const inputs = {
      ...BASE,
      users: [makeUser(1, { min_shifts_per_week: null })],
      userGroups: { 1: [10] },
      coverageRules: [],
    };
    const { warnings } = generateSchedule(inputs);
    expect(warnings.filter(w => w.type === 'min_shifts_unmet')).toHaveLength(0);
  });

  it('does not warn when min_shifts is met via fixed + fill', () => {
    const inputs = {
      ...BASE,
      users: [makeUser(1, { min_shifts_per_week: 2 })],
      userGroups: { 1: [10] },
      fixedSchedules: [{ user_id: 1, day_of_week: 0, shift_template_id: 5, group_id: 10, start_time: '11:00', hours: 5 }],
      coverageRules: [{ group_id: 10, day_of_week: 1, shift_template_id: 5, min_staff: 1, start_time: '11:00', hours: 5 }],
    };
    const { warnings } = generateSchedule(inputs);
    expect(warnings.filter(w => w.type === 'min_shifts_unmet')).toHaveLength(0);
  });
});
