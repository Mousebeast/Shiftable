'use strict';

require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../db/db');

const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PIN, RESTAURANT_NAME, DOMAIN } = process.env;

if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PIN) {
  console.log('[seed] ADMIN_NAME/EMAIL/PIN not set — skipping admin seed.');
  process.exit(0);
}

const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (count > 0) {
  console.log('[seed] Users already exist — skipping admin seed.');
  process.exit(0);
}

const pinHash = bcrypt.hashSync(ADMIN_PIN, 12);
db.prepare(
  `INSERT INTO users (name, email, pin_hash, role) VALUES (?, ?, ?, 'admin')`
).run(ADMIN_NAME, ADMIN_EMAIL, pinHash);
console.log(`[seed] Admin created: ${ADMIN_NAME} <${ADMIN_EMAIL}>`);

const upsert = db.prepare(
  `INSERT INTO app_settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`
);

if (RESTAURANT_NAME) {
  upsert.run('restaurant_name', RESTAURANT_NAME);
  console.log(`[seed] restaurant_name = ${RESTAURANT_NAME}`);
}

if (DOMAIN) {
  const appUrl = DOMAIN.startsWith('http') ? DOMAIN : `https://${DOMAIN}`;
  upsert.run('app_url', appUrl);
  console.log(`[seed] app_url = ${appUrl}`);
}
