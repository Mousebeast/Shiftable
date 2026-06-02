'use strict';
/**
 * e2e/start-server.js
 *
 * WebServer entry point for Playwright E2E tests.
 *
 * Playwright 1.60 starts globalSetup and the webServer concurrently.
 * This script re-runs the database initialization inline so it doesn't
 * depend on globalSetup timing. It is idempotent: if the DB already has
 * the correct schema + seed data it skips re-initialization.
 *
 * The test-credentials.json (written by globalSetup) is waited for
 * separately — tests that need it (claim.spec.js) import it at the top
 * of the spec and Playwright workers only start after globalSetup completes.
 */

const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

// ── Paths (mirrors global-setup.js exactly) ───────────────────────────────────
const E2E_DB     = process.env.DB_PATH || path.join(os.tmpdir(), 'shiftable-e2e.db');
const SCHEMA_PATH = path.join(__dirname, '../server/db/schema.sql');
const MIGS_DIR    = path.join(__dirname, '../server/db/migrations');
const CREDS_PATH  = path.join(__dirname, 'test-credentials.json');

const CREDS = {
  manager:   { name: 'E2E Manager',   email: 'mgr@e2e.test',   pin: '222222', role: 'manager' },
  staff:     { name: 'E2E Staff',     email: 'staff@e2e.test', pin: '333333', role: 'staff' },
  unclaimed: { name: 'E2E New Staff', email: 'new@e2e.test',   role: 'staff' },
};

// ── DB initialization ─────────────────────────────────────────────────────────

function tablesExist(db) {
  const row = db.prepare(
    "SELECT count(*) as n FROM sqlite_master WHERE type='table' AND name='users'"
  ).get();
  return row.n > 0;
}

function initDB() {
  // Remove stale WAL/SHM files from previous server runs.
  for (const f of [E2E_DB, `${E2E_DB}-wal`, `${E2E_DB}-shm`]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  const db = new Database(E2E_DB);
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  fs.readdirSync(MIGS_DIR).sort().forEach(f => {
    if (f.endsWith('.sql')) {
      db.exec(fs.readFileSync(path.join(MIGS_DIR, f), 'utf8'));
    }
  });

  const insertUser = db.prepare(
    `INSERT INTO users (name, email, pin_hash, role, is_active) VALUES (?, ?, ?, ?, 1)`
  );

  const managerId = insertUser.run(
    CREDS.manager.name, CREDS.manager.email,
    bcrypt.hashSync(CREDS.manager.pin, 4), 'manager'
  ).lastInsertRowid;

  const staffId = insertUser.run(
    CREDS.staff.name, CREDS.staff.email,
    bcrypt.hashSync(CREDS.staff.pin, 4), 'staff'
  ).lastInsertRowid;

  const claimToken = uuidv4();
  const claimExpires = Math.floor(Date.now() / 1000) + 72 * 3600;
  db.prepare(
    `INSERT INTO users (name, email, pin_hash, role, is_active, claim_token, claim_token_expires_at)
     VALUES (?, ?, NULL, 'staff', 1, ?, ?)`
  ).run(CREDS.unclaimed.name, CREDS.unclaimed.email, claimToken, claimExpires);

  const groupId = db.prepare(
    `INSERT INTO groups (name, color) VALUES ('Servers', '#3b82f6')`
  ).run().lastInsertRowid;
  db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').run(staffId, groupId);

  const nextMonday = getNextMonday();
  const draftId = db.prepare(
    `INSERT INTO schedules (week_start_date, status, created_by) VALUES (?, 'draft', ?)`
  ).run(nextMonday, managerId).lastInsertRowid;
  db.prepare(
    `INSERT INTO schedule_shifts (schedule_id, user_id, group_id, date, start_time, hours)
     VALUES (?, ?, ?, ?, '09:00', 8)`
  ).run(draftId, staffId, groupId, nextMonday);

  const prevMonday = getPrevMonday();
  const pubId = db.prepare(
    `INSERT INTO schedules (week_start_date, status, created_by, published_by, published_at)
     VALUES (?, 'published', ?, ?, unixepoch())`
  ).run(prevMonday, managerId, managerId).lastInsertRowid;
  const shiftId = db.prepare(
    `INSERT INTO schedule_shifts (schedule_id, user_id, group_id, date, start_time, hours)
     VALUES (?, ?, ?, ?, '09:00', 8)`
  ).run(pubId, staffId, groupId, prevMonday).lastInsertRowid;

  db.close();

  // Write credentials for test specs that need them.
  // This is the authoritative source — globalSetup is not used (race condition in Playwright 1.60).
  fs.writeFileSync(CREDS_PATH, JSON.stringify({
    manager:   CREDS.manager,
    staff:     CREDS.staff,
    unclaimed: CREDS.unclaimed,
    claimToken,
    managerId,
    staffId,
    groupId,
    draftScheduleId: draftId,
    publishedShiftId: shiftId,
    nextMonday,
    prevMonday,
  }, null, 2));

  console.log(`[start-server] DB seeded at ${E2E_DB}`);
}

function getNextMonday() {
  const d = new Date();
  const dow = d.getDay();
  const diff = dow === 0 ? 1 : 8 - dow;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function getPrevMonday() {
  const d = new Date();
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

// ── Start ─────────────────────────────────────────────────────────────────────
try {
  initDB();
} catch (err) {
  console.error('[start-server] DB init failed:', err.message);
  process.exit(1);
}

// server/index.js exports `app` and only calls listen() when it's require.main.
const app  = require('../server/index.js');
const PORT = Number(process.env.PORT) || 3099;
app.listen(PORT, () => {
  console.log(`Shiftable e2e server on port ${PORT}`);
});
