/**
 * migrate.js — Migration runner
 *
 * Reads all .sql files from server/db/migrations/ in alphabetical order,
 * skips already-applied migrations (tracked in _migrations table),
 * and runs each unapplied migration as a transaction.
 *
 * Usage: node server/db/migrate.js
 * Exit:  0 on success, 1 on error
 */

'use strict';

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const db = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function ensureMigrationsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
}

function getAppliedMigrations() {
  return new Set(
    db.prepare('SELECT filename FROM _migrations').all().map((r) => r.filename)
  );
}

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.warn(`[migrate] Migrations directory not found: ${MIGRATIONS_DIR}`);
    return [];
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // alphabetical = chronological with numeric prefixes
}

function runMigration(filename) {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filepath, 'utf8');

  // Run the migration SQL + record it in a single transaction so a partial
  // failure doesn't leave the _migrations table in an inconsistent state.
  const applyMigration = db.transaction(() => {
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(filename);
  });

  applyMigration();
}

function migrate() {
  try {
    ensureMigrationsTable();

    const applied = getAppliedMigrations();
    const files = getMigrationFiles();
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('[migrate] No pending migrations — database is up to date.');
      return;
    }

    for (const filename of pending) {
      console.log(`[migrate] Applying: ${filename}`);
      runMigration(filename);
      console.log(`[migrate] Applied:  ${filename}`);
    }

    console.log(`[migrate] Done. Applied ${pending.length} migration(s).`);
  } catch (err) {
    console.error('[migrate] Error:', err.message);
    process.exit(1);
  }
}

migrate();
