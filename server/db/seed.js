/**
 * server/db/seed.js — Admin user seed script
 *
 * Interactive script run once at install time to create the initial admin user.
 * Usage: node server/db/seed.js
 *
 * Guards against re-running: exits cleanly if an admin already exists.
 */

'use strict';

const readline = require('readline');
const bcrypt = require('bcrypt');
const db = require('./db');
const fs = require('fs');
const path = require('path');

// ── Schema bootstrap ─────────────────────────────────────────────────────────
// Apply the schema so this script works against a fresh DB (e.g. first install
// before migrate.js has been run).  Using CREATE TABLE IF NOT EXISTS means this
// is safe to call on an already-initialised database.
function applySchemaIfNeeded(database) {
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    database.exec(sql);
  }
}

// ── Core logic (exported for testing) ────────────────────────────────────────

/**
 * adminExists(database?)
 * Returns true if at least one admin user is present in the DB.
 */
function adminExists(database = db) {
  const row = database
    .prepare(`SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'`)
    .get();
  return row.cnt > 0;
}

/**
 * insertAdmin({ name, email, pin }, database?)
 * Inserts an admin user with a bcrypt-hashed PIN.
 *
 * Returns the new user's id on success.
 * Returns null if an admin already exists (guard).
 * Throws if the email is already taken (UNIQUE constraint).
 */
function insertAdmin({ name, email, pin }, database = db) {
  if (adminExists(database)) {
    return null;
  }

  const pinHash = bcrypt.hashSync(pin, 12);

  const result = database
    .prepare(
      `INSERT INTO users (name, email, pin_hash, role, is_active)
       VALUES (?, ?, ?, 'admin', 1)`
    )
    .run(name, email, pinHash);

  return result.lastInsertRowid;
}

// ── Interactive prompts ───────────────────────────────────────────────────────

function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function promptNonEmpty(rl, label) {
  while (true) {
    const value = await prompt(rl, `${label}: `);
    if (value.length > 0) return value;
    console.log(`  ${label} cannot be empty. Please try again.`);
  }
}

async function promptEmail(rl) {
  while (true) {
    const value = await prompt(rl, 'Admin email: ');
    if (value.includes('@') && value.length > 2) return value;
    console.log('  Invalid email address. Must contain @. Please try again.');
  }
}

async function promptPin(rl) {
  while (true) {
    const pin = await prompt(rl, 'Admin PIN (4-6 digits): ');
    if (!/^\d{4,6}$/.test(pin)) {
      console.log('  PIN must be 4-6 digits. Please try again.');
      continue;
    }
    const confirm = await prompt(rl, 'Confirm PIN: ');
    if (pin !== confirm) {
      console.log('  PINs do not match. Please try again.');
      continue;
    }
    return pin;
  }
}

// ── Non-interactive seed (used by install.sh via env vars) ───────────────────

function seedRestaurantName(name, database = db) {
  database
    .prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('restaurant_name', ?)`)
    .run(name);
}

async function nonInteractiveMain() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PIN, RESTAURANT_NAME } = process.env;

  applySchemaIfNeeded(db);

  if (adminExists(db)) {
    console.log('Admin already exists. Skipping.');
  } else {
    insertAdmin({ name: ADMIN_NAME, email: ADMIN_EMAIL, pin: ADMIN_PIN }, db);
    console.log(`✓ Admin created: ${ADMIN_NAME} <${ADMIN_EMAIL}>`);
  }

  if (RESTAURANT_NAME) {
    seedRestaurantName(RESTAURANT_NAME, db);
    console.log(`✓ Restaurant name set: ${RESTAURANT_NAME}`);
  }

  if (process.env.APP_URL) {
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('app_url', ?)`).run(process.env.APP_URL);
    console.log(`✓ App URL set: ${process.env.APP_URL}`);
  }
}

// ── Interactive main (manual / dev use) ──────────────────────────────────────

async function main() {
  applySchemaIfNeeded(db);

  if (adminExists(db)) {
    console.log('Admin already exists. Skipping seed.');
    process.exit(0);
  }

  console.log('\n=== Shiftable Admin Setup ===\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const name = await promptNonEmpty(rl, 'Admin name');
    const email = await promptEmail(rl);
    const pin = await promptPin(rl);

    insertAdmin({ name, email, pin }, db);

    console.log(`\n✓ Admin user created: ${name} <${email}>`);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed: users.email')) {
      console.error(`\nError: A user with that email address already exists.`);
      process.exit(1);
    }
    console.error(`\nError: ${err.message}`);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Only run when executed directly
if (require.main === module) {
  const isNonInteractive = process.env.ADMIN_NAME && process.env.ADMIN_EMAIL && process.env.ADMIN_PIN;
  const runner = isNonInteractive ? nonInteractiveMain : main;
  runner().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { insertAdmin, adminExists };
