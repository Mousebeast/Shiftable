/**
 * seed.test.js — Tests for the admin seed logic
 *
 * Tests the insertAdmin / adminExists functions extracted from seed.js.
 * Uses real in-memory SQLite instances. No mocks.
 */

'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { insertAdmin, adminExists } = require('./seed');

// ── Helper: build an in-memory DB with the full schema applied ────────────────
function makeTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  return db;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('insertAdmin', () => {
  test('inserts an admin user and returns a numeric id', () => {
    const db = makeTestDb();

    const id = insertAdmin(
      { name: 'Alice', email: 'alice@example.com', pin: '1234' },
      db
    );

    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);

    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    expect(row).toBeDefined();
    expect(row.name).toBe('Alice');
    expect(row.email).toBe('alice@example.com');
    expect(row.role).toBe('admin');
    expect(row.is_active).toBe(1);
    expect(row.pin_hash).toBeTruthy();

    db.close();
  });

  test('stores a valid bcrypt hash of the PIN (not the raw PIN)', () => {
    const db = makeTestDb();

    insertAdmin({ name: 'Bob', email: 'bob@example.com', pin: '654321' }, db);

    const row = db.prepare("SELECT pin_hash FROM users WHERE email = ?")
      .get('bob@example.com');

    expect(row.pin_hash).not.toBe('654321');
    expect(bcrypt.compareSync('654321', row.pin_hash)).toBe(true);
    expect(bcrypt.compareSync('000000', row.pin_hash)).toBe(false);

    db.close();
  });

  test('returns null and skips insert when an admin already exists', () => {
    const db = makeTestDb();

    // Insert first admin
    insertAdmin({ name: 'First', email: 'first@example.com', pin: '1234' }, db);

    // Attempt to insert a second admin
    const result = insertAdmin(
      { name: 'Second', email: 'second@example.com', pin: '5678' },
      db
    );

    expect(result).toBeNull();

    // Only one user should exist
    const count = db.prepare("SELECT COUNT(*) AS cnt FROM users").get().cnt;
    expect(count).toBe(1);

    db.close();
  });

  test('throws on duplicate email (UNIQUE constraint)', () => {
    const db = makeTestDb();

    // Manually insert a non-admin with the target email
    db.prepare(
      "INSERT INTO users (name, email, role) VALUES ('Staff', 'taken@example.com', 'staff')"
    ).run();

    expect(() => {
      insertAdmin({ name: 'Admin', email: 'taken@example.com', pin: '1234' }, db);
    }).toThrow(/UNIQUE constraint failed/);

    db.close();
  });
});

describe('adminExists', () => {
  test('returns false on an empty users table', () => {
    const db = makeTestDb();
    expect(adminExists(db)).toBe(false);
    db.close();
  });

  test('returns false when only non-admin users exist', () => {
    const db = makeTestDb();
    db.prepare(
      "INSERT INTO users (name, email, role) VALUES ('Staff', 's@example.com', 'staff')"
    ).run();
    expect(adminExists(db)).toBe(false);
    db.close();
  });

  test('returns true after an admin is inserted', () => {
    const db = makeTestDb();
    insertAdmin({ name: 'Admin', email: 'admin@example.com', pin: '1234' }, db);
    expect(adminExists(db)).toBe(true);
    db.close();
  });
});
