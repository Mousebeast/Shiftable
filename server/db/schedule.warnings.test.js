'use strict';
process.env.JWT_SECRET = 'test-secret';

const { createTestDb, seedUser, seedGroup, seedTemplate, seedCoverageRule } = require('../test/helpers');
const {
  createFreshDraftSchedule,
  getSchedulerInputs,
  insertShifts,
  clearShiftsForSchedule,
  getShiftsForSchedule,
  getOverrideShiftsForSchedule,
  deleteShift,
  validateScheduleShifts,
  addClosedDay,
  getClosedDays,
} = require('./schedule');
const { generateSchedule } = require('../services/scheduler');

const WEEK = '2026-07-27'; // Monday
const FRI = '2026-07-31';  // day_of_week 4 under a Monday start

let db, manager, host, hostTemplate, ava;

beforeEach(() => {
  db = createTestDb();
  manager = seedUser(db, { email: 'mgr@test.com', role: 'manager' });
  host = seedGroup(db, { name: 'Host' });
  hostTemplate = seedTemplate(db, host.id, { name: 'PM', start_time: '16:00', hours: 5 });
  ava = seedUser(db, { name: 'Ava', email: 'ava@test.com', role: 'staff' });
  db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').run(ava.id, host.id);
  seedCoverageRule(db, host.id, hostTemplate.id, { day_of_week: 4, min_staff: 1 });
});

function regenerate(draftId, closedDates = new Set()) {
  const overrideShifts = getOverrideShiftsForSchedule(draftId, db);
  const inputs = getSchedulerInputs(WEEK, db);
  const { shifts, warnings } = generateSchedule({
    ...inputs, overrideShifts, closedDates,
  });
  clearShiftsForSchedule(draftId, db);
  if (shifts.length) insertShifts(draftId, shifts, db);
  return warnings;
}

// A gap identified by everything the tray renders. Comparing on this rather than
// on object identity is what makes a label divergence a test failure.
function gapKey(w) {
  return [
    w.group_name, w.template_name, w.start_time,
    w.date ?? `dow${w.day_of_week}`, `${w.assigned}/${w.needed}`,
  ].join('|');
}

// Runs both implementations against the same persisted state and returns their
// gap sets. generateSchedule computes gaps while assigning; validateScheduleShifts
// recomputes them from stored shifts. They are separate implementations of the
// same question, so every scenario below asserts they answer it identically.
function gapsFromBothPaths(draftId, closedDates = new Set()) {
  const generated = regenerate(draftId, closedDates).map(gapKey).sort();
  const validated = validateScheduleShifts(draftId, db).warnings.map(gapKey).sort();
  return { generated, validated };
}

// Empties the Host group for Friday, which is the case that used to label badly:
// with no Host shift anywhere, the UI had nothing to derive a group name from.
function createTotalCoverageGap(draftId) {
  regenerate(draftId);
  for (const s of getShiftsForSchedule(draftId, db).filter(r => r.date === FRI)) {
    deleteShift(s.id, db);
  }
  return regenerate(draftId);
}

describe('coverage gap warnings are self-describing', () => {
  test('the scheduler names the group and shift on a total gap', () => {
    const draft = createFreshDraftSchedule(WEEK, manager.id, db);
    const warnings = createTotalCoverageGap(draft.id);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      group_name: 'Host',
      template_name: 'PM',
      start_time: '16:00',
      assigned: 0,
      needed: 1,
    });
  });

  test('validateScheduleShifts names them identically', () => {
    const draft = createFreshDraftSchedule(WEEK, manager.id, db);
    createTotalCoverageGap(draft.id);

    const { warnings } = validateScheduleShifts(draft.id, db);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      group_name: 'Host',
      template_name: 'PM',
      start_time: '16:00',
    });
  });

  // The regression this guards: generate returns its warnings and the client
  // immediately calls recheck, which replaces them with validateScheduleShifts'.
  // If only one path carries the names, the correct label renders and is then
  // overwritten by a generic one — visible as a flicker back to "Group".
  test('both paths agree, so recheck cannot downgrade the label', () => {
    const draft = createFreshDraftSchedule(WEEK, manager.id, db);
    const generated = createTotalCoverageGap(draft.id);
    const { warnings: validated } = validateScheduleShifts(draft.id, db);

    const label = w => `${w.group_name}|${w.template_name}|${w.start_time}`;
    expect(validated.map(label)).toEqual(generated.map(label));
    expect(validated.map(label)).toEqual(['Host|PM|16:00']);
  });

  test('a partial gap is named too, not just a total one', () => {
    // Two staff required, one available — the group still has a shift, which is
    // the case that always worked; it must keep working.
    db.prepare('UPDATE coverage_rules SET min_staff = 2').run();
    const draft = createFreshDraftSchedule(WEEK, manager.id, db);
    const warnings = regenerate(draft.id);

    const friday = warnings.find(w => w.day_of_week === 4);
    expect(friday).toMatchObject({ group_name: 'Host', template_name: 'PM', assigned: 1, needed: 2 });
  });
});

