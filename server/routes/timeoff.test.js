'use strict';
process.env.JWT_SECRET = 'test-secret';

const { createTestDb, seedUser } = require('../test/helpers');
const { getTimeOffForUser, createTimeOffRequest, approveTimeOff, denyTimeOff, getPendingTimeOff } = require('../db/timeoff');

describe('time-off DB helpers', () => {
  let db, user, manager;
  beforeEach(() => {
    db = createTestDb();
    user = seedUser(db);
    manager = seedUser(db, { email: 'm@test.com', role: 'manager' });
  });

  it('returns empty for new user', () => {
    expect(getTimeOffForUser(user.id, db)).toEqual([]);
  });

  it('creates and retrieves a request', () => {
    createTimeOffRequest(user.id, '2026-07-04', '2026-07-06', 'Holiday', db);
    const rows = getTimeOffForUser(user.id, db);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].start_date).toBe('2026-07-04');
  });

  it('approveTimeOff updates status and manager_note', () => {
    createTimeOffRequest(user.id, '2026-07-04', '2026-07-06', 'Holiday', db);
    const rows = getTimeOffForUser(user.id, db);
    approveTimeOff(rows[0].id, manager.id, 'Approved!', db);
    const updated = getTimeOffForUser(user.id, db);
    expect(updated[0].status).toBe('approved');
    expect(updated[0].manager_note).toBe('Approved!');
  });

  it('denyTimeOff updates status', () => {
    createTimeOffRequest(user.id, '2026-07-04', '2026-07-06', 'Holiday', db);
    const rows = getTimeOffForUser(user.id, db);
    denyTimeOff(rows[0].id, manager.id, 'Conflict', db);
    const updated = getTimeOffForUser(user.id, db);
    expect(updated[0].status).toBe('denied');
  });

  it('approveTimeOff returns changes=0 for non-existent id', () => {
    const result = approveTimeOff(9999, manager.id, null, db);
    expect(result.changes).toBe(0);
  });

  it('denyTimeOff returns changes=0 for already-resolved request', () => {
    createTimeOffRequest(user.id, '2026-07-04', '2026-07-06', 'Holiday', db);
    const rows = getTimeOffForUser(user.id, db);
    approveTimeOff(rows[0].id, manager.id, null, db);
    const result = denyTimeOff(rows[0].id, manager.id, null, db);
    expect(result.changes).toBe(0);
  });

  it('getPendingTimeOff returns only pending requests with user_name', () => {
    createTimeOffRequest(user.id, '2026-07-04', '2026-07-06', 'Holiday', db);
    createTimeOffRequest(user.id, '2026-08-01', '2026-08-03', 'Vacation', db);
    const pending = getPendingTimeOff(db);
    expect(pending).toHaveLength(2);
    expect(pending[0].user_name).toBeDefined();
  });
});
