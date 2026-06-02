/**
 * db.js — better-sqlite3 singleton
 *
 * Exports a single Database instance shared across all imports.
 * better-sqlite3 is synchronous by design — never wrap these calls
 * in Promises or async/await unless bridging to an async context.
 */

'use strict';

require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'shiftable.db');

// Ensure parent directory exists (handles relative and absolute paths)
// Skip for in-memory databases — they have no filesystem path.
if (DB_PATH !== ':memory:') {
  const dir = path.dirname(path.resolve(DB_PATH));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);

// Performance + correctness pragmas
db.pragma('journal_mode = WAL');   // concurrent reads, no busy-lock on writes
db.pragma('foreign_keys = ON');    // enforce referential integrity
db.pragma('busy_timeout = 5000');  // wait up to 5s before throwing SQLITE_BUSY

module.exports = db;