// The scheduler and validateScheduleShifts are two implementations of "which
// coverage rules are unmet". These lock them together: if one is changed without
// the other, the sets stop matching. Each case asserts the gaps are non-empty
// where expected, so agreement cannot pass by both returning nothing.
describe('the two coverage implementations agree', () => {
  test('on a total gap', () => {
    const draft = createFreshDraftSchedule(WEEK, manager.id, db);
    createTotalCoverageGap(draft.id);
    const { generated, validated } = gapsFromBothPaths(draft.id);

    expect(generated).toEqual(validated);
    expect(generated).toEqual(['Host|PM|16:00|dow4|0/1']);
  });

  test('on a partial gap', () => {
    db.prepare('UPDATE coverage_rules SET min_staff = 2').run();
    const draft = createFreshDraftSchedule(WEEK, manager.id, db);
    const { generated, validated } = gapsFromBothPaths(draft.id);

    expect(generated).toEqual(validated);
    expect(generated).toEqual(['Host|PM|16:00|dow4|1/2']);
  });

  test('across multiple groups on the same day', () => {
    const bar = seedGroup(db, { name: 'Bar' });
    const barTemplate = seedTemplate(db, bar.id, { name: 'AM', start_time: '08:00', hours: 6 });
    seedCoverageRule(db, bar.id, barTemplate.id, { day_of_week: 4, min_staff: 1 });
    // Nobody is in Bar, so its Friday rule can never be met.
    const draft = createFreshDraftSchedule(WEEK, manager.id, db);
    const { generated, validated } = gapsFromBothPaths(draft.id);

    expect(generated).toEqual(validated);
    expect(generated).toEqual(['Bar|AM|08:00|dow4|0/1']);
  });

  test('across multiple days', () => {
    // Add a Monday rule nobody can fill, alongside the existing Friday one.
    const extra = seedTemplate(db, host.id, { name: 'AM', start_time: '09:00', hours: 4 });
    seedCoverageRule(db, host.id, extra.id, { day_of_week: 0, min_staff: 2 });
    const draft = createFreshDraftSchedule(WEEK, manager.id, db);
    const { generated, validated } = gapsFromBothPaths(draft.id);

    expect(generated).toEqual(validated);
    expect(generated).toContain('Host|AM|09:00|dow0|1/2');
    expect(generated.length).toBeGreaterThan(0);
  });

  test('when a day is closed, both skip it', () => {
    const draft = createFreshDraftSchedule(WEEK, manager.id, db);
    addClosedDay(draft.id, FRI, db);
    // Mirror the generate route, which builds closedDates from the same source
    // validateScheduleShifts reads.
    const closed = new Set(getClosedDays(draft.id, db));
    const { generated, validated } = gapsFromBothPaths(draft.id, closed);

    expect(generated).toEqual(validated);
    // The only rule is on Friday, so closing it must silence the gap in both.
    expect(generated).toEqual([]);
  });

  test('when coverage is fully met, neither reports a gap', () => {
    const draft = createFreshDraftSchedule(WEEK, manager.id, db);
    const { generated, validated } = gapsFromBothPaths(draft.id);

    expect(generated).toEqual(validated);
    expect(generated).toEqual([]);
  });
});
