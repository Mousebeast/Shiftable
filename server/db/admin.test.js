'use strict';
process.env.JWT_SECRET = 'test-secret';

const { createTestDb, seedUser } = require('../test/helpers');
const { countActiveAdmins, promoteUser } = require('./admin');

let db;
beforeEach(() => {
  db = createTestDb();
});

describe('countActiveAdmins', () => {
  it('returns 0 when there are no admins', () => {
    seedUser(db, { email: 'staff@test.com', role: 'staff' });
    seedUser(db, { email: 'mgr@test.com', role: 'manager' });
    expect(countActiveAdmins(db)).toBe(0);
  });

  it('counts a single active admin', () => {
    seedUser(db, { email: 'a@test.com', role: 'admin' });
    expect(countActiveAdmins(db)).toBe(1);
  });

  it('counts multiple active admins', () => {
    seedUser(db, { email: 'a1@test.com', role: 'admin' });
    seedUser(db, { email: 'a2@test.com', role: 'admin' });
    seedUser(db, { email: 'a3@test.com', role: 'admin' });
    expect(countActiveAdmins(db)).toBe(3);
  });

  it('excludes deactivated admins', () => {
    // A deactivated admin cannot authenticate (see middleware/auth.js, which
    // 401s an inactive user), so counting one as "an admin still exists" would
    // let the last usable account be demoted away and lock the instance out.
    const ghost = seedUser(db, { email: 'ghost@test.com', role: 'admin' });
    seedUser(db, { email: 'live@test.com', role: 'admin' });
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(ghost.id);
    expect(countActiveAdmins(db)).toBe(1);
  });

  it('returns 0 when every admin is deactivated', () => {
    const a = seedUser(db, { email: 'a@test.com', role: 'admin' });
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(a.id);
    expect(countActiveAdmins(db)).toBe(0);
  });

  it('does not count staff or managers', () => {
    seedUser(db, { email: 'a@test.com', role: 'admin' });
    seedUser(db, { email: 's@test.com', role: 'staff' });
    seedUser(db, { email: 'm@test.com', role: 'manager' });
    expect(countActiveAdmins(db)).toBe(1);
  });

  it('reflects a promotion to admin', () => {
    const mgr = seedUser(db, { email: 'm@test.com', role: 'manager' });
    expect(countActiveAdmins(db)).toBe(0);
    promoteUser(mgr.id, 'admin', db);
    expect(countActiveAdmins(db)).toBe(1);
  });

  it('reflects a demotion from admin', () => {
    const a1 = seedUser(db, { email: 'a1@test.com', role: 'admin' });
    seedUser(db, { email: 'a2@test.com', role: 'admin' });
    expect(countActiveAdmins(db)).toBe(2);
    promoteUser(a1.id, 'manager', db);
    expect(countActiveAdmins(db)).toBe(1);
  });
});
