/**
 * migrate.test.js — Tests for the migration runner logic
 *
 * Uses real in-memory SQLite instances. No mocks.
 * Extracts the migration logic into testable functions rather than
 * importing the script (which calls migrate() immediately on load).
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── Helper: build a temporary migrations directory with given files ──────────
function makeTempMigrationsDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shiftable-migrations-'));
  for (const [filename, sql] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, filename), sql, 'utf8');
  }
  return dir;
}

// ── Core migration logic (extracted from migrate.js for unit testing) ────────
function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
}

function getAppliedMigrations(db) {
  return new Set(
    db.prepare('SELECT filename FROM _migrations').all().map((r) => r.filename)
  );
}

function getMigrationFiles(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function runMigration(db, migrationsDir, filename) {
  const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
  const applyMigration = db.transaction(() => {
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(filename);
  });
  applyMigration();
}

function runAllPendingMigrations(db, migrationsDir) {
  ensureMigrationsTable(db);
  const applied = getAppliedMigrations(db);
  const files = getMigrationFiles(migrationsDir);
  const pending = files.filter((f) => !applied.has(f));
  for (const f of pending) {
    runMigration(db, migrationsDir, f);
  }
  return pending; // return list of what was applied
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('migration runner', () => {
  test('applies all migrations on first run', () => {
    const db = new Database(':memory:');
    const migrationsDir = makeTempMigrationsDir({
      '001_create_foo.sql': 'CREATE TABLE foo (id INTEGER PRIMARY KEY)',
      '002_create_bar.sql': 'CREATE TABLE bar (id INTEGER PRIMARY KEY)',
    });

    const applied = runAllPendingMigrations(db, migrationsDir);

    expect(applied).toEqual(['001_create_foo.sql', '002_create_bar.sql']);

    // Tables should exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);
    expect(tables).toContain('foo');
    expect(tables).toContain('bar');
    expect(tables).toContain('_migrations');

    db.close();
    fs.rmSync(migrationsDir, { recursive: true });
  });

  test('skips already-applied migrations on second run', () => {
    const db = new Database(':memory:');
    const migrationsDir = makeTempMigrationsDir({
      '001_create_foo.sql': 'CREATE TABLE foo (id INTEGER PRIMARY KEY)',
    });

    // First run
    const firstRun = runAllPendingMigrations(db, migrationsDir);
    expect(firstRun).toEqual(['001_create_foo.sql']);

    // Second run — should skip everything
    const secondRun = runAllPendingMigrations(db, migrationsDir);
    expect(secondRun).toEqual([]);

    db.close();
    fs.rmSync(migrationsDir, { recursive: true });
  });

  test('applies migrations in alphabetical (chronological) order', () => {
    const db = new Database(':memory:');

    // Create a table to record insertion order
    db.exec('CREATE TABLE order_log (seq INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT)');

    const migrationsDir = makeTempMigrationsDir({
      '003_third.sql': "INSERT INTO order_log (label) VALUES ('third')",
      '001_first.sql': "INSERT INTO order_log (label) VALUES ('first')",
      '002_second.sql': "INSERT INTO order_log (label) VALUES ('second')",
    });

    runAllPendingMigrations(db, migrationsDir);

    const rows = db.prepare('SELECT label FROM order_log ORDER BY seq').all();
    expect(rows.map((r) => r.label)).toEqual(['first', 'second', 'third']);

    db.close();
    fs.rmSync(migrationsDir, { recursive: true });
  });

  test('only applies new migrations when some are already applied', () => {
    const db = new Database(':memory:');
    const migrationsDir = makeTempMigrationsDir({
      '001_create_users.sql':
        'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)',
    });

    // First run: apply 001
    runAllPendingMigrations(db, migrationsDir);

    // Add a second migration file
    fs.writeFileSync(
      path.join(migrationsDir, '002_add_email.sql'),
      'ALTER TABLE users ADD COLUMN email TEXT',
      'utf8'
    );

    // Second run: should only apply 002
    const secondRun = runAllPendingMigrations(db, migrationsDir);
    expect(secondRun).toEqual(['002_add_email.sql']);

    // email column should exist
    const info = db.pragma('table_info(users)');
    const cols = info.map((c) => c.name);
    expect(cols).toContain('email');

    db.close();
    fs.rmSync(migrationsDir, { recursive: true });
  });

  test('_migrations table records applied filenames', () => {
    const db = new Database(':memory:');
    const migrationsDir = makeTempMigrationsDir({
      '001_init.sql': 'CREATE TABLE t (id INTEGER PRIMARY KEY)',
    });

    runAllPendingMigrations(db, migrationsDir);

    const records = db.prepare('SELECT filename FROM _migrations').all();
    expect(records.map((r) => r.filename)).toEqual(['001_init.sql']);

    db.close();
    fs.rmSync(migrationsDir, { recursive: true });
  });

  test('empty migrations directory is handled gracefully', () => {
    const db = new Database(':memory:');
    const migrationsDir = makeTempMigrationsDir({});

    const applied = runAllPendingMigrations(db, migrationsDir);
    expect(applied).toEqual([]);

    db.close();
    fs.rmSync(migrationsDir, { recursive: true });
  });
});
