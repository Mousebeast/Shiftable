'use strict';
process.env.JWT_SECRET = 'test-secret';

const { createTestDb, seedUser, seedGroup } = require('../test/helpers');
const {
  getAllUsers, createUser, updateUser, deactivateUser, setClaimToken, setUserGroups,
} = require('./users');

let db, group;
beforeEach(() => {
  db = createTestDb();
  group = seedGroup(db);
});

describe('getAllUsers', () => {
  it('returns active users by default', () => {
    seedUser(db, { email: 'a@test.com' });
    seedUser(db, { email: 'b@test.com', is_active: 0 });
    const users = getAllUsers(false, db);
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe('a@test.com');
  });

  it('includes inactive when flag is true', () => {
    seedUser(db, { email: 'a@test.com' });
    seedUser(db, { email: 'b@test.com', is_active: 0 });
    const users = getAllUsers(true, db);
    expect(users).toHaveLength(2);
  });

  it('includes groups for each user', () => {
    const user = seedUser(db, { email: 'u@test.com' });
    db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').run(user.id, group.id);
    const users = getAllUsers(false, db);
    expect(users[0].groups).toHaveLength(1);
    expect(users[0].groups[0].name).toBe('Server');
  });
});

describe('createUser', () => {
  it('creates a user and returns id', () => {
    const result = createUser('Jane', 'jane@test.com', 'staff', 0, 40, db);
    expect(result.id).toBeDefined();
    expect(result.name).toBe('Jane');
    expect(result.email).toBe('jane@test.com');
    const users = getAllUsers(false, db);
    expect(users.find(u => u.email === 'jane@test.com')).toBeDefined();
  });
});

describe('updateUser', () => {
  it('updates user fields', () => {
    const user = seedUser(db, { email: 'u@test.com' });
    const updated = updateUser(user.id, { name: 'Updated', email: 'new@test.com', role: 'manager', minHours: 10, maxHours: 30 }, db);
    expect(updated.name).toBe('Updated');
    expect(updated.role).toBe('manager');
    expect(updated.min_hours_per_week).toBe(10);
  });

  it('preserves existing hours when minHours/maxHours are omitted', () => {
    const user = seedUser(db, { email: 'u@test.com' });
    updateUser(user.id, { name: 'First', email: 'u@test.com', role: 'staff', minHours: 15, maxHours: 35 }, db);
    const updated = updateUser(user.id, { name: 'Renamed', email: 'u@test.com', role: 'staff' }, db);
    expect(updated.min_hours_per_week).toBe(15);
    expect(updated.max_hours_per_week).toBe(35);
  });

  it('returns undefined for non-existent user', () => {
    const result = updateUser(99999, { name: 'Ghost', email: 'g@test.com', role: 'staff' }, db);
    expect(result).toBeUndefined();
  });
});

describe('deactivateUser', () => {
  it('sets is_active to 0', () => {
    const user = seedUser(db, { email: 'u@test.com' });
    deactivateUser(user.id, db);
    const users = getAllUsers(false, db);
    expect(users.find(u => u.id === user.id)).toBeUndefined();
  });
});

describe('setClaimToken', () => {
  it('sets claim token fields', () => {
    const user = seedUser(db, { email: 'u@test.com' });
    setClaimToken(user.id, 'test-uuid', 9999999999, db);
    const row = db.prepare('SELECT claim_token FROM users WHERE id = ?').get(user.id);
    expect(row.claim_token).toBe('test-uuid');
  });
});

describe('setUserGroups', () => {
  it('assigns groups to a user atomically', () => {
    const user = seedUser(db, { email: 'u@test.com' });
    const g2 = seedGroup(db, { name: 'Bartender', color: '#f00' });
    setUserGroups(user.id, [group.id, g2.id], db);
    const rows = db.prepare('SELECT group_id FROM user_groups WHERE user_id = ?').all(user.id);
    expect(rows).toHaveLength(2);
  });

  it('replaces existing group assignments', () => {
    const user = seedUser(db, { email: 'u@test.com' });
    setUserGroups(user.id, [group.id], db);
    const g2 = seedGroup(db, { name: 'Bartender', color: '#f00' });
    setUserGroups(user.id, [g2.id], db);
    const rows = db.prepare('SELECT group_id FROM user_groups WHERE user_id = ?').all(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].group_id).toBe(g2.id);
  });
});
