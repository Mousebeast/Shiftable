/**
 * reset.js — Dev-only database reset
 *
 * Drops and recreates the entire database from schema.sql, then runs
 * the migration runner to mark 0001_initial.sql as applied.
 *
 * SAFETY: Exits immediately if NODE_ENV === 'production'.
 *
 * Usage: node server/db/reset.js
 *        npm run db:reset
 */

'use strict';

require('dotenv').config();

if (process.env.NODE_ENV !== 'development' && process.env.ALLOW_DB_RESET !== 'true') {
  console.error('[reset] ERROR: db:reset requires NODE_ENV=development or ALLOW_DB_RESET=true');
  process.exit(1);
}

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'shiftable.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function reset() {
  try {
    console.log('[reset] Resetting database...');
    console.log(`[reset] DB path: ${path.resolve(DB_PATH)}`);

    // ── 1. Delete existing DB file ──────────────────────────────────────────
    const resolvedPath = path.resolve(DB_PATH);
    if (fs.existsSync(resolvedPath)) {
      fs.unlinkSync(resolvedPath);
      console.log('[reset] Deleted existing database file.');
    }

    // ── 2. Recreate from schema.sql ────────────────────────────────────────
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const db = new Database(resolvedPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);
    console.log('[reset] Schema applied from schema.sql.');

    // ── 3. Seed _migrations table so migrate.js skips the initial migration ─
    db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);

    // Mark all existing migration files as already applied (schema is fresh)
    if (fs.existsSync(MIGRATIONS_DIR)) {
      const files = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort();

      const insertMigration = db.prepare(
        'INSERT OR IGNORE INTO _migrations (filename) VALUES (?)'
      );
      const seedAll = db.transaction(() => {
        for (const f of files) {
          insertMigration.run(f);
          console.log(`[reset] Marked as applied: ${f}`);
        }
      });
      seedAll();
    }

    db.close();
    console.log('[reset] Database reset complete.');
  } catch (err) {
    console.error('[reset] Error:', err.message);
    process.exit(1);
  }
}

reset();
