'use strict';
process.env.JWT_SECRET = 'test-secret';

const { createTestDb, seedUser } = require('../test/helpers');
const {
  getAvailabilityForUser,
  createAvailabilityEntries,
  getCurrentApprovedPattern,
  approveAvailability,
  denyAvailability,
  getPendingAvailability,
} = require('../db/availability');

describe('availability DB helpers', () => {
  let db, user, manager;
  beforeEach(() => {
    db = createTestDb();
    user = seedUser(db);
    manager = seedUser(db, { email: 'm@test.com', role: 'manager' });
  });

  it('returns empty array when no availability', () => {
    expect(getAvailabilityForUser(user.id, db)).toEqual([]);
  });

  it('createAvailabilityEntries inserts pending entries', () => {
    createAvailabilityEntries(
      user.id,
      [{ day_of_week: 0, start_time: '09:00', end_time: '17:00', effective_from: '2026-06-08' }],
      db
    );
    const rows = getAvailabilityForUser(user.id, db);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].day_of_week).toBe(0);
  });

  it('creates multiple entries in one transaction', () => {
    createAvailabilityEntries(
      user.id,
      [
        { day_of_week: 0, start_time: '09:00', end_time: '17:00', effective_from: '2026-06-08' },
        { day_of_week: 1, start_time: '10:00', end_time: '18:00', effective_from: '2026-06-08' },
      ],
      db
    );
    expect(getAvailabilityForUser(user.id, db)).toHaveLength(2);
  });

  it('approveAvailability updates status to approved', () => {
    createAvailabilityEntries(
      user.id,
      [{ day_of_week: 1, start_time: '10:00', end_time: '18:00', effective_from: '2026-06-08' }],
      db
    );
    const rows = getAvailabilityForUser(user.id, db);
    approveAvailability(rows[0].id, manager.id, db);
    const updated = getAvailabilityForUser(user.id, db);
    expect(updated[0].status).toBe('approved');
  });

  it('denyAvailability updates status to denied', () => {
    createAvailabilityEntries(
      user.id,
      [{ day_of_week: 2, start_time: '08:00', end_time: '16:00', effective_from: '2026-06-08' }],
      db
    );
    const rows = getAvailabilityForUser(user.id, db);
    denyAvailability(rows[0].id, manager.id, db);
    const updated = getAvailabilityForUser(user.id, db);
    expect(updated[0].status).toBe('denied');
  });

  it('getCurrentApprovedPattern returns only approved entries', () => {
    createAvailabilityEntries(
      user.id,
      [{ day_of_week: 0, start_time: '09:00', end_time: '17:00', effective_from: '2026-06-08' }],
      db
    );
    expect(getCurrentApprovedPattern(user.id, db)).toHaveLength(0);
    const rows = getAvailabilityForUser(user.id, db);
    approveAvailability(rows[0].id, manager.id, db);
    expect(getCurrentApprovedPattern(user.id, db)).toHaveLength(1);
  });

  it('getPendingAvailability returns pending entries with user_name', () => {
    createAvailabilityEntries(
      user.id,
      [{ day_of_week: 0, start_time: '09:00', end_time: '17:00', effective_from: '2026-06-08' }],
      db
    );
    const pending = getPendingAvailability(db);
    expect(pending).toHaveLength(1);
    expect(pending[0].user_name).toBe(user.name);
  });
});
