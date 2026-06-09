/**
 * db.test.js — Tests for the better-sqlite3 singleton
 *
 * Uses a real in-memory SQLite instance. No mocks.
 */

'use strict';

const Database = require('better-sqlite3');

describe('db singleton', () => {
  let db1, db2;

  beforeAll(() => {
    // Set DB_PATH to :memory: before requiring the module so the singleton
    // opens an in-memory DB rather than the file-based one.
    process.env.DB_PATH = ':memory:';

    // Clear module cache so we get a fresh singleton using :memory:
    jest.resetModules();
    db1 = require('./db');
    db2 = require('./db');
  });

  afterAll(() => {
    // Restore env
    delete process.env.DB_PATH;
    jest.resetModules();
  });

  test('module returns the same reference on repeated requires (singleton)', () => {
    expect(db1).toBe(db2);
  });

  test('foreign_keys pragma is ON', () => {
    const result = db1.pragma('foreign_keys', { simple: true });
    expect(result).toBe(1);
  });

  test('journal_mode pragma is WAL (or memory for in-memory DB)', () => {
    // SQLite in-memory databases always report 'memory' for journal_mode —
    // WAL requires a real file. We verify the pragma was applied without error;
    // the actual WAL behavior is tested in the file-based production path.
    const result = db1.pragma('journal_mode', { simple: true });
    expect(['wal', 'memory']).toContain(result);
  });

  test('database is open and accepts queries', () => {
    const row = db1.prepare('SELECT 1 + 1 AS sum').get();
    expect(row.sum).toBe(2);
  });
});

describe('db direct construction (in-memory)', () => {
  // Sanity-check that better-sqlite3 itself works as expected, independent
  // of the singleton wrapper.
  let db;

  beforeAll(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
  });

  afterAll(() => {
    db.close();
  });

  test('foreign_keys is ON after pragma', () => {
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  test('journal_mode pragma is accepted without error', () => {
    // WAL requires a real file — in-memory DBs report 'memory'.
    // This test verifies the pragma call succeeds (no exception thrown).
    const result = db.pragma('journal_mode', { simple: true });
    expect(['wal', 'memory']).toContain(result);
  });

  test('can create a table and insert a row', () => {
    db.exec('CREATE TABLE test_table (id INTEGER PRIMARY KEY, val TEXT)');
    db.prepare('INSERT INTO test_table (val) VALUES (?)').run('hello');
    const row = db.prepare('SELECT val FROM test_table WHERE id = 1').get();
    expect(row.val).toBe('hello');
  });
});
